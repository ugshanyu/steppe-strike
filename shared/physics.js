import { isLiquid, isSolid } from './blocks.js';
import {
  AIR_ACCEL, BUTTON, FRICTION, GRAVITY, GROUND_ACCEL, JUMP_SPEED,
  MOVE_SPEED, PLAYER_HEIGHT, PLAYER_RADIUS,
} from './constants.js';

const EPSILON = 1e-4;
const approach = (value, target, delta) => (
  value < target ? Math.min(value + delta, target) : Math.max(value - delta, target)
);

export function collidesPlayer(world, x, y, z) {
  const minX = Math.floor(x - PLAYER_RADIUS + EPSILON);
  const maxX = Math.floor(x + PLAYER_RADIUS - EPSILON);
  const minY = Math.floor(y + EPSILON);
  const maxY = Math.floor(y + PLAYER_HEIGHT - EPSILON);
  const minZ = Math.floor(z - PLAYER_RADIUS + EPSILON);
  const maxZ = Math.floor(z + PLAYER_RADIUS - EPSILON);
  for (let by = minY; by <= maxY; by++) {
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(world.getBlock(bx, by, bz))) return true;
      }
    }
  }
  return false;
}

export const isGrounded = (world, state) => (
  collidesPlayer(world, state.x, state.y - 0.06, state.z)
);

export const isSwimming = (world, state) => (
  isLiquid(world.getBlock(Math.floor(state.x), Math.floor(state.y + 0.35), Math.floor(state.z)))
  || isLiquid(world.getBlock(
    Math.floor(state.x), Math.floor(state.y + PLAYER_HEIGHT - 0.2), Math.floor(state.z),
  ))
);

function moveHorizontal(world, state, axis, delta) {
  if (!delta) return;
  const next = state[axis] + delta;
  const x = axis === 'x' ? next : state.x;
  const z = axis === 'z' ? next : state.z;
  if (!collidesPlayer(world, x, state.y, z)) state[axis] = next;
  else state[axis === 'x' ? 'vx' : 'vz'] = 0;
}

function moveVertical(world, state, delta) {
  if (!delta) return;
  const next = state.y + delta;
  if (!collidesPlayer(world, state.x, next, state.z)) {
    state.y = next;
    return;
  }
  state.vy = 0;
}

export function stepMovement(world, state, input, dt) {
  const buttons = input.buttons || 0;
  const forward = Number(Boolean(buttons & BUTTON.FORWARD))
    - Number(Boolean(buttons & BUTTON.BACK));
  const strafe = Number(Boolean(buttons & BUTTON.RIGHT))
    - Number(Boolean(buttons & BUTTON.LEFT));
  const length = Math.hypot(forward, strafe) || 1;
  const sin = Math.sin(state.yaw);
  const cos = Math.cos(state.yaw);
  const desiredX = (-sin * forward / length + cos * strafe / length) * MOVE_SPEED;
  const desiredZ = (-cos * forward / length - sin * strafe / length) * MOVE_SPEED;
  const grounded = isGrounded(world, state);
  const swimming = isSwimming(world, state);
  const acceleration = grounded ? GROUND_ACCEL : AIR_ACCEL;

  if (forward || strafe) {
    state.vx = approach(state.vx, desiredX, acceleration * dt);
    state.vz = approach(state.vz, desiredZ, acceleration * dt);
  } else if (grounded) {
    state.vx = approach(state.vx, 0, FRICTION * dt);
    state.vz = approach(state.vz, 0, FRICTION * dt);
  }
  if (swimming) {
    state.vx *= 0.86;
    state.vz *= 0.86;
    state.vy *= 0.82;
    if (buttons & BUTTON.JUMP) state.vy = Math.max(state.vy, 3.4);
  } else if (grounded && (buttons & BUTTON.JUMP) && !state.jumpHeld) {
    state.vy = JUMP_SPEED;
  }
  state.jumpHeld = Boolean(buttons & BUTTON.JUMP);
  state.vy -= (swimming ? GRAVITY * 0.18 : GRAVITY) * dt;

  moveHorizontal(world, state, 'x', state.vx * dt);
  moveHorizontal(world, state, 'z', state.vz * dt);
  moveVertical(world, state, state.vy * dt);
}
