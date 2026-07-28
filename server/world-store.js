import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { WORLD_SEED } from '../shared/terrain.js';

const EMPTY_STATE = Object.freeze({
  version: 1,
  seed: WORLD_SEED,
  revision: 0,
  edits: [],
});

export function loadWorldState(path) {
  if (!existsSync(path)) return { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed?.version !== 1 || !Number.isInteger(parsed.seed)
      || !Number.isInteger(parsed.revision) || !Array.isArray(parsed.edits)) {
      throw new Error('unsupported world data');
    }
    return {
      version: 1,
      seed: parsed.seed,
      revision: parsed.revision,
      edits: parsed.edits,
    };
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'world_load_failed',
      reason: error.message,
    }));
    return { ...EMPTY_STATE };
  }
}

export function createWorldStore(path, getState) {
  let dirty = false;
  let saving = null;
  let timer = null;
  let lastSavedAt = 0;
  let lastError = '';

  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (saving) await saving;
    if (!dirty) return;
    dirty = false;
    saving = (async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, `${JSON.stringify(getState())}\n`, { mode: 0o600 });
        await rename(temporary, path);
        lastSavedAt = Date.now();
        lastError = '';
      } catch (error) {
        dirty = true;
        lastError = error.message;
        console.error(JSON.stringify({
          level: 'error',
          event: 'world_save_failed',
          reason: error.message,
        }));
      } finally {
        saving = null;
      }
    })();
    await saving;
  }

  return {
    markDirty() {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 600);
      timer.unref?.();
    },
    flush,
    health() {
      return {
        dirty,
        lastSavedAt: lastSavedAt || null,
        saveError: lastError || null,
      };
    },
  };
}
