import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const fixtureUrl = new URL('../fixtures/web-injection.json', import.meta.url);
const reportUrl = new URL('../../artifacts/xdr02-reader-report.json', import.meta.url);

// Conservative field-level redaction: retain no portion of a suspect value.
// These patterns are a precaution, not a guarantee for arbitrary real logs.
const secretLike = /\bBearer\s+\S+|\b(?:password|passwd|pwd|token|access_token|refresh_token|api[_-]?key|authorization|secret)\b["']?\s*[:=]|\b(?:sb_secret_|sk_)[A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu;

function safeText(value) {
  if (typeof value !== 'string') return null;
  return secretLike.test(value) ? '[REDACTED]' : value;
}

export function extractAlerts(fixture) {
  if (!fixture || fixture.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'web-injection' || !Array.isArray(fixture.alerts)
      || fixture.alerts.some(alert => !alert || typeof alert !== 'object' || Array.isArray(alert))) {
    throw new Error('XDR_FIXTURE_INVALID');
  }
  return fixture.alerts.map(alert => ({
    timestamp: safeText(alert.timestamp),
    sourceAddress: safeText(alert.data?.srcip),
    account: safeText(alert.data?.srcuser),
    ruleLevel: Number.isFinite(alert.rule?.level) ? alert.rule.level : null,
    description: safeText(alert.rule?.description),
  }));
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const alerts = extractAlerts(fixture);
  return {
    moduleKey: 'web-injection',
    inputCount: fixture.alerts.length,
    outputCount: alerts.length,
    redactedFieldCount: alerts.reduce((count, alert) => count
      + Object.values(alert).filter(value => value === '[REDACTED]').length, 0),
    alerts,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await readAlerts();
    await mkdir(new URL('../../artifacts/', import.meta.url), { recursive: true });
    await writeFile(reportUrl, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    // Output counts only; the ignored local report contains the five safe fields.
    const { alerts, ...summary } = report;
    console.log(JSON.stringify({ ...summary, report: 'artifacts/xdr02-reader-report.json' }, null, 2));
  } catch {
    // Do not echo malformed input, file contents, or exception details.
    console.error('경보 읽기를 완료하지 못했습니다. 공식 시험 파일과 저장 경로를 확인하세요.');
    process.exitCode = 1;
  }
}
