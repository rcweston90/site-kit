import { blogPaths } from '@rcweston/site-data/client';
import { defineAdminModule } from '../define.js';

/**
 * Posts: the list, the new-post flow and the post editor, over site-data's
 * `blog` module. Mount `BlogAdmin` at `<admin>/blog`, `BlogEditor mode="create"`
 * at `<admin>/blog/new` and `BlogEditor mode="edit" slug=…` at
 * `<admin>/blog/:slug/edit`.
 */
export const blogModule = defineAdminModule({
  id: 'blog',
  title: 'Posts',
  nav: [{ group: 'Publishing', name: 'Posts', path: 'blog', description: 'Posts and drafts', order: 20 }],
  stats: [{
    label: 'Posts',
    path: 'blog',
    order: 10,
    count: async ({ config, read }) => (await read<{ posts: unknown[] }>(`${config.siteApi}${blogPaths.posts()}`))?.posts.length ?? 0,
  }],
  quickActions: [{ label: 'New post', path: 'blog/new', order: 20 }],
});

export { default as BlogAdmin } from './BlogAdminClient.js';
export { default as BlogEditor, type BlogEditorClientProps as BlogEditorProps } from './BlogEditorClient.js';
export { default as BlogDraftPreview } from './BlogDraftPreview.js';
export { usePostUpdates, PostUpdatesNotice, PostUpdatesReview, type PostUpdatesState } from './PostUpdates.js';
export { diffPost, applyPostChange, applyPostChanges, comparePostChange, postBlocks, type PostChange } from './post-drift.js';
