export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 15;
export const MAX_PLAYERS = 96;
export const PLAYER_RADIUS = 0.34;
export const PLAYER_HEIGHT = 1.78;
export const EYE_HEIGHT = 1.62;
export const PLAYER_VISIBILITY = 112;
export const MOVE_SPEED = 4.8;
export const GROUND_ACCEL = 34;
export const AIR_ACCEL = 8;
export const FRICTION = 14;
export const JUMP_SPEED = 7.2;
export const GRAVITY = 21;
export const BUILD_REACH = 5.5;
export const MAX_WORLD_EDITS = 250_000;

export const BUTTON = Object.freeze({
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  MINE: 32,
  PLACE: 64,
});

export const MSG = Object.freeze({
  INPUT: 1,
  PING: 2,
  SNAPSHOT: 16,
  PONG: 17,
});
