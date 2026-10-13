import { detect } from './detect.mjs';

// 공개 점검은 고정 가상 사건만 만듭니다. 요청·세션·사용자 자료를 받지 않습니다.
const START = Date.UTC(2026, 9, 1);
const SUBJECT = 'detection_fixture';
function events(count, interval = 2000, subject = SUBJECT, method = 'GET') {
  return Array.from({ length: count }, (_, i) => ({
    at: new Date(START + i * interval).toISOString(), method, identity: { sub: subject },
  }));
}
export function runDetectionCheck(caseId) {
  const cases = {
    's09-normal-read': () => events(30),
    's09-boundary-read': () => events(120),
    's09-burst-read': () => events(121),
    's09-split-users': () => [...events(100), ...events(100, 2000, 'other_fixture')],
    's09-spread-read': () => events(200, 7000),
    's09-nonread': () => events(200, 2000, SUBJECT, 'POST'),
  };
  if (typeof caseId !== 'string' || !Object.hasOwn(cases, caseId)) return null;
  const result = detect(cases[caseId]());
  const burst = caseId === 's09-burst-read';
  const expected = burst ? 'action,reasonCode,subject' : 'action';
  const ready = result && Object.keys(result).sort().join(',') === expected
    && result.action === (burst ? 'propose_revocation' : 'observe')
    && (!burst || result.reasonCode === 'burst_read' && result.subject === SUBJECT);
  return { synthetic: true, ready: Boolean(ready), action: result?.action,
    reasonCode: result?.reasonCode ?? null };
}
