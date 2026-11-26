import { defineAdminModule } from '../define.js';

export { CommunityScreen } from './CommunityScreen.js';

/** Admin → Community: every word and link on the community page (site-data's `community`). */
export const communityModule = defineAdminModule({
  id: 'community',
  title: 'Community',
  nav: [{ group: 'Publishing', name: 'Community', path: 'community', description: 'Mentoring, talks and events', order: 10 }],
});
