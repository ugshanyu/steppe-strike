import { isTargetable } from './blocks.js';

export function lookDirection(yaw, pitch) {
  const horizontal = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * horizontal,
  };
}

const axisStep = (origin, cell, direction) => {
  if (Math.abs(direction) < 1e-9) return { step: 0, delta: Infinity, next: Infinity };
  const step = direction > 0 ? 1 : -1;
  const boundary = direction > 0 ? cell + 1 : cell;
  return {
    step,
    delta: Math.abs(1 / direction),
    next: (boundary - origin) / direction,
  };
};

export function voxelRaycast(world, origin, direction, maxDistance = 5.5) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const ax = axisStep(origin.x, x, direction.x);
  const ay = axisStep(origin.y, y, direction.y);
  const az = axisStep(origin.z, z, direction.z);
  let tx = ax.next;
  let ty = ay.next;
  let tz = az.next;
  let distance = 0;
  let adjacent = null;

  while (distance <= maxDistance) {
    const id = world.getBlock(x, y, z);
    if (isTargetable(id)) {
      return {
        block: { x, y, z, id },
        adjacent,
        distance,
      };
    }
    adjacent = { x, y, z };
    if (tx <= ty && tx <= tz) {
      x += ax.step;
      distance = tx;
      tx += ax.delta;
    } else if (ty <= tz) {
      y += ay.step;
      distance = ty;
      ty += ay.delta;
    } else {
      z += az.step;
      distance = tz;
      tz += az.delta;
    }
  }
  return null;
}
