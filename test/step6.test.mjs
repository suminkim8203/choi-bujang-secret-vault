import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { readFile } from 'node:fs/promises';

test('engine-confirmed registration allows normal reading with the exact response contract', async () => {
  const { normal } = fixtureRequests();
  const result = await decide(normal);
  assert.deepEqual(result, { schema: normal.schema, requestId: normal.requestId,
    decision: 'allow', reasonCode: 'approved', ruleIds: ['device_registered'] });
  assert.deepEqual(RULE_IDS, ['device_registered']);
});

test('missing, false and truthy nonboolean registration all fail closed', async () => {
  const { normal } = fixtureRequests();
  for (const deviceRegistered of [false, undefined, null, 'true', 1, {}]) {
    const result = await decide({ ...normal, deviceRegistered });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'device_not_registered');
    assert.equal(result.requestId, normal.requestId);
  }
  assert.equal((await decide({ ...normal, deviceRegistered: false,
    device: { registered: true }, identity: { trusted: true } })).decision, 'deny');
});

test('stage 6 deployment identity preserves server API, issuer and public URL', async () => {
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const identity = deploymentIdentity({ VERCEL_GIT_PROVIDER: 'github',
    VERCEL_GIT_REPO_OWNER: 'student', VERCEL_GIT_REPO_SLUG: 'practice',
    VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'practice-123.vercel.app' }, { ...config, step: 6 });
  assert.equal(identity.step, 6);
  assert.equal(identity.publicAppUrl, config.publicAppUrl);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
  assert.deepEqual(identity.identityProvider, config.identityProvider);
  assert.equal(identity.originalApiUrl, config.originalApiUrl);
  assert.equal(identity.judgeIssuer, config.judgeIssuer);
});
