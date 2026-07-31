export const TEAM = Object.freeze({ ATTACKERS: 'attackers', DEFENDERS: 'defenders' });
export const PHASE = Object.freeze({
  WARMUP: 'warmup', LIVE: 'live', ROUND_END: 'round_end', MATCH_END: 'match_end',
});
const TEAMS = Object.values(TEAM);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const cleanName = (value, fallback) => String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 24) || fallback;
function validateSpawns(spawnPoints) {
  const result = {};
  for (const team of TEAMS) {
    if (!Array.isArray(spawnPoints?.[team]) || !spawnPoints[team].length) {
      throw new TypeError(`spawnPoints.${team} must contain at least one spawn`);
    }
    result[team] = Object.freeze(spawnPoints[team].map((spawn) => {
      if (![spawn?.x, spawn?.y, spawn?.z].every(Number.isFinite)) {
        throw new TypeError(`invalid ${team} spawn`);
      }
      return Object.freeze({
        x: spawn.x, y: spawn.y, z: spawn.z,
        yaw: finite(spawn.yaw), pitch: finite(spawn.pitch),
      });
    }));
  }
  return Object.freeze(result);
}
function cleanInput(input, previous) {
  return {
    seq: input.seq >>> 0,
    moveX: clamp(finite(input.moveX), -1, 1),
    moveZ: clamp(finite(input.moveZ), -1, 1),
    yaw: finite(input.yaw, previous.yaw),
    pitch: clamp(finite(input.pitch, previous.pitch), -Math.PI / 2, Math.PI / 2),
    buttons: clamp(Math.trunc(finite(input.buttons)), 0, 0xffff),
  };
}
export class Match {
  constructor({
    id, spawnPoints, minPlayers = 2, maxPlayers = 10,
    warmupMs = 5_000, roundMs = 120_000, roundEndMs = 3_000,
    scoreToWin = 13, reconnectGraceMs = 15_000, maxHealth = 100,
    magazineSize = 30, reserveAmmo = 90, reloadMs = 2_200,
    respawnMs = null, timeoutWinner = TEAM.DEFENDERS, now = Date.now(),
  }) {
    if (!id) throw new TypeError('match id is required');
    if (minPlayers < 2 || maxPlayers > 10 || minPlayers > maxPlayers)
      throw new RangeError('match size must be between 2 and 10 players');
    if (!TEAMS.includes(timeoutWinner)) throw new TypeError('invalid timeout winner');
    this.id = String(id);
    this.spawnPoints = validateSpawns(spawnPoints);
    Object.assign(this, {
      minPlayers, maxPlayers, warmupMs, roundMs, roundEndMs, scoreToWin,
      reconnectGraceMs, maxHealth, magazineSize, reserveAmmo, reloadMs,
      respawnMs, timeoutWinner,
    });
    this.maxRounds = scoreToWin * 2 - 1;
    this.phase = PHASE.WARMUP;
    this.phaseStartedAt = now;
    this.phaseEndsAt = null;
    this.roundNumber = 0;
    this.scores = { [TEAM.ATTACKERS]: 0, [TEAM.DEFENDERS]: 0 };
    this.seats = new Map();
    this.winnerTeam = null;
    this.endReason = null;
    this.completedAt = null;
    this.pendingResult = null;
  }
  join({ playerId, name = '', sessionId = playerId }, now = Date.now()) {
    const id = String(playerId || '');
    if (!id) throw new TypeError('playerId is required');
    const existing = this.seats.get(id);
    if (existing) {
      const graceExpired = existing.expired || now > existing.disconnectExpiresAt;
      if (this.phase === PHASE.MATCH_END && graceExpired) return null;
      existing.sessionId = String(sessionId || id);
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.disconnectExpiresAt = Infinity;
      existing.expired = false;
      this.armWarmup(now);
      return { seat: existing, reconnected: true };
    }
    if (this.phase !== PHASE.WARMUP || this.seats.size >= this.maxPlayers) return null;
    const seat = {
      playerId: id, sessionId: String(sessionId || id),
      name: cleanName(name, id), team: null,
      connected: true, disconnectedAt: null, disconnectExpiresAt: Infinity,
      expired: false,
      input: { seq: 0, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 },
      health: this.maxHealth, ammo: this.magazineSize, reserveAmmo: this.reserveAmmo,
      reloading: false, reloadEndsAt: null, alive: false, spectator: true,
      respawnAt: null, kills: 0, deaths: 0,
    };
    this.seats.set(id, seat);
    this.rebalanceTeams();
    this.armWarmup(now);
    return { seat, reconnected: false };
  }
  rebalanceTeams() {
    const seats = [...this.seats.values()].sort((a, b) =>
      a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
    const indexes = { [TEAM.ATTACKERS]: 0, [TEAM.DEFENDERS]: 0 };
    seats.forEach((seat, index) => {
      seat.team = index % 2 ? TEAM.DEFENDERS : TEAM.ATTACKERS;
      this.placeAtSpawn(seat, indexes[seat.team]++);
    });
  }
  placeAtSpawn(seat, index = 0) {
    const options = this.spawnPoints[seat.team];
    Object.assign(seat, options[index % options.length]);
  }
  armWarmup(now) {
    if (this.phase !== PHASE.WARMUP) return;
    if (this.connectedSeats().length < this.minPlayers) {
      this.phaseEndsAt = null;
    } else if (this.phaseEndsAt === null) {
      this.phaseStartedAt = now;
      this.phaseEndsAt = now + this.warmupMs;
    }
  }
  setInput(playerId, input, now = Date.now()) {
    const seat = this.seats.get(String(playerId));
    if (!seat?.connected || seat.expired || !Number.isInteger(input?.seq)
      || input.seq < 0 || input.seq > 0xffffffff) return false;
    const seq = input.seq >>> 0;
    if (seq <= seat.input.seq) return false;
    seat.input = cleanInput(input, seat.input);
    seat.lastInputAt = now;
    return true;
  }
  disconnect(playerId, now = Date.now()) {
    const seat = this.seats.get(String(playerId));
    if (!seat?.connected) return false;
    seat.connected = false;
    seat.disconnectedAt = now;
    seat.disconnectExpiresAt = now + this.reconnectGraceMs;
    seat.input = { ...seat.input, moveX: 0, moveZ: 0, buttons: 0 };
    this.armWarmup(now);
    return true;
  }
  step(now = Date.now()) {
    for (const seat of this.seats.values()) {
      if (!seat.connected && !seat.expired && now > seat.disconnectExpiresAt) {
        seat.expired = true;
        seat.alive = false;
        seat.spectator = true;
        seat.respawnAt = null;
      }
      if (seat.reloading && now >= seat.reloadEndsAt) this.finishReload(seat);
      if (seat.respawnAt !== null && now >= seat.respawnAt) this.respawn(seat.playerId);
    }
    if (this.phase === PHASE.WARMUP) {
      this.armWarmup(now);
      if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) this.startRound(now);
    } else if (this.phase === PHASE.LIVE && now >= this.phaseEndsAt) {
      this.endRound(this.timeoutWinner, 'timeout', now);
    } else if (this.phase === PHASE.ROUND_END && now >= this.phaseEndsAt) {
      this.startRound(now);
    }
    if (this.phase === PHASE.LIVE) this.checkElimination(now);
  }
  startRound(now = Date.now()) {
    if (![PHASE.WARMUP, PHASE.ROUND_END].includes(this.phase)) return false;
    if (this.phase === PHASE.WARMUP && this.connectedSeats().length < this.minPlayers) {
      return false;
    }
    this.roundNumber++;
    this.phase = PHASE.LIVE;
    this.phaseStartedAt = now;
    this.phaseEndsAt = now + this.roundMs;
    const indexes = { [TEAM.ATTACKERS]: 0, [TEAM.DEFENDERS]: 0 };
    for (const seat of this.seats.values()) this.resetForRound(seat, indexes[seat.team]++);
    return true;
  }
  resetForRound(seat, spawnIndex) {
    Object.assign(seat, {
      health: this.maxHealth, ammo: this.magazineSize, reserveAmmo: this.reserveAmmo,
      reloading: false, reloadEndsAt: null, respawnAt: null,
      alive: seat.connected && !seat.expired,
      spectator: !seat.connected || seat.expired,
    });
    this.placeAtSpawn(seat, spawnIndex);
  }
  consumeAmmo(playerId, amount = 1) {
    const seat = this.activeSeat(playerId);
    if (!seat || seat.reloading || !Number.isInteger(amount) || amount < 1
      || seat.ammo < amount) return false;
    seat.ammo -= amount;
    return true;
  }
  startReload(playerId, now = Date.now()) {
    const seat = this.activeSeat(playerId);
    if (!seat || seat.reloading || seat.ammo >= this.magazineSize || seat.reserveAmmo <= 0) {
      return false;
    }
    seat.reloading = true;
    seat.reloadEndsAt = now + this.reloadMs;
    return true;
  }
  finishReload(seat) {
    const amount = Math.min(this.magazineSize - seat.ammo, seat.reserveAmmo);
    seat.ammo += amount;
    seat.reserveAmmo -= amount;
    seat.reloading = false;
    seat.reloadEndsAt = null;
  }
  applyDamage(targetId, amount, { attackerId = null, now = Date.now() } = {}) {
    const target = this.activeSeat(targetId);
    if (!target || !Number.isFinite(amount) || amount <= 0) return false;
    target.health = Math.max(0, target.health - amount);
    if (target.health === 0) this.recordKill(attackerId, target.playerId, now);
    return true;
  }
  recordKill(attackerId, victimId, now = Date.now()) {
    const victim = this.activeSeat(victimId);
    if (!victim) return false;
    victim.health = 0;
    victim.alive = false;
    victim.spectator = true;
    victim.reloading = false;
    victim.reloadEndsAt = null;
    victim.respawnAt = Number.isFinite(this.respawnMs) ? now + this.respawnMs : null;
    victim.deaths++;
    const attacker = this.seats.get(String(attackerId));
    if (attacker && attacker !== victim) attacker.kills++;
    this.checkElimination(now);
    return true;
  }
  respawn(playerId) {
    const seat = this.seats.get(String(playerId));
    if (!seat?.connected || seat.expired || this.phase !== PHASE.LIVE) return false;
    const teammates = [...this.seats.values()].filter((other) => other.team === seat.team)
      .sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
    this.resetForRound(seat, teammates.indexOf(seat));
    return true;
  }
  activeSeat(playerId) {
    const seat = this.seats.get(String(playerId));
    return this.phase === PHASE.LIVE && seat?.connected && seat.alive ? seat : null;
  }
  checkElimination(now) {
    if (this.phase !== PHASE.LIVE || Number.isFinite(this.respawnMs)) return;
    const alive = Object.fromEntries(TEAMS.map((team) => [
      team, [...this.seats.values()].some((seat) => seat.team === team && seat.alive),
    ]));
    if (alive[TEAM.ATTACKERS] && !alive[TEAM.DEFENDERS]) {
      this.endRound(TEAM.ATTACKERS, 'elimination', now);
    } else if (alive[TEAM.DEFENDERS] && !alive[TEAM.ATTACKERS]) {
      this.endRound(TEAM.DEFENDERS, 'elimination', now);
    }
  }
  endRound(winnerTeam, reason = 'objective', now = Date.now()) {
    if (this.phase !== PHASE.LIVE || !TEAMS.includes(winnerTeam)) return false;
    this.scores[winnerTeam]++;
    this.lastRound = { number: this.roundNumber, winnerTeam, reason };
    if (this.scores[winnerTeam] >= this.scoreToWin || this.roundNumber >= this.maxRounds) {
      return this.endMatch(reason, now, winnerTeam);
    }
    this.phase = PHASE.ROUND_END;
    this.phaseStartedAt = now;
    this.phaseEndsAt = now + this.roundEndMs;
    return true;
  }
  endMatch(reason = 'score_limit', now = Date.now(), winnerTeam = null) {
    if (this.phase === PHASE.MATCH_END) return false;
    this.phase = PHASE.MATCH_END;
    this.phaseStartedAt = now;
    this.phaseEndsAt = null;
    this.completedAt = now;
    this.endReason = reason;
    this.winnerTeam = winnerTeam || (
      this.scores[TEAM.ATTACKERS] === this.scores[TEAM.DEFENDERS] ? null
        : this.scores[TEAM.ATTACKERS] > this.scores[TEAM.DEFENDERS]
          ? TEAM.ATTACKERS : TEAM.DEFENDERS
    );
    this.pendingResult = this.#buildResult();
    return true;
  }
  #buildResult() {
    return {
      resultId: `${this.id}:${this.completedAt}`,
      matchId: this.id,
      completedAt: this.completedAt,
      reason: this.endReason,
      winnerTeam: this.winnerTeam,
      scores: { ...this.scores },
      players: [...this.seats.values()]
        .sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
        .map((seat) => ({
        playerId: seat.playerId, team: seat.team, kills: seat.kills,
        deaths: seat.deaths, disconnected: !seat.connected,
      })),
    };
  }
  takeResult() {
    const result = this.pendingResult;
    this.pendingResult = null;
    return result;
  }
  connectedSeats() {
    return [...this.seats.values()].filter((seat) => seat.connected && !seat.expired);
  }
}
