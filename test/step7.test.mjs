import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('normal and composite unusual engine fixtures differ and keep stage 6 denial', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  const result = await decide(suspicious);
  assert.equal(result.decision, 'step_up');
  assert.equal(result.reasonCode, 'step_up_required');
  assert.deepEqual(result.ruleIds, ['step_up_required']);
  assert.equal((await decide({ ...suspicious, deviceRegistered: false })).reasonCode, 'device_not_registered');
  assert.ok(RULE_IDS.includes('step_up_required'));
});

test('region alone does not block and client headers never become engine signals', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide({ ...normal, signals: { ...normal.signals, region: 'foreign' } })).decision, 'allow');
  const unknown = { ...normal, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 3 },
    headers: { 'x-region': 'foreign', 'x-network': 'unusual' } };
  assert.equal((await decide(unknown)).decision, 'allow');
  assert.equal((await decide({ ...suspicious, signals: { ...suspicious.signals, source: 'client' } })).decision, 'step_up');
});

test('only engine-confirmed recent step up resolves the additional check', async () => {
  const { suspicious } = fixtureRequests();
  for (const stepUp of [undefined, { verified: false, authAgeSeconds: 60 },
    { verified: 'true', authAgeSeconds: 60 }, { verified: true, authAgeSeconds: null },
    { verified: true, authAgeSeconds: -1 }, { verified: true, authAgeSeconds: 901 }]) {
    assert.equal((await decide({ ...suspicious, stepUp })).decision, 'step_up');
  }
  for (const authAgeSeconds of [0, 60, 900]) {
    assert.equal((await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds } })).decision, 'allow');
  }
});
