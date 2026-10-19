import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentView } from '../on-client/student/extension.mjs';

// 실제 브라우저와 별개로 필터·상세의 이벤트 처리와 데이터 보존 계약을 검사한다.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.text = ''; this.value = ''; this.hidden = false; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join('\n'); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = [...children]; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  fire(name) { this.listeners[name]?.({ target: this }); }
  set innerHTML(_) { throw Error('HTML 삽입 금지'); }
}
globalThis.document = { createElement: tag => new Element(tag) };
const render = createStudentView().renderEvents;
const walk = node => [node, ...node.children.flatMap(walk)];
const rows = root => walk(root).filter(node => Object.hasOwn(node.attributes, 'data-student-event-id'));
const rowIds = root => rows(root).map(node => node.attributes['data-student-event-id']);
const filter = (root, label) => walk(root).find(node => node.tagName === 'select' && node.attributes['aria-label'] === label);
const change = (root, label, value) => { const select = filter(root, label); select.value = value; select.fire('change'); };
const clickDetail = (root, id) => walk(root).find(node => node.tagName === 'button' && node.textContent === `${id} 상세`).fire('click');
const details = root => walk(root).filter(node => Object.hasOwn(node.attributes, 'data-student-event-detail'));
const event = (id, at, kind, appId, access = 'denied') => ({ id, at, kind, appId, summary: `${id} 예제 요약`, evidence: [{ id: `e-${id}`, text: '예제 근거' }], rules: [{ id: `r-${id}`, text: '예제 규칙' }], state: { access, session: 'revoked', device: 'noncompliant' }, supportedActions: [] });
const sample = () => [event('older', '2026-10-19T00:00:00Z', 'access', 'library', 'allowed'), event('newest', '2026-10-20T02:00:00Z', 'xdr', 'repository'), event('middle', '2026-10-20T01:00:00Z', 'access', null, 'unknown')];
const ok = data => ({ status: 'ok', mode: 'demo', data });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('받은 기록만 최신순으로 표시하고 동결한 원본을 바꾸지 않는다', () => {
  const data = freeze(sample()); const before = JSON.stringify(data); const root = render(ok(data));
  assert.deepEqual(rowIds(root), ['newest', 'middle', 'older']); assert.equal(JSON.stringify(data), before);
  for (const text of ['최대 40건', 'XDR 경보(xdr)', '접속 기록(access)', '2026-10-20T02:00:00Z', 'repository', 'newest 예제 요약', '앱 확인 불가']) assert.ok(root.textContent.includes(text), text);
});
test('세 필터의 이름과 all/원래 값 계약을 지킨다', () => {
  const root = render(ok(sample()));
  for (const [label, values] of [['기록 종류', ['all', 'xdr', 'access']], ['업무 앱', ['all', 'repository', 'library']], ['접속 상태', ['all', 'denied', 'unknown', 'allowed']]]) {
    const select = filter(root, label); assert.ok(select);
    assert.deepEqual(select.children.map(node => node.value), values);
  }
});
test('필터는 AND로 받은 배열 안에서만 적용되고 해제하면 원래 목록으로 돌아온다', () => {
  const root = render(ok(sample())); change(root, '기록 종류', 'access');
  assert.deepEqual(rowIds(root), ['middle', 'older']); assert.ok(root.textContent.includes('표시 기록 2건'));
  change(root, '접속 상태', 'allowed'); assert.deepEqual(rowIds(root), ['older']);
  change(root, '업무 앱', 'repository'); assert.deepEqual(rowIds(root), []);
  assert.ok(root.textContent.includes('선택한 조건에 맞는 기록이 없습니다.'));
  for (const label of ['기록 종류', '업무 앱', '접속 상태']) change(root, label, 'all');
  assert.deepEqual(rowIds(root), ['newest', 'middle', 'older']);
});
test('기록별 상세에 ID·앱·근거·규칙과 독립된 세 상태를 표시한다', () => {
  const root = render(ok(sample())); assert.deepEqual(details(root), []);
  clickDetail(root, 'newest'); const detail = details(root)[0];
  assert.equal(detail.attributes['data-student-event-detail'], 'newest'); assert.equal(detail.hidden, false);
  for (const value of ['newest', 'repository', 'e-newest', '예제 근거', 'r-newest', '예제 규칙', '거부됨(denied)', '철회됨(revoked)', '보안 기준 미충족(noncompliant)']) assert.ok(detail.textContent.includes(value), value);
  clickDetail(root, 'newest'); assert.deepEqual(details(root), []);
});
test('unknown 상태와 앱 누락을 정상으로 꾸미지 않고 조치 버튼을 만들지 않는다', () => {
  const data = sample(); data[1].state = { access: 'unknown', session: 'unknown', device: 'unknown' };
  const root = render(ok(data)); clickDetail(root, 'newest');
  assert.equal(details(root)[0].textContent.split('확인 불가(unknown)').length - 1, 3);
  clickDetail(root, 'middle'); assert.ok(details(root).find(node => node.attributes['data-student-event-detail'] === 'middle').textContent.includes('앱 확인 불가'));
  assert.ok(walk(root).filter(node => node.tagName === 'button').every(node => node.textContent.endsWith(' 상세')));
});
test('필터 변경과 새 조회·빈 배열·실패는 이전 목록과 상세를 남기지 않는다', () => {
  const first = render(ok(sample())); clickDetail(first, 'newest'); change(first, '기록 종류', 'access'); assert.deepEqual(details(first), []);
  const next = render(ok([event('fresh', '2026-10-20T03:00:00Z', 'xdr', 'library')]));
  assert.notEqual(first, next); assert.deepEqual(rowIds(next), ['fresh']); assert.deepEqual(details(next), []);
  for (const input of [{ status: 'loading', mode: 'demo', data: sample() }, { status: 'error', mode: 'disconnected', data: sample(), error: { message: '예제 장애' } }, ok([])]) {
    const root = render(input); assert.deepEqual(rowIds(root), []); assert.deepEqual(details(root), []); assert.ok(!root.textContent.includes('newest'));
  }
});
test('빈 배열·통신 실패·형식 오류·loading은 서로 구분한다', () => {
  assert.ok(render(ok([])).textContent.includes('표시할 기록이 없습니다.'));
  for (const code of ['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED']) {
    const root = render({ status: 'error', mode: 'unknown', error: { code, message: '예제 응답 오류' } });
    assert.ok(root.textContent.includes('기록을 불러오지 못했습니다: 예제 응답 오류')); assert.ok(root.textContent.includes('기록 응답 형식 확인 불가'));
    assert.ok(!root.textContent.includes('표시할 기록이 없습니다.'));
  }
  assert.ok(render({ status: 'loading', mode: 'demo' }).textContent.includes('불러오는 중(loading)'));
  assert.ok(render(ok({})).textContent.includes('기록 확인 불가'));
});
test('서버 문자열의 HTML은 요약·근거·규칙·오류에서 글자로만 표시한다', () => {
  const text = '<b onclick=alert(1)>예제 문자열</b>'; const data = sample();
  data[1].summary = data[1].evidence[0].text = data[1].rules[0].text = text;
  const root = render(ok(data)); clickDetail(root, 'newest');
  assert.ok(root.textContent.includes(text)); assert.ok(!walk(root).some(node => node.tagName === 'b'));
  assert.ok(render({ status: 'error', mode: 'unknown', error: { message: text } }).textContent.includes(text));
});
