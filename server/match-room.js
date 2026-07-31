import {
  BUTTON, DT, PLAYER_FLAG, TICK_RATE,
} from '../shared/constants.js';
import { CombatMap, TEAM_SPAWNS } from '../shared/combat-map.js';
import { RIFLE, TransformHistory, resolveShot } from '../shared/combat.js';
import { stepMovement } from '../shared/physics.js';
import { voxelRaycast } from '../shared/voxel-ray.js';
import { Match, PHASE, TEAM } from './match.js';

const TEAM_NUMBER = Object.freeze({ [TEAM.ATTACKERS]: 1, [TEAM.DEFENDERS]: 2 });
const sequenceDelta = (next, previous) => ((next - previous + 65_536) % 65_536);
const shotSeed = (roomId, playerId, nonce, round) => {
  let hash = (nonce ^ (round << 16)) >>> 0;
  for (const character of `${roomId}:${playerId}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;
  }
  return hash;
};

const matchSpawns = Object.freeze({
  [TEAM.ATTACKERS]: TEAM_SPAWNS[1],
  [TEAM.DEFENDERS]: TEAM_SPAWNS[2],
});
export const TEST_MATCH_SPAWNS = Object.freeze({
  [TEAM.ATTACKERS]: Object.freeze([
    Object.freeze({ x: -23.5, y: 21, z: -23.5, yaw: -Math.PI / 2 }),
  ]),
  [TEAM.DEFENDERS]: Object.freeze([
    Object.freeze({ x: 8.5, y: 20, z: -23.5, yaw: Math.PI / 2 }),
  ]),
});

export class MatchRoom {
  constructor(id, {
    now = Date.now(),
    map = new CombatMap(),
    emit = () => {},
    complete = () => {},
    warmupMs = 5_000,
    roundMs = 120_000,
    roundEndMs = 4_000,
    scoreToWin = 7,
    spawnPoints = matchSpawns,
  } = {}) {
    this.id = String(id);
    this.map = map;
    this.emit = emit;
    this.complete = complete;
    this.tickNumber = 0;
    this.nextNetworkId = 1;
    this.resultSessionId = null;
    this.match = new Match({
      id: this.id,
      spawnPoints,
      warmupMs,
      roundMs,
      roundEndMs,
      scoreToWin,
      now,
    });
    this.lastPhase = this.match.phase;
  }

  join(identity, name, ws, now = Date.now()) {
    const joined = this.match.join({
      playerId: identity.userId,
      sessionId: identity.sessionId,
      name,
    }, now);
    if (!joined) return null;
    const { seat } = joined;
    if (seat.ws && seat.ws !== ws) seat.ws.close(4009, 'connected elsewhere');
    seat.ws = ws;
    seat.networkId ??= this.nextNetworkId++;
    seat.vx ??= 0;
    seat.vy ??= 0;
    seat.vz ??= 0;
    seat.jumpHeld ??= false;
    // Every browser connection starts its wire counters from zero. Preserve
    // the authoritative seat/input sequence, but reset connection-local
    // counters so a recovered player can move immediately.
    seat.lastAck = 0;
    seat.lastWireSeq = null;
    seat.lastFireNonce = null;
    seat.pendingShot = null;
    seat.lastFireAt ??= -Infinity;
    seat.damageDealt ??= 0;
    seat.history ??= new TransformHistory();
    seat.history.push(now, seat);
    this.resultSessionId ??= identity.sessionId;
    this.emitRoster(joined.reconnected ? 'rejoin' : 'join', seat);
    return { room: this, seat, reconnected: joined.reconnected };
  }

  disconnect(seat, now = Date.now()) {
    if (!seat || seat.ws === null) return;
    seat.ws = null;
    this.match.disconnect(seat.playerId, now);
    this.emit({ t: 'leave', id: seat.networkId, name: seat.name });
  }

  setInput(seat, input, now = Date.now()) {
    if (!seat?.connected) return false;
    const delta = seat.lastWireSeq === null ? 1 : sequenceDelta(input.seq, seat.lastWireSeq);
    if (delta === 0 || delta > 32_768) return false;
    const absoluteSeq = (seat.input.seq + delta) >>> 0;
    const previousButtons = seat.input.buttons;
    const accepted = this.match.setInput(seat.playerId, {
      ...input,
      seq: absoluteSeq,
    }, now);
    if (!accepted) return false;
    seat.lastWireSeq = input.seq;
    seat.lastAck = input.seq;
    if ((input.buttons & BUTTON.RELOAD) && !(previousButtons & BUTTON.RELOAD)) {
      this.match.startReload(seat.playerId, now);
    }
    if ((input.buttons & BUTTON.FIRE) && input.fireNonce !== seat.lastFireNonce) {
      seat.pendingShot = { nonce: input.fireNonce, viewTick: input.viewTick };
    }
    seat.lastFireNonce = input.fireNonce;
    return true;
  }

  step(now = Date.now()) {
    this.match.step(now);
    if (this.match.phase !== this.lastPhase) {
      this.lastPhase = this.match.phase;
      this.emitMatchState();
    }
    for (const seat of this.match.connectedSeats()) {
      if (seat.alive && this.match.phase === PHASE.LIVE) {
        seat.yaw = seat.input.yaw;
        seat.pitch = seat.input.pitch;
        stepMovement(this.map, seat, seat.input, DT);
        this.handleShot(seat, now);
      } else {
        seat.vx = 0;
        seat.vy = 0;
        seat.vz = 0;
        seat.pendingShot = null;
      }
      seat.history.push(now, seat);
    }
    this.tickNumber = (this.tickNumber + 1) >>> 0;
    const result = this.match.takeResult();
    if (result) this.complete(this, result);
  }

  handleShot(shooter, now) {
    const pending = shooter.pendingShot;
    shooter.pendingShot = null;
    if (!pending || now - shooter.lastFireAt < RIFLE.fireIntervalMs) return;
    shooter.shotStreak = now - shooter.lastFireAt < 350 ? (shooter.shotStreak || 0) + 1 : 0;
    shooter.lastFireAt = now;
    if (!this.match.consumeAmmo(shooter.playerId)) {
      this.emit({ t: 'weapon', id: shooter.networkId, event: 'empty' });
      return;
    }
    const viewedTicksAgo = Math.min(12, (this.tickNumber - pending.viewTick) >>> 0);
    const shotTime = now - Math.min(RIFLE.maxRewindMs, viewedTicksAgo * 1_000 / TICK_RATE);
    const shooterAtShot = shooter.history.sample(shotTime, now) || shooter;
    const candidates = this.match.connectedSeats().map((seat) => ({
      ...seat, id: seat.playerId, history: seat.history,
    }));
    const shot = resolveShot({
      shooterPose: {
        ...shooterAtShot,
        id: shooter.playerId,
        alive: shooter.alive,
        health: shooter.health,
        yaw: shooter.input.yaw,
        pitch: shooter.input.pitch,
      },
      candidates,
      raycastWorld: (origin, direction, range) =>
        voxelRaycast(this.map, origin, direction, range),
      serverTimeMs: now,
      claimedShotTimeMs: shotTime,
      spreadSeed: shotSeed(this.id, shooter.playerId, pending.nonce, this.match.roundNumber),
      spreadRadians: Math.min(
        RIFLE.maxSpreadRadians,
        RIFLE.baseSpreadRadians
          + Math.min(1, Math.hypot(shooter.vx, shooter.vz) / 4.8) * RIFLE.movingSpreadRadians
          + shooter.shotStreak * RIFLE.burstSpreadRadians,
      ),
    });
    const target = shot.hit ? this.match.seats.get(shot.targetId) : null;
    const friendly = Boolean(target && target.team === shooter.team);
    const wasAlive = target?.alive;
    const healthBefore = target?.health || 0;
    if (target && !friendly) {
      this.match.applyDamage(target.playerId, shot.damage, {
        attackerId: shooter.playerId,
        now,
      });
      shooter.damageDealt += Math.min(shot.damage, healthBefore);
    }
    this.emit({
      t: 'shot',
      shooter: shooter.networkId,
      target: target?.networkId || null,
      hit: Boolean(target),
      friendly,
      headshot: shot.headshot,
      damage: target && !friendly ? shot.damage : 0,
      nonce: pending.nonce,
    });
    if (wasAlive && target && !target.alive) {
      this.emit({
        t: 'kill',
        killer: shooter.networkId,
        victim: target.networkId,
        headshot: shot.headshot,
      });
    }
  }

  emitRoster(type, seat) {
    this.emit({
      t: type,
      id: seat.networkId,
      name: seat.name,
      team: TEAM_NUMBER[seat.team],
    });
  }

  emitMatchState() {
    this.emit({
      t: 'match',
      phase: this.match.phase,
      round: this.match.roundNumber,
      scores: this.match.scores,
      winnerTeam: this.match.winnerTeam,
      phaseEndsAt: this.match.phaseEndsAt,
      lastRound: this.match.lastRound || null,
    });
  }

  roster() {
    return this.match.connectedSeats().map((seat) => ({
      id: seat.networkId,
      name: seat.name,
      team: TEAM_NUMBER[seat.team],
    }));
  }

  snapshotPlayers() {
    return this.match.connectedSeats().map((seat) => ({
      id: seat.networkId,
      x: seat.x, y: seat.y, z: seat.z,
      vx: seat.vx, vy: seat.vy, vz: seat.vz,
      yaw: seat.yaw, pitch: seat.pitch,
      team: TEAM_NUMBER[seat.team],
      health: seat.health,
      armor: seat.armor || 0,
      ammo: seat.ammo,
      flags: (seat.alive ? PLAYER_FLAG.ALIVE : 0)
        | (seat.reloading ? PLAYER_FLAG.RELOADING : 0)
        | (seat.spectator ? PLAYER_FLAG.SPECTATOR : 0),
      kills: seat.kills,
      deaths: seat.deaths,
      reserveAmmo: seat.reserveAmmo,
    }));
  }

  welcome(seat, reconnected) {
    return {
      t: 'welcome',
      version: 2,
      id: seat.networkId,
      roomId: this.id,
      tickRate: TICK_RATE,
      snapshotRate: 20,
      maxPlayers: this.match.maxPlayers,
      map: { id: this.map.id, seed: this.map.seed, immutable: true },
      players: this.roster(),
      match: {
        phase: this.match.phase,
        round: this.match.roundNumber,
        scores: this.match.scores,
        phaseEndsAt: this.match.phaseEndsAt,
      },
      reconnected,
    };
  }
}
