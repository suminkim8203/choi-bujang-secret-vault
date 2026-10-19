import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../on-client/student/extension.mjs';

// DOM 생성 계약의 단위 검사. 실제 브라우저 메뉴·재조회 검증은 별도로 기록한다.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.text = ''; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  set innerHTML(_) { throw Error('HTML 삽입 금지'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
const render = createStudentView().renderIdentity;
const ok = data => ({ status: 'ok', mode: 'demo', data });
const sample = () => ({
  me: ok({ user: { id: 'example-user', label: '예제 직원' }, device: { id: 'example-pc', label: '예제 PC', status: 'compliant' }, session: { id: 'example-session', status: 'active' } }),
  devices: ok([{ id: 'example-pc', label: '예제 PC', status: 'compliant' }]),
  sessions: ok([{ id: 'example-session', status: 'active' }]),
});
test('정상 입력의 사용자·기기·세션과 예제 모드를 표시한다', () => {
  const node = render(sample());
  assert.ok(node instanceof Element);
  for (const expected of ['예제 직원', 'example-user', '예제 PC', 'example-pc', 'example-session', '보안 기준 충족', '활성', '예제 자료']) assert.ok(node.textContent.includes(expected), expected);
});
test('기기와 세션의 모든 비정상 상태를 정확히 구분한다', () => {
  for (const [device, label] of [['noncompliant', '보안 기준 미충족'], ['unknown', '확인 불가']]) {
    for (const [session, meaning] of [['expired', '만료'], ['revoked', '철회됨'], ['unknown', '확인 불가']]) {
      const input = sample(); input.me.data.device.status = device; input.me.data.session.status = session;
      input.devices.data[0].status = device; input.sessions.data[0].status = session;
      const text = render(input).textContent;
      assert.ok(text.includes(`${label} (${device})`)); assert.ok(text.includes(`${meaning} (${session})`));
      assert.ok(!text.includes('보안 기준 충족')); assert.ok(!text.includes('활성'));
    }
  }
});
test('각 자원의 loading/error에서도 모드를 표시하고 오래된 data를 읽지 않는다', () => {
  for (const status of ['loading', 'error']) for (const [mode, label] of [['demo', '예제 자료'], ['disconnected', '연결 없음'], ['unknown', '확인 불가']]) {
    const input = sample();
    for (const key of ['me', 'devices', 'sessions']) Object.assign(input[key], { status, mode, error: { message: '예제 연결 오류' } });
    const text = render(input).textContent;
    assert.equal(text.split(label).length - 1, 3);
    assert.ok(text.includes(status === 'loading' ? '불러오는 중' : '연결 실패: 예제 연결 오류'));
    assert.ok(!text.includes('예제 직원')); assert.ok(!text.includes('example-session'));
  }
});
test('me/devices/sessions가 서로 다른 상태여도 개별 실패를 숨기지 않는다', () => {
  const input = sample(); input.devices = { status: 'error', mode: 'disconnected', error: { message: '기기 조회 실패' } };
  input.sessions = { status: 'loading', mode: 'unknown' };
  const text = render(input).textContent;
  for (const value of ['예제 직원', '연결 실패: 기기 조회 실패', '연결 없음', '불러오는 중', '연결 상태 확인 불가']) assert.ok(text.includes(value));
});
test('새 조회와 오류의 반환 DOM에 이전 사용자 값이 남지 않는다', () => {
  const first = render(sample()); const next = sample();
  next.me.data.user.label = '새 직원'; next.me.data.user.id = 'new-user';
  const second = render(next);
  const failed = render({ me: { status: 'error', mode: 'unknown', error: { message: '연결 끊김' } } });
  assert.notEqual(first, second); assert.notEqual(second, failed);
  assert.ok(!second.textContent.includes('example-user')); assert.ok(!second.textContent.includes('예제 직원'));
  assert.ok(second.textContent.includes('새 직원'));
  assert.ok(!failed.textContent.includes('직원')); assert.ok(!failed.textContent.includes('new-user'));
});
test('빈 목록과 누락되거나 잘못된 자료를 성공 정보로 꾸미지 않는다', () => {
  const input = sample(); input.devices = ok([]); input.sessions = ok([]);
  assert.ok(render(input).textContent.includes('표시할 기기가 없습니다.'));
  assert.ok(render(input).textContent.includes('표시할 세션이 없습니다.'));
  assert.ok(render().textContent.includes('확인 불가'));
  assert.ok(render({ devices: ok({}), sessions: ok({}) }).textContent.includes('목록 확인 불가'));
});
test('사용자·서버 메시지의 HTML 문자열은 텍스트로만 표시한다', () => {
  const input = sample(); const markup = '<img src=x onerror=alert(1)>';
  input.me.data.user.label = markup;
  input.devices = { status: 'error', mode: 'unknown', error: { message: markup } };
  const node = render(input); assert.ok(node.textContent.includes(markup));
  const tags = element => [element.tagName, ...element.children.flatMap(tags)];
  assert.ok(!tags(node).includes('img'));
});
