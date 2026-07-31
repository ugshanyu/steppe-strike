import { WebSocketServer } from 'ws';
import {
  MAX_PLAYERS, MSG, SNAPSHOT_RATE, TICK_RATE,
} from '../shared/constants.js';
import {
  decodeInput, encodePong, encodeSnapshot, INPUT_BYTES,
} from '../shared/protocol.js';
import {
  ALLOWED_ORIGINS, DEV_ALLOW_UNSIGNED, IS_PRODUCTION, SERVICE_ID, USION_JWKS_URL,
} from './config.js';
import { createUsionDirectTokenVerifier } from './usion-direct-auth.js';

const HELLO_TIMEOUT_MS = 5_000;
const MAX_BUFFERED_BYTES = 128 * 1_024;
const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const log = (level, event, fields = {}) => {
  console.log(JSON.stringify({ level, event, ...fields }));
};

const sendJson = (ws, payload) => {
  if (ws.readyState === ws.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES) {
    ws.send(JSON.stringify(payload));
  }
};

function devIdentity(token, roomId) {
  if (!DEV_ALLOW_UNSIGNED || !token.startsWith('dev:')) return null;
  const [, userId, sessionId = userId] = token.split(':');
  if (!userId) return null;
  return {
    userId: userId.slice(0, 128),
    sessionId: sessionId.slice(0, 128),
    roomId,
    serviceId: SERVICE_ID,
    permissions: ['play'],
  };
}

export function attachRealtime(server, rooms, {
  verifyToken = createUsionDirectTokenVerifier({
    serviceId: SERVICE_ID,
    jwksUrl: USION_JWKS_URL,
  }),
} = {}) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 8_192,
  });

  const broadcast = (room, payload) => {
    const serialized = JSON.stringify(payload);
    for (const seat of room.match.connectedSeats()) {
      const ws = seat.ws;
      if (ws?.readyState === ws.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES) {
        ws.send(serialized);
      }
    }
  };
  rooms.onEvent = broadcast;

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    const origin = request.headers.origin || '';
    const allowed = !ALLOWED_ORIGINS.size || ALLOWED_ORIGINS.has(origin)
      || (!IS_PRODUCTION && /^https?:\/\/localhost(?::\d+)?$/.test(origin));
    if (url.pathname !== '/ws' || !allowed) {
      log('warn', 'realtime_upgrade_rejected', {
        reason: url.pathname !== '/ws' ? 'invalid_path' : 'origin_not_allowed',
        origin: origin.slice(0, 256),
      });
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    request.direct = {
      roomId: url.searchParams.get('room_id') || '',
      token: url.searchParams.get('token') || '',
    };
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws, request) => {
    ws.isAlive = true;
    ws.seat = null;
    ws.room = null;
    ws.messageWindow = { started: Date.now(), count: 0 };
    const timer = setTimeout(() => ws.close(4000, 'hello timeout'), HELLO_TIMEOUT_MS);
    const { roomId, token } = request.direct;
    const authenticate = () => {
      if (!ROOM_ID.test(roomId)) return Promise.reject(new Error('invalid room'));
      const development = devIdentity(token, roomId);
      return development ? Promise.resolve(development) : verifyToken(token, { roomId });
    };

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', async (data, isBinary) => {
      const now = Date.now();
      if (now - ws.messageWindow.started >= 1_000) {
        ws.messageWindow = { started: now, count: 0 };
      }
      if (++ws.messageWindow.count > 90) return ws.close(4008, 'rate limit');
      if (!ws.seat) {
        if (isBinary || ws.joining) return;
        let message;
        try { message = JSON.parse(data.toString()); } catch { return; }
        if (message?.t !== 'hello' || message.version !== 2) return;
        ws.joining = true;
        try {
          const identity = await authenticate();
          if (!identity || ws.readyState !== ws.OPEN) throw new Error('invalid identity');
          const joined = rooms.join(identity, String(message.name || ''), ws, now);
          if (!joined) {
            log('warn', 'match_join_rejected', { roomId, reason: 'match_unavailable' });
            sendJson(ws, { t: 'error', reason: 'MATCH_UNAVAILABLE' });
            ws.close(4001, 'match unavailable');
            return;
          }
          clearTimeout(timer);
          ws.seat = joined.seat;
          ws.room = joined.room;
          sendJson(ws, joined.room.welcome(joined.seat, joined.reconnected));
          log('info', 'match_joined', {
            roomId,
            networkId: joined.seat.networkId,
            connectedPlayers: joined.room.match.connectedSeats().length,
            reconnected: joined.reconnected,
          });
        } catch (error) {
          log('warn', 'realtime_access_rejected', {
            roomId: ROOM_ID.test(roomId) ? roomId : '',
            reason: error?.message === 'invalid room' ? 'invalid_room' : 'invalid_access',
          });
          sendJson(ws, { t: 'error', reason: 'USION_ACCESS_REJECTED' });
          ws.close(4002, 'invalid access');
        }
        return;
      }
      if (!isBinary) return;
      const buffer = Buffer.from(data);
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      if (buffer.byteLength === INPUT_BYTES && view.getUint8(0) === MSG.INPUT) {
        const input = decodeInput(view);
        if (input) ws.room.setInput(ws.seat, input, now);
      } else if (buffer.byteLength === 9 && view.getUint8(0) === MSG.PING) {
        ws.send(encodePong(view.getFloat64(1, true)));
      }
    });
    ws.on('close', (code) => {
      clearTimeout(timer);
      if (ws.room && ws.seat?.ws === ws) {
        const { room, seat } = ws;
        room.disconnect(seat);
        log('info', 'match_disconnected', {
          roomId: room.id,
          networkId: seat.networkId,
          code,
          connectedPlayers: room.match.connectedSeats().length,
        });
      }
    });
    ws.on('error', () => {});
  });

  const snapshotEvery = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE));
  const snapshotTimer = setInterval(() => {
    for (const room of rooms.rooms.values()) {
      if (room.tickNumber % snapshotEvery) continue;
      const players = room.snapshotPlayers();
      for (const recipient of room.match.connectedSeats()) {
        const ws = recipient.ws;
        if (ws?.readyState !== ws.OPEN || ws.bufferedAmount >= MAX_BUFFERED_BYTES) continue;
        ws.send(encodeSnapshot(room.tickNumber, recipient.lastAck, players));
      }
    }
  }, 1_000 / TICK_RATE);

  const livenessTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 10_000);

  return {
    wss,
    close() {
      clearInterval(snapshotTimer);
      clearInterval(livenessTimer);
      for (const ws of wss.clients) ws.close(1001, 'server shutdown');
      wss.close();
    },
  };
}
