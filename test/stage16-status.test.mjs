import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../on-client/student/extension.mjs';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.text = ''; this.value = ''; this.hidden = false; this.disabled = false; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = [...children]; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  fire(name) { if (!this.disabled) return this.listeners[name]?.({ target: this }); }
  set innerHTML(_) { throw Error('HTML 삽입 금지'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
const copies = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => copies.push(text) } } });
let requests = 0;
globalThis.fetch = () => { requests++; throw Error('학생 표시에서 네트워크 요청 금지'); };
const view = createStudentView(); const render = view.renderStatus;
const walk = root => [root, ...root.children.flatMap(walk)];
const button = (root, name) => walk(root).find(node => node.tagName === 'button' && node.textContent === name);
const ok = data => ({ status: 'ok', mode: 'demo', data });
const sample = () => ({
  mode: 'demo', devices: ok([{ id: 'example-pc', label: '예제 PC', status: 'noncompliant' }]), sessions: ok([{ id: 'example-session', status: 'revoked' }]),
  notifications: [{ resource: 'devices', code: 'noncompliant', message: '예제 점검 필요' }],
  diagnostics: { status: 'idle', mode: 'unknown' },
});
const diagnostics = () => ({ requestId: 'example-request', component: 'on-client', version: '0.2.13', checkedAt: '2026-10-20T00:00:00.000Z', engine: { mode: 'demo', code: 'DEMO_ONLY' } });

test('기기·현재 연결과 알림의 의미·원래 코드·자료 구분을 표시한다', () => {
  const root = render(sample());
  for (const text of ['예제 PC', 'example-pc', '보안 기준 미충족(noncompliant)', 'example-session', '철회됨(revoked)', 'devices', '예제 점검 필요', '현재 검증된 연결 한 개', '과거 세션 전체 목록이 아닙니다']) assert.ok(root.textContent.includes(text), text);
});
test('불러오는 중·빈 목록·오류·확인 불가를 독립적으로 구분한다', () => {
  const input = sample(); input.devices = ok([]); input.sessions = ok([]); input.notifications = [];
  const empty = render(input); assert.ok(empty.textContent.includes('등록된 기기가 없습니다.')); assert.ok(empty.textContent.includes('현재 연결이 없습니다.')); assert.ok(empty.textContent.includes('주의할 알림이 없습니다.'));
  input.devices = { status: 'loading', mode: 'demo' }; input.sessions = { status: 'error', mode: 'disconnected', data: [{ id: 'STALE', status: 'active' }], error: { message: '예제 장애' } };
  const failed = render(input); assert.ok(failed.textContent.includes('불러오는 중(loading)')); assert.ok(failed.textContent.includes('세션 정보를 불러오지 못했습니다: 예제 장애')); assert.ok(!failed.textContent.includes('STALE')); assert.ok(!failed.textContent.includes('현재 연결이 없습니다.'));
  assert.ok(render().textContent.includes('정보 확인 불가'));
});
test('시간 초과와 수동 재시도를 안내하며 성공하면 이전 오류를 제거한다', () => {
  const input = sample(); input.devices = { status: 'error', mode: 'unknown', error: { code: 'REQUEST_TIMEOUT', message: '예제 응답 기한' } };
  const failed = render(input); assert.ok(failed.textContent.includes('시간 초과')); assert.ok(failed.textContent.includes('위쪽 다시 불러오기 버튼을 직접 누르세요'));
  const recovered = render(sample()); assert.notEqual(recovered, failed); assert.ok(!recovered.textContent.includes('예제 응답 기한')); assert.ok(!recovered.textContent.includes('시간 초과')); assert.equal(requests, 0);
});
test('진단은 여분 필드를 읽지 않고 6개 허용 필드만 표시·수동 복사한다', async () => {
  copies.length = 0; const data = diagnostics();
  Object.defineProperty(data, 'token', { enumerable: true, get() { throw Error('여분 인증 필드 접근 금지'); } });
  Object.defineProperty(data.engine, 'privateKey', { enumerable: true, get() { throw Error('여분 인증 필드 접근 금지'); } });
  const root = render({ ...sample(), diagnostics: ok(data) }); assert.equal(copies.length, 0);
  for (const field of ['requestId', 'component', 'version', 'checkedAt', 'engine.mode', 'engine.code']) assert.ok(root.textContent.includes(field));
  const copy = button(root, '도움정보 복사'); assert.ok(copy); assert.equal(copy.disabled, false); await copy.fire('click');
  assert.equal(copies.length, 1); assert.deepEqual(JSON.parse(copies[0]), diagnostics()); assert.ok(root.textContent.includes('복사했습니다')); assert.equal(requests, 0);
});
test('진단 전·불러오는 중·실패에서 복사는 비활성이고 비밀 형태는 표시·복사하지 않는다', async () => {
  for (const status of ['idle', 'loading', 'error']) {
    const root = render({ ...sample(), diagnostics: { status, mode: 'unknown', data: diagnostics(), error: { code: 'REQUEST_TIMEOUT', message: '예제 진단 실패' } } });
    assert.equal(button(root, '도움정보 복사').disabled, true); assert.ok(!root.textContent.includes('example-request'));
  }
  copies.length = 0; const data = diagnostics(); data.requestId = 'Bearer EXAMPLE_ONLY';
  const root = render({ ...sample(), diagnostics: ok(data) }); assert.ok(!root.textContent.includes('EXAMPLE_ONLY')); await button(root, '도움정보 복사').fire('click'); assert.ok(!copies[0].includes('EXAMPLE_ONLY'));
});
test('HTML 문장·미확인 상태를 정상이나 실행 코드로 바꾸지 않는다', () => {
  const input = sample(); input.devices.data[0].status = 'unknown'; input.sessions.data[0].status = 'unknown'; input.notifications[0].message = '<b>예제</b>';
  const root = render(input); assert.ok(root.textContent.includes('확인 불가(unknown)')); assert.ok(root.textContent.includes('<b>예제</b>')); assert.ok(!walk(root).some(node => node.tagName === 'b'));
});
test('미지원 조치는 해당 기록 상세 안의 비활성 버튼이며 어떠한 요청도 보내지 않는다', () => {
  const event = { id: 'example-event', kind: 'xdr', at: '2026-10-20T00:00:00Z', appId: 'library', summary: '예제', evidence: [], rules: [], state: { access: 'unknown', session: 'unknown', device: 'unknown' }, supportedActions: ['revoke', 'isolate'] };
  const root = view.renderEvents(ok([event])); button(root, 'example-event 상세').fire('click');
  const detail = walk(root).find(node => node.attributes['data-student-event-detail'] === 'example-event'); assert.ok(detail);
  assert.ok(detail.textContent.includes('조치 실행 연결은 준비 중'));
  for (const action of event.supportedActions) { const unsupported = button(detail, `${action} 미지원`); assert.ok(unsupported); assert.equal(unsupported.disabled, true); unsupported.fire('click'); }
  assert.equal(requests, 0);
  event.supportedActions = []; const empty = view.renderEvents(ok([event])); button(empty, 'example-event 상세').fire('click'); assert.ok(!walk(empty).some(node => node.tagName === 'button' && node.textContent.endsWith(' 미지원')));
});
