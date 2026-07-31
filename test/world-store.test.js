import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldStore, loadWorldState } from '../server/world-store.js';

test('world store writes atomically and reloads acknowledged edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'steppe-world-'));
  const path = join(directory, 'world.json');
  const state = { version: 1, seed: 42, revision: 7, edits: [[1, 2, 3, 11]] };
  const store = createWorldStore(path, () => state);
  store.markDirty();
  await store.flush();
  assert.deepEqual(loadWorldState(path), state);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).revision, 7);
  await rm(directory, { recursive: true });
});

test('corrupt persistence safely falls back to the documented world seed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'steppe-world-corrupt-'));
  const path = join(directory, 'world.json');
  await writeFile(path, '{broken');
  const state = loadWorldState(path);
  assert.equal(state.version, 1);
  assert.equal(state.revision, 0);
  assert.deepEqual(state.edits, []);
  await rm(directory, { recursive: true });
});
