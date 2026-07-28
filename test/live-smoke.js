import WebSocket from 'ws';
import { BUTTON, MSG } from '../shared/constants.js';
import { decodeSnapshot, encodeInput } from '../shared/protocol.js';

const SOCKET_URL = process.env.LIVE_URL;
if (!SOCKET_URL || !/^wss:\/\/[^/]+\/ws$/.test(SOCKET_URL)) {
  throw new Error('Set LIVE_URL to an exact secure WebSocket URL ending in /ws');
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LiveBot {
  constructor(name, session) {
    this.name = name;
    this.session = session;
    this.id = 0;
    this.sequence = 0;
    this.events = [];
    this.snapshot = null;
  }

  async connect() {
    this.socket = new WebSocket(SOCKET_URL, {
      origin: `https://${new URL(SOCKET_URL).host}`,
    });
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
      const timeout = setTimeout(() => reject(new Error(`${this.name} socket timeout`)), 5000);
      this.socket.once('open', () => {
        clearTimeout(timeout);
        this.socket.send(JSON.stringify({
          t: 'hello', version: 1, name: this.name, session: this.session,
        }));
        resolve();
      });
      this.socket.once('error', reject);
    });
    await this.waitFor(() => this.id > 0, 'welcome');
  }

  state(id = this.id) {
    return this.snapshot?.players.find((player) => player.id === id);
  }

  send(buttons, yaw, pitch = 0) {
    this.sequence = (this.sequence + 1) & 0xffff;
    this.socket.send(encodeInput(this.sequence, buttons, yaw, pitch));
  }

  async waitFor(predicate, label, timeout = 7000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error(`${this.name}: ${label} timeout`);
      await sleep(30);
    }
  }
}

const serial = Date.now().toString(36);
const alpha = new LiveBot('Live Alpha', `live-alpha-${serial}`);
const bravo = new LiveBot('Live Bravo', `live-bravo-${serial}`);

try {
  await alpha.connect();
  await bravo.connect();
  await alpha.waitFor(() => alpha.state() && alpha.state(bravo.id), 'shared two-player snapshot');
  const before = alpha.state();
  const start = { x: before.x, z: before.z };
  for (let i = 0; i < 18; i++) {
    alpha.send(BUTTON.FORWARD, before.yaw);
    await sleep(34);
  }
  alpha.send(0, before.yaw);
  await alpha.waitFor(() => {
    const state = alpha.state();
    return state && Math.hypot(state.x - start.x, state.z - start.z) > .35;
  }, 'authoritative movement');
  alpha.socket.send(Buffer.from([1, 2]));
  await sleep(150);
  if (alpha.socket.readyState !== WebSocket.OPEN || bravo.socket.readyState !== WebSocket.OPEN) {
    throw new Error('malformed input disconnected a healthy client');
  }
  console.log(`  ok  production WSS shared world (${alpha.id}, ${bravo.id}) and authoritative movement`);
} finally {
  alpha.socket?.close();
  bravo.socket?.close();
}
