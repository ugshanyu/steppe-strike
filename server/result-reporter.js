import { createHash, createHmac } from 'node:crypto';

const RESULT_PATH = '/games/direct/results';
const RETRY_DELAYS = [0, 500, 2_000, 8_000];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ResultReporter {
  constructor({
    apiUrl,
    serviceId,
    keyId,
    secret,
    fetchImpl = globalThis.fetch,
  }) {
    this.url = new URL(RESULT_PATH, apiUrl);
    this.serviceId = serviceId;
    this.keyId = keyId;
    this.secret = secret;
    this.fetch = fetchImpl;
  }

  configured() {
    return Boolean(this.serviceId && this.keyId && this.secret && this.fetch);
  }

  async submit(room, result) {
    if (!this.configured()) throw new Error('Usion result signing is not configured');
    const winners = result.players
      .filter((player) => player.team === result.winnerTeam)
      .map((player) => player.playerId);
    const finalStats = Object.fromEntries(result.players.map((player) => [
      player.playerId,
      {
        team: player.team,
        kills: player.kills,
        deaths: player.deaths,
        damage_dealt: room.match.seats.get(player.playerId)?.damageDealt || 0,
      },
    ]));
    const payload = {
      room_id: room.id,
      session_id: room.resultSessionId,
      service_id: this.serviceId,
      winner_ids: winners,
      participants: result.players.map((player) => player.playerId),
      reason: result.reason,
      final_stats: finalStats,
      ended_at: new Date(result.completedAt).toISOString(),
      proof: JSON.stringify({
        result_id: result.resultId,
        map: room.map.id,
        scores: result.scores,
        tick: room.tickNumber,
      }),
    };
    const body = JSON.stringify(payload);
    let lastError;
    for (const delay of RETRY_DELAYS) {
      if (delay) await wait(delay);
      try {
        const response = await this.send(body, result.resultId);
        if (response.ok) return response.json();
        const detail = (await response.text()).slice(0, 200);
        lastError = new Error(`Usion result rejected (${response.status}): ${detail}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Usion result submission failed');
  }

  send(body, idempotencyKey) {
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const digest = createHash('sha256').update(body).digest('hex');
    const canonical = `${timestamp}\nPOST\n${RESULT_PATH}\n${digest}`;
    const signature = createHmac('sha256', this.secret).update(canonical).digest('hex');
    return this.fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Usion-Service-Id': this.serviceId,
        'X-Usion-Key-Id': this.keyId,
        'X-Usion-Signature': signature,
        'X-Usion-Timestamp': timestamp,
        'X-Idempotency-Key': idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  }
}
