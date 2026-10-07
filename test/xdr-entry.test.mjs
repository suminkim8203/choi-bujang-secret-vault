import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createDecider as createSourceDecider } from '../xdr/brute-force/decision-core.mjs';

test('entry executes with no repository companion files and agrees with source for every original alert', async () => {
  execFileSync(process.execPath, ['scripts/xdr-pack.mjs', '--check'], { stdio: 'pipe' });
  const directory = await mkdtemp(join(tmpdir(), 'aleph-xdr-entry-'));
  try {
    const entry = join(directory, 'decide.mjs');
    await copyFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), entry);
    const standalone = (await import(pathToFileURL(entry).href)).createDecider({ assess: async () => null });
    const source = createSourceDecider({ assess: async () => null });
    const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url)));
    for (const alert of fixture.alerts) assert.deepEqual(await standalone(alert), await source(alert));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
