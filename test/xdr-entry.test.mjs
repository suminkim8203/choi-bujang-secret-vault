import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { isIP as nativeIsIP } from 'node:net';
import test from 'node:test';
import { isIP } from '../xdr/brute-force/address.mjs';
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

test('entry runs in a context without imports, process, fetch or filesystem access', async () => {
  const text = await readFile(new URL('../xdr/brute-force/decide.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /^import /mu);
  const classify = runInNewContext(text.replace(/^export /gmu, '') + '\ndecide;', { setTimeout, clearTimeout });
  const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url)));
  const source = createSourceDecider({ assess: async () => null });
  for (const alert of fixture.alerts) {
    assert.deepEqual(JSON.parse(JSON.stringify(await classify(alert))), await source(alert));
  }
});

test('portable validator agrees with Node for supported addresses and malformed inputs', () => {
  for (const address of ['192.0.2.1','203.0.113.254','2001:db8::1','::','::1','::ffff:192.0.2.1',
    '1:2:3:4:5:6:7:8','999.1.1.1','01.2.3.4','1.2.3','1:2:3',':::1','1::2::3',
    '1:2:3:4:5:6:7:8:9','not-an-address','']) assert.equal(isIP(address), nativeIsIP(address));
  assert.equal(isIP('fe80::1%eth0'), 0); // Interface-scoped addresses are intentionally unsupported.
});
