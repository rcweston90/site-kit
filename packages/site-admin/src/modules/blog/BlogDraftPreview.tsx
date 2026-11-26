'use client';

import { useId, type MouseEvent, type ReactNode, type Ref } from 'react';
import { useAdminConfig } from '../../config.js';
import { formatBlogDate, relatedTileKey, renderBlogRelatedTiles, sanitizeBlogHtml, safeBlogUrl, type RelatedTileChoice } from '@rcweston/site-data/client';
/* Styles: blog.css. */
const styles = { preview: 'sa-blog-preview', notice: 'sa-blog-preview-notice' } as const;

// The preview is part of the editor, not a navigation surface. Preserve
// reader link styling but don't let a click or Enter leave an unsaved draft.
function keepDraftOpen(event: MouseEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest('a[href]')) event.preventDefault();
}

/** The post page's title style, shared by the editor's title field and this preview. */
export const blogReaderTitleClass = 'text-3xl md:text-4xl font-semibold leading-9 md:leading-12 text-foreground mb-minor-2 tracking-tight';

/** The date line and title, as the post page sets them. */
export function BlogReaderHeading({ date, readingTime, children }: { date?: string; readingTime?: string; children: ReactNode }) {
  return <>
    {date && <div className="flex items-center gap-3 text-sm leading-baseline text-foreground-muted">
      <time dateTime={date}>{formatBlogDate(date)}</time>
      {readingTime && <><span>&middot;</span><span>{readingTime}</span></>}
    </div>}
    {children}
  </>;
}

/** The cover image, as the post page sets it. */
export function BlogReaderCover({ cover, title }: { cover: string; title: string }) {
  return <div className="mb-minor-2 @container">
    <div className="relative snap-video w-full overflow-hidden rounded-xl bg-card-bg">
      <img src={cover} alt={title} className="absolute inset-0 h-full w-full object-cover" sizes="(max-width: 768px) 100vw, 768px" />
    </div>
  </div>;
}

export default function BlogDraftPreview({ title, content, imageUrl, headingRef, relatedChoices, date, readingTime, embedded }: {
  title: string;
  content: string;
  imageUrl: string;
  relatedChoices: readonly RelatedTileChoice[];
  headingRef: Ref<HTMLHeadingElement>;
  date?: string;
  embedded?: boolean;
  readingTime?: string;
}) {
  const headingId = useId();
  const { storyHref } = useAdminConfig();
  const cover = safeBlogUrl(imageUrl, true);
  let body = '';
  try {
    const destinations = new Map(relatedChoices.map(choice => [relatedTileKey(choice), choice]));
    body = renderBlogRelatedTiles(sanitizeBlogHtml(content, { retainRelatedTiles: true }), reference => destinations.get(relatedTileKey(reference)), { caseStudy: storyHref });
  } catch { body = ''; }
  const titleText = title.trim() || 'Untitled post';

  return <section id={embedded ? undefined : 'blog-draft-preview'} className={styles.preview} aria-labelledby={headingId}>
    <BlogReaderHeading date={date} readingTime={readingTime}>
      <h1 id={headingId} ref={headingRef} tabIndex={-1} className={blogReaderTitleClass}>{titleText}</h1>
    </BlogReaderHeading>
    {cover && <BlogReaderCover cover={cover} title={titleText} />}
    <article className="blog-content" data-blog-authoring onClickCapture={keepDraftOpen} onAuxClickCapture={keepDraftOpen}>
      {body
        ? <div className="blog-cms-content" dangerouslySetInnerHTML={{ __html: body }} />
        : <p className={styles.notice}>Write something to see it here.</p>}
    </article>
  </section>;
}
