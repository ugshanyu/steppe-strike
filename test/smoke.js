import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { BLOCK } from '../shared/blocks.js';
import { BUTTON, MSG } from '../shared/constants.js';
import { decodeSnapshot, encodeInput } from '../shared/protocol.js';

const PORT = 8127;
const URL = `ws://127.0.0.1:${PORT}/ws`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bot {
  constructor(name, session) {
    this.name = name;
    this.session = session;
    this.id = 0;
    this.seq = 0;
    this.events = [];
    this.edits = new Map();
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
      if (message.t === 'block') {
        this.edits.set(`${message.x},${message.y},${message.z}`, message.id);
      }
      if (message.t === 'chunks') {
        for (const chunk of message.chunks || []) {
          for (const [x, y, z, id] of chunk.edits || []) this.edits.set(`${x},${y},${z}`, id);
        }
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} open timeout`)), 4000);
      this.ws.once('open', () => {
        clearTimeout(timer);
        this.ws.send(JSON.stringify({
          t: 'hello', version: 1, name: this.name, session: this.session, authToken: '',
        }));
        resolve();
      });
      this.ws.once('error', reject);
    });
    await this.waitFor(() => this.id > 0 && this.state(), 'welcome');
  }

  state(id = this.id) {
    return this.snapshot?.players.find((player) => player.id === id);
  }

  send(buttons, yaw = -Math.PI / 2, pitch = 0, slot = 0) {
    this.seq = (this.seq + 1) & 0xffff;
    this.ws.send(encodeInput(this.seq, buttons, yaw, pitch, slot));
  }

  async stream(ticks, buttons, yaw = -Math.PI / 2, pitch = 0, slot = 0) {
    for (let index = 0; index < ticks; index++) {
      this.send(buttons, yaw, pitch, slot);
      await sleep(34);
    }
  }

  async waitFor(predicate, label, timeout = 6000) {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error(`${this.name} ${label} timeout`);
      await sleep(25);
    }
  }

  close() {
    this.ws?.close();
  }
}

async function startServer(worldPath) {
  const child = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      TEST_MODE: '1',
      NODE_ENV: 'test',
      WORLD_DATA_PATH: worldPath,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 5000);
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
  await sleep(100);
}

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'steppe-smoke-'));
  const worldPath = join(directory, 'world.json');
  let server = await startServer(worldPath);
  try {
    const alice = new Bot('Алтан', 'smoke-alice-0001');
    const bob = new Bot('Бөртэ', 'smoke-bob-00002');
    await alice.connect();
    await bob.connect();
    await alice.waitFor(() => alice.state(bob.id), 'shared player snapshot');

    const startX = alice.state().x;
    await alice.stream(26, BUTTON.FORWARD);
    await alice.stream(3, 0);
    await alice.waitFor(() => alice.state().x > startX + 2.5, 'voxel movement');

    for (let tick = 0; tick < 70 && ![...alice.edits.values()].includes(BLOCK.AIR); tick++) {
      alice.send(BUTTON.MINE, -Math.PI / 2, -1.1);
      await sleep(34);
    }
    alice.send(0, -Math.PI / 2, -1.1);
    await alice.waitFor(
      () => [...alice.edits.values()].includes(BLOCK.AIR),
      'authoritative mining',
    );
    const minedKey = [...alice.edits].find(([, id]) => id === BLOCK.AIR)[0];
    await bob.waitFor(() => bob.edits.get(minedKey) === BLOCK.AIR, 'shared mining edit');

    alice.send(BUTTON.PLACE, -Math.PI / 2, -1.1, 5);
    await sleep(80);
    alice.send(0, -Math.PI / 2, -1.1, 5);
    await alice.waitFor(() => [...alice.edits.values()].includes(BLOCK.PLANKS), 'block placement');
    const placedKey = [...alice.edits].find(([, id]) => id === BLOCK.PLANKS)[0];
    assertSameBlock(placedKey, minedKey);
    await bob.waitFor(() => bob.edits.get(placedKey) === BLOCK.PLANKS, 'shared placement edit');

    alice.close();
    bob.close();
    await sleep(800);
    await stopServer(server);
    server = null;

    server = await startServer(worldPath);
    const late = new Bot('Саруул', 'smoke-late-000003');
    await late.connect();
    await late.waitFor(() => late.edits.get(placedKey) === BLOCK.PLANKS, 'restart persistence');
    late.close();
    console.log('  ok  two clients mine/place one shared block; restart preserves it');
  } finally {
    if (server) await stopServer(server);
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function assertSameBlock(actual, expected) {
  if (actual !== expected) throw new Error(`placement moved from ${expected} to ${actual}`);
}
