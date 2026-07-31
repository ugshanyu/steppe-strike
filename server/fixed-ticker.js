import { performance } from 'node:perf_hooks';

const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

export class FixedTicker {
  constructor(handler, {
    rate = 60,
    clock = () => performance.now(),
    wallClock = Date.now,
    schedule = setTimeout,
    cancel = clearTimeout,
    sampleLimit = 2_048,
    maxCatchUpSteps = 4,
  } = {}) {
    this.handler = handler;
    this.interval = 1_000 / rate;
    this.clock = clock;
    this.wallClock = wallClock;
    this.schedule = schedule;
    this.cancel = cancel;
    this.sampleLimit = sampleLimit;
    this.maxCatchUpSteps = maxCatchUpSteps;
    this.timer = null;
    this.nextAt = 0;
    this.samples = [];
    this.driftSamples = [];
    this.ticks = 0;
    this.overruns = 0;
    this.droppedSteps = 0;
    this.run = this.run.bind(this);
  }

  start() {
    if (this.timer !== null) return;
    this.nextAt = this.clock();
    this.timer = this.schedule(this.run, 0);
  }

  run() {
    this.timer = null;
    let now = this.clock();
    let steps = 0;
    while (now >= this.nextAt && steps < this.maxCatchUpSteps) {
      const drift = Math.max(0, now - this.nextAt);
      const started = this.clock();
      this.handler(this.wallClock());
      const duration = Math.max(0, this.clock() - started);
      this.record(this.samples, duration);
      this.record(this.driftSamples, drift);
      if (duration > this.interval) this.overruns += 1;
      this.ticks += 1;
      this.nextAt += this.interval;
      steps += 1;
      now = this.clock();
    }
    if (now >= this.nextAt) {
      const skipped = Math.floor((now - this.nextAt) / this.interval) + 1;
      this.droppedSteps += skipped;
      this.nextAt += skipped * this.interval;
    }
    this.timer = this.schedule(this.run, Math.max(0, this.nextAt - this.clock()));
  }

  record(bucket, value) {
    bucket.push(value);
    if (bucket.length > this.sampleLimit) bucket.shift();
  }

  stop() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  health() {
    return {
      ticks: this.ticks,
      overruns: this.overruns,
      droppedSteps: this.droppedSteps,
      durationP95Ms: Number(percentile(this.samples, 0.95).toFixed(3)),
      durationP99Ms: Number(percentile(this.samples, 0.99).toFixed(3)),
      driftP99Ms: Number(percentile(this.driftSamples, 0.99).toFixed(3)),
    };
  }
}
