// 자료 ID·구역은 서버 코드로 정합니다. 브라우저의 role/resourceId는 사용하지 않습니다.
export const RESOURCES = Object.freeze({
  notes: Object.freeze({ id: 'personal_notes', service: 'notes', collection: '/api/my/notes', create: '/api/notes', item: '/api/notes/:id' }),
  announcements: Object.freeze({ id: 'teacher_announcements', service: 'announcements', item: '/api/announcements/:id' }),
});
