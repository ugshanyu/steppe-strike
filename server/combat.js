import {
  BODY_DAMAGE, EYE_HEIGHT, HEAD_DAMAGE, PLAYER_HEIGHT, SHOT_RANGE,
} from '../shared/constants.js';
import { terrainRayDistance } from '../shared/world.js';

function raySphereDistance(origin, direction, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const along = -(ox * direction.x + oy * direction.y + oz * direction.z);
  const closestSq = ox * ox + oy * oy + oz * oz - along * along;
  const radiusSq = radius * radius;
  if (closestSq > radiusSq) return Infinity;
  const offset = Math.sqrt(radiusSq - closestSq);
  const near = along - offset;
  const far = along + offset;
  if (far < 0) return Infinity;
  return near >= 0 ? near : far;
}

export function shotDirection(yaw, pitch) {
  const horizontal = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * horizontal,
  };
}

export function resolveShot(shooter, players, now) {
  const origin = { x: shooter.x, y: shooter.y + EYE_HEIGHT, z: shooter.z };
  const direction = shotDirection(shooter.yaw, shooter.pitch);
  let distance = terrainRayDistance(origin, direction, SHOT_RANGE);
  let victim = null;
  let headshot = false;

  for (const candidate of players) {
    if (candidate === shooter || !candidate.alive || candidate.team === shooter.team) continue;
    if (now < candidate.shieldUntil) continue;
    const head = raySphereDistance(origin, direction, {
      x: candidate.x, y: candidate.y + PLAYER_HEIGHT - 0.22, z: candidate.z,
    }, 0.28);
    const body = raySphereDistance(origin, direction, {
      x: candidate.x, y: candidate.y + 0.92, z: candidate.z,
    }, 0.48);
    const hitDistance = Math.min(head, body);
    if (hitDistance < distance) {
      distance = hitDistance;
      victim = candidate;
      headshot = head <= body;
    }
  }

  return {
    origin,
    direction,
    distance,
    end: {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance,
    },
    victim,
    headshot,
    damage: headshot ? HEAD_DAMAGE : BODY_DAMAGE,
  };
}
