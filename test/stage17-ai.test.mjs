import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../on-client/student/extension.mjs';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.text = ''; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  set innerHTML(_) { throw Error('HTML 삽입 금지'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
let requests = 0;
globalThis.fetch = () => { requests++; throw Error('학생 표시의 요청 금지'); };
const view = createStudentView();
const time = '2026-10-23T00:00:00.000Z';
const ok = () => ({ status: 'ok', mode: 'connected', checkedAt: time,
  data: { transportChecked: true, audienceAuthorization: 'verified', modelCount: 2 } });

test('연결 test/verified·모델 수·시각을 표시하고 사건 설명 실행과 구분한다', () => {
  for (const authorization of ['test', 'verified']) {
    const input = ok(); input.data.audienceAuthorization = authorization;
    const text = view.renderAiConnection(input).textContent;
    assert.ok(text.includes(authorization)); assert.ok(text.includes('modelCount): 2'));
    assert.ok(text.includes(time)); assert.ok(text.includes('사건 설명은 아직 실행하지 않았습니다'));
  }
});
test('연결 idle/loading에서 과거 자료·오류·시각을 제거한다', () => {
  for (const status of ['idle', 'loading']) {
    const text = view.renderAiConnection({ ...ok(), status, error: { code: 'WB_CLCO_AUTH_REQUIRED', message: '과거 인증 오류' } }).textContent;
    assert.ok(text.includes(status)); assert.ok(!text.includes(time)); assert.ok(!text.includes('과거 인증 오류'));
    assert.ok(!text.includes('modelCount')); assert.ok(!text.includes('점검(verified)'));
  }
});
test('권한·인증·제한·한도·시간·네트워크·취소·모델 없음은 각각 복구 방향을 표시한다', () => {
  const cases = {
    ON_AI_PROVISIONING_PENDING: '권한 준비 중', WB_CLCO_AUTH_REQUIRED: '인증 실패',
    WB_CLCO_ACCESS_BLOCKED: '접근 제한', WB_CLCO_COHORT_BUDGET_EXHAUSTED: '반 사용량',
    WB_CLCO_LIMIT_REACHED: '이용 한도', WB_CLCO_SESSION_CLOSED: '이용 시간',
    WB_CLCO_RATE_LIMITED: '요청 제한', WB_CLCO_TIMEOUT: '시간 초과', REQUEST_TIMEOUT: '시간 초과',
    TIMEOUT: '시간 초과', WB_CLCO_NETWORK_ERROR: '네트워크 오류',
    CANCELLED: '취소', REQUEST_CANCELLED: '취소', WB_CLCO_CANCELLED: '취소',
    MODEL_NOT_CONFIGURED: '모델', ON_AI_MODEL_LIST_EMPTY: '모델',
    ON_AI_AUTHORIZATION_CHANGED: '권한이 변경',
  };
  for (const [code, meaning] of Object.entries(cases)) {
    const text = view.renderAiConnection({ ...ok(), status: 'error', error: { code, message: '안전한 오류 설명' } }).textContent;
    assert.ok(text.includes(code), code); assert.ok(text.includes(meaning), code); assert.ok(text.includes('안전한 오류 설명'));
    assert.ok(!text.includes('modelCount')); assert.ok(!text.includes(time));
  }
});
test('재점검 성공과 계정 초기화는 별도 DOM이며 이전 오류를 남기지 않는다', () => {
  const before = view.renderAiConnection({ status: 'error', error: { code: 'WB_CLCO_AUTH_REQUIRED', message: '과거 실패' } });
  const after = view.renderAiConnection(ok()); const reset = view.renderAiConnection({ status: 'idle' });
  assert.notEqual(before, after); assert.notEqual(after, reset);
  assert.ok(!after.textContent.includes('과거 실패')); assert.ok(!after.textContent.includes('WB_CLCO_AUTH_REQUIRED'));
  assert.ok(!reset.textContent.includes('verified')); assert.equal(requests, 0);
});
test('빈 모델과 잘못된 성공 응답을 연결 성공으로 표시하지 않는다', () => {
  const input = ok(); input.data.modelCount = 0;
  assert.ok(view.renderAiConnection(input).textContent.includes('ON_AI_MODEL_LIST_EMPTY'));
  input.data.modelCount = -1; assert.ok(view.renderAiConnection(input).textContent.includes('AI_REQUEST_UNVERIFIED'));
  input.data.modelCount = 1; input.data.transportChecked = false;
  assert.ok(!view.renderAiConnection(input).textContent.includes('점검(verified)'));
});
test('원문 비밀·미허용 필드는 읽거나 표시하지 않고 HTML은 텍스트로 표시한다', () => {
  const input = ok(); Object.defineProperty(input.data, 'credential', { get() { throw Error('비밀 필드 읽기 금지'); } });
  assert.ok(view.renderAiConnection(input).textContent.includes('verified'));
  const text = view.renderAiConnection({ status: 'error', error: { code: 'Bearer SYNTHETIC_ONLY', message: 'Bearer SYNTHETIC_ONLY' } }).textContent;
  assert.ok(!text.includes('SYNTHETIC_ONLY')); assert.ok(text.includes('AI_REQUEST_UNVERIFIED'));
  const html = view.renderAiConnection({ status: 'error', error: { code: 'CANCELLED', message: '<img src=x onerror=alert(1)>' } });
  assert.ok(html.textContent.includes('<img')); assert.ok(!html.children.some(n => n.tagName === 'img'));
});
test('사건 설명 성공만 사건 ID 속성·요약을 표시하고 실패·취소·대기는 구분한다', () => {
  const event = { id: 'example-event-17' };
  const success = view.renderExplanation({ event, explanation: { status: 'ok', data: { summary: '예제 사건 해석' } }, checkedAt: time });
  assert.equal(success.attributes['data-student-explanation-event'], event.id);
  assert.ok(success.textContent.includes(event.id)); assert.ok(success.textContent.includes('예제 사건 해석'));
  for (const status of ['idle', 'loading', 'error']) {
    const root = view.renderExplanation({ event, explanation: { status, data: { summary: '과거 설명' }, error: { code: 'CANCELLED', message: '취소' } } });
    assert.equal(root.attributes['data-student-explanation-event'], undefined);
    assert.ok(!root.textContent.includes('과거 설명')); assert.ok(root.textContent.includes('기록은 그대로'));
  }
  assert.equal(requests, 0);
});
test('비밀 형태 요약·잘못된 사건 ID를 성공으로 표시하지 않는다', () => {
  for (const input of [
    { event: { id: 'example-event' }, explanation: { status: 'ok', data: { summary: 'Bearer SYNTHETIC_ONLY' } } },
    { event: { id: '<invalid>' }, explanation: { status: 'ok', data: { summary: '안전한 요약' } } },
  ]) {
    const root = view.renderExplanation(input);
    assert.equal(root.attributes['data-student-explanation-event'], undefined);
    assert.ok(root.textContent.includes('ON_AI_INVALID_OUTPUT')); assert.ok(!root.textContent.includes('SYNTHETIC_ONLY'));
  }
});
