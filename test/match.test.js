import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, PHASE, TEAM } from '../server/match.js';

const spawns = {
  [TEAM.ATTACKERS]: [
    { x: 1, y: 20, z: 1, yaw: 0.5 },
    { x: 2, y: 20, z: 1, yaw: 0.5 },
  ],
  [TEAM.DEFENDERS]: [
    { x: 50, y: 22, z: 50, yaw: -2.5 },
    { x: 51, y: 22, z: 50, yaw: -2.5 },
  ],
};

function create(options = {}) {
  return new Match({
    id: 'match-1',
    spawnPoints: spawns,
    warmupMs: 100,
    roundMs: 1_000,
    roundEndMs: 50,
    scoreToWin: 2,
    now: 0,
    ...options,
  });
}

function join(match, ids, now = 0) {
  return ids.map((playerId) => match.join({ playerId, name: playerId }, now).seat);
}

function start(match, now = 100) {
  match.step(now);
  assert.equal(match.phase, PHASE.LIVE);
}

test('requires valid 2-10 player configuration and fixed team spawns', () => {
  assert.throws(() => new Match({ id: 'bad', spawnPoints: {}, maxPlayers: 10 }));
  assert.throws(() => create({ minPlayers: 1 }), /between 2 and 10/);
  assert.throws(() => create({ maxPlayers: 11 }), /between 2 and 10/);
  assert.equal(Object.isFrozen(create().spawnPoints), true);
});

test('team assignment is balanced and deterministic regardless of join order', () => {
  const first = create();
  const second = create();
  join(first, ['delta', 'alpha', 'charlie', 'bravo']);
  join(second, ['bravo', 'charlie', 'alpha', 'delta']);
  const teams = (match) => Object.fromEntries(
    [...match.seats.values()].map((seat) => [seat.playerId, seat.team]),
  );
  assert.deepEqual(teams(first), teams(second));
  assert.deepEqual(teams(first), {
    delta: TEAM.DEFENDERS,
    alpha: TEAM.ATTACKERS,
    charlie: TEAM.ATTACKERS,
    bravo: TEAM.DEFENDERS,
  });
  assert.equal(first.seats.get('alpha').x, spawns.attackers[0].x);
  assert.equal(first.seats.get('charlie').x, spawns.attackers[1].x);
});

test('warmup waits for enough players and timeout advances score and rounds', () => {
  const match = create();
  join(match, ['alpha']);
  match.step(1_000);
  assert.equal(match.phase, PHASE.WARMUP);
  match.join({ playerId: 'bravo' }, 1_000);
  match.step(1_099);
  assert.equal(match.phase, PHASE.WARMUP);
  match.step(1_100);
  assert.equal(match.phase, PHASE.LIVE);
  assert.equal(match.roundNumber, 1);
  match.step(2_100);
  assert.equal(match.phase, PHASE.ROUND_END);
  assert.equal(match.scores.defenders, 1);
  match.step(2_150);
  assert.equal(match.phase, PHASE.LIVE);
  assert.equal(match.roundNumber, 2);
});

test('health, death, spectator, elimination, and round respawn are server-owned', () => {
  const match = create();
  const [alpha, bravo] = join(match, ['alpha', 'bravo']);
  start(match);
  const victim = alpha.team === TEAM.ATTACKERS ? bravo : alpha;
  const attacker = victim === alpha ? bravo : alpha;
  assert.equal(match.applyDamage(victim.playerId, 40, { attackerId: attacker.playerId, now: 120 }), true);
  assert.equal(victim.health, 60);
  assert.equal(match.applyDamage(victim.playerId, 60, { attackerId: attacker.playerId, now: 130 }), true);
  assert.equal(victim.alive, false);
  assert.equal(victim.spectator, true);
  assert.equal(attacker.kills, 1);
  assert.equal(match.phase, PHASE.ROUND_END);
  match.step(180);
  assert.equal(match.phase, PHASE.LIVE);
  assert.equal(victim.health, 100);
  assert.equal(victim.alive, true);
  assert.equal(victim.spectator, false);
});

test('optional timed respawn remains server-controlled', () => {
  const match = create({ respawnMs: 200 });
  const [one, two] = join(match, ['alpha', 'bravo']);
  start(match);
  assert.equal(match.recordKill(one.playerId, two.playerId, 150), true);
  assert.equal(two.respawnAt, 350);
  assert.equal(match.phase, PHASE.LIVE);
  match.step(349);
  assert.equal(two.alive, false);
  match.step(350);
  assert.equal(two.alive, true);
  assert.equal(two.health, 100);
  assert.equal(two.respawnAt, null);
});

test('ammo consumption and reload completion are authoritative', () => {
  const match = create({ reloadMs: 200 });
  const [seat] = join(match, ['alpha', 'bravo']);
  start(match);
  assert.equal(match.consumeAmmo(seat.playerId, 3), true);
  assert.equal(seat.ammo, 27);
  assert.equal(match.startReload(seat.playerId, 150), true);
  assert.equal(match.consumeAmmo(seat.playerId), false);
  match.step(349);
  assert.equal(seat.reloading, true);
  match.step(350);
  assert.equal(seat.reloading, false);
  assert.equal(seat.ammo, 30);
  assert.equal(seat.reserveAmmo, 87);
});

test('reconnect retains a seat within grace and expires it afterward', () => {
  const match = create({ reconnectGraceMs: 500 });
  const [seat] = join(match, ['alpha', 'bravo']);
  assert.equal(match.disconnect(seat.playerId, 10), true);
  const connected = match.join({ playerId: seat.playerId }, 509);
  assert.equal(connected.reconnected, true);
  assert.equal(connected.seat, seat);
  match.disconnect(seat.playerId, 600);
  match.step(1_101);
  assert.equal(seat.expired, true);
  assert.equal(match.join({ playerId: seat.playerId }, 1_102), null);
});

test('input state validates sequence and clamps untrusted values', () => {
  const match = create();
  const [seat] = join(match, ['alpha', 'bravo']);
  assert.equal(match.setInput(seat.playerId, {
    seq: 2, moveX: 4, moveZ: -4, yaw: 1, pitch: 9, buttons: 99_999,
  }, 20), true);
  assert.equal(seat.input.moveX, 1);
  assert.equal(seat.input.moveZ, -1);
  assert.equal(seat.input.pitch, Math.PI / 2);
  assert.equal(seat.input.buttons, 0xffff);
  assert.equal(match.setInput(seat.playerId, { seq: 1 }, 30), false);
  assert.equal(seat.input.seq, 2);
});

test('match result is generated once after score limit', () => {
  const match = create();
  const [one, two] = join(match, ['alpha', 'bravo']);
  start(match);
  const winner = one.team;
  assert.equal(match.endRound(winner, 'objective', 200), true);
  match.step(250);
  assert.equal(match.endRound(winner, 'elimination', 300), true);
  assert.equal(match.phase, PHASE.MATCH_END);
  assert.equal(match.winnerTeam, winner);
  const result = match.takeResult();
  assert.equal(result.matchId, 'match-1');
  assert.equal(result.winnerTeam, winner);
  assert.equal(result.scores[winner], 2);
  assert.equal(result.players.length, 2);
  assert.equal(match.takeResult(), null);
  assert.equal(match.endMatch('again', 400, two.team), false);
});
