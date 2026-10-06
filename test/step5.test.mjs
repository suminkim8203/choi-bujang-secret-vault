import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const database = { url: 'https://practice-vault.supabase.co', table: 'aleph_defense_notes' };
const config = { step: 5, database, publicAppUrl: 'https://practice-vault.vercel.app',
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1', allowedRoutes: ['/api/notes', '/api/notes/:id'],
  originalApiUrl: `${database.url}/rest/v1/${database.table}`,
  identityProvider: { issuer: `${database.url}/auth/v1`, audience: 'authenticated',
    jwksUrl: `${database.url}/auth/v1/.well-known/jwks.json` } };
const metadata = { VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'student',
  VERCEL_GIT_REPO_SLUG: 'practice', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'practice-123.vercel.app' };

test('stage 5 records the exact original endpoint while preserving login, public URL and routes', () => {
  const result = deploymentIdentity(metadata, config);
  assert.equal(result.step, 5);
  assert.equal(result.originalApiUrl, config.originalApiUrl);
  assert.equal(result.publicAppUrl, config.publicAppUrl);
  assert.deepEqual(result.identityProvider, config.identityProvider);
  assert.deepEqual(result.allowedRoutes, config.allowedRoutes);
  assert.equal(result.judgeIssuer, config.judgeIssuer);
  assert.equal(Object.hasOwn(result, 'sampleMarker'), false);
});

test('stage 5 refuses query, fragment, foreign table or mismatched original endpoint', () => {
  for (const target of [null, `${config.originalApiUrl}?select=*`, `${config.originalApiUrl}#fragment`,
    `${database.url}/rest/v1/another_table`, 'https://different.supabase.co/rest/v1/aleph_defense_notes']) {
    assert.throws(() => deploymentIdentity(metadata, { ...config, originalApiUrl: target }));
  }
});

test('application and verification browser entrypoints retain Auth and have no direct data API calls', async () => {
  for (const file of ['../public/app.js', '../public/verify-access.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /client\.auth\./);
    assert.match(source, /\/api\/notes/);
    assert.doesNotMatch(source, /\.from\s*\(|\/rest\/v1\//);
  }
});
