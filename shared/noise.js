const fade = (value) => value * value * (3 - 2 * value);
const mix = (a, b, amount) => a + (b - a) * amount;

function hash(seed, x, y = 0, z = 0) {
  let value = seed | 0;
  value = Math.imul(value ^ (x | 0), 0x45d9f3b);
  value = Math.imul(value ^ (y | 0), 0x119de1f3);
  value = Math.imul(value ^ (z | 0), 0x3449f5);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

export const hash2 = (seed, x, z) => hash(seed, x, 0, z);
export const hash3 = (seed, x, y, z) => hash(seed, x, y, z);

export function valueNoise2(seed, x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = mix(hash2(seed, x0, z0), hash2(seed, x0 + 1, z0), tx);
  const b = mix(hash2(seed, x0, z0 + 1), hash2(seed, x0 + 1, z0 + 1), tx);
  return mix(a, b, tz) * 2 - 1;
}

export function valueNoise3(seed, x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const layer = (iy) => {
    const a = mix(hash3(seed, x0, iy, z0), hash3(seed, x0 + 1, iy, z0), tx);
    const b = mix(hash3(seed, x0, iy, z0 + 1), hash3(seed, x0 + 1, iy, z0 + 1), tx);
    return mix(a, b, tz);
  };
  return mix(layer(y0), layer(y0 + 1), ty) * 2 - 1;
}

export function fbm2(seed, x, z, octaves = 4) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += valueNoise2(seed + octave * 1013, x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}
