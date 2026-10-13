import { publicDatabase } from './public-db-config.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { decide } from './decider.mjs';
import {randomUUID} from 'node:crypto';

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config,{send=globalThis.fetch,onResponse}={}) {
  const fetch=async(target,options={})=>{
    const requestId=randomUUID(),url=new URL(target);
    const result=await send(target,{...options,alephEvidence:{...options.alephEvidence,requestId}});
    if(onResponse)onResponse({requestId:result.headers?.get('x-vercel-id')??result.headers?.get('sb-request-id')??`client:${requestId}`,
      checkedAt:new Date().toISOString(),method:options.method??'GET',
      path:url.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu,':id'),
      caseId:url.searchParams.get('case'),status:result.status});
    return result;
  };
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  let emptyStatic = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
      emptyStatic = Array.isArray(data?.notes) && data.notes.length === 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  if (config.step >= 3) {
    if (!response.ok || !emptyStatic) throw new Error('공개 정적 메모 제거를 확인하지 못했습니다.');
    const checks = [{ attackId: 'static_note_read', expected: '공개 data.json에 메모가 없어야 함',
      observed: '실제 공개 응답 HTTP200; 메모 배열 비어 있음' }];
    async function decisionCheck(caseId,expected){
      const result=await fetch(new URL(`/api/checks?case=${caseId}`,app),{redirect:'error',signal:AbortSignal.timeout(10000)});
      const body=await result.json();
      if(result.status!==200||body.synthetic!==true||body.ready!==true||body.decision!==expected)throw Error('서버 가상 판정 확인 실패');
      return `실제 GET HTTP200; 고정 가상 사건 ${expected}·ready=true; 실제 운영 기기 연결과 구분`;
    }
    const id = '00000000-0000-4000-8000-000000000000';
    for (const [attackId, method, path, invalid] of [
      ['anonymous_list', 'GET', '/api/notes', false],
      ['anonymous_item', 'GET', `/api/notes/${id}`, false],
      ['anonymous_create', 'POST', '/api/notes', false],
      ['anonymous_update', 'PUT', `/api/notes/${id}`, false],
      ['anonymous_delete', 'DELETE', `/api/notes/${id}`, false],
      ['malformed_token', 'GET', '/api/notes', true],
    ]) {
      const result = await fetch(new URL(path, app), { method,
        ...(invalid ? { headers: { Authorization: 'Bearer invalid-login-token' } } : {}),
        redirect: 'error', signal: AbortSignal.timeout(10000) });
      let body;
      try { body = await result.json(); } catch { /* Do not report response bodies. */ }
      const denied = result.status === 401 && body && Object.keys(body).join(',') === 'error';
      if (!denied) throw new Error(`${attackId}: HTTP401과 자료 없는 거부 응답을 확인하지 못했습니다.`);
      checks.push({ attackId, expected: '토큰이 없거나 유효하지 않으면 자료와 변경 없이 HTTP401',
        observed: `실제 ${method} 요청 HTTP401; 자료 없는 거부 응답 확인` });
    }
    const database = publicDatabase(config.database);
    const original = new URL(`/rest/v1/${database.table}`, database.url);
    if (config.step >= 5 && config.originalApiUrl !== original.href) throw new Error('원본 API 경로 불일치');
    const readTarget = new URL(original); readTarget.search = '?select=id&limit=1';
    const direct = await fetch(readTarget, {
      headers: { apikey: database.publishableKey }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    let code;
    try { code = (await direct.json())?.code; } catch { /* No upstream bodies in evidence. */ }
    if (![401, 403].includes(direct.status) || code !== '42501') throw new Error('공개 DB 권한 거부 확인 실패');
    checks.push({ attackId: 'direct_database_read', expected: '공개용 키로 DB 직접 읽기 거부',
      observed: `실제 DB 직접 요청 HTTP${direct.status}; PostgreSQL42501 권한 거부` });
    if (config.step >= 5) {
      const writeTarget = new URL(config.originalApiUrl);
      writeTarget.searchParams.set('id', `eq.${id}`);
      const write = await fetch(writeTarget, { method: 'PATCH',
        headers: { apikey: database.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'disposable verification' }),
        redirect: 'error', signal: AbortSignal.timeout(10000) });
      let writeCode;
      try { writeCode = (await write.json())?.code; } catch { /* No upstream bodies. */ }
      if (![401, 403].includes(write.status) || writeCode !== '42501') throw new Error('원본 DB 직접 수정 권한 거부 확인 실패');
      checks.push({ attackId: 'direct_database_update', expected: '공개용 키의 원본 DB 직접 수정은 권한 오류로 거부',
        observed: `실제 PATCH 요청 HTTP${write.status}; PostgreSQL42501 권한 거부` });
    }
    if (config.step >= 6) {
      const { normal } = fixtureRequests();
      const registered = await decide(normal);
      const unregistered = await decide({ ...normal, deviceRegistered: false });
      const absent = { ...normal }; delete absent.deviceRegistered;
      const missing = await decide(absent);
      if (registered.decision !== 'allow' || unregistered.decision !== 'deny'
          || unregistered.reasonCode !== 'device_not_registered'
          || missing.decision !== 'deny' || missing.reasonCode !== 'device_not_registered') {
        throw new Error('등록·미등록·등록값 누락 가상 요청 판정 실패');
      }
      checks.push({ attackId: 'device_registration_fixture',
        expected: '로컬 가상 요청: 등록 허용, 미등록 및 누락 deny/device_not_registered',
        observed: config.step>=12?await decisionCheck('s06-registered','allow')
          :'실행한 가상 요청 3건 일치; 운영 기기 등록·mTLS 연결의 증거는 아님' });
    }
    if (config.step >= 7) {
      const { suspicious } = fixtureRequests();
      const before = await decide(suspicious);
      const after = await decide({ ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } });
      if (before.decision !== 'step_up' || before.reasonCode !== 'step_up_required'
          || after.decision !== 'allow') throw new Error('복합 이상 가상 요청 재확인 판정 실패');
      checks.push({ attackId: 'step_up_fixture',
        expected: '가상 복합 이상 사건은 step_up, 엔진 확인 재인증 뒤 allow',
        observed: config.step>=12?await decisionCheck('s07-risk','step_up')
          :'로컬 가상 요청에서 확인 전 step_up·확인 후 allow; 실제 재로그인·자료 차단은 미실행' });
    }
    if (config.step >= 8) {
      const ownList = await fetch(new URL('/api/my/notes', app), {
        redirect: 'error', signal: AbortSignal.timeout(10000) });
      let ownBody;
      try { ownBody = await ownList.json(); } catch { /* No raw bodies in evidence. */ }
      if (ownList.status !== 401 || !ownBody || Object.keys(ownBody).join(',') !== 'error') {
        throw new Error('익명 본인 목록 전용 경로 거부 확인 실패');
      }
      checks.push({ attackId: 'anonymous_own_list', expected: '익명 본인 목록 전용 경로 HTTP401',
        observed: '실제 GET /api/my/notes HTTP401; 자료 없는 거부 응답 확인' });
      const announcement = await fetch(new URL(`/api/announcements/${id}`, app), {
        method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (announcement.status !== 401) throw new Error('익명 공지 수정 거부 확인 실패');
      checks.push({ attackId: 'anonymous_announcement_update', expected: '익명 공지 수정 HTTP401',
        observed: '실제 PUT 요청 HTTP401; 공지 구역 접근 거부' });
      const { normal } = fixtureRequests();
      for (const path of ['/admin', '/notes/export', '/notes/demo/extra']) {
        if ((await decide({ ...normal, path })).decision !== 'deny') throw new Error('다른 구역 가상 요청 거부 실패');
      }
      checks.push({ attackId: 'resource_scope_fixture', expected: '가상 미허용 경로와 기능 경로 거부',
        observed: config.step>=12?await decisionCheck('s08-other-zone','deny')
          :'로컬 가상 요청3건 deny 확인; API 소유자 점검과 구분' });
    }
    if (config.step >= 9) {
      // Stage 10 keeps representative normal/burst/spread checks within the official 20-row cap.
      const cases = config.step >= 11 ? ['s09-burst-read'] : config.step >= 10 ? ['s09-normal-read', 's09-burst-read', 's09-spread-read']
        : ['s09-normal-read', 's09-boundary-read', 's09-burst-read', 's09-split-users', 's09-spread-read', 's09-nonread'];
      for (const caseId of cases) {
        const result = await fetch(new URL(`/api/checks?case=${caseId}`, app), {
          redirect: 'error', signal: AbortSignal.timeout(10000),
          alephEvidence: { caseId, requestKey: 'read' },
        });
        let body;
        try { body = await result.json(); } catch { /* No raw bodies in evidence. */ }
        const expected = caseId === 's09-burst-read' ? 'propose_revocation' : 'observe';
        if (result.status !== 200 || body?.synthetic !== true || body.ready !== true
            || body.action !== expected || Object.keys(body).sort().join(',') !== 'action,ready,reasonCode,synthetic'
            || body.reasonCode !== (expected === 'observe' ? null : 'burst_read')) {
          throw new Error('배포된 가상 탐지 점검 확인 실패');
        }
        checks.push({ attackId: caseId, expected: `고정 가상 사건 결과 ${expected}`,
          observed: `실제 점검 GET HTTP200; synthetic=true·ready=true·action=${expected}. 실제 접속 회수·경과 시간은 미검증` });
      }
    }
    if (config.step >= 10) {
      for (const method of ['GET','POST']) {
        const result = await fetch(new URL(`/api/restore/${id}`,app), {
          method,redirect:'error',signal:AbortSignal.timeout(10000) });
        const body = await result.json();
        if(result.status!==401||Object.keys(body).join(',')!=='error')throw Error('익명 복구 거부 확인 실패');
        checks.push({attackId:`anonymous_restore_${method.toLowerCase()}`,
          expected:'익명 복구 사본 조회·실행 거부',observed:`실제 ${method} 복구 요청 HTTP401; 자료 없는 오류`});
      }
      const target = new URL('/rest/v1/aleph_note_backups?select=id&limit=1',database.url);
      const result = await fetch(target,{headers:{apikey:database.publishableKey},redirect:'error',signal:AbortSignal.timeout(10000)});
      const code = (await result.json())?.code;
      if(![401,403].includes(result.status)||code!=='42501')throw Error('공개 DB 백업 읽기 거부 확인 실패');
      checks.push({attackId:'direct_backup_read',expected:'공개용 키로 사전 메모 백업 직접 읽기 거부',
        observed:`실제 DB 백업 요청 HTTP${result.status}; PostgreSQL42501 권한 거부`});
    }
    if(config.step>=11){
      const manifest=await fetch(new URL('/manifest.json',app),{redirect:'error',signal:AbortSignal.timeout(10000)});
      const metadata=await manifest.json();
      if(manifest.status!==200||metadata.display!=='standalone'||metadata.start_url!=='/'
        ||typeof metadata.name!=='string'||!Array.isArray(metadata.icons)||!metadata.icons.length)throw Error('PWA 설정 확인 실패');
      checks.push({attackId:'pwa_manifest',expected:'설치형 웹앱 manifest와 이름·아이콘·시작 주소',
        observed:'실제 GET HTTP200; standalone·시작 주소·앱 이름·아이콘 확인. 실제 OS 설치는 미실행'});
      const status=await fetch(new URL('/api/device/status',app),{redirect:'error',signal:AbortSignal.timeout(10000)});
      const state=await status.json();
      if(status.status!==200||state.approved!==false||Object.keys(state).sort().join(',')!=='approved,reason')throw Error('승인 전 기기 상태 거부 확인 실패');
      checks.push({attackId:'device_initial_status',expected:'확인된 등록 기기 세션이 없으면 승인 전',
        observed:'실제 GET HTTP200; approved=false. 사용자 정보·기기 키 없음; 운영 등록 어댑터 미연결'});
    }
    return checks;
  }
  if (config.step === 2) {
    const results = [{ attackId: 'static_note_read', expected: '공개 data.json에 메모가 없어야 함',
      observed: response.ok && emptyStatic ? '공개 파일 응답의 메모 배열이 비어 있음' : `공개 파일 점검 실패 (HTTP ${response.status})` }];
    const api = await fetch(new URL('/api/notes', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let count = null;
    if (api.ok) {
      try {
        const data = await api.json();
        if (data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)) count = data.notes.length;
      } catch { /* Report the failed response without copying note bodies. */ }
    }
    results.push({ attackId: 'anonymous_api_note_read', expected: '2단계의 남은 약점: 공개 서버 API로 가상 메모 네 건이 읽힘',
      observed: count === 4 ? '비로그인 서버 API에서 가상 메모 네 건이 읽힘; 로그인 보호는 아직 없음' : `서버 API 확인 실패 (HTTP ${api.status}; 건수 ${count ?? '확인 불가'})` });
    const write = await fetch(new URL('/api/notes', app), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    results.push({ attackId: 'unsupported_write', expected: '현재 읽기 전용 API에 POST 요청은 거부됨',
      observed: `POST 응답 HTTP ${write.status}${write.status === 405 ? '; 쓰기 요청 거부됨' : '; 예상과 다름'}` });
    const database = publicDatabase(config.database);
    const descriptorResponse = await fetch(new URL('/database.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let deployed;
    try { deployed = publicDatabase(await descriptorResponse.json()); } catch { /* Fail closed below. */ }
    if (!descriptorResponse.ok || JSON.stringify(deployed) !== JSON.stringify(database)) {
      throw new Error('공개 DB 검증 정보가 현재 설정과 일치하지 않습니다.');
    }
    const target = new URL(`/rest/v1/${database.table}`, database.url);
    target.searchParams.set('select', 'id');
    target.searchParams.set('limit', '1');
    const direct = await fetch(target, { headers: { apikey: database.publishableKey },
      redirect: 'error', signal: AbortSignal.timeout(10000) });
    let code = null;
    try { const body = await direct.json(); if (body?.code === '42501') code = body.code; } catch { /* No bodies in evidence. */ }
    const denied = [401, 403].includes(direct.status) && code === '42501';
    results.push({ attackId: 'direct_database_read', expected: '공개용 키로 전용 DB 테이블을 직접 읽으면 권한 오류로 거부됨',
      observed: `DB 직접 읽기 HTTP ${direct.status}; ${denied ? 'PostgreSQL 42501 권한 거부 확인' : '권한 거부 확인 실패'}` });
    return results;
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
