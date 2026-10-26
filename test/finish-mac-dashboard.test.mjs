import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePcSnapshot, pcObservations, createPcDashboard, createStudentView} from '../on-client/student/extension.mjs';

// 상태 전이·동시 요청·오래된 응답·부분 결측을 검증합니다. 실제 Mac 실측/브라우저 검증은 별도입니다.
class Element {
  constructor(tag) {this.tagName = tag; this.children = []; this.attributes = {}; this.listeners = {}; this.text = ''; this.disabled = false; this.open = false;}
  set textContent(value) {this.text = String(value); this.children = [];}
  get textContent() {return this.text + this.children.map(child => child.textContent).join('\n');}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.text = ''; this.children = [...children];}
  setAttribute(name, value) {this.attributes[name] = String(value);}
  addEventListener(name, fn) {this.listeners[name] = fn;}
  fire(name) {if (!this.disabled) return this.listeners[name]?.({target: this});}
  set innerHTML(_) {throw Error('HTML 해석 금지');}
}
globalThis.document = {createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag)};
globalThis.fetch = () => {throw Error('직접 네트워크 호출 금지');};
Object.defineProperty(globalThis, 'localStorage', {configurable: true, get() {throw Error('브라우저 영구 저장 금지');}});
const walk = node => [node, ...node.children.flatMap(walk)];
const button = (root, text) => walk(root).find(node => node.tagName === 'button' && node.textContent === text);
const card = (root, title) => walk(root).find(node => node.tagName === 'section' && node.children[0]?.tagName === 'h4' && node.children[0]?.textContent === title);
const sample = at => ({
  schema: 'aleph.on.pc-status.v1', source: 'local-pc', measuredAt: new Date(at).toISOString(),
  metrics: {
    cpu: {state: 'ok', usagePercent: 12.5, sampleMs: 200},
    memory: {state: 'ok', usedBytes: 4 * 2 ** 30, totalBytes: 8 * 2 ** 30},
    disk: {state: 'ok', freeBytes: 80 * 2 ** 30, totalBytes: 200 * 2 ** 30},
    network: {state: 'ok', interfaceCount: 2, ipv4Count: 1},
    firewall: {state: 'unavailable', reason: 'unsupported'}, events: {state: 'unavailable', reason: 'unsupported'},
  },
});
function harness() {
  let time = Date.now(), response, calls = [];
  const api = {get: async path => {calls.push(path); return typeof response === 'function' ? response() : response;}};
  const render = createPcDashboard({api, now: () => time});
  const root = render();
  return {root, render, calls, set: value => {response = value;}, next: (edit = () => {}) => {
    time += 1000; const data = sample(time); edit(data); response = {ok: true, data}; return data;
  }, query: () => button(root, 'PC 상태 다시 조회').fire('click')};
}

test('정상 0값과 Mac 미지원 항목을 구분하고 여분 비밀 필드는 읽지 않는다', () => {
  const now = Date.now(), data = sample(now);
  data.metrics.cpu.usagePercent = 0; data.metrics.memory.usedBytes = 0; data.metrics.disk.freeBytes = 0;
  Object.defineProperty(data, 'token', {get() {throw Error('여분 필드 접근 금지');}});
  Object.defineProperty(data.metrics.network, 'addresses', {get() {throw Error('주소 원문 접근 금지');}});
  const out = normalizePcSnapshot(data, now);
  assert.equal(out.values.cpu.ratio, 0); assert.equal(out.values.memory.ratio, 0); assert.equal(out.values.disk.ratio, 0);
  assert.equal(out.values.firewall.reason, 'unsupported'); assert.equal(out.values.events.state, 'unavailable');
  assert.deepEqual(Object.keys(out.values.network).sort(), ['state', 'text', 'note'].sort());
});

test('출처·시각이 잘못됐거나 오래된 응답은 실측으로 받지 않는다', () => {
  const now = Date.now();
  for (const edit of [d => {d.source = 'demo';}, d => {d.schema = 'unknown';}, d => {d.measuredAt = 'bad';},
    d => {d.measuredAt = new Date(now - 60001).toISOString();}, d => {d.measuredAt = new Date(now + 5001).toISOString();}]) {
    const data = sample(now); edit(data); assert.equal(normalizePcSnapshot(data, now), null);
  }
});

test('잘못된 수치와 이유 문자열은 개별 확인 불가이며 다른 실측은 보존한다', () => {
  const now = Date.now(), data = sample(now);
  data.metrics.cpu.usagePercent = NaN; data.metrics.memory.usedBytes = 9 * 2 ** 30;
  data.metrics.firewall.reason = '<script>실행 금지</script>';
  const out = normalizePcSnapshot(data, now);
  assert.equal(out.values.cpu.state, 'unavailable'); assert.equal(out.values.memory.state, 'unavailable');
  assert.equal(out.values.disk.state, 'ok'); assert.equal(out.values.firewall.reason, 'invalid_response');
  assert.ok(!JSON.stringify(out).includes('<script>'));
});

test('수동 조회 전에는 요청이 없고 제공 PC API 하나만 사용한다', async () => {
  const h = harness(); assert.deepEqual(h.calls, []); assert.ok(h.root.textContent.includes('조회 전'));
  h.next(); await h.query();
  assert.deepEqual(h.calls, ['/api/pc/status']); assert.ok(card(h.root, '확인 범위').textContent.includes('4 / 6항목 실측'));
  assert.ok(h.root.textContent.includes('Windows 방화벽 · 확인 불가'));
  assert.ok(h.root.textContent.includes('새로고침하면 지워지며'));
});

test('조회 중 중복 요청을 차단하고 새 화면에 도착한 결과만 그린다', async () => {
  const h = harness(); let resolve;
  const data = h.next(); h.set(() => new Promise(done => {resolve = done;}));
  const pending = h.query();
  assert.equal(button(h.root, 'PC를 읽는 중…').attributes['aria-disabled'], 'true');
  const latest = h.render(); button(latest, 'PC를 읽는 중…').fire('click');
  assert.equal(h.calls.length, 1); resolve({ok: true, data}); await pending;
  assert.ok(card(latest, 'CPU').textContent.includes('12.5%'));
  assert.equal(button(latest, 'PC 상태 다시 조회').attributes['aria-disabled'], 'false');
});

test('실패하면 이전 값을 현재 카드에서 제거하고 과거 기록으로만 남긴다', async () => {
  const h = harness(); h.next(); await h.query();
  h.set({ok: false, error: {code: 'REQUEST_TIMEOUT', message: 'Bearer PRIVATE_EXAMPLE'}}); await h.query();
  assert.ok(card(h.root, 'CPU').textContent.includes('확인 불가'));
  assert.ok(!card(h.root, 'CPU').textContent.includes('12.5%'));
  assert.ok(h.root.textContent.includes('조회 시간을 초과')); assert.ok(!h.root.textContent.includes('PRIVATE_EXAMPLE'));
  const table = walk(h.root).find(node => node.tagName === 'tbody');
  assert.equal(table.children.length, 2); assert.ok(table.children[0].textContent.includes('실패')); assert.ok(table.children[1].textContent.includes('12.5'));
});

test('지원 없음과 오래되거나 역순인 성공 응답은 별도 실패로 남긴다', async () => {
  const h = harness(); const data = h.next(); await h.query();
  h.set({ok: true, data}); await h.query(); assert.ok(h.root.textContent.includes('측정 시각·순서'));
  assert.ok(card(h.root, 'CPU').textContent.includes('확인 불가'));
  h.set({ok: false, error: {code: 'NOT_ALLOWED'}}); await h.query(); assert.ok(h.root.textContent.includes('제공본 업데이트'));
  h.next(); await h.query(); assert.ok(card(h.root, 'CPU').textContent.includes('12.5%'));
});

test('그래프는 4회부터 만들고 실패 구간을 가로질러 연결하지 않는다', async () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {h.next(); await h.query();}
  assert.equal(walk(h.root).filter(node => node.tagName === 'svg').length, 0);
  h.next(); await h.query(); assert.equal(walk(h.root).filter(node => node.tagName === 'svg').length, 1);
  h.set({ok: false}); await h.query();
  for (let i = 0; i < 2; i++) {h.next(); await h.query();}
  const paths = walk(h.root).filter(node => node.tagName === 'polyline');
  assert.deepEqual(paths.map(node => node.attributes.points.split(' ').length), [4, 2, 4, 2]);
  assert.ok(paths.some(node => node.attributes['stroke-dasharray'] === '7 5'));
  assert.ok(walk(h.root).some(node => node.tagName === 'caption'));
});

test('기록은 20회 상한을 지키고 지우기·새로 만들기는 실제로 초기화한다', async () => {
  const h = harness();
  for (let i = 0; i < 25; i++) {h.next(); await h.query();}
  assert.ok(h.root.textContent.includes('20 / 20회'));
  assert.equal(walk(h.root).find(node => node.tagName === 'tbody').children.length, 20);
  button(h.root, '이 탭의 조회 기록 지우기').fire('click');
  assert.ok(h.root.textContent.includes('0 / 20회')); assert.ok(card(h.root, 'CPU').textContent.includes('조회 전'));
  const fresh = createPcDashboard({api: {get() {throw Error('자동 조회 금지');}}})();
  assert.ok(fresh.textContent.includes('0 / 20회'));
});

test('참고 기준 경계와 전부 결측을 안전·공격 판정으로 바꾸지 않는다', () => {
  const now = Date.now(), data = sample(now);
  data.metrics.cpu.usagePercent = 85; data.metrics.memory.totalBytes = 10 * 2 ** 30; data.metrics.memory.usedBytes = 9 * 2 ** 30;
  data.metrics.disk.freeBytes = data.metrics.disk.totalBytes * 0.1;
  let out = pcObservations(normalizePcSnapshot(data, now));
  assert.ok(out.some(text => text.includes('85%'))); assert.ok(out.some(text => text.includes('90%')));
  assert.ok(!out.some(text => text.includes('10% 미만')));
  for (const key of ['cpu', 'memory', 'disk']) data.metrics[key] = {state: 'unavailable', reason: 'query_failed'};
  out = pcObservations(normalizePcSnapshot(data, now)); assert.ok(out[0].includes('적용하지'));
});

test('기존 학생 상태 함수에서 PC 대시보드를 함께 표시해도 자동 요청은 없다', () => {
  let calls = 0;
  const view = createStudentView({api: {get() {calls++;}}});
  const root = view.renderStatus({mode: 'disconnected', notifications: []});
  assert.ok(root.textContent.includes('PC 상태 대시보드')); assert.ok(root.textContent.includes('연결 없음(disconnected)'));
  assert.equal(calls, 0);
});
