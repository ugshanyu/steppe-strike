import {
  AIR_ACCEL, BUTTON, FRICTION, GRAVITY, GROUND_ACCEL, JUMP_SPEED, MOVE_SPEED,
} from './constants.js';
import { moveWithCollisions } from './world.js';

const approach = (value, target, maxDelta) => {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
};

export function stepMovement(state, input, dt) {
  const buttons = input.buttons || 0;
  const forward = Number(Boolean(buttons & BUTTON.FORWARD)) - Number(Boolean(buttons & BUTTON.BACK));
  const strafe = Number(Boolean(buttons & BUTTON.RIGHT)) - Number(Boolean(buttons & BUTTON.LEFT));
  const length = Math.hypot(forward, strafe) || 1;
  const f = forward / length;
  const s = strafe / length;
  const sin = Math.sin(state.yaw);
  const cos = Math.cos(state.yaw);
  const desiredX = (-sin * f + cos * s) * MOVE_SPEED;
  const desiredZ = (-cos * f - sin * s) * MOVE_SPEED;
  const grounded = state.y <= 0.0001;
  const accel = grounded ? GROUND_ACCEL : AIR_ACCEL;

  if (forward || strafe) {
    state.vx = approach(state.vx, desiredX, accel * dt);
    state.vz = approach(state.vz, desiredZ, accel * dt);
  } else if (grounded) {
    state.vx = approach(state.vx, 0, FRICTION * dt);
    state.vz = approach(state.vz, 0, FRICTION * dt);
  }
  if (grounded && (buttons & BUTTON.JUMP) && !state.jumpHeld) state.vy = JUMP_SPEED;
  state.jumpHeld = Boolean(buttons & BUTTON.JUMP);
  state.vy -= GRAVITY * dt;
  moveWithCollisions(state, state.vx * dt, state.vz * dt);
  state.y += state.vy * dt;
  if (state.y <= 0) {
    state.y = 0;
    state.vy = 0;
  }
}

