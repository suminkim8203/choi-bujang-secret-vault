import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotesHandler } from '../src/notes-api.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const noteA = '33333333-3333-4333-8333-333333333333';
const noteB = '44444444-4444-4444-8444-444444444444';
const fresh = '55555555-5555-4555-8555-555555555555';
const config = { step: 4, publicAppUrl: 'https://practice-vault.vercel.app',
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1', allowedRoutes: ['/api/notes', '/api/notes/:id'],
  database: { url: 'https://practice-vault.supabase.co', table: 'aleph_defense_notes' },
  identityProvider: { issuer: 'https://practice-vault.supabase.co/auth/v1', audience: 'authenticated',
    jwksUrl: 'https://practice-vault.supabase.co/auth/v1/.well-known/jwks.json' } };
const env = { SUPABASE_URL: config.database.url, SUPABASE_SECRET_KEY: 'sb_' + 'secret_' + 'x'.repeat(30) };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; } });

function fixture() {
  const rows = new Map([[noteA, { id: noteA, owner_id: a, title: 'fixture A', content: 'fixture' }],
    [noteB, { id: noteB, owner_id: b, title: 'fixture B', content: 'fixture' }]]);
  let identity = { kind: 'student', userId: a };
  let calls = 0;
  const send = async (url, options) => {
    calls++;
    assert.equal(url.origin, config.database.url);
    const owner = url.searchParams.get('owner_id')?.slice(3);
    const id = url.searchParams.get('id')?.slice(3);
    const method = options.method ?? 'GET';
    if (method === 'POST') {
      const row = JSON.parse(options.body);
      if (rows.has(row.id)) return new Response('', { status: 409 });
      rows.set(row.id, row);
      return Response.json([row]);
    }
    assert.equal(owner, identity.userId.toLowerCase());
    const selected = [...rows.values()].filter(row => row.owner_id === owner && (!id || row.id === id));
    assert.ok(method === 'GET' || id);
    if (method === 'PATCH') for (const row of selected) Object.assign(row, JSON.parse(options.body));
    if (method === 'DELETE') for (const row of selected) rows.delete(row.id);
    return Response.json(selected);
  };
  const options = { config, env: () => env, send, verify: async () => identity };
  const collection = createNotesHandler(options);
  const item = createNotesHandler({ ...options, item: true });
  const run = async (method, id, body, query = {}) => {
    const res = response();
    await (id ? item : collection)({ method, headers: { authorization: 'Bearer local-fixture' },
      query: { ...query, id }, body }, res);
    return res;
  };
  return { rows, run, login(userId, kind = 'student') { identity = { userId, kind }; },
    get calls() { return calls; } };
}

test('stage 4 atomically denies both directions of cross-owner GET/PUT/DELETE without changing rows', async () => {
  const f = fixture();
  for (const [user, other, foreign] of [[a, b, noteB], [b, a, noteA]]) {
    f.login(user);
    const before = structuredClone([...f.rows]);
    assert.equal((await f.run('GET')).body.length, 1);
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await f.run(method, foreign, method === 'PUT' ? { title: 'fixture', body: 'fixture' } : undefined,
        { owner_id: other, userId: other, role: 'admin' });
      assert.equal(res.code, 404);
      assert.deepEqual(res.body, { error: '메모를 찾을 수 없습니다.' });
      assert.deepEqual([...f.rows], before);
    }
  }
});

test('stage 4 preserves each student and judge identity own CRUD and prevents ownership transfer', async () => {
  for (const kind of ['student', 'judge']) for (const owner of [a, b]) {
    const f = fixture();
    f.login(owner, kind);
    const created = await f.run('POST', undefined, { id: fresh, title: 'fixture', body: 'fixture' });
    assert.equal(created.code, 201);
    assert.deepEqual(created.body, { id: fresh });
    assert.equal(f.rows.get(fresh).owner_id, owner);
    assert.deepEqual(Object.keys((await f.run('GET', fresh)).body).sort(), ['body', 'id', 'title']);
    const before = structuredClone([...f.rows]);
    for (const extra of [{ owner_id: owner === a ? b : a }, { userId: b }, { role: 'admin' }, { id: noteB }]) {
      const calls = f.calls;
      assert.equal((await f.run('PUT', fresh, { title: 'fixture', body: 'fixture', ...extra })).code, 400);
      assert.equal(f.calls, calls);
      assert.deepEqual([...f.rows], before);
    }
    assert.equal((await f.run('POST', undefined, { title: 'fixture', body: 'fixture', owner_id: b })).code, 400);
    assert.equal((await f.run('PUT', fresh, { title: 'changed fixture', body: 'fixture' })).code, 200);
    assert.equal(f.rows.get(fresh).owner_id, owner);
    assert.equal((await f.run('DELETE', fresh)).code, 200);
    assert.equal((await f.run('GET', fresh)).code, 404);
    assert.equal(f.rows.size, 2);
    assert.equal((await f.run('POST', undefined, { id: noteA, title: 'fixture', body: 'fixture' })).code, 409);
    assert.equal(f.rows.get(noteA).owner_id, a);
  }
});

test('stage 4 rejects a mismatched upstream owner without exposing the row', async () => {
  const handler = createNotesHandler({ config, item: true, env: () => env,
    verify: async () => ({ userId: a }), send: async () => Response.json([
      { id: noteB, title: 'upstream fixture', content: 'upstream fixture', owner_id: b }]) });
  const res = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer local-fixture' }, query: { id: noteB } }, res);
  assert.equal(res.code, 503);
  assert.deepEqual(res.body, { error: '요청을 처리하지 못했습니다.' });
});

test('stage 4 deployment retains the public issuer and actual protected routes', () => {
  const metadata = { VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'student',
    VERCEL_GIT_REPO_SLUG: 'practice', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'practice-123.vercel.app' };
  const result = deploymentIdentity(metadata, config);
  assert.equal(result.step, 4);
  assert.deepEqual(result.allowedRoutes, config.allowedRoutes);
  assert.deepEqual(result.identityProvider, config.identityProvider);
});
