import WebSocket from 'ws';
import { BUTTON, MSG, PLAYER_FLAG } from '../shared/constants.js';
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

  fireAt(target) {
    const shooter = this.state();
    const victim = this.state(target.id);
    const dx = victim.x - shooter.x;
    const dz = victim.z - shooter.z;
    const horizontal = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(
      (victim.y + 1.62) - (shooter.y + 1.62),
      horizontal,
    );
    this.send(BUTTON.FIRE, yaw, pitch, true);
  }

  async waitFor(predicate, label, timeout = 8_000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error(`${this.name}: ${label} timeout`);
      await sleep(25);
    }
  }
}

async function eliminate(attacker, victim) {
  const previousKills = attacker.events.filter(
    (event) => event.t === 'kill' && event.victim === victim.id,
  ).length;
  for (let shot = 0; shot < 4; shot += 1) {
    attacker.fireAt(victim);
    await attacker.waitFor(
      () => attacker.events.some(
        (event) => event.t === 'shot' && event.nonce === attacker.fireNonce,
      ),
      'shot resolution',
    );
    if (attacker.events.filter(
      (event) => event.t === 'kill' && event.victim === victim.id,
    ).length > previousKills) return;
    await sleep(120);
  }
  throw new Error(`${attacker.name}: could not eliminate ${victim.name} ${JSON.stringify({
    attacker: attacker.state(),
    victim: attacker.state(victim.id),
    shots: attacker.events.filter((event) => event.t === 'shot').slice(-4),
  })}`);
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

  for (let round = 0; round < 7; round += 1) {
    await alpha.waitFor(
      () => alpha.state()?.health === 100
        && bravo.state()?.health === 100
        && (bravo.state().flags & PLAYER_FLAG.ALIVE),
      `round ${round + 1} spawn`,
      10_000,
    );
    await eliminate(alpha, bravo);
    await alpha.waitFor(
      () => bravo.state()?.health === 0
        && (bravo.state().flags & PLAYER_FLAG.SPECTATOR),
      `round ${round + 1} authoritative death`,
    );
  }
  await alpha.waitFor(
    () => alpha.events.some((event) => event.t === 'match' && event.phase === 'match_end'),
    'match end',
  );
  await sleep(2_000);
  console.log(`  ok  production direct room ${ROOM_ID}, seven-round authoritative match`);
} finally {
  alpha.socket?.close();
  bravo.socket?.close();
}
