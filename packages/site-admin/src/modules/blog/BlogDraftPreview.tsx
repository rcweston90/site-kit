'use client';

import type { MouseEvent, Ref } from 'react';
import { useAdminConfig } from '../../config.js';
import { relatedTileKey, renderBlogRelatedTiles, sanitizeBlogHtml, safeBlogUrl, type RelatedTileChoice } from '@rcweston/site-data/client';
/* Styles: blog.css. */
const styles = { preview: 'sa-blog-preview', notice: 'sa-blog-preview-notice' } as const;

// The preview is part of the editor, not a navigation surface. Preserve
// reader link styling but don't let a click or Enter leave an unsaved draft.
function keepDraftOpen(event: MouseEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
}

export default function BlogDraftPreview({ title, content, imageUrl, headingRef, relatedChoices }: {
  title: string;
  content: string;
  imageUrl: string;
  relatedChoices: readonly RelatedTileChoice[];
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const { storyHref } = useAdminConfig();
  const cover = safeBlogUrl(imageUrl, true);
  let body = '';
  try {
    const destinations = new Map(relatedChoices.map(choice => [relatedTileKey(choice), choice]));
    body = renderBlogRelatedTiles(sanitizeBlogHtml(content, { retainRelatedTiles: true }), reference => destinations.get(relatedTileKey(reference)), { caseStudy: storyHref });
  } catch { body = ''; }
  const titleText = title.trim() || 'Untitled post';

  return <section id="blog-draft-preview" className={styles.preview} aria-labelledby="blog-draft-preview-heading">
    <p className={styles.notice}>Preview of your current edits. Nothing is saved or published from this view.</p>
    <h2 id="blog-draft-preview-heading" ref={headingRef} tabIndex={-1} className="text-3xl md:text-4xl font-semibold leading-9 md:leading-12 text-foreground mb-minor-2 tracking-tight">{titleText}</h2>
    {cover && <div className="mb-minor-2 @container">
      <div className="relative snap-video w-full overflow-hidden rounded-xl bg-card-bg">
        <img src={cover} alt={titleText} className="absolute inset-0 h-full w-full object-cover" sizes="(max-width: 768px) 100vw, 768px" />
      </div>
    </div>}
    <article className="blog-content" data-blog-authoring onClickCapture={keepDraftOpen} onAuxClickCapture={keepDraftOpen}>
      {body
        ? <div className="blog-cms-content" dangerouslySetInnerHTML={{ __html: body }} />
        : <p className={styles.notice}>Write something to see it here.</p>}
    </article>
  </section>;
}
