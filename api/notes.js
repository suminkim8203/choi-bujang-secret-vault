import config from '../aleph.config.json' with { type: 'json' };

// Server-only reader. Only the three display fields leave this function.
export async function loadNotes(env = process.env, send = fetch) {
  let base;
  try { base = new URL(env.SUPABASE_URL); }
  catch { throw new Error('DB_CONFIG_MISSING'); }
  const key = env.SUPABASE_SECRET_KEY;
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname)
      || base.username || base.password || base.port || base.search || base.hash || base.pathname !== '/'
      || typeof key !== 'string' || !key.startsWith('sb_secret_') || key.length < 24) {
    throw new Error('DB_CONFIG_INVALID');
  }
  const target = new URL('/rest/v1/aleph_defense_notes', base);
  target.searchParams.set('select', 'id,title,content');
  target.searchParams.set('order', 'created_at.asc,id.asc');
  target.searchParams.set('limit', '100');
  const result = await send(target, {
    headers: { apikey: key, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error('DB_READ_FAILED');
  const rows = await result.json();
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row
      || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.content !== 'string')) {
    throw new Error('DB_RESPONSE_INVALID');
  }
  return rows.map(row => ({ id: row.id, title: row.title, content: row.content }));
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: '이 작업은 허용되지 않습니다.' });
  }
  try {
    const env = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    };
    if (env.SUPABASE_URL !== config.database?.url) throw new Error('DB_CONFIG_MISMATCH');
    const notes = await loadNotes(env);
    return response.status(200).json({ sampleMarker: 'SAMPLE_NOTE_1', notes });
  } catch {
    return response.status(503).json({ error: '자료를 불러오지 못했습니다.' });
  }
}
