import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { detect } from '../src/detect.mjs';
import { checkDetection } from '../scripts/detect-test.mjs';
import checkHandler from '../api/checks.js';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const START = Date.UTC(2026, 9, 1);
const reads = (count, interval = 2000, sub = 'learner_fixture', method = 'GET') =>
  Array.from({ length: count }, (_, i) => ({
    at: new Date(START + i * interval).toISOString(), method, identity: { sub },
  }));
const proposed = subject => ({ action: 'propose_revocation', reasonCode: 'burst_read', subject });

test('official six detection scenarios satisfy the exact proposal contract', async () => {
  assert.ok((await checkDetection(detect)).every(row => row.passed));
  assert.deepEqual(detect([]), { action: 'observe' });
});

test('read and time limits exclude exactly 120 and exactly ten-minute old events', () => {
  assert.deepEqual(detect(reads(120, 0)), { action: 'observe' });
  assert.deepEqual(detect(reads(121, 0)), proposed('learner_fixture'));
  const edge = reads(121, 5000);
  assert.deepEqual(detect(edge), { action: 'observe' });
  edge[120] = { ...edge[120], at: new Date(START + 599999).toISOString() };
  assert.deepEqual(detect(edge), proposed('learner_fixture'));
});

test('order and unrelated methods do not alter the target or mutate events', () => {
  const onlyReads = reads(121);
  const events = [...onlyReads, ...reads(200, 0, 'other_fixture', 'POST')].reverse();
  const before = JSON.stringify(events);
  assert.deepEqual(detect(events), proposed('learner_fixture'));
  assert.equal(JSON.stringify(events), before);
  assert.deepEqual(detect([...reads(100), ...reads(100, 2000, 'other_fixture')]), { action: 'observe' });
  const both = [...reads(121, 2000, 'b_fixture'), ...reads(121, 2000, 'a_fixture')];
  assert.deepEqual(detect(both), proposed('a_fixture'));
  assert.deepEqual(detect([...both].reverse()), proposed('a_fixture'));
});

test('malformed batches fail without echoing inputs; unrelated private fields are never read', () => {
  for (const events of [null, {}, [null], [{ at: 'bad', method: 'GET', identity: { sub: 'fixture' } }],
    [{ at: new Date(START).toISOString(), method: 'GET', identity: {} }]]) {
    assert.throws(() => detect(events), { name: 'TypeError', message: 'invalid_detection_events' });
  }
  const events = reads(121);
  Object.defineProperty(events[0], 'body', { get() { throw Error('private_field_read'); } });
  Object.defineProperty(events[0], 'token', { get() { throw Error('private_field_read'); } });
  assert.deepEqual(detect(events), proposed('learner_fixture'));
  assert.deepEqual(Object.keys(detect(events)).sort(), ['action', 'reasonCode', 'subject']);
});

const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('public checks run fixed synthetic inputs only and never return a subject or raw events', () => {
  for (const name of ['s09-normal-read', 's09-boundary-read', 's09-burst-read',
    's09-split-users', 's09-spread-read', 's09-nonread']) {
    const res = response(); checkHandler({ method: 'GET', query: { case: name } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.synthetic, true); assert.equal(res.body.ready, true);
    assert.deepEqual(Object.keys(res.body).sort(), ['action', 'ready', 'reasonCode', 'synthetic']);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  for (const query of [{ case: 'unknown' }, { case: ['s09-burst-read'] },
    { case: 's09-burst-read', events: [] }, {}, { case: '__proto__' }]) {
    const res = response(); checkHandler({ method: 'GET', query }, res);
    assert.equal(res.code, 400); assert.deepEqual(res.body, { error: 'invalid_check_case' });
  }
  const res = response(); checkHandler({ method: 'POST', query: { case: 's09-burst-read' } }, res);
  assert.equal(res.code, 405);
});

test('stage 9 deployment retains identity, API protection and declared engine zones', async () => {
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  config.step = 9; // Historical stage-9 contract remains valid after later stages.
  const result = deploymentIdentity({ VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'student',
    VERCEL_GIT_REPO_SLUG: 'practice', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    VERCEL_URL: 'practice.vercel.app' }, config);
  assert.equal(result.step, 9); assert.deepEqual(result.allowedRoutes, config.allowedRoutes);
  assert.equal(result.judgeIssuer, config.judgeIssuer);
  assert.equal(result.originalApiUrl, config.originalApiUrl);
  assert.equal(result.identityProvider.issuer, config.identityProvider.issuer);
});
