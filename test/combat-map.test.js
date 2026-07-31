import assert from 'node:assert/strict';
import test from 'node:test';
import { BLOCK } from '../shared/blocks.js';
import {
  ARENA_HALF_X, ARENA_HALF_Z, CombatMap, TEAM_SPAWNS,
} from '../shared/combat-map.js';
import { collidesPlayer } from '../shared/physics.js';
import { VoxelWorld } from '../shared/voxel-world.js';

test('competitive arena is deterministic and immutable', () => {
  const first = new CombatMap();
  const second = new CombatMap();
  const original = new VoxelWorld(first.seed);
  for (const point of [[0, 20, 0], [-13, 19, 2], [8, 20, -11], [31, 21, 0]]) {
    assert.equal(first.getBlock(...point), second.getBlock(...point));
    assert.equal(first.getBlock(...point), original.getBlock(...point));
  }
  assert.equal(first.setBlock(0, 2, 0, BLOCK.AIR), false);
});

test('small arena keeps natural terrain, sealed borders, and clear team spawns', () => {
  const map = new CombatMap();
  assert.notEqual(map.getBlock(0, map.highestGround(0, 0), 0), BLOCK.AIR);
  assert.equal(map.getBlock(ARENA_HALF_X, 20, 0), BLOCK.BEDROCK);
  assert.equal(map.getBlock(0, 20, ARENA_HALF_Z), BLOCK.BEDROCK);
  assert.equal(map.getBlock(ARENA_HALF_X + 1, 20, 0), BLOCK.AIR);
  for (const spawns of Object.values(TEAM_SPAWNS)) {
    for (const spawn of spawns) {
      assert.equal(collidesPlayer(map, spawn.x, spawn.y, spawn.z), false);
    }
  }
});
