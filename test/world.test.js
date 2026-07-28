import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, isSolid } from '../shared/blocks.js';
import { BUTTON, DT } from '../shared/constants.js';
import { collidesPlayer, isGrounded, isSwimming, stepMovement } from '../shared/physics.js';
import {
  CHUNK_SIZE, SEA_LEVEL, WORLD_SEED, floorDiv, generateChunk, localCoord, terrainHeight,
} from '../shared/terrain.js';
import { voxelRaycast } from '../shared/voxel-ray.js';
import { VoxelWorld } from '../shared/voxel-world.js';

const chunkHash = (chunk) => {
  let hash = 2166136261;
  for (const value of chunk) hash = Math.imul(hash ^ value, 16777619);
  return hash >>> 0;
};

test('negative chunk coordinates are floor-based and seam-safe', () => {
  assert.equal(floorDiv(-1), -1);
  assert.equal(floorDiv(-16), -1);
  assert.equal(floorDiv(-17), -2);
  assert.equal(localCoord(-1), 15);
  assert.equal(localCoord(-16), 0);
  assert.equal(CHUNK_SIZE, 16);
});

test('terrain generation is deterministic and seed-sensitive', () => {
  const first = generateChunk(WORLD_SEED, -1, 2);
  const second = generateChunk(WORLD_SEED, -1, 2);
  const different = generateChunk(WORLD_SEED + 1, -1, 2);
  assert.equal(chunkHash(first), chunkHash(second));
  assert.notEqual(chunkHash(first), chunkHash(different));
  assert.equal(chunkHash(first), 1992809429);
});

test('base terrain has soil, stone, water, caves, ores, and cross-chunk trees', () => {
  const world = new VoxelWorld(WORLD_SEED);
  const seen = new Set();
  for (let z = -128; z <= 128; z++) {
    for (let x = -128; x <= 128; x++) {
      for (let y = 0; y < 45; y++) seen.add(world.getBaseBlock(x, y, z));
    }
  }
  for (const id of [
    BLOCK.BEDROCK, BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND,
    BLOCK.WATER, BLOCK.LOG, BLOCK.LEAVES, BLOCK.COAL_ORE, BLOCK.IRON_ORE,
  ]) assert.ok(seen.has(id), `missing generated block ${id}`);
});

test('overrides compact when restored to deterministic base', () => {
  const world = new VoxelWorld(WORLD_SEED);
  const x = 20;
  const z = -7;
  const y = terrainHeight(WORLD_SEED, x, z);
  const base = world.getBaseBlock(x, y, z);
  assert.equal(world.setBlock(x, y, z, BLOCK.AIR), true);
  assert.equal(world.getBlock(x, y, z), BLOCK.AIR);
  assert.equal(world.serializeEdits().length, 1);
  assert.equal(world.setBlock(x, y, z, base), true);
  assert.equal(world.serializeEdits().length, 0);
});

test('spawn is dry, supported, and has head clearance', () => {
  const world = new VoxelWorld(WORLD_SEED);
  const spawn = world.findSpawn();
  assert.ok(isSolid(world.getBlock(Math.floor(spawn.x), spawn.y - 1, Math.floor(spawn.z))));
  assert.equal(isSolid(world.getBlock(Math.floor(spawn.x), spawn.y, Math.floor(spawn.z))), false);
  assert.equal(collidesPlayer(world, spawn.x, spawn.y, spawn.z), false);
});

test('voxel physics lands, jumps, and rejects a placed wall', () => {
  const world = new VoxelWorld(WORLD_SEED);
  const spawn = world.findSpawn();
  const player = { ...spawn, vx: 0, vy: 0, vz: 0, jumpHeld: false };
  stepMovement(world, player, { buttons: 0 }, DT);
  assert.equal(isGrounded(world, player), true);
  stepMovement(world, player, { buttons: BUTTON.JUMP }, DT);
  assert.ok(player.vy > 0);

  const wallX = Math.floor(player.x);
  const wallZ = Math.floor(player.z) - 1;
  world.setBlock(wallX, Math.floor(player.y), wallZ, BLOCK.STONE);
  player.vy = 0;
  player.y = spawn.y;
  player.yaw = 0;
  for (let index = 0; index < 30; index++) {
    stepMovement(world, player, { buttons: BUTTON.FORWARD }, DT);
  }
  assert.ok(player.z > wallZ + 0.99);
});

test('water slows falling and jump input swims upward', () => {
  const world = new VoxelWorld(WORLD_SEED);
  const player = {
    x: 100.5, y: SEA_LEVEL + 20.5, z: 100.5, vx: 4, vy: -4, vz: 0, yaw: 0,
  };
  world.setBlock(100, SEA_LEVEL + 20, 100, BLOCK.WATER);
  world.setBlock(100, SEA_LEVEL + 21, 100, BLOCK.WATER);
  assert.equal(isSwimming(world, player), true);
  stepMovement(world, player, { buttons: BUTTON.JUMP }, DT);
  assert.ok(player.vy > 0);
  assert.ok(player.vx < 4);
});

test('DDA ray returns the target and adjacent placement cell', () => {
  const world = new VoxelWorld(WORLD_SEED);
  world.setBlock(30, 55, 30, BLOCK.PLANKS);
  const hit = voxelRaycast(world, { x: 30.5, y: 55.5, z: 34.5 }, { x: 0, y: 0, z: -1 }, 6);
  assert.deepEqual(hit.block, { x: 30, y: 55, z: 30, id: BLOCK.PLANKS });
  assert.deepEqual(hit.adjacent, { x: 30, y: 55, z: 31 });
});
