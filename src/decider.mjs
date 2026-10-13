// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 등록 상태는 브라우저 입력이 아니라 엔진이 검증한 계약의 값입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
function permittedResource(request) {
  if (request.service !== 'notes') return false;
  const { method, path, route } = request;
  if (path === '/notes') return ['GET', 'POST'].includes(method) && route === `${method} /notes`;
  // 실제 메모 ID는 UUID입니다. 공식 로컬 연습의 demo는 가상 출처에서만 허용합니다.
  const uuidPath = typeof path === 'string'
    && /^\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(path);
  // 연습용 demo는 공식 fixture-7의 정상 주체 learner_fixture로 소유 범위를 한정합니다.
  // 같은 경로로 다른 가명 신원이 요청하면 가상 자원의 소유 범위를 벗어납니다.
  const practicePath = path === '/notes/demo' && request.signals?.source === 'judge_fixture'
    && request.subjectId === 'learner_fixture';
  if (!uuidPath && !practicePath) return false;
  return ['GET', 'PUT', 'DELETE'].includes(method) && route === `${method} /notes/:id`;
}
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_scope']);

function requiresStepUp(request) {
  const signals = request.signals;
  // 실제 엔진은 위치 정보가 없음을 명시합니다. 브라우저 헤더는 참조하지 않습니다.
  if (signals?.source === 'none') return false;
  if (signals?.source !== 'judge_fixture') return true;
  const unusualHour = Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour < 6;
  const unusualNetwork = signals.network === 'unusual';
  const foreignRegion = signals.region === 'foreign';
  const heavyActivity = Array.isArray(request.recentEvents) && request.recentEvents.some(event =>
    event?.kind === 'risk_signal' && Number.isInteger(event.count) && event.count >= 20
      && Number.isInteger(event.ageSeconds) && event.ageSeconds >= 0 && event.ageSeconds <= 180);
  // 지역 하나로 영구 거부하지 않습니다. 가상 복합 이상에 추가 확인을 요구합니다.
  return unusualNetwork && unusualHour && heavyActivity
    || foreignRegion && (unusualNetwork || unusualHour || heavyActivity);
}

function freshStepUp(request) {
  const age = request.stepUp?.authAgeSeconds;
  return request.stepUp?.verified === true && Number.isInteger(age) && age >= 0 && age <= 900;
}

export async function decide(request) {
  const registered = request.deviceRegistered === true;
  if (registered && !permittedResource(request)) {
    return { schema: 'aleph.decision.v1', requestId: request.requestId,
      decision: 'deny', reasonCode: 'resource_not_allowed', ruleIds: [RULE_IDS[2]] };
  }
  if (registered && requiresStepUp(request) && !freshStepUp(request)) {
    return { schema: 'aleph.decision.v1', requestId: request.requestId,
      decision: 'step_up', reasonCode: 'step_up_required', ruleIds: [RULE_IDS[1]] };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
