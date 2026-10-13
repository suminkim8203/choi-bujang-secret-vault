import config from '../../aleph.config.json' with { type: 'json' };
import { createNotesHandler } from '../../src/notes-api.mjs';

// 본인 목록 전용 경로입니다. 기존 서버 검증·소유자 조건을 그대로 사용합니다.
export default createNotesHandler({ config, listOnly: true });
