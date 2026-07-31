import { resolve } from 'node:path';

export const PORT = Number.parseInt(process.env.PORT || '8080', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const TEST_MODE = process.env.TEST_MODE === '1';
export const SERVICE_ID = process.env.SERVICE_ID || 'steppe-strike';
export const USION_JWKS_URL = process.env.USION_JWKS_URL
  || 'https://mobile.mongolai.mn/.well-known/jwks.json';
export const USION_API_URL = process.env.USION_API_URL || 'https://mobile.mongolai.mn';
export const DEV_ALLOW_UNSIGNED = !IS_PRODUCTION && process.env.DEV_ALLOW_UNSIGNED === '1';
export const RESULT_KEY_ID = process.env.USION_RESULT_KEY_ID || '';
export const RESULT_SECRET = process.env.USION_RESULT_SECRET || '';
export const WORLD_DATA_PATH = process.env.WORLD_DATA_PATH
  || resolve(IS_PRODUCTION ? '/data/steppe-world.json' : '.data/steppe-world.json');
export const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
);
