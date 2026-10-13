import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { createNotesHandler } from '../src/notes-api.mjs';
import { createAnnouncementsHandler } from '../src/announcements-api.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

test('stage 8 manifest declares exact service, action and zone without expanding routes', async () => {
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const env = { VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'student',
    VERCEL_GIT_REPO_SLUG: 'practice', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'practice.vercel.app' };
  const identity = deploymentIdentity(env, config);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
  assert.notEqual(identity.allowedRoutes[0], config.allowedRoutes[0]);
  for (const edit of [{ zone: 'instructor-materials' }, { pathPattern: '/api/admin/notes' },
    { method: 'PATCH' }, { role: 'teacher' }]) {
    const rows = config.allowedRoutes.map(row => ({ ...row }));
    rows[0] = { ...rows[0], ...edit };
    assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: rows }));
  }
  assert.throws(() => deploymentIdentity(env, { ...config,
    allowedRoutes: config.allowedRoutes.map(() => config.allowedRoutes[0]) }));
});

test('resource allowlist pairs exact verified service, method, path and route', async () => {
  const { normal } = fixtureRequests();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await decide({ ...normal, method, route: `${method} /notes/:id` })).decision, 'allow');
  }
  for (const edit of [{ service: 'announcements' }, { path: '/admin' }, { path: '/notes/other' },
    { path: '/notes/export' }, { path: '/notes/demo/extra' }, { path: '/notes/../admin' },
    { path: '/notes/%2e%2e' }, { method: 'PATCH' }, { route: 'GET /admin' }]) {
    const result = await decide({ ...normal, ...edit });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'resource_not_allowed');
  }
  assert.equal((await decide({ ...normal, path: '/notes/33333333-3333-4333-8333-333333333333',
    signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 14 } })).decision, 'allow');
  assert.equal((await decide({ ...normal, subjectId: 'other_fixture' })).decision, 'deny');
  const deployedPath = '/api/notes/33333333-3333-4333-8333-333333333333';
  assert.equal((await decide({ ...normal, path: deployedPath, route: 'GET /api/notes/:id' })).decision, 'allow');
  assert.equal((await decide({ ...normal, path: '/api/notes/export', route: 'GET /api/notes/:id' })).decision, 'deny');
});

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('final note API keeps atomic owner filtering and rejects query-based scope changes', async () => {
  const config = { ...JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8')), step: 8 };
  const env = { SUPABASE_URL: config.database.url, SUPABASE_SECRET_KEY: 'sb_'+'secret_'+'x'.repeat(30) };
  let identity = { userId: a }, calls = 0;
  const row = { id, owner_id: a, title: 'fixture', content: 'fixture' };
  const send = async url => { calls++; return Response.json(url.searchParams.get('owner_id') === `eq.${a}` ? [row] : []); };
  const item = createNotesHandler({ config, item: true, env: () => env, verify: async () => identity, send });
  const request = { method: 'GET', headers: { authorization: 'Bearer local-fixture' }, query: { id } };
  const own = res(); await item(request, own); assert.equal(own.code, 200);
  identity = { userId: b };
  const foreign = res(); await item(request, foreign); assert.equal(foreign.code, 404);
  for (const method of ['PUT', 'DELETE']) {
    const denied = res(); await item({ ...request, method, body: { title: 'fixture', body: 'fixture' } }, denied);
    assert.equal(denied.code, 404);
  }
  for (const query of [{ id, role: 'teacher' }, { id, resourceId: 'teacher_announcements' }, { id, action: 'export' }]) {
    const count = calls; const denied = res(); await item({ ...request, query }, denied);
    assert.equal(denied.code, 400); assert.equal(calls, count);
  }
  assert.equal(own.headers['X-Resource-Id'], 'personal_notes');
});

test('announcement resource denies client teacher claims and returns no material', async () => {
  const handler = createAnnouncementsHandler({ config: {}, verify: async () => ({ userId: a }) });
  const r = res(); await handler({ method: 'PUT', headers: { authorization: 'Bearer local-fixture', 'x-role': 'teacher' },
    body: { role: 'teacher', owner_id: a }, query: { role: 'teacher' } }, r);
  assert.equal(r.code, 403); assert.deepEqual(Object.keys(r.body), ['error']);
  assert.equal(r.headers['X-Resource-Id'], 'teacher_announcements');
  const anonymous = res(); await handler({ headers: {} }, anonymous); assert.equal(anonymous.code, 401);
});
