import {
  EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS,
} from './constants.js';
import { lookDirection } from './voxel-ray.js';

export const RIFLE = Object.freeze({
  id: 'service-rifle',
  bodyDamage: 34,
  headDamage: 100,
  fireIntervalMs: 100,
  maxRange: 96,
  maxRewindMs: 200,
  baseSpreadRadians: 0.002,
  movingSpreadRadians: 0.01,
  burstSpreadRadians: 0.0015,
  maxSpreadRadians: 0.026,
});

export const PLAYER_HITBOX = Object.freeze({
  radius: PLAYER_RADIUS,
  height: PLAYER_HEIGHT,
  headHeight: 0.36,
});
const EPSILON = 1e-7;
const finite = (...values) => values.every(Number.isFinite);
const validId = (value) => (Number.isSafeInteger(value) && value >= 0)
  || (typeof value === 'string' && value.length > 0 && value.length <= 128);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, amount) => a + (b - a) * amount;

const lerpAngle = (a, b, amount) => {
  const delta = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2)
    % (Math.PI * 2) - Math.PI;
  return a + delta * amount;
};
const copyPose = (pose, timeMs) => Object.freeze({
  timeMs,
  x: pose.x,
  y: pose.y,
  z: pose.z,
  yaw: pose.yaw ?? 0,
  pitch: pose.pitch ?? 0,
});
export class TransformHistory {
  constructor({ capacity = 64, maxAgeMs = 1_000 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 1_024) {
      throw new RangeError('capacity must be an integer between 2 and 1024');
    }
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
      throw new RangeError('maxAgeMs must be positive');
    }
    this.capacity = capacity;
    this.maxAgeMs = maxAgeMs;
    this.samples = [];
  }
  get size() {
    return this.samples.length;
  }
  push(timeMs, pose) {
    if (!validPose(pose) || !Number.isFinite(timeMs)) return false;
    const latest = this.samples.at(-1);
    if (latest && timeMs < latest.timeMs) return false;
    const sample = copyPose(pose, timeMs);
    if (latest?.timeMs === timeMs) this.samples[this.samples.length - 1] = sample;
    else this.samples.push(sample);
    const oldestAllowed = timeMs - this.maxAgeMs;
    while (this.samples.length > this.capacity
      || this.samples[0]?.timeMs < oldestAllowed) this.samples.shift();
    return true;
  }
  sample(timeMs, serverTimeMs, maxRewindMs = RIFLE.maxRewindMs) {
    const rewindLimit = Math.min(maxRewindMs, RIFLE.maxRewindMs);
    if (!finite(timeMs, serverTimeMs, maxRewindMs)
      || maxRewindMs < 0
      || timeMs > serverTimeMs
      || serverTimeMs - timeMs > rewindLimit
      || !this.samples.length) return null;
    const first = this.samples[0];
    const last = this.samples.at(-1);
    if (timeMs < first.timeMs) return null;
    if (timeMs >= last.timeMs) return copyPose(last, timeMs);

    let low = 0;
    let high = this.samples.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (this.samples[middle].timeMs <= timeMs) low = middle;
      else high = middle;
    }
    const before = this.samples[low];
    const after = this.samples[high];
    const amount = (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
    return Object.freeze({
      timeMs,
      x: lerp(before.x, after.x, amount),
      y: lerp(before.y, after.y, amount),
      z: lerp(before.z, after.z, amount),
      yaw: lerpAngle(before.yaw, after.yaw, amount),
      pitch: lerp(before.pitch, after.pitch, amount),
    });
  }
}
export function validPose(pose) {
  return Boolean(pose
    && finite(pose.x, pose.y, pose.z, pose.yaw ?? 0, pose.pitch ?? 0)
    && Math.abs(pose.pitch ?? 0) <= Math.PI / 2 + EPSILON);
}
function raySphere(origin, direction, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return Infinity;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? far : Infinity;
}

function pointInsideCapsule(point, pose, hitbox) {
  const low = pose.y + hitbox.radius;
  const high = pose.y + hitbox.height - hitbox.radius;
  const closestY = clamp(point.y, low, high);
  return Math.hypot(point.x - pose.x, point.y - closestY, point.z - pose.z)
    <= hitbox.radius;
}

export function raycastPlayer(origin, rawDirection, pose, {
  maxDistance = Infinity,
  hitbox = PLAYER_HITBOX,
} = {}) {
  if (!validPose(pose)
    || !origin || !rawDirection
    || !finite(origin.x, origin.y, origin.z, rawDirection.x, rawDirection.y, rawDirection.z)
    || !finite(hitbox.radius, hitbox.height, hitbox.headHeight)
    || Number.isNaN(maxDistance)
    || hitbox.radius <= 0 || hitbox.height <= hitbox.radius * 2 || maxDistance < 0) return null;
  const length = Math.hypot(rawDirection.x, rawDirection.y, rawDirection.z);
  if (length < EPSILON) return null;
  const direction = {
    x: rawDirection.x / length,
    y: rawDirection.y / length,
    z: rawDirection.z / length,
  };
  let distance = pointInsideCapsule(origin, pose, hitbox) ? 0 : Infinity;
  const low = pose.y + hitbox.radius;
  const high = pose.y + hitbox.height - hitbox.radius;
  const ox = origin.x - pose.x;
  const oz = origin.z - pose.z;
  const a = direction.x ** 2 + direction.z ** 2;
  if (a > EPSILON) {
    const b = 2 * (ox * direction.x + oz * direction.z);
    const c = ox * ox + oz * oz - hitbox.radius ** 2;
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      for (const candidate of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const y = origin.y + direction.y * candidate;
        if (candidate >= 0 && y >= low && y <= high) distance = Math.min(distance, candidate);
      }
    }
  }
  distance = Math.min(
    distance,
    raySphere(origin, direction, { x: pose.x, y: low, z: pose.z }, hitbox.radius),
    raySphere(origin, direction, { x: pose.x, y: high, z: pose.z }, hitbox.radius),
  );
  if (!Number.isFinite(distance) || distance > maxDistance) return null;
  const point = {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
  return Object.freeze({
    distance,
    point: Object.freeze(point),
    headshot: point.y >= pose.y + hitbox.height - hitbox.headHeight,
  });
}

function candidatePose(candidate, shotTimeMs, serverTimeMs) {
  if (candidate?.history instanceof TransformHistory) {
    return candidate.history.sample(shotTimeMs, serverTimeMs, RIFLE.maxRewindMs);
  }
  return shotTimeMs === serverTimeMs && validPose(candidate) ? candidate : null;
}

export function nearestPlayerHit({
  origin, direction, candidates, shotTimeMs, serverTimeMs, maxDistance = Infinity,
}) {
  if (!Array.isArray(candidates)) return null;
  let nearest = null;
  for (const candidate of candidates) {
    if (!candidate || !validId(candidate.id) || candidate.alive === false) continue;
    const pose = candidatePose(candidate, shotTimeMs, serverTimeMs);
    if (!pose) continue;
    const hit = raycastPlayer(origin, direction, pose, { maxDistance });
    if (hit && (!nearest || hit.distance < nearest.distance)) {
      nearest = Object.freeze({ ...hit, targetId: candidate.id });
    }
  }
  return nearest;
}

const rejection = (reason) => Object.freeze({
  accepted: false, hit: false, reason, targetId: null, damage: 0, headshot: false,
});

function spreadDirection(pose, seed, spreadRadians) {
  if (!Number.isInteger(seed) || !Number.isFinite(spreadRadians) || spreadRadians <= 0) {
    return lookDirection(pose.yaw, pose.pitch);
  }
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state ^ (state >>> 16), 0x45d9f3b) + 0x9e3779b9) >>> 0;
    return state / 0x1_0000_0000;
  };
  const radius = Math.sqrt(random()) * Math.min(spreadRadians, RIFLE.maxSpreadRadians);
  const angle = random() * Math.PI * 2;
  return lookDirection(
    pose.yaw + Math.cos(angle) * radius,
    clamp(pose.pitch + Math.sin(angle) * radius, -Math.PI / 2, Math.PI / 2),
  );
}

export function resolveShot({
  shooterPose,
  candidates,
  raycastWorld,
  serverTimeMs,
  claimedShotTimeMs,
  spreadSeed = null,
  spreadRadians = 0,
}) {
  if (!validPose(shooterPose)
    || !validId(shooterPose?.id)
    || !Array.isArray(candidates)
    || typeof raycastWorld !== 'function'
    || !finite(serverTimeMs, claimedShotTimeMs)) return rejection('invalid');
  if (shooterPose.alive === false || shooterPose.health <= 0) return rejection('shooter-dead');
  if (claimedShotTimeMs > serverTimeMs) return rejection('shot-in-future');
  if (serverTimeMs - claimedShotTimeMs > RIFLE.maxRewindMs) {
    return rejection('shot-too-old');
  }

  const origin = {
    x: shooterPose.x,
    y: shooterPose.y + EYE_HEIGHT,
    z: shooterPose.z,
  };
  const direction = spreadDirection(shooterPose, spreadSeed, spreadRadians);
  const target = nearestPlayerHit({
    origin,
    direction,
    candidates: candidates.filter((candidate) => candidate?.id !== shooterPose.id),
    shotTimeMs: claimedShotTimeMs,
    serverTimeMs,
  });
  if (!target) {
    return Object.freeze({
      accepted: true, hit: false, reason: 'miss', targetId: null,
      damage: 0, headshot: false, shotTimeMs: claimedShotTimeMs,
    });
  }
  if (target.distance > RIFLE.maxRange) {
    return rejection('out-of-range');
  }

  let worldHit;
  try {
    worldHit = raycastWorld(origin, direction, RIFLE.maxRange);
  } catch {
    return rejection('world-raycast-failed');
  }
  const worldDistance = typeof worldHit === 'number' ? worldHit : worldHit?.distance;
  if (worldHit != null && (!Number.isFinite(worldDistance) || worldDistance < 0)) {
    return rejection('invalid-world-hit');
  }
  if (Number.isFinite(worldDistance) && worldDistance <= target.distance + EPSILON) {
    return Object.freeze({
      accepted: true, hit: false, reason: 'occluded', targetId: null,
      damage: 0, headshot: false, shotTimeMs: claimedShotTimeMs,
    });
  }
  return Object.freeze({
    accepted: true,
    hit: true,
    reason: 'hit',
    targetId: target.targetId,
    damage: target.headshot ? RIFLE.headDamage : RIFLE.bodyDamage,
    headshot: target.headshot,
    distance: target.distance,
    point: target.point,
    shotTimeMs: claimedShotTimeMs,
    rewindMs: serverTimeMs - claimedShotTimeMs,
  });
}
