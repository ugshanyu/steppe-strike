import { BLOCK, isSolid } from './blocks.js';
import {
  WORLD_HEIGHT, WORLD_SEED, terrainHeight,
} from './terrain.js';
import { lookDirection, voxelRaycast } from './voxel-ray.js';
import { VoxelWorld } from './voxel-world.js';

export const COMBAT_MAP_ID = 'steppe-world-small-v1';
export const COMBAT_MAP_SEED = WORLD_SEED;
export const ARENA_HALF_X = 40;
export const ARENA_HALF_Z = 28;

const withinBoundary = (x, z) =>
  Math.abs(x) < ARENA_HALF_X && Math.abs(z) < ARENA_HALF_Z;

const onBoundary = (x, z) => (
  (Math.abs(x) === ARENA_HALF_X && Math.abs(z) <= ARENA_HALF_Z)
  || (Math.abs(z) === ARENA_HALF_Z && Math.abs(x) <= ARENA_HALF_X)
);

/**
 * The approved Steppe World terrain, reduced to one competitive region.
 * Terrain generation is untouched; only the perimeter and edit policy differ.
 */
export class CombatMap {
  constructor() {
    this.seed = COMBAT_MAP_SEED;
    this.id = COMBAT_MAP_ID;
    this.world = new VoxelWorld(this.seed);
  }

  getBlock(x, y, z) {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y < 0) return BLOCK.BEDROCK;
    if (y >= WORLD_HEIGHT) return BLOCK.AIR;
    if (withinBoundary(x, z)) return this.world.getBlock(x, y, z);
    if (onBoundary(x, z) && y <= terrainHeight(this.seed, x, z) + 5) {
      return BLOCK.BEDROCK;
    }
    return BLOCK.AIR;
  }

  setBlock() {
    return false;
  }

  editsForChunk() {
    return [];
  }

  highestGround(x, z) {
    for (let y = WORLD_HEIGHT - 2; y >= 0; y -= 1) {
      if (isSolid(this.getBlock(x, y, z)) && !isSolid(this.getBlock(x, y + 1, z))) {
        return y;
      }
    }
    return 0;
  }

  findSpawn() {
    return { ...TEAM_SPAWNS[1][0] };
  }
}

function safeSpawn(world, targetX, targetZ, yaw) {
  for (let radius = 0; radius <= 5; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = targetX + dx;
        const z = targetZ + dz;
        const ground = terrainHeight(world.seed, x, z);
        if (!isSolid(world.getBlock(x, ground, z))) continue;
        if (isSolid(world.getBlock(x, ground + 1, z))
          || isSolid(world.getBlock(x, ground + 2, z))) continue;
        const spawn = { x: x + 0.5, y: ground + 1, z: z + 0.5, yaw };
        const forwardHit = voxelRaycast(
          world,
          { x: spawn.x, y: spawn.y + 1.62, z: spawn.z },
          lookDirection(yaw, 0),
          6,
        );
        if (forwardHit) continue;
        return spawn;
      }
    }
  }
  throw new Error(`No clear competitive spawn near ${targetX},${targetZ}`);
}

const spawnWorld = new VoxelWorld(COMBAT_MAP_SEED);
const spawnRows = [-16, -8, 0, 8, 16];

export const TEAM_SPAWNS = Object.freeze({
  1: Object.freeze(spawnRows.map((z) => Object.freeze(
    safeSpawn(spawnWorld, -33, z, -Math.PI / 2),
  ))),
  2: Object.freeze(spawnRows.map((z) => Object.freeze(
    safeSpawn(spawnWorld, 33, -z, Math.PI / 2),
  ))),
});
