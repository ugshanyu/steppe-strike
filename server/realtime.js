import { WebSocketServer } from 'ws';
import { MAX_PLAYERS, MSG, SNAPSHOT_RATE, TICK_RATE } from '../shared/constants.js';
import {
  decodeInput, encodePong, encodeSnapshot, INPUT_BYTES,
} from '../shared/protocol.js';
import { ALLOWED_ORIGINS, IS_PRODUCTION } from './config.js';

const HELLO_TIMEOUT_MS = 5000;
const MAX_BUFFERED_BYTES = 128 * 1024;

export function attachRealtime(server, world) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 512,
  });

  const sendJson = (ws, payload) => {
    if (ws.readyState === ws.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES) {
      ws.send(JSON.stringify(payload));
    }
  };
  const broadcast = (payload) => {
    const serialized = JSON.stringify(payload);
    for (const player of world.connectedPlayers()) {
      if (player.ws.readyState === player.ws.OPEN && player.ws.bufferedAmount < MAX_BUFFERED_BYTES) {
        player.ws.send(serialized);
      }
    }
  };
  world.emit = broadcast;

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const origin = request.headers.origin || '';
    const allowed = !ALLOWED_ORIGINS.size || ALLOWED_ORIGINS.has(origin)
      || (!IS_PRODUCTION && /^https?:\/\/localhost(?::\d+)?$/.test(origin));
    if (pathname !== '/ws' || !allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.player = null;
    ws.messageWindow = { started: Date.now(), count: 0 };
    const helloTimer = setTimeout(() => ws.close(4000, 'hello timeout'), HELLO_TIMEOUT_MS);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - ws.messageWindow.started >= 1000) ws.messageWindow = { started: now, count: 0 };
      if (++ws.messageWindow.count > 90) {
        ws.close(4008, 'rate limit');
        return;
      }
      if (!ws.player) {
        if (isBinary) return;
        let message;
        try { message = JSON.parse(data.toString()); } catch { return; }
        if (!message || message.t !== 'hello' || message.version !== 1) return;
        const result = world.join({ name: message.name, session: message.session, ws });
        if (!result) {
          sendJson(ws, { t: 'error', reason: 'World is full. Try again shortly.' });
          ws.close(4001, 'world full');
          return;
        }
        clearTimeout(helloTimer);
        ws.player = result.player;
        sendJson(ws, {
          t: 'welcome', id: result.player.id, session: result.player.session,
          tickRate: TICK_RATE, snapshotRate: SNAPSHOT_RATE, maxPlayers: MAX_PLAYERS,
          players: world.roster(), scores: world.teamScores, reconnected: result.reconnected,
        });
        broadcast({
          t: result.reconnected ? 'rejoin' : 'join',
          id: result.player.id, name: result.player.name, team: result.player.team,
        });
        return;
      }
      if (!isBinary) return;
      const buffer = Buffer.from(data);
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      if (buffer.byteLength === INPUT_BYTES && view.getUint8(0) === MSG.INPUT) {
        const input = decodeInput(view);
        if (input) world.setInput(ws.player, input);
      } else if (buffer.byteLength === 9 && view.getUint8(0) === MSG.PING) {
        ws.send(encodePong(view.getFloat64(1, true)));
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (ws.player) world.disconnect(ws.player);
    });
    ws.on('error', () => {});
  });

  const snapshotEvery = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE));
  const snapshotTimer = setInterval(() => {
    if (world.tickNumber % snapshotEvery) return;
    const players = world.connectedPlayers();
    for (const recipient of players) {
      if (recipient.ws.readyState !== recipient.ws.OPEN
        || recipient.ws.bufferedAmount >= MAX_BUFFERED_BYTES) continue;
      recipient.ws.send(encodeSnapshot(world.tickNumber, recipient.lastAck, players));
    }
  }, 1000 / TICK_RATE);

  const livenessTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 10000);

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
