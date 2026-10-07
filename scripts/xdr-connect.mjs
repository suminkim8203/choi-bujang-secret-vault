import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { buildDenyRules } from '../xdr/ztna-gate.mjs';

// Local fixture export, not a live-engine registration or live block.
function documentationAddress(value) {
  return typeof value === 'string' && isIP(value) === 4
    && /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/u.test(value);
}

try {
  const root = new URL('../', import.meta.url);
  const fixture = JSON.parse(await readFile(new URL('xdr/fixtures/brute-force.json', root), 'utf8'));
  const result = JSON.parse(await readFile(new URL('xdr/brute-force/result.json', root), 'utf8'));
  if (fixture.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force'
      || !Array.isArray(fixture.alerts) || fixture.alerts.some(alert => !documentationAddress(alert.data?.srcip))) {
    throw new Error('FICTIONAL_FIXTURE_REQUIRED');
  }
  const rules = buildDenyRules(fixture.alerts, result);
  const overlay = { schema: 'aleph.student.xdr.deny-overlay.v1', moduleKey: 'brute-force',
    mode: 'fixture-export-only', ttlSeconds: 900, rules };
  const logUrl = new URL('xdr/alerts.log', root);
  let oldLog = '';
  try { oldLog = await readFile(logUrl, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const prior = new Set(oldLog.split('\n').filter(Boolean).map(line => {
    const entry = JSON.parse(line);
    return `${entry.moduleKey}:${entry.alertId}:${entry.action}:${entry.confidence}`;
  }));
  const additions = result.decisions.filter(row => row.action !== 'record'
    && !prior.has(`brute-force:${row.alertId}:${row.action}:${row.confidence}`))
    .map(row => JSON.stringify({ moduleKey: 'brute-force', alertId: row.alertId,
      action: row.action, confidence: row.confidence }));
  await writeFile(new URL('xdr/brute-force/deny-rules.json', root), `${JSON.stringify(overlay, null, 2)}\n`);
  if (additions.length) await appendFile(logUrl, `${oldLog && !oldLog.endsWith('\n') ? '\n' : ''}${additions.join('\n')}\n`);
  await writeFile(new URL('public/xdr01-status.json', root), `${JSON.stringify({
    moduleKey: 'brute-force', mode: 'fixture-only', counts: result.counts,
    fixtureCount: fixture.alerts.length, denyRulesExported: rules.length,
    jevLiveVerified: false, liveEngineConnected: false, judgeStatus: 'check-portal-for-current-verdict',
    integrationNotes: 'xdr/INTEGRATION.md in the public repository',
  }, null, 2)}\n`);
  console.log(JSON.stringify({ ...result.counts, denyRulesExported: rules.length,
    currentlyActive: rules.filter(rule => Date.parse(rule.expiresAt) > Date.now()).length,
    newLogLines: additions.length, liveEngineConnected: false }, null, 2));
} catch {
  console.error('경보 연결 자료를 만들지 못했습니다. 가상 시험 파일과 판정 결과의 형식을 확인하세요.');
  process.exitCode = 1;
}
