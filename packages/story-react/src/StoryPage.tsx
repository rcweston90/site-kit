import type { ReactNode } from 'react';
import type { MediaResolveOptions, Story, StoryTeaser } from '@rcweston/story-core';
import { StoryHero, type StoryCompany } from './StoryHero.js';
import type { StoryHeroReviewLayout } from './StoryHero.js';
import { StoryChapter, StoryCredits, StoryHindsight } from './StoryChapter.js';
import { StoryDecisions } from './StoryDecisions.js';
import { ChapterBar } from './ChapterBar.js';
import { NextStudy } from './NextStudy.js';
import { storyStyles as styles } from './classes.js';
import type { BlockRegistry, StoryRenderEditor } from './editor.js';
import { isStoryVisible } from './editor.js';
import { StoryProvider, type RenderLink } from './context.js';

export interface StoryPageProps {
  story: Story;
  /** The company as the host knows it: its display name and logo. Falls back
   *  to the story's own `company` and `companyLogo`. */
  company?: StoryCompany | null;
  /** The next story to read, shown as a card at the end. */
  next?: StoryTeaser;
  children?: ReactNode;
  /** Inside another surface (a sheet, a preview): no back link, and the next
   *  card replaces the current entry instead of adding one. */
  embedded?: boolean;
  /** Present in the editor only. Readers never pass it. */
  editor?: StoryRenderEditor;
  heroReviewLayout?: StoryHeroReviewLayout;
  /** Components for `custom` blocks, by name. */
  blocks?: BlockRegistry;
  /** Your router's link. Defaults to a plain anchor. */
  renderLink?: RenderLink;
  /** Where uploaded media loads from. */
  media?: MediaResolveOptions;
  /** The link above the hero back to your index, e.g. `{ href: '/stories', label: 'Stories' }`. */
  backLink?: { href: string; label: string };
  /** Where the next card links. Defaults to `/${slug}`. */
  hrefFor?: (slug: string) => string;
  /** Show unfilled shot slots (development). Default false. */
  showShots?: boolean;
  /** The contents rail at the right edge. Default true. */
  chapterBar?: boolean;
}

/**
 * A story, start to finish: hero, the chapters, decisions, hindsight, credits
 * and the next story. Server-renderable; only the chapter bar, media loops
 * and the lightbox hydrate.
 *
 * The root is a div, not an article: a host's hover animations that follow
 * the nearest `a, article` ancestor shouldn't fire anywhere on the page.
 */
export function StoryPage({
  story,
  company,
  next,
  children,
  embedded = false,
  editor,
  heroReviewLayout,
  blocks,
  renderLink,
  media,
  backLink,
  hrefFor,
  showShots,
  chapterBar = true,
}: StoryPageProps) {
  const visibleChapters = story.chapters.filter((chapter) => editor || !chapter.hidden);
  return (
    <StoryProvider blocks={blocks} renderLink={renderLink} media={media} showShots={showShots}>
      <div
        className={styles.story}
        data-tone={story.tone ?? 'neutral'}
        data-story={story.slug}
        data-story-reader={!editor || undefined}
        data-embedded={embedded || undefined}
      >
        <div className={styles.page}>
          <StoryHero story={story} company={company} embedded={embedded} editor={editor} reviewLayout={heroReviewLayout} backLink={backLink} />
          <div>
            {visibleChapters.map((chapter) => (
              <StoryChapter key={chapter.key} chapter={chapter} chapterIndex={story.chapters.indexOf(chapter)} editor={editor} storySlug={story.slug} />
            ))}
            {story.decisions && <StoryDecisions section={story.decisions} editor={editor} />}
            {story.hindsight && (editor || isStoryVisible(story.visibility?.hindsight)) && (
              <StoryHindsight title={story.hindsight.title} paragraphs={story.hindsight.paragraphs} editor={editor} hidden={!isStoryVisible(story.visibility?.hindsight)} />
            )}
          </div>
          {story.credits && story.credits.length > 0 && (editor || isStoryVisible(story.visibility?.credits)) && <StoryCredits credits={story.credits} title={story.creditsTitle} editor={editor} hidden={!isStoryVisible(story.visibility?.credits)} />}
          {next && <NextStudy next={next} href={hrefFor ? hrefFor(next.slug) : `/${next.slug}`} indexLink={backLink} />}
        </div>
        {chapterBar && <ChapterBar chapters={story.chapters} title={story.title} />}
        {children}
      </div>
    </StoryProvider>
  );
}
