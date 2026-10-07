import { isIP } from '../brute-force/address.mjs';
import { extractAlerts } from './read-alerts.mjs';

function countOf(value) {
  if (typeof value === 'string' && /^\d{1,6}$/u.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function observe(alert) {
  const [row] = extractAlerts({ schema: 'aleph.xdr.fixture.v1', moduleKey: 'web-injection', alerts: [alert] });
  const readable = typeof row.description === 'string' && row.description !== '[REDACTED]' && row.description.length <= 2000;
  const text = readable ? row.description : '';
  const described = countOf(text.match(/(\d+)\s*(?:번|건)/u)?.[1]);
  const aggregated = countOf(alert.data?.count);
  const sqlEvidence = /SQL\s*(?:구문|표식)|데이터베이스 조회를 이어 붙/u.test(text);
  const scriptEvidence = /스크립트\s*(?:삽입 표기|표식)/u.test(text);
  const traversalEvidence = /경로(?:를 여러 단계 거슬러 올라가는| 이탈) 표기/u.test(text);
  const commandEvidence = /명령 구분자 표기/u.test(text);
  const suspicious = /SQL|sql|select|스크립트|따옴표|경로|주입|이상한|구분 문자|공격 표기|주소가 평소보다/u.test(text);
  const ordinary = /조회했습니다|화면이 열렸습니다|새로고침했습니다/u.test(text);
  return {
    readable,
    sourceAddress: row.sourceAddress,
    sameSourceConfirmed: Boolean(readable && isIP(row.sourceAddress ?? '')),
    count: described ?? aggregated,
    contradictoryCount: Boolean(described && aggregated && described !== aggregated),
    sqlEvidence, scriptEvidence, traversalEvidence, commandEvidence,
    // The classroom alert aggregates one source. Real ingest needs verified grouping.
    repetitionDenied: /반복은 없습니다|반복되지 않았/u.test(text),
    normal: readable && ordinary && !suspicious && !sqlEvidence && !scriptEvidence
      && !traversalEvidence && !commandEvidence && !(aggregated > 1),
  };
}

export function modelState(facts) {
  const { sourceAddress, ...state } = facts;
  return state;
}
