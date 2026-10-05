import { loadNotes } from '../src/notes-store.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: '이 작업은 허용되지 않습니다.' });
  }
  try {
    const notes = await loadNotes();
    // Step 2 deliberately permits anonymous reads of fictional notes only.
    return response.status(200).json({ sampleMarker: 'SAMPLE_NOTE_1', notes });
  } catch {
    return response.status(503).json({ error: '자료를 불러오지 못했습니다.' });
  }
}
