import { randomUUID } from 'node:crypto';
import { blockDef, BLOCK, HOTBAR_BLOCKS } from '../shared/blocks.js';
import {
  BUILD_REACH, BUTTON, DT, EYE_HEIGHT, MAX_PLAYERS, PLAYER_HEIGHT,
  MAX_WORLD_EDITS, PLAYER_RADIUS, PLAYER_VISIBILITY,
} from '../shared/constants.js';
import { stepMovement } from '../shared/physics.js';
import { CHUNK_SIZE, WORLD_HEIGHT, chunkKey, floorDiv } from '../shared/terrain.js';
import { lookDirection, voxelRaycast } from '../shared/voxel-ray.js';
import { VoxelWorld } from '../shared/voxel-world.js';

const INTEREST_RADIUS = 4;
const DISCONNECT_GRACE_MS = 10_000;

const cleanName = (value) => {
  const name = String(value || '').normalize('NFKC')
    .replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return name || `Нүүдэлчин ${Math.floor(100 + Math.random() * 900)}`;
};

const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class GameWorld {
  constructor({ persisted = {}, testMode = false } = {}) {
    this.testMode = testMode;
    this.voxels = new VoxelWorld(persisted.seed, persisted.edits);
    this.revision = persisted.revision || 0;
    this.spawn = this.voxels.findSpawn();
    this.players = new Map();
    this.nextId = 1;
    this.tickNumber = 0;
    this.emit = () => {};
    this.send = () => {};
    this.onDirty = () => {};
  }

  join({ name, session, ws }) {
    const safeSession = /^[\w-]{8,64}$/.test(session || '') ? session : randomUUID();
    const existing = [...this.players.values()].find((player) => player.session === safeSession);
    if (existing) {
      if (existing.ws && existing.ws !== ws) {
        existing.ws.player = null;
        existing.ws.close(4003, 'reconnected');
      }
      existing.ws = ws;
      existing.connected = true;
      existing.disconnectedAt = 0;
      existing.name = cleanName(name || existing.name);
      existing.activeChunks.clear();
      existing.lastChunk = '';
      return { player: existing, reconnected: true };
    }
    if (this.connectedPlayers().length >= MAX_PLAYERS) return null;
    const player = {
      id: this.allocateId(),
      session: safeSession,
      name: cleanName(name),
      ws,
      x: this.spawn.x,
      y: this.spawn.y,
      z: this.spawn.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: this.spawn.yaw,
      pitch: 0,
      slot: 0,
      jumpHeld: false,
      input: { seq: 0, buttons: 0, yaw: this.spawn.yaw, pitch: 0, slot: 0 },
      lastAck: 0,
      mining: null,
      mineProgress: 0,
      placeHeld: false,
      connected: true,
      disconnectedAt: 0,
      activeChunks: new Set(),
      lastChunk: '',
    };
    this.players.set(player.id, player);
    return { player, reconnected: false };
  }

  allocateId() {
    while (this.players.has(this.nextId)) this.nextId = (this.nextId % 65535) + 1;
    return this.nextId++;
  }

  setInput(player, input) {
    if (!player.connected) return;
    player.input = input;
    player.lastAck = input.seq;
    player.yaw = input.yaw;
    player.pitch = input.pitch;
    player.slot = input.slot;
  }

  disconnect(player) {
    if (!player || this.players.get(player.id) !== player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    player.input.buttons = 0;
    player.mining = null;
    player.mineProgress = 0;
  }

  connectedPlayers() {
    return [...this.players.values()].filter((player) => player.connected);
  }

  visiblePlayers(recipient) {
    return this.connectedPlayers().filter((player) => (
      player === recipient || distance2D(player, recipient) <= PLAYER_VISIBILITY
    ));
  }

  step(now = Date.now()) {
    this.tickNumber++;
    for (const player of [...this.players.values()]) {
      if (!player.connected && now - player.disconnectedAt > DISCONNECT_GRACE_MS) {
        this.players.delete(player.id);
        this.emit({ t: 'leave', id: player.id });
        continue;
      }
      if (!player.connected) continue;
      player.yaw = player.input.yaw;
      player.pitch = player.input.pitch;
      stepMovement(this.voxels, player, player.input, DT);
      if (player.y < 1) this.respawn(player);
      this.handleMining(player, now);
      this.handlePlacement(player);
      this.syncInterest(player);
    }
  }

  targetFor(player) {
    return voxelRaycast(this.voxels, {
      x: player.x,
      y: player.y + EYE_HEIGHT,
      z: player.z,
    }, lookDirection(player.yaw, player.pitch), BUILD_REACH);
  }

  handleMining(player, now) {
    if (!(player.input.buttons & BUTTON.MINE)) {
      player.mining = null;
      player.mineProgress = 0;
      return;
    }
    const hit = this.targetFor(player);
    if (!hit || !Number.isFinite(blockDef(hit.block.id).hardness)
      || this.spawnProtected(hit.block)) {
      player.mining = null;
      player.mineProgress = 0;
      return;
    }
    const key = `${hit.block.x},${hit.block.y},${hit.block.z}`;
    if (player.mining?.key !== key || player.mining.id !== hit.block.id) {
      player.mining = { key, id: hit.block.id, startedAt: now, block: hit.block };
    }
    const duration = blockDef(hit.block.id).hardness * 1000;
    player.mineProgress = Math.min(1, (now - player.mining.startedAt) / duration);
    if (player.mineProgress < 1) return;
    if (this.voxels.getBlock(hit.block.x, hit.block.y, hit.block.z) === hit.block.id) {
      this.applyBlockEdit(hit.block.x, hit.block.y, hit.block.z, BLOCK.AIR, player.id);
    }
    player.mining = null;
    player.mineProgress = 0;
  }

  handlePlacement(player) {
    const placing = Boolean(player.input.buttons & BUTTON.PLACE);
    if (!placing || player.placeHeld) {
      player.placeHeld = placing;
      return;
    }
    player.placeHeld = true;
    const hit = this.targetFor(player);
    const destination = hit?.adjacent;
    const blockId = HOTBAR_BLOCKS[player.slot] || HOTBAR_BLOCKS[0];
    if (!hit || !destination || !blockDef(blockId).placeable
      || !blockDef(this.voxels.getBlock(destination.x, destination.y, destination.z)).replaceable
      || this.spawnProtected(destination)
      || this.blockIntersectsPlayer(destination)) return;
    this.applyBlockEdit(destination.x, destination.y, destination.z, blockId, player.id);
  }

  blockIntersectsPlayer(block) {
    return this.connectedPlayers().some((player) => (
      block.x + 1 > player.x - PLAYER_RADIUS
      && block.x < player.x + PLAYER_RADIUS
      && block.y + 1 > player.y
      && block.y < player.y + PLAYER_HEIGHT
      && block.z + 1 > player.z - PLAYER_RADIUS
      && block.z < player.z + PLAYER_RADIUS
    ));
  }

  spawnProtected(block) {
    return Math.hypot(block.x + 0.5 - this.spawn.x, block.z + 0.5 - this.spawn.z) < 3
      && block.y <= this.spawn.y + 1;
  }

  applyBlockEdit(x, y, z, id, actorId = 0) {
    const wasEdited = this.voxels.getBlock(x, y, z) !== this.voxels.getBaseBlock(x, y, z);
    const addsEdit = id !== this.voxels.getBaseBlock(x, y, z);
    if (!wasEdited && addsEdit && this.voxels.edits.size >= MAX_WORLD_EDITS) {
      const actor = this.players.get(actorId);
      if (actor) this.send(actor, { t: 'error', reason: 'Ертөнцийн хадгалах зай дүүрлээ.' });
      return false;
    }
    if (!this.voxels.setBlock(x, y, z, id)) return false;
    this.revision++;
    const payload = { t: 'block', x, y, z, id, revision: this.revision, actorId };
    const key = chunkKey(floorDiv(x), floorDiv(z));
    for (const player of this.connectedPlayers()) {
      if (player.activeChunks.has(key)) this.send(player, payload);
    }
    this.onDirty();
    return true;
  }

  syncInterest(player) {
    const cx = floorDiv(Math.floor(player.x));
    const cz = floorDiv(Math.floor(player.z));
    const center = chunkKey(cx, cz);
    if (center === player.lastChunk) return;
    player.lastChunk = center;
    const next = new Set();
    const chunks = [];
    for (let dz = -INTEREST_RADIUS; dz <= INTEREST_RADIUS; dz++) {
      for (let dx = -INTEREST_RADIUS; dx <= INTEREST_RADIUS; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        next.add(key);
        if (!player.activeChunks.has(key)) {
          const edits = this.voxels.editsForChunk(cx + dx, cz + dz);
          if (edits.length) chunks.push({ cx: cx + dx, cz: cz + dz, edits });
        }
      }
    }
    player.activeChunks = next;
    for (let index = 0; index < chunks.length; index += 12) {
      this.send(player, {
        t: 'chunks',
        revision: this.revision,
        chunks: chunks.slice(index, index + 12),
      });
    }
  }

  respawn(player) {
    Object.assign(player, {
      x: this.spawn.x, y: this.spawn.y, z: this.spawn.z,
      vx: 0, vy: 0, vz: 0, yaw: this.spawn.yaw, pitch: 0,
    });
  }

  roster() {
    return this.connectedPlayers().map(({ id, name }) => ({ id, name }));
  }

  serialize() {
    return {
      version: 1,
      seed: this.voxels.seed,
      revision: this.revision,
      edits: this.voxels.serializeEdits(),
    };
  }

  worldInfo() {
    return {
      seed: this.voxels.seed,
      height: WORLD_HEIGHT,
      chunkSize: CHUNK_SIZE,
      revision: this.revision,
      hotbar: HOTBAR_BLOCKS,
    };
  }
}
