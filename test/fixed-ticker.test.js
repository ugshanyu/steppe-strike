import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedTicker } from '../server/fixed-ticker.js';

test('fixed ticker corrects drift, bounds catch-up, and exposes health percentiles', () => {
  let clock = 0;
  let scheduled;
  let calls = 0;
  const ticker = new FixedTicker(() => {
    calls += 1;
    clock += calls === 2 ? 20 : 1;
  }, {
    rate: 60,
    clock: () => clock,
    wallClock: () => clock,
    schedule: (handler, delay) => {
      scheduled = { handler, delay };
      return 1;
    },
    cancel: () => {},
    maxCatchUpSteps: 2,
  });
  ticker.start();
  scheduled.handler();
  clock = 18;
  scheduled.handler();
  clock = 200;
  scheduled.handler();
  const health = ticker.health();
  assert.ok(calls >= 3);
  assert.ok(health.overruns >= 1);
  assert.ok(health.droppedSteps > 0);
  assert.ok(health.durationP99Ms >= health.durationP95Ms);
  assert.ok(scheduled.delay >= 0);
  ticker.stop();
});
