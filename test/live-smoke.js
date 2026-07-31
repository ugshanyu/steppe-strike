import WebSocket from 'ws';
import { BUTTON, MSG } from '../shared/constants.js';
import { decodeSnapshot, encodeInput } from '../shared/protocol.js';

const SOCKET_URL = process.env.LIVE_URL;
const ROOM_ID = process.env.LIVE_ROOM_ID;
const TOKENS = [process.env.LIVE_ACCESS_TOKEN_ALPHA, process.env.LIVE_ACCESS_TOKEN_BRAVO];
if (!SOCKET_URL || !/^wss:\/\/[^/]+\/ws$/.test(SOCKET_URL)
  || !ROOM_ID || TOKENS.some((token) => !token)) {
  throw new Error(
    'Set LIVE_URL, LIVE_ROOM_ID, LIVE_ACCESS_TOKEN_ALPHA, and LIVE_ACCESS_TOKEN_BRAVO',
  );
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LiveBot {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.id = 0;
    this.sequence = 0;
    this.fireNonce = 0;
    this.events = [];
    this.snapshot = null;
  }

  async connect() {
    const url = new URL(SOCKET_URL);
    url.searchParams.set('room_id', ROOM_ID);
    url.searchParams.set('token', this.token);
    this.socket = new WebSocket(url, { origin: `https://${url.host}` });
    this.socket.on('message', (data, binary) => {
      if (binary) {
        const buffer = Buffer.from(data);
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        if (view.getUint8(0) === MSG.SNAPSHOT) this.snapshot = decodeSnapshot(view);
        return;
      }
      const event = JSON.parse(data.toString());
      this.events.push(event);
      if (event.t === 'welcome') this.id = event.id;
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${this.name} socket timeout`)), 5_000);
      this.socket.once('open', () => {
        clearTimeout(timeout);
        this.socket.send(JSON.stringify({ t: 'hello', version: 2, name: this.name }));
        resolve();
      });
      this.socket.once('error', reject);
    });
    await this.waitFor(() => this.id > 0 && this.state(), 'welcome');
  }

  state(id = this.id) {
    return this.snapshot?.players.find((player) => player.id === id);
  }

  send(buttons, yaw, pitch = 0, fire = false) {
    this.sequence = (this.sequence + 1) & 0xffff;
    if (fire) this.fireNonce = (this.fireNonce + 1) & 0xffff;
    this.socket.send(encodeInput(
      this.sequence,
      buttons,
      yaw,
      pitch,
      this.fireNonce,
      this.snapshot?.tick || 0,
    ));
  }

  async waitFor(predicate, label, timeout = 8_000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error(`${this.name}: ${label} timeout`);
      await sleep(25);
    }
  }
}

const alpha = new LiveBot('Live Alpha', TOKENS[0]);
const bravo = new LiveBot('Live Bravo', TOKENS[1]);
try {
  await Promise.all([alpha.connect(), bravo.connect()]);
  await alpha.waitFor(() => alpha.state(bravo.id), 'shared two-player snapshot');
  await alpha.waitFor(
    () => alpha.events.some((event) => event.t === 'match' && event.phase === 'live'),
    'live phase',
  );
  const before = alpha.state();
  for (let index = 0; index < 24; index += 1) {
    alpha.send(BUTTON.FORWARD, before.yaw);
    await sleep(17);
  }
  await alpha.waitFor(() => {
    const state = alpha.state();
    return state && Math.hypot(state.x - before.x, state.z - before.z) > 0.25;
  }, 'authoritative movement');
  const ammo = alpha.state().ammo;
  alpha.send(BUTTON.FIRE, alpha.state().yaw, alpha.state().pitch, true);
  await alpha.waitFor(
    () => alpha.events.some((event) => event.t === 'shot' && event.shooter === alpha.id),
    'authoritative rifle event',
  );
  await alpha.waitFor(() => alpha.state().ammo === ammo - 1, 'authoritative ammo');
  console.log(`  ok  production direct room ${ROOM_ID}, movement and rifle authority`);
} finally {
  alpha.socket?.close();
  bravo.socket?.close();
}
