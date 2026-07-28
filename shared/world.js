import { PLAYER_RADIUS, WORLD_HALF } from './constants.js';

const block = (x, z, w, d, h, material = 'stone') => ({ x, z, w, d, h, material });

export const OBSTACLES = [
  block(0, 0, 8, 8, 2.6, 'stone'),
  block(-15, 0, 8, 2, 2.2, 'wood'),
  block(15, 0, 8, 2, 2.2, 'wood'),
  block(0, -16, 2, 8, 2.2, 'wood'),
  block(0, 16, 2, 8, 2.2, 'wood'),
  block(-26, -18, 10, 2, 3, 'blue'),
  block(-31, -13, 2, 10, 3, 'blue'),
  block(-26, 18, 10, 2, 3, 'blue'),
  block(-31, 13, 2, 10, 3, 'blue'),
  block(26, -18, 10, 2, 3, 'red'),
  block(31, -13, 2, 10, 3, 'red'),
  block(26, 18, 10, 2, 3, 'red'),
  block(31, 13, 2, 10, 3, 'red'),
  block(-15, -15, 3, 3, 1.5, 'sand'),
  block(-15, 15, 3, 3, 1.5, 'sand'),
  block(15, -15, 3, 3, 1.5, 'sand'),
  block(15, 15, 3, 3, 1.5, 'sand'),
  block(-7, -29, 5, 2, 1.6, 'stone'),
  block(7, 29, 5, 2, 1.6, 'stone'),
  block(7, -29, 5, 2, 1.6, 'stone'),
  block(-7, 29, 5, 2, 1.6, 'stone'),
];

export const SPAWNS = {
  1: [
    { x: -39, z: -30, yaw: -Math.PI / 2 },
    { x: -39, z: 0, yaw: -Math.PI / 2 },
    { x: -39, z: 30, yaw: -Math.PI / 2 },
    { x: -34, z: -35, yaw: -Math.PI / 2 },
    { x: -34, z: 35, yaw: -Math.PI / 2 },
  ],
  2: [
    { x: 39, z: 30, yaw: Math.PI / 2 },
    { x: 39, z: 0, yaw: Math.PI / 2 },
    { x: 39, z: -30, yaw: Math.PI / 2 },
    { x: 34, z: 35, yaw: Math.PI / 2 },
    { x: 34, z: -35, yaw: Math.PI / 2 },
  ],
};

export function testSpawns(team) {
  return team === 1
    ? [{ x: -8, z: -10, yaw: -Math.PI / 2 }]
    : [{ x: 8, z: -10, yaw: Math.PI / 2 }];
}

export function collides(x, z, radius = PLAYER_RADIUS) {
  if (Math.abs(x) > WORLD_HALF - radius || Math.abs(z) > WORLD_HALF - radius) return true;
  return OBSTACLES.some((o) =>
    x + radius > o.x - o.w / 2 && x - radius < o.x + o.w / 2
    && z + radius > o.z - o.d / 2 && z - radius < o.z + o.d / 2);
}

export function moveWithCollisions(state, dx, dz) {
  const nx = state.x + dx;
  if (!collides(nx, state.z)) state.x = nx;
  else state.vx = 0;
  const nz = state.z + dz;
  if (!collides(state.x, nz)) state.z = nz;
  else state.vz = 0;
}

export function rayBoxDistance(origin, direction, box, maxDistance) {
  const min = [box.x - box.w / 2, 0, box.z - box.d / 2];
  const max = [box.x + box.w / 2, box.h, box.z + box.d / 2];
  const o = [origin.x, origin.y, origin.z];
  const d = [direction.x, direction.y, direction.z];
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(d[axis]) < 1e-8) {
      if (o[axis] < min[axis] || o[axis] > max[axis]) return Infinity;
      continue;
    }
    let a = (min[axis] - o[axis]) / d[axis];
    let b = (max[axis] - o[axis]) / d[axis];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return Infinity;
  }
  return near >= 0 ? near : far;
}

export function terrainRayDistance(origin, direction, maxDistance) {
  let nearest = maxDistance;
  for (const obstacle of OBSTACLES) {
    nearest = Math.min(nearest, rayBoxDistance(origin, direction, obstacle, maxDistance));
  }
  return nearest;
}
