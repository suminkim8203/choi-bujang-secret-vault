// The privileged key stays in the server environment. Never log upstream errors.
export async function loadNotes(env = process.env, send = fetch) {
  let base;
  try {
    base = new URL(env.SUPABASE_URL);
  } catch {
    throw new Error('DB_CONFIG_MISSING');
  }
  const key = env.SUPABASE_SECRET_KEY;
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname)
      || base.username || base.password || base.search || base.hash || base.pathname !== '/'
      || typeof key !== 'string' || !key.startsWith('sb_secret_') || key.length < 24) {
    throw new Error('DB_CONFIG_INVALID');
  }
  const url = new URL('/rest/v1/aleph_defense_notes', base);
  url.searchParams.set('select', 'id,title,content');
  url.searchParams.set('order', 'created_at.asc,id.asc');
  url.searchParams.set('limit', '100');
  const response = await send(url, {
    headers: { apikey: key, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('DB_READ_FAILED');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row
      || typeof row.id !== 'string' || typeof row.title !== 'string'
      || typeof row.content !== 'string')) {
    throw new Error('DB_RESPONSE_INVALID');
  }
  return rows.map(({ id, title, content }) => ({ id, title, content }));
}
