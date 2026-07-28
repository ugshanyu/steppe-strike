import test from 'node:test';
import assert from 'node:assert/strict';
import { HEAD_DAMAGE } from '../shared/constants.js';
import { resolveShot, shotDirection } from '../server/combat.js';

const player = (overrides) => ({
  x: -8, y: 0, z: -10, yaw: -Math.PI / 2, pitch: 0,
  alive: true, team: 1, shieldUntil: 0, ...overrides,
});

test('yaw convention matches first-person camera direction', () => {
  const direction = shotDirection(-Math.PI / 2, 0);
  assert.ok(direction.x > .999);
  assert.ok(Math.abs(direction.z) < .001);
});

test('server detects a headshot before the terrain', () => {
  const shooter = player({});
  const victim = player({ x: 8, team: 2 });
  const shot = resolveShot(shooter, [shooter, victim], Date.now());
  assert.equal(shot.victim, victim);
  assert.equal(shot.headshot, true);
  assert.equal(shot.damage, HEAD_DAMAGE);
});

test('friendly fire and spawn-shield damage are rejected', () => {
  const shooter = player({});
  const teammate = player({ x: 4, team: 1 });
  const shieldedEnemy = player({ x: 8, team: 2, shieldUntil: Date.now() + 1000 });
  const shot = resolveShot(shooter, [shooter, teammate, shieldedEnemy], Date.now());
  assert.equal(shot.victim, null);
});

