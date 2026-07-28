import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyIframeToken } from '../server/usion-auth.js';

test('verifies scoped Usion identity without exposing the token', async () => {
  let request;
  const identity = await verifyIframeToken('scoped-token-value', {
    serviceId: 'steppe-strike',
    verifyUrl: 'https://example.test/iframe/verify-token',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ user_id: 'user-123', name: 'Бат' }),
      };
    },
  });

  assert.equal(request.url, 'https://example.test/iframe/verify-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    token: 'scoped-token-value',
    expected_service_id: 'steppe-strike',
  });
  assert.equal(identity.name, 'Бат');
  assert.match(identity.session, /^[\w-]{40}$/);
});

test('rejects failed token verification', async () => {
  await assert.rejects(
    verifyIframeToken('scoped-token-value', {
      serviceId: 'steppe-strike',
      verifyUrl: 'https://example.test/iframe/verify-token',
      fetchImpl: async () => ({ ok: false }),
    }),
    /rejected/,
  );
});
