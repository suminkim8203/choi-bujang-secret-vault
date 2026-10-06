import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const originalCommit = '0f9a3c9d23b9eead50b8c03ac78c8a61a7efb7fd';
const secret = /sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u;

export function findingsFor(text, noteBodies) {
  return { noteBody: noteBodies.some(body => text.includes(body)), secretPattern: secret.test(text) };
}

export async function checkPublicNotes({ localOnly = false } = {}) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  });
  const seed = JSON.parse(git('show', `${originalCommit}:data.json`));
  if (!Array.isArray(seed.notes) || seed.notes.length !== 4
      || seed.notes.some(note => typeof note.content !== 'string' || note.content.length < 8)) {
    throw new Error('SEED_REFERENCE_INVALID');
  }
  // Read the old fictional seed in memory only. Never print its contents.
  const bodies = seed.notes.map(note => note.content);
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
  const publicFiles = [];
  async function walk(dir) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const name = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error('UNSAFE_PUBLIC_FILE');
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) publicFiles.push(name);
    }
  }
  await walk('public');
  const sourceFindings = [];
  for (const file of new Set([...tracked, ...publicFiles])) {
    if (/(?:^|\/)\.env(?:\.|$)/u.test(file) || (await lstat(join(root, file))).isSymbolicLink()) {
      throw new Error('UNSAFE_SOURCE_FILE');
    }
    const text = await readFile(join(root, file), 'utf8');
    const result = findingsFor(text, bodies);
    if (result.noteBody || result.secretPattern) sourceFindings.push({ path: file, ...result });
  }
  const staticResponses = [];
  if (!localOnly) {
    const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
    const app = new URL(config.publicAppUrl);
    if (app.protocol !== 'https:' || app.username || app.password || app.port
        || app.search || app.hash || app.pathname !== '/' || !app.hostname.endsWith('.vercel.app')) {
      throw new Error('PUBLIC_URL_INVALID');
    }
    // These are the current static outputs. /api/notes deliberately contains
    // fictional DB rows in step 2 and is checked separately by npm run bundle.
    const paths = ['/', '/data.json', '/aleph.json', '/database.json'];
    // In stage 3 the browser also loads these deployed assets. Checking their
    // local copies alone does not establish what the production browser gets.
    if (config.step >= 3) paths.push('/app.js', '/vendor/supabase.js');
    if (config.step === 4) paths.push('/verify-access.html', '/verify-access.js');
    for (const path of paths) {
      const response = await fetch(new URL(path, app), {
        redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store',
      });
      if (!response.ok) throw new Error('STATIC_RESPONSE_UNAVAILABLE');
      const text = await response.text();
      if (text.length > 1024 * 1024) throw new Error('STATIC_RESPONSE_TOO_LARGE');
      staticResponses.push({ path, status: response.status, ...findingsFor(text, bodies) });
    }
  }
  return { currentGitFiles: tracked.length, localPublicFiles: publicFiles.length,
    sourceFindings, staticResponses,
    passed: sourceFindings.length === 0 && staticResponses.every(row => !row.noteBody && !row.secretPattern) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkPublicNotes({ localOnly: process.argv.includes('--local') });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } catch {
    console.error('공개 자료 검증을 완료하지 못했습니다. 원본 시작 커밋, 현재 파일, 운영 주소를 확인하세요.');
    process.exitCode = 1;
  }
}
