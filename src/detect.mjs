// 검증된 가상 사건만 받습니다. 실제 계정·본문·토큰·추가 신원 필드는 읽지 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const READ_LIMIT = 120;

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const bySubject = new Map();
  for (const event of events) {
    const at = event?.at;
    const method = event?.method;
    const subject = event?.identity?.sub;
    const time = typeof at === 'string' ? Date.parse(at) : NaN;
    if (!Number.isFinite(time) || typeof method !== 'string' || !method
        || typeof subject !== 'string' || !subject.trim()) {
      throw new TypeError('invalid_detection_events');
    }
    if (method !== 'GET') continue;
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push(time);
  }
  let chosen = null;
  for (const [subject, times] of bySubject) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end++) {
      // 공개 표본과 같은 반열린 10분 창입니다. 정확히 10분 전 사건은 제외합니다.
      while (times[end] - times[start] >= WINDOW_MS) start++;
      if (end - start + 1 <= READ_LIMIT) continue;
      if (!chosen || times[end] < chosen.at
          || (times[end] === chosen.at && subject < chosen.subject)) {
        chosen = { at: times[end], subject };
      }
      break;
    }
  }
  return chosen ? { action: 'propose_revocation', reasonCode: 'burst_read', subject: chosen.subject }
    : { action: 'observe' };
}
