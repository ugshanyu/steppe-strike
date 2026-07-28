export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 15;
export const WORLD_HALF = 48;
export const MAX_PLAYERS = 96;
export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const MOVE_SPEED = 7.2;
export const GROUND_ACCEL = 42;
export const AIR_ACCEL = 10;
export const FRICTION = 12;
export const JUMP_SPEED = 7;
export const GRAVITY = 20;
export const MAX_HP = 100;
export const MAG_SIZE = 30;
export const RELOAD_MS = 2200;
export const FIRE_INTERVAL_MS = 100;
export const BODY_DAMAGE = 34;
export const HEAD_DAMAGE = 100;
export const SHOT_RANGE = 110;
export const RESPAWN_MS = 3000;
export const SPAWN_SHIELD_MS = 1200;
export const TEAM_BLUE = 1;
export const TEAM_RED = 2;
export const TEAM_LIMIT = 50;

export const BUTTON = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  FIRE: 32,
  RELOAD: 64,
};

export const MSG = {
  INPUT: 1,
  PING: 2,
  SNAPSHOT: 16,
  PONG: 17,
};
