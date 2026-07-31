import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';
import {
  createUsionDirectTokenVerifier,
  UsionDirectAuthError,
} from '../server/usion-direct-auth.js';

const NOW = 1_800_000_000;
const SERVICE_ID = 'steppe-strike';
const ROOM_ID = 'room-123';
const SESSION_ID = 'session-456';

const fixture = await (async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const jwks = {
    keys: [{
      ...publicJwk,
      alg: 'RS256',
      kid: 'test-key',
      use: 'sig',
    }],
  };
  let fetchCount = 0;
  const verifier = createUsionDirectTokenVerifier({
    serviceId: SERVICE_ID,
    jwksUrl: 'https://usion.test/.well-known/jwks.json',
    clock: () => new Date(NOW * 1_000),
    clockToleranceSeconds: 0,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const sign = async (overrides = {}) => {
    const claims = {
      room_id: ROOM_ID,
      service_id: SERVICE_ID,
      session_id: SESSION_ID,
      permissions: ['play'],
      ...overrides,
    };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('usion-backend')
      .setAudience(overrides.aud ?? `usion-game-service:${SERVICE_ID}`)
      .setSubject('user-789')
      .setIssuedAt(NOW - 10)
      .setJti('token-abc')
      .setExpirationTime(overrides.exp ?? NOW + 300)
      .sign(privateKey);
  };

  return { verifier, sign, fetchCount: () => fetchCount };
})();

const rejected = async (overrides, roomId = ROOM_ID) => {
  const token = await fixture.sign(overrides);
  await assert.rejects(
    fixture.verifier(token, { roomId }),
    (error) => (
      error instanceof UsionDirectAuthError
      && error.code === 'USION_DIRECT_TOKEN_REJECTED'
    ),
  );
};

test('accepts a valid room-bound protocol-v2 direct token', async () => {
  const identity = await fixture.verifier(await fixture.sign(), { roomId: ROOM_ID });

  assert.deepEqual(identity, {
    userId: 'user-789',
    roomId: ROOM_ID,
    serviceId: SERVICE_ID,
    sessionId: SESSION_ID,
    permissions: ['play'],
    tokenId: 'token-abc',
    issuedAt: NOW - 10,
    expiresAt: NOW + 300,
    traceId: undefined,
    keyId: 'test-key',
  });
  assert.equal(fixture.fetchCount(), 1);
});

test('rejects a token used for another room', async () => {
  await rejected({}, 'room-other');
});

test('rejects a mismatched service_id claim', async () => {
  await rejected({ service_id: 'another-service' });
});

test('rejects a mismatched audience', async () => {
  await rejected({ aud: 'usion-game-service:another-service' });
});

test('rejects a token without play permission', async () => {
  await rejected({ permissions: ['spectate'] });
});

test('rejects an expired token', async () => {
  await rejected({ exp: NOW - 30 });
});

test('rejects a missing session identifier', async () => {
  await rejected({ session_id: '' });
});
