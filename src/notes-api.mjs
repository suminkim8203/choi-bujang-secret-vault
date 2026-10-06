import { randomUUID } from 'node:crypto';
import { createLoginVerifier } from './verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const errors = { 400: '입력 내용을 확인해 주세요.', 401: '로그인이 필요합니다.',
  404: '메모를 찾을 수 없습니다.', 405: '이 작업은 허용되지 않습니다.',
  409: '이미 사용 중인 메모 ID입니다.', 503: '요청을 처리하지 못했습니다.' };

function databaseConfig(env, config) {
  let base;
  try { base = new URL(env.SUPABASE_URL); } catch { throw new Error('DB_CONFIG_INVALID'); }
  const key = env.SUPABASE_SECRET_KEY;
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname)
      || base.username || base.password || base.port || base.search || base.hash || base.pathname !== '/'
      || base.origin !== config.database?.url || config.database?.table !== 'aleph_defense_notes'
      || typeof key !== 'string' || !key.startsWith('sb_secret_') || key.length < 24) {
    throw new Error('DB_CONFIG_INVALID');
  }
  return { base, key };
}

function noteInput(value, create) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120
      || typeof value.body !== 'string' || !value.body.trim() || value.body.length > 10000
      || (create && value.id !== undefined && !UUID.test(value.id))) return null;
  // owner_id, userId and role from the browser are deliberately not used.
  return { title: value.title.trim(), content: value.body.trim(),
    ...(create ? { id: value.id ?? randomUUID() } : {}) };
}

function displayRow(row) {
  if (!row || !UUID.test(row.id ?? '') || typeof row.title !== 'string'
      || typeof row.content !== 'string') throw new Error('DB_RESPONSE_INVALID');
  return { id: row.id, title: row.title, body: row.content };
}

export function createNotesHandler({ config, item = false, env = () => process.env,
  send = (...args) => fetch(...args), verify } = {}) {
  let verifier;
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = status => response.status(status).json({ error: errors[status] });
    const authorization = request.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return fail(401);
    try {
      const currentEnv = env();
      const db = databaseConfig(currentEnv, config);
      verifier ??= verify ?? createLoginVerifier({ config, supabaseSecretKey: currentEnv.SUPABASE_SECRET_KEY });
      const identity = await verifier(authorization);
      if (!identity || !UUID.test(identity.userId ?? '')) return fail(401);
      const method = request.method;
      const methods = item ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
      if (!methods.includes(method)) {
        response.setHeader('Allow', methods.join(', '));
        return fail(405);
      }
      const id = item ? request.query?.id : null;
      if (item && (typeof id !== 'string' || !UUID.test(id))) return fail(400);
      const target = new URL('/rest/v1/aleph_defense_notes', db.base);
      target.searchParams.set('select', 'id,title,content');
      if (item) target.searchParams.set('id', `eq.${id}`);
      if (!item && method === 'GET') {
        target.searchParams.set('owner_id', `eq.${identity.userId}`);
        target.searchParams.set('order', 'created_at.asc,id.asc');
        target.searchParams.set('limit', '100');
      }
      const headers = { apikey: db.key, Accept: 'application/json' };
      const options = { headers, redirect: 'error', signal: AbortSignal.timeout(10000) };
      if (method === 'POST' || method === 'PUT') {
        const input = noteInput(request.body, method === 'POST');
        if (!input) return fail(400);
        // Stage 3 verifies login; item ownership checks are the Stage 4 task.
        const row = method === 'POST' ? { ...input, owner_id: identity.userId } : input;
        headers['Content-Type'] = 'application/json';
        headers.Prefer = 'return=representation';
        options.method = method === 'PUT' ? 'PATCH' : 'POST';
        options.body = JSON.stringify(row);
      } else if (method === 'DELETE') {
        options.method = 'DELETE';
        headers.Prefer = 'return=representation';
      }
      const result = await send(target, options);
      if (!result.ok) {
        if (method === 'POST' && result.status === 409) return fail(409);
        return fail(503);
      }
      const rows = await result.json();
      if (!Array.isArray(rows) || rows.length > 100) return fail(503);
      if ((item || method === 'POST') && rows.length === 0) return fail(404);
      if ((item || method === 'POST') && rows.length !== 1) return fail(503);
      if (method === 'DELETE') return response.status(200).json({ id });
      const notes = rows.map(displayRow);
      if (method === 'POST') return response.status(201).json({ id: notes[0].id });
      return response.status(200).json(item ? notes[0] : notes);
    } catch {
      // Never expose credentials, tokens or upstream error details.
      return fail(503);
    }
  };
}
