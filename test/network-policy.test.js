import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldReconnectAfterClose } from '../client/network.js';

test('reconnects recoverable transport and access failures', () => {
  assert.equal(shouldReconnectAfterClose(1006), true);
  assert.equal(shouldReconnectAfterClose(4002), true);
  assert.equal(shouldReconnectAfterClose(4008), true);
});

test('does not mint tokens forever for unavailable or replaced seats', () => {
  assert.equal(shouldReconnectAfterClose(4001), false);
  assert.equal(shouldReconnectAfterClose(4009), false);
});
