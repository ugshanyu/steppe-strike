import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { BUTTON, MSG, PLAYER_FLAG } from '../shared/constants.js';
import { decodeSnapshot, encodeInput } from '../shared/protocol.js';

const PORT = 8127;
const BASE_URL = `ws://127.0.0.1:${PORT}/ws`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bot {
  constructor(name, userId, roomId = 'smoke-room') {
    this.name = name;
    this.userId = userId;
    this.roomId = roomId;
    this.sessionId = `session-${userId}`;
    this.id = 0;
    this.seq = 0;
    this.fireNonce = 0;
    this.events = [];
    this.snapshot = null;
    this.closeCode = null;
    this.closeReason = '';
  }

  async connect() {
    const token = encodeURIComponent(`dev:${this.userId}:${this.sessionId}`);
    this.ws = new WebSocket(`${BASE_URL}?room_id=${this.roomId}&token=${token}`);
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
    this.ws.on('close', (code, reason) => {
      this.closeCode = code;
      this.closeReason = reason.toString();
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} open timeout`)), 4_000);
      this.ws.once('open', () => {
        clearTimeout(timer);
        this.ws.send(JSON.stringify({ t: 'hello', version: 2, name: this.name }));
        resolve();
      });
      this.ws.once('error', reject);
    });
    await this.waitFor(() => this.id > 0 && this.state(), 'welcome');
  }

  state(id = this.id) {
    return this.snapshot?.players.find((player) => player.id === id);
  }

  send(buttons, yaw, pitch = 0, fire = false) {
    this.seq = (this.seq + 1) & 0xffff;
    if (fire) this.fireNonce = (this.fireNonce + 1) & 0xffff;
    this.ws.send(encodeInput(
      this.seq,
      buttons,
      yaw,
      pitch,
      this.fireNonce,
      this.snapshot?.tick || 0,
    ));
  }

  async stream(ticks, buttons, yaw, pitch = 0) {
    for (let index = 0; index < ticks; index += 1) {
      this.send(buttons, yaw, pitch);
      await sleep(17);
    }
  }

  fireAt(target) {
    const shooter = this.state();
    const victim = this.state(target.id);
    const dx = victim.x - shooter.x;
    const dz = victim.z - shooter.z;
    const horizontal = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2((victim.y + 1) - (shooter.y + 1.62), horizontal);
    this.send(BUTTON.FIRE, yaw, pitch, true);
  }

  async waitFor(predicate, label, timeout = 6_000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) {
        throw new Error(`${this.name} ${label} timeout ${JSON.stringify({
          state: this.state(),
          events: this.events.slice(-6),
        })}`);
      }
      await sleep(20);
    }
  }

  async close() {
    if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) return;
    await new Promise((resolve) => {
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }
}

async function eliminate(attacker, victim) {
  const previousKills = attacker.events.filter(
    (event) => event.t === 'kill' && event.victim === victim.id,
  ).length;
  for (let shot = 0; shot < 4; shot += 1) {
    await sleep(120);
    attacker.fireAt(victim);
    await attacker.waitFor(
      () => attacker.events.filter(
        (event) => event.t === 'kill' && event.victim === victim.id,
      ).length > previousKills
        || attacker.events.some(
          (event) => event.t === 'shot' && event.nonce === attacker.fireNonce,
        ),
      'shot resolution',
    );
    if (attacker.events.filter(
      (event) => event.t === 'kill' && event.victim === victim.id,
    ).length > previousKills) return;
  }
  throw new Error(`${attacker.name} could not eliminate ${victim.name}`);
}

async function startServer() {
  const child = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      TEST_MODE: '1',
      NODE_ENV: 'test',
      DEV_ALLOW_UNSIGNED: '1',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 5_000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('server_started')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', () => reject(new Error('server exited early')));
  });
  return child;
}

async function stopServer(child) {
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
}

async function main() {
  const server = await startServer();
  const alice = new Bot('Алтан', 'smoke-alice');
  const bob = new Bot('Бөртэ', 'smoke-bob');
  const isolated = new Bot('Тусдаа', 'smoke-isolated', 'another-room');
  const flood = new Bot('Үер', 'smoke-flood', 'flood-room');
  try {
    await Promise.all([alice.connect(), bob.connect(), isolated.connect()]);
    await alice.waitFor(() => alice.state(bob.id), 'shared player snapshot');
    await isolated.waitFor(() => isolated.state(), 'isolated snapshot');
    if (isolated.state(bob.id)) throw new Error('players leaked between Usion rooms');

    await alice.waitFor(
      () => alice.events.some((event) => event.t === 'match' && event.phase === 'live'),
      'live round',
    );
    const start = alice.state();
    await alice.stream(24, BUTTON.FORWARD, start.yaw);
    await alice.waitFor(() => {
      const state = alice.state();
      return Math.hypot(state.x - start.x, state.z - start.z) > 0.25;
    }, 'authoritative movement');

    const ammo = alice.state().ammo;
    alice.fireAt(bob);
    await alice.waitFor(
      () => alice.events.some((event) => event.t === 'shot' && event.shooter === alice.id),
      'authoritative shot event',
    );
    await alice.waitFor(() => alice.state().ammo === ammo - 1, 'authoritative ammo');
    await eliminate(alice, bob);
    await alice.waitFor(
      () => bob.state()?.health === 0
        && (bob.state().flags & PLAYER_FLAG.SPECTATOR),
      'server-owned death and spectator state',
    );
    await alice.waitFor(
      () => alice.events.some((event) => event.t === 'kill' && event.victim === bob.id),
      'authoritative kill event',
    );
    await alice.waitFor(
      () => bob.state()?.health === 100 && (bob.state().flags & PLAYER_FLAG.ALIVE),
      'next-round respawn',
    );
    await eliminate(alice, bob);
    await alice.waitFor(
      () => alice.events.some((event) => event.t === 'match' && event.phase === 'match_end'),
      'score-limit match end',
    );

    const originalId = alice.id;
    await alice.close();
    const rejoined = new Bot('Алтан', 'smoke-alice');
    await rejoined.connect();
    if (rejoined.id !== originalId) throw new Error('reconnect did not retain the match seat');
    if (!rejoined.events.some((event) => event.t === 'welcome' && event.reconnected)) {
      throw new Error('reconnect was not acknowledged');
    }

    rejoined.ws.send(Buffer.from([1, 2]));
    await sleep(100);
    if (rejoined.ws.readyState !== WebSocket.OPEN) {
      throw new Error('malformed input disconnected a healthy client');
    }
    await rejoined.close();

    await flood.connect();
    for (let index = 0; index < 190; index += 1) {
      flood.send(0, 0);
    }
    await flood.waitFor(
      () => flood.closeCode === 4008,
      'rate-limit rejection',
    );
    console.log(
      '  ok  room isolation, combat loop, reconnect, malformed input, and rate limit',
    );
  } finally {
    await Promise.all([alice.close(), bob.close(), isolated.close(), flood.close()]);
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
