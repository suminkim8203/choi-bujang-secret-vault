import { publicDatabase } from './public-db-config.mjs';

// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  if (config.step === 3) {
    if (!response.ok || !emptyStatic) throw new Error('공개 정적 메모 제거를 확인하지 못했습니다.');
    const checks = [{ attackId: 'static_note_read', expected: '공개 data.json에 메모가 없어야 함',
      observed: '실제 공개 응답 HTTP200; 메모 배열 비어 있음' }];
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
    const direct = await fetch(new URL(`/rest/v1/${database.table}?select=id&limit=1`, database.url), {
      headers: { apikey: database.publishableKey }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    let code;
    try { code = (await direct.json())?.code; } catch { /* No upstream bodies in evidence. */ }
    if (![401, 403].includes(direct.status) || code !== '42501') throw new Error('공개 DB 권한 거부 확인 실패');
    checks.push({ attackId: 'direct_database_read', expected: '공개용 키로 DB 직접 읽기 거부',
      observed: `실제 DB 직접 요청 HTTP${direct.status}; PostgreSQL42501 권한 거부` });
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
