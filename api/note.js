import config from '../aleph.config.json' with { type: 'json' };
import { createNotesHandler } from '../src/notes-api.mjs';

// /api/notes/:id is rewritten here with the named id query parameter.
export default createNotesHandler({ config, item: true });
