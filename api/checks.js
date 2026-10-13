import { runDetectionCheck } from '../src/detection-check.mjs';

// 고정 가상 탐지 사례의 상태만 공개합니다. 실제 사건 입력·로그 읽기·회수 기능은 없습니다.
export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }
  if (!request.query || Object.keys(request.query).join(',') !== 'case') {
    return response.status(400).json({ error: 'invalid_check_case' });
  }
  try {
    const result = runDetectionCheck(request.query.case);
    return result ? response.status(200).json(result)
      : response.status(400).json({ error: 'invalid_check_case' });
  } catch {
    return response.status(500).json({ error: 'check_unavailable' });
  }
}
