// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 등록 상태는 브라우저 입력이 아니라 엔진이 검증한 계약의 값입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered']);

export async function decide(request) {
  const registered = request.deviceRegistered === true;
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
