import { BLOCK, isSolid } from './blocks.js';
import {
  CHUNK_SIZE, WORLD_BORDER, WORLD_HEIGHT, chunkKey, floorDiv, generateChunk,
  localCoord, voxelIndex, voxelKey,
} from './terrain.js';

export class VoxelWorld {
  constructor(seed, edits = [], { cacheLimit = 384 } = {}) {
    this.seed = seed;
    this.cacheLimit = cacheLimit;
    this.chunks = new Map();
    this.edits = new Map();
    this.editsByChunk = new Map();
    this.loadEdits(edits);
  }

  inBounds(x, y, z) {
    return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z)
      && Math.abs(x) < WORLD_BORDER && Math.abs(z) < WORLD_BORDER
      && y >= 0 && y < WORLD_HEIGHT;
  }

  getChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) {
      this.chunks.delete(key);
      this.chunks.set(key, chunk);
      return chunk;
    }
    chunk = generateChunk(this.seed, cx, cz);
    this.chunks.set(key, chunk);
    while (this.chunks.size > this.cacheLimit) {
      this.chunks.delete(this.chunks.keys().next().value);
    }
    return chunk;
  }

  getBaseBlock(x, y, z) {
    if (y < 0 || Math.abs(x) >= WORLD_BORDER || Math.abs(z) >= WORLD_BORDER) {
      return BLOCK.BEDROCK;
    }
    if (y >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = floorDiv(x);
    const cz = floorDiv(z);
    return this.getChunk(cx, cz)[voxelIndex(localCoord(x), y, localCoord(z))];
  }

  getBlock(x, y, z) {
    return this.edits.get(voxelKey(x, y, z)) ?? this.getBaseBlock(x, y, z);
  }

  setBlock(x, y, z, id) {
    if (!this.inBounds(x, y, z) || id < BLOCK.AIR || id > BLOCK.PLANKS) return false;
    if (this.getBlock(x, y, z) === id) return false;
    const key = voxelKey(x, y, z);
    const bucketKey = chunkKey(floorDiv(x), floorDiv(z));
    if (id === this.getBaseBlock(x, y, z)) {
      this.edits.delete(key);
      const bucket = this.editsByChunk.get(bucketKey);
      bucket?.delete(key);
      if (!bucket?.size) this.editsByChunk.delete(bucketKey);
    } else {
      this.edits.set(key, id);
      let bucket = this.editsByChunk.get(bucketKey);
      if (!bucket) {
        bucket = new Map();
        this.editsByChunk.set(bucketKey, bucket);
      }
      bucket.set(key, id);
    }
    return true;
  }

  loadEdits(edits) {
    if (!Array.isArray(edits)) return;
    for (const edit of edits) {
      if (!Array.isArray(edit) || edit.length !== 4) continue;
      const [x, y, z, id] = edit.map(Number);
      if (!this.inBounds(x, y, z) || !Number.isInteger(id)
        || id < BLOCK.AIR || id > BLOCK.PLANKS) continue;
      if (id === this.getBaseBlock(x, y, z)) continue;
      const key = voxelKey(x, y, z);
      const bucketKey = chunkKey(floorDiv(x), floorDiv(z));
      this.edits.set(key, id);
      let bucket = this.editsByChunk.get(bucketKey);
      if (!bucket) {
        bucket = new Map();
        this.editsByChunk.set(bucketKey, bucket);
      }
      bucket.set(key, id);
    }
  }

  serializeEdits() {
    return [...this.edits].map(([key, id]) => [...key.split(',').map(Number), id]);
  }

  editsForChunk(cx, cz) {
    const bucket = this.editsByChunk.get(chunkKey(cx, cz));
    if (!bucket) return [];
    return [...bucket].map(([key, id]) => [...key.split(',').map(Number), id]);
  }

  highestGround(x, z) {
    for (let y = WORLD_HEIGHT - 2; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (isSolid(id) && !isSolid(this.getBlock(x, y + 1, z))) return y;
    }
    return 0;
  }

  findSpawn() {
    for (let radius = 0; radius < 32; radius++) {
      for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
          if (Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
          const ground = this.highestGround(x, z);
          if (ground > 0 && !isSolid(this.getBlock(x, ground + 1, z))
            && !isSolid(this.getBlock(x, ground + 2, z))) {
            return { x: x + 0.5, y: ground + 1, z: z + 0.5, yaw: 0 };
          }
        }
      }
    }
    return { x: 0.5, y: 32, z: 0.5, yaw: 0 };
  }
}
