import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadNotes } from '../src/notes-store.mjs';
import handler from '../api/notes.js';
import { readFile } from 'node:fs/promises';
import { runAttackChecks } from '../src/attack-check.mjs';
import { publicDatabase } from '../src/public-db-config.mjs';
const database = { url: 'https://fictional-project.supabase.co', publishableKey: 'sb_publishable_' + 'x'.repeat(30), table: 'aleph_defense_notes' };

const env = { SUPABASE_URL: 'https://fictional-project.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_' + 'secret_' + 'x'.repeat(30) };

test('server requests only the fixed table and never returns extra DB fields', async () => {
  const result = await loadNotes(env, async (url, options) => {
    assert.equal(url.origin, env.SUPABASE_URL);
    assert.equal(url.pathname, '/rest/v1/aleph_defense_notes');
    assert.equal(url.searchParams.get('select'), 'id,title,content');
    assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    return Response.json([{ id: 'test-note', title: '가상 제목', content: '검사용 자료', extra: 'omit-me' }]);
  });
  assert.deepEqual(result, [{ id: 'test-note', title: '가상 제목', content: '검사용 자료' }]);
});

test('invalid DB configuration stops before credentials can be sent', async () => {
  let sent = false;
  await assert.rejects(loadNotes({ ...env, SUPABASE_URL: 'https://unrelated.example' }, async () => { sent = true; }), /DB_CONFIG_INVALID/u);
  assert.equal(sent, false);
});

test('DB errors and absent configuration produce generic responses without key contents', async () => {
  await assert.rejects(loadNotes(env, async () => new Response('upstream details', { status: 403 })), /DB_READ_FAILED/u);
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ method: 'GET' }, response);
    assert.equal(response.code, 503);
    assert.deepEqual(response.body, { error: '자료를 불러오지 못했습니다.' });
    await handler({ method: 'POST' }, response);
    assert.equal(response.code, 405);
  } finally {
    if (saved.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = saved.key;
  }
});

test('public files contain no note rows and the page reads the server route', async () => {
  for (const path of ['data.json', 'public/data.json']) {
    assert.deepEqual(JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8')), { notes: [] });
  }
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /fetch\('\/api\/notes'/u);
  assert.doesNotMatch(html, /SUPABASE_SECRET_KEY|sb_secret_/u);
});

test('step 2 check rejects a static JSON that still has notes without the marker', async () => {
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = async url => String(url).endsWith('/data.json')
      ? Response.json({ notes: [{ title: 'unexpected' }] })
      : String(url).endsWith('/database.json') ? Response.json(publicDatabase(database))
      : new Response('', { status: 405 });
    const checks = await runAttackChecks({ step: 2, publicAppUrl: 'https://student-defense.vercel.app', sampleMarker: 'SAMPLE_NOTE_1', database });
    assert.match(checks[0].observed, /점검 실패/u);
  } finally {
    globalThis.fetch = saved;
  }
});


test('public metadata cannot export server credentials or arbitrary fields', () => {
  assert.deepEqual(publicDatabase({ ...database, privateField: 'must not export' }),
    { schema: 'aleph.defense.database.v1', ...database });
  assert.throws(() => publicDatabase({ ...database, publishableKey: env.SUPABASE_SECRET_KEY }), /PUBLIC_DB_CONFIG_INVALID/u);
  assert.throws(() => publicDatabase({ ...database, url: 'https://unrelated.example' }), /PUBLIC_DB_CONFIG_INVALID/u);
});

test('direct DB check distinguishes permission denial from an invalid key and refuses mismatched metadata', async () => {
  const saved = globalThis.fetch;
  let directCalls = 0;
  let mismatch = false;
  let permission = true;
  try {
    globalThis.fetch = async (url, options) => {
      const target = new URL(url);
      if (target.pathname === '/data.json') return Response.json({ notes: [] });
      if (target.pathname === '/api/notes') return options?.method === 'POST'
        ? new Response('', { status: 405 })
        : Response.json({ sampleMarker: 'SAMPLE_NOTE_1', notes: Array.from({ length: 4 }, () => ({})) });
      if (target.pathname === '/database.json') return Response.json(publicDatabase({ ...database,
        url: mismatch ? 'https://different-project.supabase.co' : database.url }));
      directCalls++;
      assert.equal(target.origin, database.url);
      assert.equal(options.headers.apikey, database.publishableKey);
      assert.equal(options.redirect, 'error');
      return Response.json(permission ? { code: '42501' } : { message: 'Invalid API key' }, { status: 401 });
    };
    const config = { step: 2, publicAppUrl: 'https://student-defense.vercel.app', sampleMarker: 'SAMPLE_NOTE_1', database };
    assert.match((await runAttackChecks(config))[3].observed, /42501 권한 거부 확인/u);
    permission = false;
    assert.match((await runAttackChecks(config))[3].observed, /확인 실패/u);
    mismatch = true;
    await assert.rejects(runAttackChecks(config), /일치하지 않습니다/u);
    assert.equal(directCalls, 2);
  } finally { globalThis.fetch = saved; }
});
