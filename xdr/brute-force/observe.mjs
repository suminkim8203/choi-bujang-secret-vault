import { isIP } from './address.mjs';
import { extractAlerts } from './read-alerts.mjs';

function positiveInteger(value) {
  if (typeof value === 'string' && /^\d{1,6}$/u.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function observe(alert) {
  const [row] = extractAlerts({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'brute-force', alerts: [alert] });
  const text = row.description;
  const readable = typeof text === 'string' && text !== '[REDACTED]' && text.length <= 2000;
  const description = readable ? text : '';
  const failure = /실패/u.test(description);
  const window = description.match(/(\d+)\s*(분|초)\s*(?:안|동안)/u);
  const describedCount = positiveInteger(description.match(/실패(?:가)?\s*(\d+)\s*건/u)?.[1]);
  const dataCount = positiveInteger(alert.data?.count);
  const accountCount = positiveInteger(description.match(/계정\s*(\d+)\s*개/u)?.[1]);
  // Only count well-formed fictional account labels; never return their values.
  const accounts = typeof alert.data?.accounts === 'string' && alert.data.accounts.length <= 500
    ? alert.data.accounts.split(',').map(value => value.trim()) : [];
  const distinctAccounts = accounts.length && accounts.every(value => /^user\d{1,4}$/u.test(value))
    ? new Set(accounts).size : accountCount;
  const samePassword = /같은 비밀번호/u.test(description);
  const accountRotation = /계정 이름을 바꿔/u.test(description);
  const multipleAccounts = accountRotation || /여러 계정|서로 다른 계정|두 계정|계정\s*\d+\s*개/u.test(description);
  const hadSuccess = /성공(?:했|이|한)/u.test(description) && !/성공은 없습니다/u.test(description);
  const normal = readable && (!failure || describedCount === 1)
    && /성공|로그아웃|세션 유지|화면이 열|로그인 상태가 유지/u.test(description)
    && !samePassword && !accountRotation && !(dataCount > 1);
  const contradictoryCount = Boolean(describedCount && dataCount && describedCount !== dataCount);
  return {
    // In this classroom fixture, data.srcip/srcuser name the summary's source
    // and account. Real Wazuh ingest needs separately verified grouping.
    eventType: failure ? 'login_failure' : samePassword ? 'login_attempt' : normal ? 'normal' : 'unknown',
    sourceAddress: row.sourceAddress,
    sameSourceConfirmed: Boolean(readable && isIP(row.sourceAddress ?? '')),
    sameAccountConfirmed: !multipleAccounts && typeof row.account === 'string'
      && row.account !== '[REDACTED]' && row.account.length > 0,
    failureCount: failure ? describedCount ?? dataCount : null,
    windowSeconds: window ? Number(window[1]) * (window[2] === '분' ? 60 : 1) : null,
    distinctAccounts: distinctAccounts ?? null,
    samePasswordEvidence: samePassword,
    accountRotationEvidence: accountRotation,
    passwordVariationEvidence: /비밀번호를 한 글자씩 바꿔/u.test(description),
    continuedFailureEvidence: /이어졌|성공은 없습니다/u.test(description),
    uniformIntervalEvidence: /같은 간격/u.test(description),
    hadSuccess,
    normal,
    readable,
    contradictoryCount,
    ruleLevel: row.ruleLevel,
  };
}

export function modelState(observation) {
  // No raw description, address, account, time, alert ID or credential goes to AI.
  const { sourceAddress, ...facts } = observation;
  return facts;
}
