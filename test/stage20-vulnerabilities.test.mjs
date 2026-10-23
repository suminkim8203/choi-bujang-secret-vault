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
let requests = 0; globalThis.fetch = () => { requests++; throw Error('학생 표시에서 외부 조회 금지'); };
const render = createStudentView().renderVulnerabilities;
const time = '2026-10-23T00:00:00Z';
const row = (name = 'example-public', version = '1.2.3') => ({ name, version, status: 'known_vulnerabilities',
  vulnerabilities: [{ id: 'OSV-EXAMPLE-20', modified: '2026-10-22T00:00:00Z' }], source: 'https://api.osv.dev/v1/querybatch', checkedAt: time });
const sample = () => ({ status: 'ok', mode: 'demo', data: { status: 'complete', lockfileVersion: 3, lockfileHash: 'a'.repeat(64), checkedAt: time, packages: [row()] } });
const walk = root => [root, ...root.children.flatMap(walk)];
const packageRows = root => walk(root).filter(n => n.attributes['data-student-package-name']);
test('정확한 좌표·버전·OSV 출처·시각·취약점 ID와 modified를 각 행에 표시한다', () => {
  const x = sample(); x.data.packages.push(row('@example/public', '2.0.1-beta.2+build.1'));
  const original = JSON.stringify(x), root = render(x); assert.equal(packageRows(root).length, 2);
  for (const pkg of x.data.packages) {
    const el = packageRows(root).find(n => n.attributes['data-student-package-name'] === pkg.name);
    assert.equal(el.attributes['data-student-package-version'], pkg.version);
    for (const value of [pkg.name, pkg.version, pkg.source, pkg.checkedAt, pkg.vulnerabilities[0].id, pkg.vulnerabilities[0].modified, 'known_vulnerabilities']) assert.ok(el.textContent.includes(value));
  }
  for(const value of ['lockfileVersion: 3', x.data.lockfileHash, '예제(demo)']) assert.ok(root.textContent.includes(value));
  assert.equal(JSON.stringify(x),original);
});
test('전체 조회의 다섯 상태와 운영자 설정·미조회·lock 확인 불가를 구분한다', () => {
  const cases={complete:'모두 조회',partial:'일부 조회 실패',not_checked:'아직 조회 안 함',not_configured:'조회 대상 프로젝트 설정 필요',unverifiable:'lock 파일 확인 불가'};
  for(const [status,label] of Object.entries(cases)){
    const x=sample();x.data.status=status;x.data.packages=[];const text=render(x).textContent;
    assert.ok(text.includes(label));assert.ok(text.includes(`(${status})`));
  }
  assert.ok(render({status:'ok',data:{status:'not_configured',packages:[],checkedAt:time}}).textContent.includes('경로나 공개 조회 허용 목록을 임의로 변경하지 않습니다'));
});
test('알려진 항목 없음·조회 실패·미조회는 안전 보장으로 바꾸지 않는다', () => {
  const x=sample();x.data.packages[0].status='none_found';x.data.packages[0].vulnerabilities=[];
  const text=render(x).textContent;assert.ok(text.includes('조회 범위에서 알려진 항목 없음(none_found)'));assert.ok(text.includes('안전 보장이 아닙니다'));
  const failed=render({status:'error',error:{code:'SERVICE_UNAVAILABLE',message:'예제 통신 장애'}}).textContent;
  assert.ok(failed.includes('조회 실패(error)'));assert.ok(failed.includes('예제 통신 장애'));assert.ok(!failed.includes('(none_found)'));
  const unchecked=render({status:'ok',data:{status:'not_checked',packages:[]}}).textContent;assert.ok(unchecked.includes('아직 조회하지 않았습니다'));assert.ok(!unchecked.includes('(none_found)'));
});
test('부분 실패는 먼저 받은 ID·modified·완료된 다른 패키지를 보존한다', () => {
  const x=sample();x.data.status='partial';x.data.packages[0].status='unverifiable';x.data.packages.push({...row('other-public','4.5.6'),status:'none_found',vulnerabilities:[]});
  const root=render(x),rows=packageRows(root);assert.equal(rows.length,2);
  assert.ok(rows[0].textContent.includes('일부 확인·전체 조회 확인 불가'));assert.ok(rows[0].textContent.includes('OSV-EXAMPLE-20'));assert.ok(rows[0].textContent.includes('2026-10-22T00:00:00Z'));
  assert.ok(rows[1].textContent.includes('(none_found)'));assert.ok(root.textContent.includes('(partial)'));
});
test('새 hash·버전·시각으로 갱신하고 과거 표나 발견 ID를 남기지 않는다', () => {
  const a=sample(),first=render(a),b=sample();b.data.lockfileHash='b'.repeat(64);b.data.packages=[{...row('new-public','9.8.7'),status:'none_found',vulnerabilities:[]}];b.data.checkedAt='2026-10-23T01:00:00Z';
  const next=render(b);assert.notEqual(first,next);assert.ok(next.textContent.includes(b.data.lockfileHash));assert.ok(!next.textContent.includes(a.data.lockfileHash));assert.ok(!next.textContent.includes('OSV-EXAMPLE-20'));assert.ok(!next.textContent.includes('1.2.3'));
});
test('idle/loading/error는 전달된 과거 data를 현재 표로 표시하지 않는다', () => {
  for(const status of ['idle','loading','error']){
    const x=sample();x.status=status;x.error={code:'TIMEOUT',message:'예제 조회 기한'};const root=render(x);
    assert.equal(packageRows(root).length,0);assert.ok(!root.textContent.includes('OSV-EXAMPLE-20'));assert.ok(!root.textContent.includes(x.data.lockfileHash));
  }
});
test('시간 초과·취소 뒤 수동 재조회만 안내하고 요청·재시도는 수행하지 않는다', () => {
  for(const code of ['TIMEOUT','CANCELLED']){
    const text=render({status:'error',error:{code,message:'예제 오류'}}).textContent;
    assert.ok(text.includes(code));assert.ok(text.includes('직접 누르세요'));
    assert.ok(text.includes(code==='TIMEOUT'?'시간이 초과':'조회를 취소'));
  }
  assert.equal(requests,0);
});
test('버전 범위를 실제 설치 버전으로 표시하지 않고 모순된 빈 결과도 확인 불가로 표시한다', () => {
  const x=sample();x.data.packages[0].version='^1.2.0';let root=render(x);assert.equal(packageRows(root).length,0);assert.ok(root.textContent.includes('버전 범위나 태그'));
  x.data.packages[0]=row();x.data.packages[0].status='none_found';root=render(x);assert.ok(root.textContent.includes('조회 확인 불가(unverifiable)'));assert.ok(root.textContent.includes('OSV-EXAMPLE-20'));assert.ok(!root.textContent.includes('(none_found)'));
});
test('없는 메타데이터를 만들지 않고 여분 비밀 필드를 읽지 않으며 HTML은 글자로 표시한다', () => {
  const sparse=render({status:'ok',data:{status:'not_configured',packages:[]}}).textContent;
  assert.ok(!sparse.includes('lockfileVersion:'));assert.ok(!sparse.includes('lockfileHash:'));assert.ok(!sparse.includes('checkedAt):'));
  const x=sample();Object.defineProperty(x.data.packages[0],'token',{get(){throw Error('비밀 읽기 금지');}});x.data.packages[0].vulnerabilities[0].id='<b>예제ID</b>';
  const root=render(x);assert.ok(root.textContent.includes('<b>예제ID</b>'));assert.ok(!walk(root).some(n=>n.tagName==='b'));
  const failed=render({status:'error',error:{code:'SERVICE_UNAVAILABLE',message:'Bearer SYNTHETIC_ONLY'}});assert.ok(!failed.textContent.includes('SYNTHETIC_ONLY'));
});
