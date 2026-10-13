import config from '../aleph.config.json' with { type: 'json' };
import { createAnnouncementsHandler } from '../src/announcements-api.mjs';

export default createAnnouncementsHandler({ config });
