import { BLOCK } from './blocks.js';
import { fbm2, hash2, valueNoise3 } from './noise.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const WORLD_BORDER = 8192;
export const SEA_LEVEL = 18;
export const WORLD_SEED = 7282026;
const TREE_DENSITY = 0.0075;

export const floorDiv = (value, size = CHUNK_SIZE) => Math.floor(value / size);
export const localCoord = (value, size = CHUNK_SIZE) => ((value % size) + size) % size;
export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const voxelKey = (x, y, z) => `${x},${y},${z}`;
export const voxelIndex = (x, y, z) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);

export function terrainHeight(seed, x, z) {
  const continental = fbm2(seed, x / 150, z / 150, 4);
  const hills = fbm2(seed + 811, x / 48, z / 48, 3);
  const detail = fbm2(seed + 2371, x / 18, z / 18, 2);
  return Math.max(5, Math.min(46,
    Math.floor(SEA_LEVEL + 3 + continental * 10 + hills * 4 + detail * 1.5)));
}

function treeAt(seed, x, z) {
  if (Math.abs(x) < 7 && Math.abs(z) < 7) return false;
  const height = terrainHeight(seed, x, z);
  if (height <= SEA_LEVEL + 1) return false;
  if (hash2(seed + 991, x, z) > TREE_DENSITY) return false;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dz) continue;
      if (hash2(seed + 991, x + dx, z + dz) < hash2(seed + 991, x, z)) return false;
    }
  }
  return true;
}

function terrainBlock(seed, x, y, z, surface) {
  if (y === 0) return BLOCK.BEDROCK;
  if (y > surface) return y <= SEA_LEVEL ? BLOCK.WATER : BLOCK.AIR;
  if (y === surface) return surface <= SEA_LEVEL + 1 ? BLOCK.SAND : BLOCK.GRASS;
  if (y >= surface - 3) return surface <= SEA_LEVEL + 1 ? BLOCK.SAND : BLOCK.DIRT;
  if (y > 3 && y < surface - 3) {
    const cave = valueNoise3(seed + 5011, x / 19, y / 11, z / 19)
      + valueNoise3(seed + 7129, x / 8, y / 7, z / 8) * 0.35;
    if (cave > 0.58) return BLOCK.AIR;
  }
  const ore = valueNoise3(seed + 3203, x / 5, y / 4, z / 5);
  if (y < 24 && ore > 0.76) return BLOCK.IRON_ORE;
  if (y < 38 && ore < -0.73) return BLOCK.COAL_ORE;
  return BLOCK.STONE;
}

export function generateChunk(seed, cx, cz) {
  const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = startX + lx;
      const z = startZ + lz;
      const surface = terrainHeight(seed, x, z);
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        data[voxelIndex(lx, y, lz)] = terrainBlock(seed, x, y, z, surface);
      }
    }
  }

  for (let z = startZ - 2; z < startZ + CHUNK_SIZE + 2; z++) {
    for (let x = startX - 2; x < startX + CHUNK_SIZE + 2; x++) {
      if (!treeAt(seed, x, z)) continue;
      const ground = terrainHeight(seed, x, z);
      const trunkTop = ground + 4 + Math.floor(hash2(seed + 177, x, z) * 2);
      for (let y = ground + 1; y <= trunkTop; y++) {
        setIfInside(data, startX, startZ, x, y, z, BLOCK.LOG, true);
      }
      for (let y = trunkTop - 2; y <= trunkTop + 1; y++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) + Math.abs(dz) + Math.max(0, y - trunkTop) > 3) continue;
            setIfInside(data, startX, startZ, x + dx, y, z + dz, BLOCK.LEAVES, false);
          }
        }
      }
    }
  }
  return data;
}

function setIfInside(data, startX, startZ, x, y, z, id, overwrite) {
  const lx = x - startX;
  const lz = z - startZ;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE
    || y < 0 || y >= WORLD_HEIGHT) return;
  const index = voxelIndex(lx, y, lz);
  if (overwrite || data[index] === BLOCK.AIR) data[index] = id;
}
