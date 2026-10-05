// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
    return results;
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}
