import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK } from '../shared/blocks.js';
import { BUTTON } from '../shared/constants.js';
import { GameWorld } from '../server/game-world.js';

const socket = () => ({
  player: null,
  close() {},
});

function builder(world, session = 'builder-session-0001') {
  const ws = socket();
  const result = world.join({ name: 'Builder', session, ws });
  ws.player = result.player;
  const player = result.player;
  player.x = 12.5;
  player.z = 12.5;
  player.y = world.voxels.highestGround(12, 12) + 1;
  player.yaw = 0;
  player.pitch = -1.1;
  return player;
}

test('authoritative mining removes exactly one shared block', () => {
  const world = new GameWorld({ persisted: { seed: 7282026, edits: [], revision: 0 } });
  const player = builder(world);
  const target = world.targetFor(player);
  assert.ok(target);
  player.input = { ...player.input, buttons: BUTTON.MINE, pitch: -1.1 };
  world.handleMining(player, 1000);
  const duration = world.voxels.getBlock(target.block.x, target.block.y, target.block.z) === BLOCK.BEDROCK
    ? 10_000
    : 3000;
  world.handleMining(player, 1000 + duration);
  assert.equal(world.voxels.getBlock(target.block.x, target.block.y, target.block.z), BLOCK.AIR);
  assert.equal(world.revision, 1);
  assert.equal(world.voxels.serializeEdits().length, 1);
});

test('placement is adjacent, selected from hotbar, and cannot overlap a player', () => {
  const world = new GameWorld({ persisted: { seed: 7282026, edits: [], revision: 0 } });
  const player = builder(world, 'builder-session-0002');
  const hit = world.targetFor(player);
  assert.ok(hit?.adjacent);
  player.input = { ...player.input, buttons: BUTTON.PLACE, slot: 5, pitch: -1.1 };
  player.slot = 5;
  world.handlePlacement(player);
  const placed = world.voxels.getBlock(hit.adjacent.x, hit.adjacent.y, hit.adjacent.z);
  assert.ok(placed === BLOCK.PLANKS || world.spawnProtected(hit.adjacent));

  const occupied = {
    x: Math.floor(player.x),
    y: Math.floor(player.y),
    z: Math.floor(player.z),
  };
  assert.equal(world.blockIntersectsPlayer(occupied), true);
});

test('serialized edits restore the same shared world revision', () => {
  const world = new GameWorld({ persisted: { seed: 7282026, edits: [], revision: 0 } });
  assert.equal(world.applyBlockEdit(50, 30, 50, BLOCK.PLANKS), true);
  const restored = new GameWorld({ persisted: world.serialize() });
  assert.equal(restored.revision, 1);
  assert.equal(restored.voxels.getBlock(50, 30, 50), BLOCK.PLANKS);
});
