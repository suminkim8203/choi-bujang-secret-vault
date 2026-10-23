import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../on-client/student/extension.mjs';
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.text = ''; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  append(...children) { this.children.push(...children); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  set innerHTML(_) { throw Error('HTML 삽입 금지'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
let requests = 0; globalThis.fetch = () => { requests++; throw Error('요청 금지'); };
const render = createStudentView().renderExplanation;
const sample = (suffix = 'a') => ({
  event: { id: `event-${suffix}`, evidence: [{ id: `evidence-${suffix}`, text: `근거 문장 ${suffix}` }],
    rules: [{ id: `rule-${suffix}`, text: `규칙 문장 ${suffix}` }],
    state: { access: 'unknown', session: 'unknown', device: 'unknown' }, supportedActions: [] },
  explanation: { status: 'ok', mode: 'demo', data: { summary: `AI 요약 ${suffix}`, evidenceIds: [`evidence-${suffix}`],
    proposals: [], requiresHumanConfirmation: true, executed: false } }, checkedAt: '2026-10-23T00:00:00Z',
});
const walk = n => [n, ...n.children.flatMap(walk)];
test('동적으로 다른 사건의 ID·근거·규칙·시각과 AI 해석 경계를 표시한다', () => {
  for (const suffix of ['a', 'b']) {
    const input = sample(suffix); const original = JSON.stringify(input); const root = render(input);
    assert.equal(root.attributes['data-student-explanation-event'], input.event.id);
    for (const text of [input.event.id, `AI 요약 ${suffix}`, `evidence-${suffix} — 근거 문장 ${suffix}`, `rule-${suffix} — 규칙 문장 ${suffix}`, input.checkedAt, '참고용 해석']) assert.ok(root.textContent.includes(text), text);
    assert.equal(JSON.stringify(input), original); assert.ok(!walk(root).some(n => n.tagName === 'button'));
  }
});
test('접속·세션·기기 unknown을 각각 나열하고 확인 불가가 없으면 없음으로 표시한다', () => {
  const input = sample(); const text = render(input).textContent;
  for (const name of ['접속', '세션', '기기']) assert.ok(text.includes(`${name}: 확인 불가(unknown)`));
  input.event.state = { access: 'allowed', session: 'active', device: 'compliant' };
  const known = render(input).textContent; assert.ok(known.includes('없음')); assert.ok(!known.includes('확인 불가(unknown)'));
});
test('근거 누락·중복·다른 사건의 참조와 중복 원천 ID는 성공 표시와 요약을 남기지 않는다', () => {
  const variants = [];
  let x = sample(); x.explanation.data.evidenceIds = ['foreign-id']; variants.push(x);
  x = sample(); x.explanation.data.evidenceIds = []; variants.push(x);
  x = sample(); x.explanation.data.evidenceIds.push('evidence-a'); variants.push(x);
  x = sample(); x.event.evidence = []; variants.push(x);
  x = sample(); x.event.evidence.push({ ...x.event.evidence[0] }); variants.push(x);
  x = sample(); x.event = sample('b').event; variants.push(x);
  for (const input of variants) {
    const root = render(input); assert.equal(root.attributes['data-student-explanation-event'], undefined);
    assert.ok(root.textContent.includes('근거 부족')); assert.ok(!root.textContent.includes('AI 요약'));
  }
});
test('실행 주장·미승인 조치·다른 근거의 제안을 거부하고 지원 제안은 미실행으로 표시한다', () => {
  const input = sample(); input.event.supportedActions = ['revoke'];
  input.explanation.data.proposals = [{ action: 'revoke', evidenceIds: ['evidence-a'], reason: '예제 조치 이유' }];
  const valid = render(input); assert.ok(valid.textContent.includes('revoke — 예제 조치 이유'));
  assert.ok(valid.textContent.includes('사람 확인이 필요하며 실행되지 않았습니다')); assert.ok(!walk(valid).some(n => n.tagName === 'button'));
  for (const change of [x => { x.explanation.data.executed = true; }, x => { x.explanation.data.requiresHumanConfirmation = false; }, x => { x.explanation.data.proposals[0].action = 'unsupported'; }, x => { x.explanation.data.proposals[0].evidenceIds = ['foreign']; }]) {
    const x = structuredClone(input); change(x); assert.equal(render(x).attributes['data-student-explanation-event'], undefined);
  }
});
test('지원 조치 없음과 AI 제안 없음의 이유를 구분한다', () => {
  const input = sample(); assert.ok(render(input).textContent.includes('지원하는 조치가 없어 제안이 없습니다(정상)'));
  input.event.supportedActions = ['revoke']; assert.ok(render(input).textContent.includes('AI가 이 기록에 제안한 조치가 없습니다'));
});
test('event=null이어도 오류·근거 부족을 먼저 표시하고 단순 미선택과 구분한다', () => {
  const failed = render({ event: null, explanation: { status: 'error', error: { code: 'ON_AI_INVALID_INPUT', message: '예제 근거 부족' } } });
  for (const text of ['AI 설명 실패', 'ON_AI_INVALID_INPUT', '예제 근거 부족', '기록은 그대로', '과제 실패를 뜻하지 않습니다']) assert.ok(failed.textContent.includes(text));
  assert.ok(!failed.textContent.includes('기록을 먼저 고르세요'));
  const empty = render({ event: null }); assert.ok(empty.textContent.includes('기록을 먼저 고르세요'));
  assert.equal(failed.attributes['data-student-explanation-event'], undefined);
});
test('새 사건·대기·실패·재조회는 이전 성공 요약과 속성을 제거하며 요청하지 않는다', () => {
  const a = render(sample()); const b = render(sample('b')); assert.notEqual(a, b); assert.ok(!b.textContent.includes('요약 a'));
  for (const status of ['idle', 'loading', 'error']) {
    const x = sample(); x.explanation.status = status; x.explanation.error = { code: 'CANCELLED', message: '취소됨' };
    const root = render(x); assert.equal(root.attributes['data-student-explanation-event'], undefined); assert.ok(!root.textContent.includes('AI 요약'));
  }
  assert.equal(requests, 0);
});
test('HTML은 글자로 표시하고 합성 비밀 형태는 요약에 공개하지 않는다', () => {
  const x = sample(); x.explanation.data.summary = '<img onerror=alert(1)>';
  const root = render(x); assert.ok(root.textContent.includes('<img')); assert.ok(!walk(root).some(n => n.tagName === 'img'));
  x.explanation.data.summary = 'Bearer SYNTHETIC_ONLY'; const failed = render(x);
  assert.equal(failed.attributes['data-student-explanation-event'], undefined); assert.ok(!failed.textContent.includes('SYNTHETIC_ONLY'));
});
