const loginForm = document.querySelector('#login-form');
const workspace = document.querySelector('#workspace');
const message = document.querySelector('#message');
const noteForm = document.querySelector('#note-form');
const list = document.querySelector('#notes');
let client;
let session = null;
let generation = 0;
let editingId = null;

function say(text) { message.textContent = text; }
function resetEditor() {
  editingId = null;
  noteForm.reset();
  document.querySelector('#save-note').textContent = '메모 추가';
  document.querySelector('#cancel-edit').hidden = true;
}

async function api(path, options = {}) {
  if (!session?.access_token) throw new Error('로그인해 주세요.');
  const response = await fetch(path, { ...options, cache: 'no-store', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...options.headers,
      Authorization: `Bearer ${session.access_token}` } });
  if (response.status === 401) throw new Error('로그인이 만료됐습니다. 다시 로그인해 주세요.');
  if (response.status === 404) throw new Error('메모를 찾을 수 없습니다.');
  if (!response.ok) throw new Error('메모 요청을 처리하지 못했습니다.');
  return response.json();
}

async function refreshNotes() {
  const current = generation;
  const notes = await api('/api/notes');
  if (current !== generation || !session) return;
  if (!Array.isArray(notes)) throw new Error('메모 응답을 확인할 수 없습니다.');
  list.replaceChildren();
  document.querySelector('#empty').hidden = notes.length > 0;
  for (const note of notes) {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const body = document.createElement('p');
    const edit = document.createElement('button');
    const remove = document.createElement('button');
    title.textContent = note.title;
    body.textContent = note.body;
    edit.textContent = '수정';
    remove.textContent = '삭제';
    edit.addEventListener('click', async () => {
      try {
        const fresh = await api(`/api/notes/${encodeURIComponent(note.id)}`);
        if (!session || current !== generation) return;
        editingId = fresh.id;
        noteForm.elements.title.value = fresh.title;
        noteForm.elements.body.value = fresh.body;
        document.querySelector('#save-note').textContent = '변경 저장';
        document.querySelector('#cancel-edit').hidden = false;
        noteForm.elements.title.focus();
        say('수정할 내용을 입력해 주세요.');
      } catch (error) { say(error.message); }
    });
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await api(`/api/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' });
        // Confirm the item is gone through the canonical GET route, without
        // placing the session or note contents in logs or visible diagnostics.
        try {
          await api(`/api/notes/${encodeURIComponent(note.id)}`);
          throw new Error('삭제 결과를 확인하지 못했습니다.');
        } catch (error) {
          if (error.message !== '메모를 찾을 수 없습니다.') throw error;
        }
        if (editingId === note.id) resetEditor();
        await refreshNotes();
        say('메모를 삭제했습니다.');
      } catch (error) { say(error.message); }
      finally { remove.disabled = false; }
    });
    card.append(title, body, edit, remove);
    list.append(card);
  }
}

function showSession(next) {
  generation++;
  session = next;
  list.replaceChildren();
  resetEditor();
  loginForm.hidden = Boolean(session);
  workspace.hidden = !session;
  document.querySelector('#logout').hidden = !session;
  document.querySelector('#login-state').textContent = session ? '로그인됨' : '로그인하지 않음';
  if (session) refreshNotes().catch(error => say(error.message));
  else say('로그인하면 내 실습 메모를 볼 수 있습니다.');
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#login');
  button.disabled = true;
  try {
    const { error } = await client.auth.signInWithPassword({
      email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value,
    });
    loginForm.elements.password.value = '';
    if (error) {
      say(error.code === 'email_not_confirmed' ? '이메일 확인을 완료한 뒤 로그인해 주세요.'
        : '로그인에 실패했습니다. 이메일·비밀번호와 이메일 확인 여부를 확인해 주세요.');
    } else say('로그인했습니다.');
  } catch { say('로그인 서비스에 연결하지 못했습니다.'); }
  finally { loginForm.elements.password.value = ''; button.disabled = false; }
});
document.querySelector('#logout').addEventListener('click', async () => {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) say('로그아웃하지 못했습니다. 다시 시도해 주세요.');
  else { showSession(null); say('로그아웃했습니다.'); }
});
noteForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#save-note');
  button.disabled = true;
  try {
    const id = editingId;
    await api(id ? `/api/notes/${encodeURIComponent(id)}` : '/api/notes', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({ title: noteForm.elements.title.value, body: noteForm.elements.body.value }),
    });
    resetEditor();
    await refreshNotes();
    say(id ? '메모를 수정했습니다.' : '메모를 추가했습니다.');
  } catch (error) { say(error.message); }
  finally { button.disabled = false; }
});
document.querySelector('#cancel-edit').addEventListener('click', resetEditor);

try {
  const response = await fetch('/database.json', { cache: 'no-store' });
  if (!response.ok) throw new Error();
  const config = await response.json();
  client = window.supabase.createClient(config.url, config.publishableKey);
  client.auth.onAuthStateChange((_event, next) => {
    // Keep async server work outside the Auth callback's lock.
    setTimeout(() => showSession(next), 0);
  });
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error();
  showSession(data.session);
  document.querySelector('#login').disabled = false;
} catch { say('로그인 설정을 불러오지 못했습니다.'); }
