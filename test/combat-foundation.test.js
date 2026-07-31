import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestPlayerHit, PLAYER_HITBOX, raycastPlayer, resolveShot, RIFLE, TransformHistory,
} from '../shared/combat.js';

const pose = (x, y, z, extras = {}) => ({
  x, y, z, yaw: 0, pitch: 0, alive: true, ...extras,
});

const history = (...samples) => {
  const result = new TransformHistory();
  for (const [timeMs, playerPose] of samples) {
    assert.equal(result.push(timeMs, playerPose), true);
  }
  return result;
};

test('rifle and hitbox constants are immutable server rules', () => {
  assert.equal(Object.isFrozen(RIFLE), true);
  assert.equal(Object.isFrozen(PLAYER_HITBOX), true);
  assert.equal(RIFLE.bodyDamage, 34);
  assert.equal(RIFLE.headDamage, 100);
  assert.equal(RIFLE.maxRewindMs, 200);
});

test('transform history is bounded and interpolates poses and wrapped yaw', () => {
  const transforms = new TransformHistory({ capacity: 3, maxAgeMs: 1_000 });
  transforms.push(100, pose(0, 0, 0, { yaw: Math.PI - 0.1 }));
  transforms.push(200, pose(2, 2, 4, { yaw: -Math.PI + 0.1 }));
  transforms.push(300, pose(4, 4, 8));
  transforms.push(400, pose(6, 6, 12));
  assert.equal(transforms.size, 3);
  assert.equal(transforms.sample(100, 400), null);
  const middle = transforms.sample(250, 300);
  assert.deepEqual(
    { x: middle.x, y: middle.y, z: middle.z },
    { x: 3, y: 3, z: 6 },
  );

  const angles = new TransformHistory();
  angles.push(100, pose(0, 0, 0, { yaw: Math.PI - 0.1 }));
  angles.push(200, pose(0, 0, 0, { yaw: -Math.PI + 0.1 }));
  assert.ok(Math.abs(Math.abs(angles.sample(150, 200).yaw) - Math.PI) < 1e-9);
  assert.equal(angles.push(190, pose(0, 0, 0)), false);
});

test('rewind samples reject future and timestamps beyond the cap', () => {
  const transforms = history(
    [800, pose(0, 0, -10)],
    [900, pose(0, 0, -10)],
    [1_000, pose(0, 0, -10)],
  );
  assert.equal(transforms.sample(1_001, 1_000), null);
  assert.equal(transforms.sample(799, 1_000), null);
  assert.equal(transforms.sample(799, 1_000, 10_000), null);
  assert.equal(transforms.sample(800, 1_000).z, -10);
});

test('capsule raycast classifies body and head intersections', () => {
  const target = pose(0, 0, -10);
  const body = raycastPlayer(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    target,
  );
  const head = raycastPlayer(
    { x: 0, y: 1.62, z: 0 },
    { x: 0, y: 0, z: -1 },
    target,
  );
  assert.ok(body.distance > 9 && body.distance < 10);
  assert.equal(body.headshot, false);
  assert.equal(head.headshot, true);
  assert.equal(raycastPlayer(
    { x: 1, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    target,
  ), null);
});

test('nearest hit uses rewound interpolation, not the current transform', () => {
  const moving = {
    id: 7,
    alive: true,
    history: history(
      [900, pose(2, 0, -10)],
      [1_000, pose(-2, 0, -10)],
    ),
  };
  const hit = nearestPlayerHit({
    origin: { x: 0, y: 1, z: 0 },
    direction: { x: 0, y: 0, z: -1 },
    candidates: [moving],
    shotTimeMs: 950,
    serverTimeMs: 1_000,
  });
  assert.equal(hit.targetId, 7);
  assert.equal(hit.headshot, false);
});

test('resolveShot picks the nearest player and owns body damage', () => {
  const candidates = [
    {
      id: 2,
      alive: true,
      claimedDamage: 9_999,
      history: history([1_000, pose(0, 0, -20)]),
    },
    { id: 3, alive: true, history: history([1_000, pose(0, 0, -10)]) },
  ];
  const result = resolveShot({
    shooterPose: pose(0, 0, 0, { id: 1, pitch: -0.06 }),
    candidates,
    raycastWorld: () => null,
    serverTimeMs: 1_000,
    claimedShotTimeMs: 1_000,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.hit, true);
  assert.equal(result.targetId, 3);
  assert.equal(result.damage, RIFLE.bodyDamage);
  assert.equal(result.headshot, false);
  assert.equal(candidates[1].health, undefined);
});

test('resolveShot applies server headshot damage and respects voxel occlusion', () => {
  const target = { id: 2, alive: true, history: history([1_000, pose(0, 0, -10)]) };
  const shooterPose = pose(0, 0, 0, { id: 1 });
  const headshot = resolveShot({
    shooterPose,
    candidates: [target],
    raycastWorld: () => null,
    serverTimeMs: 1_000,
    claimedShotTimeMs: 1_000,
  });
  assert.equal(headshot.damage, RIFLE.headDamage);
  assert.equal(headshot.headshot, true);

  const blocked = resolveShot({
    shooterPose,
    candidates: [target],
    raycastWorld: () => ({ distance: 5 }),
    serverTimeMs: 1_000,
    claimedShotTimeMs: 1_000,
  });
  assert.equal(blocked.hit, false);
  assert.equal(blocked.damage, 0);
  assert.equal(blocked.reason, 'occluded');
});

test('resolveShot rejects invalid, dead, future, and too-old shots', () => {
  const base = {
    shooterPose: pose(0, 0, 0, { id: 1 }),
    candidates: [],
    raycastWorld: () => null,
    serverTimeMs: 1_000,
    claimedShotTimeMs: 1_000,
  };
  assert.equal(resolveShot({
    ...base, shooterPose: { ...base.shooterPose, id: undefined },
  }).reason, 'invalid');
  assert.equal(resolveShot({ ...base, shooterPose: { ...base.shooterPose, x: NaN } }).reason, 'invalid');
  assert.equal(resolveShot({
    ...base, shooterPose: { ...base.shooterPose, yaw: NaN },
  }).reason, 'invalid');
  assert.equal(resolveShot({
    ...base, shooterPose: { ...base.shooterPose, alive: false },
  }).reason, 'shooter-dead');
  assert.equal(resolveShot({ ...base, claimedShotTimeMs: 1_001 }).reason, 'shot-in-future');
  assert.equal(resolveShot({ ...base, claimedShotTimeMs: 799 }).reason, 'shot-too-old');
});

test('targets beyond rifle range cannot receive damage', () => {
  const result = resolveShot({
    shooterPose: pose(0, 0, 0, { id: 1 }),
    candidates: [{
      id: 2,
      alive: true,
      history: history([1_000, pose(0, 0, -(RIFLE.maxRange + 20))]),
    }],
    raycastWorld: () => null,
    serverTimeMs: 1_000,
    claimedShotTimeMs: 1_000,
  });
  assert.equal(result.hit, false);
  assert.equal(result.accepted, false);
  assert.equal(result.damage, 0);
  assert.equal(result.reason, 'out-of-range');
});

test('server-owned spread is deterministic for a shot seed', () => {
  const shooter = pose(0, 0, 0, {
    id: 's', yaw: -Math.PI / 2, health: 100, alive: true,
  });
  const target = {
    id: 'target',
    alive: true,
    history: history([1_000, pose(20, 0, 0)]),
  };
  const fire = () => resolveShot({
    shooterPose: shooter,
    candidates: [target],
    raycastWorld: () => null,
    serverTimeMs: 1_000,
    claimedShotTimeMs: 1_000,
    spreadSeed: 731,
    spreadRadians: RIFLE.baseSpreadRadians,
  });
  assert.deepEqual(fire(), fire());
});
