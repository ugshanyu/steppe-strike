import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
} from 'jose';

const DEFAULT_ISSUER = 'usion-backend';
const DEFAULT_JWKS_URL = 'https://mobile.mongolai.mn/.well-known/jwks.json';
const MAX_TOKEN_LENGTH = 8_192;
const MAX_ID_LENGTH = 256;

export class UsionDirectAuthError extends Error {
  constructor(cause) {
    super('Usion direct access token rejected', { cause });
    this.name = 'UsionDirectAuthError';
    this.code = 'USION_DIRECT_TOKEN_REJECTED';
  }
}

const requiredId = (value, label) => {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_ID_LENGTH
  ) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
};

const currentDate = (clock) => {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('clock returned an invalid date');
  return date;
};

/**
 * Creates one verifier per game-server process so the remote JWKS cache is reused.
 */
export function createUsionDirectTokenVerifier({
  serviceId,
  jwksUrl = DEFAULT_JWKS_URL,
  issuer = DEFAULT_ISSUER,
  fetchImpl = globalThis.fetch,
  clock = () => new Date(),
  clockToleranceSeconds = 5,
} = {}) {
  const expectedServiceId = requiredId(serviceId, 'serviceId');
  const url = new URL(jwksUrl);
  if (url.protocol !== 'https:') throw new TypeError('jwksUrl must use HTTPS');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');
  if (
    !Number.isFinite(clockToleranceSeconds)
    || clockToleranceSeconds < 0
    || clockToleranceSeconds > 60
  ) {
    throw new TypeError('clockToleranceSeconds must be between 0 and 60');
  }

  const audience = `usion-game-service:${expectedServiceId}`;
  const jwks = createRemoteJWKSet(url, {
    [customFetch]: fetchImpl,
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });

  return async function verifyUsionDirectToken(token, { roomId } = {}) {
    const expectedRoomId = requiredId(roomId, 'roomId');
    if (
      typeof token !== 'string'
      || token.length < 32
      || token.length > MAX_TOKEN_LENGTH
      || token.split('.').length !== 3
    ) {
      throw new UsionDirectAuthError(new TypeError('Malformed compact JWT'));
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(token, jwks, {
        algorithms: ['RS256'],
        issuer,
        audience,
        currentDate: currentDate(clock),
        clockTolerance: clockToleranceSeconds,
        requiredClaims: [
          'sub',
          'exp',
          'iat',
          'jti',
          'room_id',
          'service_id',
          'session_id',
          'permissions',
        ],
      });

      const userId = requiredId(payload.sub, 'sub');
      const room = requiredId(payload.room_id, 'room_id');
      const service = requiredId(payload.service_id, 'service_id');
      const sessionId = requiredId(payload.session_id, 'session_id');
      if (room !== expectedRoomId) throw new Error('Room claim mismatch');
      if (service !== expectedServiceId) throw new Error('Service claim mismatch');
      if (
        !Array.isArray(payload.permissions)
        || !payload.permissions.every((permission) => typeof permission === 'string')
        || !payload.permissions.includes('play')
      ) {
        throw new Error('Missing play permission');
      }

      return Object.freeze({
        userId,
        roomId: room,
        serviceId: service,
        sessionId,
        permissions: Object.freeze([...payload.permissions]),
        tokenId: payload.jti,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
        traceId: typeof payload.trace_id === 'string' ? payload.trace_id : undefined,
        keyId: protectedHeader.kid,
      });
    } catch (error) {
      if (error instanceof UsionDirectAuthError) throw error;
      throw new UsionDirectAuthError(error);
    }
  };
}

