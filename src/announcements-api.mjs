import { createLoginVerifier } from './verify-login.mjs';
import { RESOURCES } from './resource-scope.mjs';

// 현재 계약에는 검증된 강사 역할/공지 저장소가 없으므로 모든 공지 접근을 거부합니다.
export function createAnnouncementsHandler({ config, verify, env = () => process.env } = {}) {
  let verifier;
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Resource-Id', RESOURCES.announcements.id);
    const authorization = request.headers?.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      return response.status(401).json({ error: '로그인이 필요합니다.' });
    }
    try {
      verifier ??= verify ?? createLoginVerifier({ config, supabaseSecretKey: env().SUPABASE_SECRET_KEY });
      if (!(await verifier(authorization))) return response.status(401).json({ error: '로그인이 필요합니다.' });
      // role·owner_id·resourceId 등의 클라이언트 값으로 권한을 승격하지 않습니다.
      if (RESOURCES.announcements.id === 'teacher_announcements') {
        return response.status(403).json({ error: '이 자료 구역에 접근할 권한이 없습니다.' });
      }
    } catch { return response.status(401).json({ error: '로그인이 필요합니다.' }); }
    return response.status(403).json({ error: '이 자료 구역에 접근할 권한이 없습니다.' });
  };
}
