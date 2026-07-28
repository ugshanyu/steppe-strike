import * as THREE from 'three';
import { BLOCK, blockDef, isOpaque } from '../shared/blocks.js';
import { hash3 } from '../shared/noise.js';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../shared/terrain.js';

const FACES = [
  { n: [1, 0, 0], shade: 0.78, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], shade: 0.68, corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], shade: 1, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], shade: 0.55, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], shade: 0.84, corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], shade: 0.72, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

const colorFor = (id, face, shade, x, y, z) => {
  const block = blockDef(id);
  const hex = face.n[1] > 0 ? block.topColor : block.sideColor;
  const color = new THREE.Color(hex);
  const variation = 0.92 + hash3(id * 7919, x, y, z) * 0.12;
  color.multiplyScalar(shade * variation);
  return color;
};

function geometryFor(world, cx, cz, water) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z++) {
      for (let x = startX; x < startX + CHUNK_SIZE; x++) {
        const id = world.getBlock(x, y, z);
        if ((water && id !== BLOCK.WATER) || (!water && (id === BLOCK.AIR || id === BLOCK.WATER))) {
          continue;
        }
        for (const face of FACES) {
          const neighbor = world.getBlock(x + face.n[0], y + face.n[1], z + face.n[2]);
          const hidden = water ? neighbor === BLOCK.WATER : (neighbor === id || isOpaque(neighbor));
          if (hidden) continue;
          const base = positions.length / 3;
          const color = colorFor(id, face, face.shade, x, y, z);
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.n);
            colors.push(color.r, color.g, color.b);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createChunkGroup(world, cx, cz, materials) {
  const group = new THREE.Group();
  group.userData.chunk = `${cx},${cz}`;
  const solid = new THREE.Mesh(geometryFor(world, cx, cz, false), materials.solid);
  solid.receiveShadow = true;
  const water = new THREE.Mesh(geometryFor(world, cx, cz, true), materials.water);
  water.renderOrder = 2;
  group.add(solid, water);
  return group;
}

export function disposeChunk(group) {
  group.traverse((child) => child.geometry?.dispose());
}
