'use client';

import type { CommunityContent } from '@rcweston/site-data/client';
import home from '../home/Home.module.css';
import { CommunityPageView } from './CommunityPageView';
import s from './Community.module.css';

/** Admin → Community's preview: the page's own view on the page's paper, fed the unsaved form. */
export function CommunityPreview({ content }: { content: CommunityContent }) {
  return (
    <div className={home.surface}>
      <div className={`${home.page} ${s.community}`}>
        <CommunityPageView content={content} idPrefix="preview-" />
      </div>
    </div>
  );
}
