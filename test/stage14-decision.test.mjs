import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../on-client/student/extension.mjs';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.text = ''; this.attributes = {}; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  set innerHTML(_) { throw Error('HTML 삽입 금지'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
const render = createStudentView().renderDecision;
const input = decision => ({ status: 'ok', mode: 'demo', appId: 'example-app', data: {
  appId: 'example-app', decision, reason: '예제 판정 근거', checkedAt: '2026-10-20T00:00:00.000Z',
} });
test('네 판정을 뜻과 원래 코드·앱·이유·시각으로 구분한다', () => {
  const expected = { allow: '접근 허용 (allow)', deny: '접근 거부 (deny)', challenge: '추가 인증 또는 확인 필요 (challenge)', unknown: '판정 확인 불가 (unknown)' };
  for (const [code, label] of Object.entries(expected)) {
    const node = render(input(code)); assert.ok(node instanceof Element);
    for (const value of [label, 'example-app', '예제 판정 근거', '2026-10-20T00:00:00.000Z']) assert.ok(node.textContent.includes(value), value);
  }
  assert.ok(render(input('allow')).textContent.includes('접속 성공을 보장하지 않습니다'));
  assert.ok(render(input('challenge')).textContent.includes('절차를 대신 수행하지 않습니다'));
});
test('unknown과 알 수 없는 값은 허용으로 바꾸지 않는다', () => {
  for (const code of ['unknown', 'unsupported', 'constructor', undefined]) {
    const text = render(input(code)).textContent;
    assert.ok(text.includes('판정 확인 불가 (unknown)'));
    assert.ok(text.includes('접근 허용으로 간주하지 마세요'));
    assert.ok(!text.includes('접근 허용 (allow)'));
  }
});
test('요청 전·요청 중에는 이전 결과와 이유·시각을 표시하지 않는다', () => {
  for (const [status, label] of [['idle', '앱을 골라 접속을 요청하세요'], ['loading', '판정 확인 중']]) {
    const node = render({ ...input('allow'), status });
    assert.ok(node.textContent.includes(label));
    for (const stale of ['접근 허용 (allow)', '예제 판정 근거', '2026-10-20T00:00:00.000Z']) assert.ok(!node.textContent.includes(stale));
  }
});
test('요청 실패는 거부 판정과 구분하고 오래된 성공 자료를 표시하지 않는다', () => {
  const failed = render({ ...input('allow'), status: 'error', mode: 'disconnected', error: { message: '예제 네트워크 연결 실패' } }).textContent;
  assert.ok(failed.includes('요청 실패 (error): 예제 네트워크 연결 실패'));
  assert.ok(failed.includes('거부 (deny) 판정과 다르며'));
  for (const stale of ['접근 허용 (allow)', '예제 판정 근거', '2026-10-20T00:00:00.000Z']) assert.ok(!failed.includes(stale));
  assert.notEqual(failed, render(input('deny')).textContent);
});
test('새 앱·재조회·실패는 각각 새로운 DOM을 반환한다', () => {
  const first = render(input('allow'));
  const nextInput = input('deny'); nextInput.appId = nextInput.data.appId = 'another-app';
  const next = render(nextInput); assert.notEqual(first, next);
  assert.ok(next.textContent.includes('another-app')); assert.ok(!next.textContent.includes('example-app'));
  const reset = render({ status: 'idle', mode: 'unknown' });
  assert.ok(!reset.textContent.includes('another-app')); assert.ok(!reset.textContent.includes('접근 거부 (deny)'));
  assert.ok(render().textContent.includes('판정 확인 불가 (unknown)'));
});
test('모드 안내를 요청 상태와 무관하게 표시한다', () => {
  for (const status of ['idle', 'loading', 'ok', 'error']) for (const [mode, expected] of [['demo', '예제 자료 (demo)'], ['disconnected', '연결 없음 (disconnected)'], ['unknown', '연결 상태 확인 불가 (unknown)']]) {
    assert.ok(render({ ...input('unknown'), status, mode, error: { message: '예제 오류' } }).textContent.includes(expected));
  }
});
test('서버 이유와 오류의 HTML은 실행하지 않고 글자로만 표시한다', () => {
  const markup = '<img src=x onerror=alert(1)>';
  const ok = input('deny'); ok.data.reason = markup;
  for (const node of [render(ok), render({ status: 'error', error: { message: markup } })]) {
    assert.ok(node.textContent.includes(markup));
    const tags = el => [el.tagName, ...el.children.flatMap(tags)];
    assert.ok(!tags(node).includes('img'));
  }
});
