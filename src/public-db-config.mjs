// Additional verification metadata, not an official judge protocol.
// Publishable keys identify a project; table permissions still control access.
export function publicDatabase(input) {
  let url;
  try { url = new URL(input?.url); } catch { throw new Error('PUBLIC_DB_CONFIG_INVALID'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || typeof input.publishableKey !== 'string'
      || !/^sb_publishable_[A-Za-z0-9_-]{20,}$/u.test(input.publishableKey)
      || input.table !== 'aleph_defense_notes') throw new Error('PUBLIC_DB_CONFIG_INVALID');
  return { schema: 'aleph.defense.database.v1', url: url.origin,
    publishableKey: input.publishableKey, table: input.table };
}
