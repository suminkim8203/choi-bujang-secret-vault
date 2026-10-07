import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { extractAlerts, readAlerts } from '../xdr/brute-force/read-alerts.mjs';

const fixtureUrl = new URL('../xdr/fixtures/brute-force.json', import.meta.url);
const fixture = alerts => ({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'brute-force', alerts });

test('official fixture is unchanged and all 28 alerts retain exactly five fields', async () => {
  const before = await readFile(fixtureUrl);
  const blobHash = createHash('sha1').update(`blob ${before.length}\0`).update(before).digest('hex');
  assert.equal(blobHash, '5180c420756dd6e8d8b73ca8ccffe11926e4f754');
  const report = await readAlerts();
  assert.equal(report.inputCount, 28);
  assert.equal(report.outputCount, report.inputCount);
  for (const alert of report.alerts) {
    assert.deepEqual(Object.keys(alert), ['timestamp', 'sourceAddress', 'account', 'ruleLevel', 'description']);
  }
  assert.deepEqual(await readFile(fixtureUrl), before);
});

test('maps Wazuh fields without returning the original alert or mutating it', () => {
  const input = fixture([{ timestamp: '2026-01-01T00:00:00Z', id: 'example',
    data: { srcip: '192.0.2.1', srcuser: 'user01', count: '8' },
    rule: { level: 10, description: 'Repeated login failures' }, raw: 'excluded' }]);
  const snapshot = structuredClone(input);
  assert.deepEqual(extractAlerts(input), [{ timestamp: '2026-01-01T00:00:00Z',
    sourceAddress: '192.0.2.1', account: 'user01', ruleLevel: 10,
    description: 'Repeated login failures' }]);
  assert.deepEqual(input, snapshot);
});

test('missing or incorrectly typed optional fields preserve count with null values', () => {
  assert.deepEqual(extractAlerts(fixture([{}, { timestamp: {}, data: { srcip: 1 },
    rule: { level: '10', description: [] } }])), Array.from({ length: 2 }, () => ({
    timestamp: null, sourceAddress: null, account: null, ruleLevel: null, description: null,
  })));
});

test('recognizable credential patterns redact entire fields and never change input', () => {
  // Synthetic markers only, constructed here; no real credentials are used.
  const values = ['password=synthetic', '"access_token":"synthetic"', 'Bearer synthetic',
    ['sb', 'secret', 'synthetic'].join('_'), ['eyJsynthetic', 'synthetic', 'synthetic'].join('.')];
  const input = fixture(values.map(value => ({ timestamp: value, data: { srcip: value, srcuser: value },
    rule: { level: 5, description: value } })));
  const snapshot = structuredClone(input);
  const rows = extractAlerts(input);
  for (const row of rows) assert.deepEqual(row, { timestamp: '[REDACTED]', sourceAddress: '[REDACTED]',
    account: '[REDACTED]', ruleLevel: 5, description: '[REDACTED]' });
  assert.deepEqual(input, snapshot);
});

test('rejects wrong fixture contracts without including their contents in errors', () => {
  for (const input of [null, {}, { ...fixture([]), moduleKey: 'another-module' },
    { ...fixture([]), schema: 'wrong' }, fixture([null]), fixture([[]])]) {
    assert.throws(() => extractAlerts(input), { message: 'XDR_FIXTURE_INVALID' });
  }
});

test('CLI reports counts only, without alert texts or account values', () => {
  const output = execFileSync(process.execPath, ['xdr/brute-force/read-alerts.mjs'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  const summary = JSON.parse(output);
  assert.equal(summary.inputCount, 28);
  assert.equal(summary.outputCount, 28);
  assert.equal(summary.alerts, undefined);
  assert.equal(summary.report, 'artifacts/xdr01-reader-report.json');
});
