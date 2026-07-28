import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON, DT, MOVE_SPEED } from '../shared/constants.js';
import { stepMovement } from '../shared/physics.js';
import { collides, OBSTACLES, terrainRayDistance } from '../shared/world.js';

test('world boundaries and cover reject player movement', () => {
  assert.equal(collides(47.8, 0), true);
  assert.equal(collides(0, 0), true);
  assert.equal(collides(-8, -10), false);
});

test('shared movement accelerates without exceeding top speed', () => {
  const player = { x: -8, y: 0, z: -10, vx: 0, vy: 0, vz: 0, yaw: -Math.PI / 2 };
  const input = { buttons: BUTTON.FORWARD };
  for (let i = 0; i < 120; i++) stepMovement(player, input, DT);
  assert.ok(player.x > -2);
  assert.ok(Math.hypot(player.vx, player.vz) <= MOVE_SPEED + 1e-6);
});

test('terrain ray stops at the first central block', () => {
  const distance = terrainRayDistance(
    { x: -10, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    100,
  );
  assert.ok(Math.abs(distance - 6) < .001);
  assert.ok(OBSTACLES.length >= 20);
});
