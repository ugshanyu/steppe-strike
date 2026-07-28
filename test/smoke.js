import { spawn } from 'node:child_process';
import http from 'node:http';
import WebSocket from 'ws';
import { BUTTON, MSG } from '../shared/constants.js';
import { decodeSnapshot, encodeInput } from '../shared/protocol.js';

const PORT = 8127;
const AUTH_PORT = 8128;
const URL = `ws://127.0.0.1:${PORT}/ws`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bot {
  constructor(name, session, authToken = '') {
    this.name = name;
    this.session = session;
    this.authToken = authToken;
    this.id = 0;
    this.seq = 0;
    this.events = [];
    this.snapshot = null;
  }

  async connect() {
    this.ws = new WebSocket(URL);
    this.ws.binaryType = 'arraybuffer';
    this.ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buffer = Buffer.from(data);
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        if (view.getUint8(0) === MSG.SNAPSHOT) this.snapshot = decodeSnapshot(view);
        return;
      }
      const message = JSON.parse(data.toString());
      this.events.push(message);
      if (message.t === 'welcome') this.id = message.id;
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} open timeout`)), 4000);
      this.ws.once('open', () => {
        clearTimeout(timer);
        this.ws.send(JSON.stringify({
          t: 'hello', version: 1, name: this.name, session: this.session,
          authToken: this.authToken,
        }));
        resolve();
      });
      this.ws.once('error', reject);
    });
    await this.waitFor(() => this.id > 0, 'welcome');
  }

  state(id = this.id) {
    return this.snapshot?.players.find((player) => player.id === id);
  }

  send(buttons, yaw = -Math.PI / 2, pitch = 0) {
    this.seq = (this.seq + 1) & 0xffff;
    this.ws.send(encodeInput(this.seq, buttons, yaw, pitch));
  }

  async stream(ticks, buttons, yaw = -Math.PI / 2, pitch = 0) {
    for (let i = 0; i < ticks; i++) {
      this.send(buttons, yaw, pitch);
      await sleep(34);
    }
  }

  async waitFor(predicate, label, timeout = 5000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error(`${this.name} ${label} timeout`);
      await sleep(25);
    }
  }
}

async function main() {
  const authServer = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body); } catch { /* rejected below */ }
      const valid = payload.token === 'valid-scoped-token'
        && payload.expected_service_id === 'steppe-strike';
      response.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' });
      response.end(valid
        ? JSON.stringify({ user_id: 'usion-smoke-user', name: 'Саруул' })
        : JSON.stringify({ detail: 'invalid iframe token' }));
    });
  });
  await new Promise((resolve) => authServer.listen(AUTH_PORT, '127.0.0.1', resolve));
  const server = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      TEST_MODE: '1',
      NODE_ENV: 'test',
      USION_VERIFY_URL: `http://127.0.0.1:${AUTH_PORT}/iframe/verify-token`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 5000);
      server.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('server_started')) {
          clearTimeout(timer);
          resolve();
        }
      });
      server.once('exit', () => reject(new Error('server exited early')));
    });

    const alice = new Bot('Алтан', 'smoke-alice-0001');
    const bob = new Bot('Бөртэ', 'smoke-bob-00002');
    await alice.connect();
    await bob.connect();
    await alice.waitFor(() => alice.state() && alice.state(bob.id), 'shared snapshot');
    const startX = alice.state().x;
    await alice.stream(8, BUTTON.FORWARD);
    await alice.waitFor(() => alice.state().x > startX + .25, 'authoritative movement');
    alice.ws.send(Buffer.from([1, 2]));
    alice.ws.send(JSON.stringify({ nope: true }));
    await alice.stream(4, BUTTON.FIRE);
    await bob.waitFor(() => bob.events.some((event) => event.t === 'kill'), 'kill event');
    const kill = bob.events.find((event) => event.t === 'kill');
    if (kill.killer !== alice.id || kill.victim !== bob.id || !kill.headshot) {
      throw new Error(`unexpected kill event ${JSON.stringify(kill)}`);
    }
    await bob.waitFor(() => bob.state()?.alive === false, 'authoritative death');
    await bob.waitFor(() => bob.state()?.alive === true, 'respawn', 5000);

    const originalId = alice.id;
    alice.ws.close();
    await sleep(100);
    const reconnected = new Bot('Алтан', 'smoke-alice-0001');
    await reconnected.connect();
    const welcome = reconnected.events.find((event) => event.t === 'welcome');
    if (reconnected.id !== originalId || !welcome.reconnected) throw new Error('session reconnect failed');
    reconnected.ws.close();
    bob.ws.close();

    const usionPlayer = new Bot('Spoofed name', 'spoofed-session', 'valid-scoped-token');
    await usionPlayer.connect();
    const usionWelcome = usionPlayer.events.find((event) => event.t === 'welcome');
    const verifiedPlayer = usionWelcome.players.find((player) => player.id === usionPlayer.id);
    if (verifiedPlayer?.name !== 'Саруул') throw new Error('Usion profile name was not enforced');
    usionPlayer.ws.close();
    console.log('  ok  two-client match, guest reconnect, verified Usion identity');
  } finally {
    server.kill('SIGTERM');
    authServer.close();
    await sleep(150);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
