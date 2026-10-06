import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createNotesHandler } from '../src/notes-api.mjs';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const noteId = '33333333-3333-4333-8333-333333333333';
const config = { step: 3, publicAppUrl: 'https://practice-vault.vercel.app',
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1', allowedRoutes: ['/api/notes', '/api/notes/:id'],
  database: { url: 'https://practice-vault.supabase.co', table: 'aleph_defense_notes' },
  identityProvider: { issuer: 'https://practice-vault.supabase.co/auth/v1', audience: 'authenticated',
    jwksUrl: 'https://practice-vault.supabase.co/auth/v1/.well-known/jwks.json' } };
const environment = { SUPABASE_URL: config.database.url, SUPABASE_SECRET_KEY: 'sb_' + 'secret_' + 'x'.repeat(30) };
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

// Ephemeral local fixtures only: no real account, private key or token is saved.
test('unchanged starter verifier rejects forged, expired, wrong audience and wrong issuer judge tokens', async () => {
  const pair = await generateKeyPair('ES256');
  const rogue = await generateKeyPair('ES256');
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: config.judgeIssuer, aud: 'practice-vault.vercel.app', sub: userA,
    aleph_run: noteId, aleph_role: 'judge', aleph_identity: 'a', iat: now, exp: now + 120 };
  const sign = (overrides = {}, key = pair.privateKey) => new SignJWT({ ...claims, ...overrides })
    .setProtectedHeader({ alg: 'ES256' }).sign(key);
  const verifier = createLoginVerifier({ config, judgeKeySet: async () => pair.publicKey,
    supabaseClient: { auth: { getClaims: async () => ({ error: new Error('unused') }) } } });
  assert.deepEqual(await verifier('Bearer ' + await sign()),
    { kind: 'judge', userId: userA, runId: noteId, identity: 'a' });
  for (const token of [await sign({}, rogue.privateKey), await sign({ iat: now - 200, exp: now - 100 }),
    await sign({ aud: 'different-vault.vercel.app' }), await sign({ iss: 'https://other-service.supabase.co/auth/v1' }),
    await sign({ aleph_role: 'admin' }), await sign({ exp: now + 1000 })]) {
    assert.equal(await verifier('Bearer ' + token), null);
  }
  assert.equal(await verifier(undefined), null);
  assert.equal(await verifier('Bearer invalid-login-token'), null);
});

test('student branch requires verified SDK claims and the configured issuer, audience, role and expiry', async () => {
  const pair = await generateKeyPair('ES256');
  const now = Math.floor(Date.now() / 1000);
  const base = { iss: config.identityProvider.issuer, aud: 'authenticated', sub: userA,
    role: 'authenticated', iat: now, exp: now + 120 };
  const sdk = { auth: { getClaims: async token => {
    try { return { data: { claims: (await jwtVerify(token, pair.publicKey, { algorithms: ['ES256'] })).payload }, error: null }; }
    catch { return { data: null, error: new Error('rejected') }; }
  } } };
  const verifier = createLoginVerifier({ config, judgeKeySet: async () => pair.publicKey, supabaseClient: sdk });
  const sign = claims => new SignJWT(claims).setProtectedHeader({ alg: 'ES256' }).sign(pair.privateKey);
  assert.deepEqual(await verifier('Bearer ' + await sign(base)), { kind: 'student', userId: userA });
  for (const claims of [{ ...base, aud: 'another-app' }, { ...base, role: 'anon' },
    { ...base, exp: now - 10 }, { ...base, iss: 'https://wrong.supabase.co/auth/v1' }]) {
    assert.equal(await verifier('Bearer ' + await sign(claims)), null);
  }
  const failedSdk = createLoginVerifier({ config, judgeKeySet: async () => pair.publicKey,
    supabaseClient: { auth: { getClaims: async () => ({ data: { claims: base }, error: new Error('invalid signature') }) } } });
  assert.equal(await failedSdk('Bearer ' + await sign(base)), null);
});

test('missing or rejected authorization blocks all CRUD before database access', async () => {
  let calls = 0;
  for (const item of [false, true]) {
    const handler = createNotesHandler({ config, item, env: () => environment, verify: async () => null,
      send: async () => { calls++; throw new Error('must not run'); } });
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
        const res = response();
        await handler({ method, headers, query: { id: noteId } }, res);
        assert.equal(res.code, 401);
        assert.deepEqual(res.body, { error: '로그인이 필요합니다.' });
        assert.equal(res.headers['Cache-Control'], 'no-store');
      }
    }
  }
  assert.equal(calls, 0);
});

test('server CRUD derives insert owner from login, filters list, preserves item contract and deleted GET404', async () => {
  const rows = new Map();
  let identity = userA;
  const requests = [];
  const send = async (url, options) => {
    const method = options.method ?? 'GET';
    requests.push({ method, url, options });
    assert.equal(url.origin, config.database.url);
    assert.equal(url.pathname, '/rest/v1/aleph_defense_notes');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.apikey, environment.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization, undefined);
    const id = url.searchParams.get('id')?.slice(3);
    if (method === 'POST') {
      const row = JSON.parse(options.body);
      rows.set(row.id, row);
      return Response.json([row]);
    }
    const row = rows.get(id);
    if (method === 'PATCH' && row) Object.assign(row, JSON.parse(options.body));
    if (method === 'DELETE') rows.delete(id);
    if (id) return Response.json(row ? [row] : []);
    const owner = url.searchParams.get('owner_id')?.slice(3);
    return Response.json([...rows.values()].filter(note => note.owner_id === owner));
  };
  const options = { config, env: () => environment, send, verify: async () => ({ kind: 'student', userId: identity }) };
  const collection = createNotesHandler(options);
  const item = createNotesHandler({ ...options, item: true });
  const run = async (handler, method, body) => {
    const res = response();
    await handler({ method, headers: { authorization: 'Bearer local-fixture' }, query: { id: noteId }, body }, res);
    return res;
  };
  const created = await run(collection, 'POST', { id: noteId, title: '검사용 제목', body: '가상 검증 자료', owner_id: userB, userId: userB, role: 'admin' });
  assert.equal(created.code, 201);
  assert.deepEqual(created.body, { id: noteId });
  assert.equal(rows.get(noteId).owner_id, userA);
  const ownList = await run(collection, 'GET');
  assert.equal(ownList.body.length, 1);
  assert.deepEqual(Object.keys(ownList.body[0]).sort(), ['body', 'id', 'title']);
  identity = userB;
  assert.deepEqual((await run(collection, 'GET')).body, []);
  // Explicit stage-3 limitation: individual item ownership is added in stage 4.
  assert.equal((await run(item, 'GET')).code, 200);
  identity = userA;
  assert.equal((await run(item, 'PUT', { title: '수정 제목', body: '수정 검증 자료', owner_id: userB })).code, 200);
  assert.equal(rows.get(noteId).owner_id, userA);
  assert.deepEqual((await run(item, 'GET')).body, { id: noteId, title: '수정 제목', body: '수정 검증 자료' });
  assert.equal((await run(item, 'DELETE')).code, 200);
  assert.equal((await run(item, 'GET')).code, 404);
  assert.deepEqual((await run(collection, 'GET')).body, []);
  assert.ok(requests.length >= 8);
});

test('invalid input, conflicting IDs and DB failures do not expose server or upstream details', async () => {
  let calls = 0;
  const handler = createNotesHandler({ config, env: () => environment,
    verify: async () => ({ userId: userA }), send: async () => { calls++; return new Response('upstream private details', { status: 503 }); } });
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer local-fixture' }, body: { title: '', body: 'x' } }, res);
  assert.equal(res.code, 400);
  assert.equal(calls, 0);
  await handler({ method: 'GET', headers: { authorization: 'Bearer local-fixture' } }, res);
  assert.equal(res.code, 503);
  assert.equal(JSON.stringify(res.body).includes(environment.SUPABASE_SECRET_KEY), false);
  assert.equal(JSON.stringify(res.body).includes('upstream'), false);
  const item = createNotesHandler({ config, item: true, env: () => environment, verify: async () => ({ userId: userA }) });
  await item({ method: 'DELETE', headers: { authorization: 'Bearer local-fixture' }, query: { id: [noteId, noteId] } }, res);
  assert.equal(res.code, 400);
});

test('stage 3 published identity matches canonical routes and exports only public identity fields', () => {
  const env = { VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'student',
    VERCEL_GIT_REPO_SLUG: 'practice', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'practice-123.vercel.app' };
  const identity = deploymentIdentity(env, { ...config, identityProvider: { ...config.identityProvider, extra: 'must not publish' } });
  assert.deepEqual(identity.identityProvider, config.identityProvider);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
  assert.equal(identity.publicAppUrl, config.publicAppUrl);
  assert.equal(Object.hasOwn(identity, 'sampleMarker'), false);
  assert.throws(() => deploymentIdentity(env, { ...config, identityProvider: { ...config.identityProvider, audience: 'other' } }));
  assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: ['/api/notes'] }));
});
