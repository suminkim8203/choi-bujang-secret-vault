const $ = id => document.getElementById(id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const seeded = /^00000000-0000-4000-8000-00000000000[1-4]$/;
const fakeOwner = '99999999-9999-4999-8999-999999999999';
const text = { title: '검증용 ' + '임시 항목', body: '삭제 예정 ' + '가상 시험 자료',
  updatedTitle: '수정된 ' + '임시 항목', updatedBody: '수정 확인용 ' + '가상 시험 자료' };
let client, session, database, busy = false, preparedOwner = null;
function report(label, result) { $('results').textContent += `${label}: ${result}\n`; }
function assert(value) { if (!value) throw new Error('검증 실패: 결과를 확인해 주세요.'); }
function controls() {
  const differentOwner = preparedOwner && preparedOwner !== session?.user?.id;
  for (const id of ['prepare', 'cross', 'finish']) $(id).disabled = busy || !session || differentOwner;
  $('state').textContent = session ? '로그인됨 — 실제 운영 요청으로 확인합니다.' : '로그인되지 않았습니다. 자료실에서 로그인해 주세요.';
}
async function request(path, method = 'GET', data) {
  assert(session?.access_token);
  const response = await fetch(path, { method, credentials: 'omit', cache: 'no-store',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}) });
  let body; try { body = await response.json(); } catch { /* no raw responses */ }
  return { status: response.status, body };
}
function matches(row) { return row?.title === text.updatedTitle && row?.body === text.updatedBody; }
function item(id) { assert(UUID.test(id)); return `/api/notes/${encodeURIComponent(id)}`; }
async function run(action) {
  if (busy) return;
  busy = true; controls(); $('message').textContent = '확인 중입니다.';
  try { await action(); $('message').textContent = '요청한 확인을 완료했습니다.'; }
  catch { $('message').textContent = '확인을 완료하지 못했습니다. 표시된 마지막 결과를 확인해 주세요.'; }
  finally { busy = false; controls(); }
}
$('prepare').addEventListener('click', () => run(async () => {
  assert(!$('own-id').value);
  $('results').textContent = '';
  const initial = await request('/api/notes');
  report('본인 목록', `HTTP${initial.status}; ${Array.isArray(initial.body) ? initial.body.length : '확인 불가'}건`);
  assert(initial.status === 200 && Array.isArray(initial.body));
  const id = crypto.randomUUID();
  const created = await request('/api/notes', 'POST', { id, title: text.title, body: text.body });
  report('UUID 지정 추가', `HTTP${created.status}`);
  assert(created.status === 201 && created.body?.id === id);
  $('own-id').value = id; preparedOwner = session.user.id;
  const own = await request(item(id));
  report('본인 개별 조회', `HTTP${own.status}`);
  assert(own.status === 200 && own.body?.id === id && own.body.title === text.title && own.body.body === text.body);
  const changed = await request(item(id), 'PUT', { title: text.updatedTitle, body: text.updatedBody });
  report('본인 수정', `HTTP${changed.status}`); assert(changed.status === 200 && matches(changed.body));
  const transfer = await request(item(id), 'PUT', { title: text.updatedTitle, body: text.updatedBody, owner_id: fakeOwner });
  report('API 소유자 변경 시도', `HTTP${transfer.status}`); assert(transfer.status === 400);
  const foreignInsert = await request('/api/notes', 'POST', { title: text.title, body: text.body, owner_id: fakeOwner });
  report('API 타인 소유 추가 시도', `HTTP${foreignInsert.status}`); assert(foreignInsert.status === 400);
}));
$('cross').addEventListener('click', () => run(async () => {
  const id = $('other-id').value.trim();
  assert(UUID.test(id) && !seeded.test(id) && id !== $('own-id').value);
  const listed = await request('/api/notes');
  report('상대 ID 본인 목록 제외', `HTTP${listed.status}`);
  assert(listed.status === 200 && Array.isArray(listed.body) && !listed.body.some(row => row.id === id));
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const denied = await request(item(id), method, method === 'PUT'
      ? { title: text.updatedTitle, body: text.updatedBody } : undefined);
    report(`상대 ${method}`, `HTTP${denied.status}`);
    assert(denied.status === 404 && denied.body && Object.keys(denied.body).join(',') === 'error');
  }
}));
$('finish').addEventListener('click', () => run(async () => {
  const id = $('own-id').value.trim(); assert(UUID.test(id) && !seeded.test(id));
  assert(!preparedOwner || preparedOwner === session.user.id);
  const own = await request(item(id));
  report('교차 시험 후 본인 메모 보존', `HTTP${own.status}`);
  assert(own.status === 200 && matches(own.body));
  const deleted = await request(item(id), 'DELETE');
  report('본인 임시 메모 삭제', `HTTP${deleted.status}`); assert(deleted.status === 200);
  const gone = await request(item(id)); report('삭제 후 개별 조회', `HTTP${gone.status}`); assert(gone.status === 404);
  const list = await request('/api/notes');
  report('정리 후 본인 목록', `HTTP${list.status}; ${Array.isArray(list.body) ? list.body.length : '확인 불가'}건`);
  assert(list.status === 200 && !list.body.some(row => row.id === id));
  $('own-id').value = ''; preparedOwner = null;
}));
try {
  const [metadata, descriptor] = await Promise.all([fetch('/aleph.json', { cache: 'no-store' }), fetch('/database.json', { cache: 'no-store' })]);
  assert(metadata.ok && descriptor.ok);
  const deployed = await metadata.json(); database = await descriptor.json(); assert(deployed.step === 5);
  $('identity').textContent = `5단계 운영 저장점 ${deployed.commit}`;
  client = window.supabase.createClient(database.url, database.publishableKey);
  client.auth.onAuthStateChange((_event, next) => { session = next; controls(); });
  const { data, error } = await client.auth.getSession(); assert(!error); session = data.session; controls();
} catch { $('state').textContent = '로그인 설정 또는 5단계 운영 배포를 확인할 수 없습니다.'; }
