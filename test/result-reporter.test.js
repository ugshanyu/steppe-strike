import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { ResultReporter } from '../server/result-reporter.js';

test('direct result payload is signed, idempotent, and contains server-owned stats', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: String(url), ...options };
    return {
      ok: true,
      async json() { return { success: true, duplicate: false }; },
    };
  };
  const reporter = new ResultReporter({
    apiUrl: 'https://mobile.mongolai.mn',
    serviceId: 'steppe-strike',
    keyId: 'key-1',
    secret: 'test-secret',
    fetchImpl,
  });
  const room = {
    id: 'room-1',
    resultSessionId: 'session-1',
    tickNumber: 731,
    map: { id: 'steppe-depot-v1' },
    match: {
      seats: new Map([
        ['alpha', { damageDealt: 80 }],
        ['bravo', { damageDealt: 34 }],
      ]),
    },
  };
  const result = {
    resultId: 'room-1:1000',
    completedAt: 1_000,
    reason: 'elimination',
    winnerTeam: 'attackers',
    scores: { attackers: 7, defenders: 4 },
    players: [
      { playerId: 'alpha', team: 'attackers', kills: 8, deaths: 4 },
      { playerId: 'bravo', team: 'defenders', kills: 4, deaths: 8 },
    ],
  };
  const response = await reporter.submit(room, result);
  assert.equal(response.success, true);
  assert.equal(request.url, 'https://mobile.mongolai.mn/games/direct/results');
  assert.equal(request.headers['X-Idempotency-Key'], result.resultId);
  const payload = JSON.parse(request.body);
  assert.deepEqual(payload.winner_ids, ['alpha']);
  assert.equal(payload.final_stats.alpha.damage_dealt, 80);
  assert.equal(typeof payload.proof, 'string');

  const bodyHash = createHash('sha256').update(request.body).digest('hex');
  const canonical =
    `${request.headers['X-Usion-Timestamp']}\nPOST\n/games/direct/results\n${bodyHash}`;
  const expected = createHmac('sha256', 'test-secret').update(canonical).digest('hex');
  assert.equal(request.headers['X-Usion-Signature'], expected);
});
