export const PORT = Number.parseInt(process.env.PORT || '8080', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
export const TEST_MODE = process.env.TEST_MODE === '1';
export const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
);

