import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadNotes } from '../src/notes-store.mjs';
import handler from '../api/notes.js';
import { readFile } from 'node:fs/promises';
import { runAttackChecks } from '../src/attack-check.mjs';

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
      : new Response('', { status: 405 });
    const checks = await runAttackChecks({ step: 2, publicAppUrl: 'https://student-defense.vercel.app', sampleMarker: 'SAMPLE_NOTE_1' });
    assert.match(checks[0].observed, /점검 실패/u);
  } finally {
    globalThis.fetch = saved;
  }
});
