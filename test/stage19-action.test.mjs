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
let calls = 0; globalThis.fetch = () => { calls++; throw Error('학생 조치 화면의 집행 금지'); };
const render = createStudentView().renderAction;
const sample = (status = 'prepared', id = 'a') => ({ status,
  event: { id: `event-${id}`, evidence: [{ id: `evidence-${id}`, text: '예제 근거' }], supportedActions: ['revoke'] },
  actionId: 'revoke', target: { id: `device:example-${id}`, generation: 3 },
  receipt: { eventId: `event-${id}`, actionId: 'revoke', requestId: `request-${id}`, receiptId: `receipt-${id}`, version: 2, replayed: false },
  confirmationExpiresAt: '2026-10-23T01:00:00Z', observation: null });
const walk = n => [n, ...n.children.flatMap(walk)];
test('각 상태의 뜻과 원래 코드를 별도 문장으로 표시한다', () => {
  const cases = { idle: '아직 미실행', loading: '준비 또는 결과 조회 중', prepared: '준비됨·미실행', executing: '서버에 전달 중', pending: '서버 접수·처리 중', denied: '거절', failed: '실패', unknown: '결과 불명', expired: '확인 기한 지남', error: '요청이 처리되지 않았습니다' };
  for (const [status, meaning] of Object.entries(cases)) {
    const root = render(sample(status)); assert.ok(root.textContent.includes(status)); assert.ok(root.textContent.includes(meaning));
    assert.ok(!root.textContent.includes('효과 확인(succeeded)'));
  }
});
test('준비 상태에 현재 사건·근거·조치·대상·요청·버전·사람 확인 기한을 표시한다', () => {
  const x = sample(); const original = JSON.stringify(x); const root = render(x);
  for (const text of ['event-a','evidence-a','revoke','device:example-a','generation): 3','request-a','receipt-a','version): 2',x.confirmationExpiresAt,'직접 확인해야']) assert.ok(root.textContent.includes(text), text);
  assert.equal(root.attributes['data-student-action-event'], 'event-a'); assert.equal(root.attributes['data-student-action-request'], 'request-a');
  assert.ok(!walk(root).some(n=>n.tagName==='button')); assert.equal(JSON.stringify(x), original);
});
test('executing/pending에서 접수와 실제 효과를 혼동시키지 않는다', () => {
  for (const status of ['executing', 'pending']) {
    const x = sample(status); x.observation = { effectApplied: true, observedAt: '2026-10-23T00:00:00Z' };
    const text = render(x).textContent;
    assert.ok(text.includes('실행 결과는 아직 확인되지 않았습니다'));
    assert.ok(!text.includes('효과 확인(succeeded)')); assert.ok(!text.includes('effectApplied: true'));
  }
  assert.ok(render(sample('pending')).textContent.includes('ACK'));
});
test('succeeded는 실제 효과 true·시각·현재 receipt가 있을 때만 확인한다', () => {
  const x = sample('succeeded'); x.observation = { effectApplied: true, observedAt: '2026-10-23T00:00:00Z' };
  const text = render(x).textContent; for (const value of ['효과 확인(succeeded)', 'effectApplied: true', x.observation.observedAt, 'receipt-a']) assert.ok(text.includes(value));
  for (const change of [i=>{i.observation=null;},i=>{i.observation.effectApplied=false;},i=>{i.observation.observedAt='invalid';},i=>{i.receipt.receiptId=null;}]) {
    const input = structuredClone(x); change(input); const root=render(input);
    assert.ok(root.textContent.includes('결과 불명(unknown)')); assert.ok(!root.textContent.includes('효과 확인(succeeded)'));
  }
});
test('다른 사건·조치의 receipt는 현재 요청에 붙이지 않는다', () => {
  for (const key of ['eventId', 'actionId']) {
    const x = sample('succeeded'); x.observation={effectApplied:true, observedAt:'2026-10-23T00:00:00Z'};x.receipt[key]='foreign';
    const root=render(x);assert.ok(root.textContent.includes('응답이 맞지 않습니다'));assert.ok(!root.textContent.includes('receipt-a'));
    assert.equal(root.attributes['data-student-action-request'],undefined);assert.ok(!root.textContent.includes('효과 확인(succeeded)'));
  }
});
test('unknown·재사용 응답·취소는 자동 재집행이나 효과 없음으로 판단하지 않는다', () => {
  const x=sample('unknown');x.receipt.replayed=true;const text=render(x).textContent;
  for(const value of ['효과 없음으로 판단하지 마세요','결과만 직접 재조회','replayed','자동 재집행하지 않습니다','효과를 되돌리지 않습니다'])assert.ok(text.includes(value));
  assert.equal(calls,0);
});
test('실패와 거절은 안전한 원인·오류를 보이고 비밀 필드는 접근하지 않는다', () => {
  for(const status of ['denied','failed','error']){
    const x=sample(status);x.message='예제 거절 사유';x.error={code:'ACTION_DENIED',message:'예제 상세 원인'};
    Object.defineProperty(x.receipt,'confirmationId',{get(){throw Error('확인 티켓 읽기 금지');}});
    const text=render(x).textContent;for(const value of ['예제 거절 사유','ACTION_DENIED','예제 상세 원인'])assert.ok(text.includes(value));
  }
  const x=sample('error');x.error={code:'Bearer SYNTHETIC_ONLY',message:'Bearer SYNTHETIC_ONLY'};
  assert.ok(!render(x).textContent.includes('SYNTHETIC_ONLY'));
});
test('새 입력·초기화는 이전 대상·요청·관측과 속성을 제거한다', () => {
  const old=sample('succeeded');old.observation={effectApplied:true,observedAt:'2026-10-23T00:00:00Z'};
  const a=render(old),b=render(sample('prepared','b'));assert.notEqual(a,b);assert.ok(!b.textContent.includes('device:example-a'));assert.ok(!b.textContent.includes('request-a'));
  const idle=render({...old,status:'idle'});assert.equal(idle.attributes['data-student-action-event'],undefined);assert.equal(idle.attributes['data-student-action-request'],undefined);
  assert.ok(!idle.textContent.includes('receipt-a'));assert.ok(!idle.textContent.includes('effectApplied'));
});
