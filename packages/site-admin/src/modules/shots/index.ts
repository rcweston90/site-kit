import { siteDataPaths, type ShotsList } from '@rcweston/site-data/client';
import { defineAdminModule } from '../define.js';

export { ShotsScreen, shotRecordKey } from './ShotsScreen.js';
export { Reorder } from './Reorder.js';

/** Shots: the photography library, its dashboard count and its upload shortcut. */
export const shotsModule = defineAdminModule({
  id: 'shots',
  title: 'Shots',
  nav: [{ group: 'Publishing', name: 'Shots', path: 'shots', description: 'Photography library', order: 50 }],
  stats: [{
    label: 'Shots',
    path: 'shots',
    order: 40,
    count: async ({ config, read }) => (await read<ShotsList>(`${config.siteApi}${siteDataPaths.shots()}`))?.shots.length ?? 0,
  }],
  quickActions: [{ label: 'Upload Shot', path: 'shots', order: 40 }],
});
