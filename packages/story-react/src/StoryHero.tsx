import type { Story } from '@rcweston/story-core';
import { StoryMedia } from './StoryMedia.js';
import { HeroMorph } from './HeroMorph/HeroMorph.js';
import { readingMinutes } from '@rcweston/story-core';
import { heroStyles as styles } from './classes.js';
import { InlineStoryText } from './InlineStoryText.js';
import type { StoryRenderEditor } from './editor.js';
import { isStoryVisible } from './editor.js';
import { storyHeroPresentation } from './hero-presentation.js';
import { resolveHeroMediaSlots } from './hero-media-slots.js';
import { heroLogo, type StoryCompany } from './hero-logo.js';
import { useStoryEnvironment } from './context.js';

export type { StoryCompany } from './hero-logo.js';

export type StoryHeroReviewLayout =
  | 'editorial-a' | 'editorial-b' | 'editorial-c' | 'editorial-d'
  | 'media-first-a' | 'media-first-b' | 'media-first-c' | 'media-first-d'
  | 'rail-a' | 'rail-b' | 'rail-c' | 'rail-d';

/**
 * The fold: where it happened, what it's called, what changed — then the
 * facts a reviewer checks first, then the work itself. From 1024px every
 * hero is two columns that start on one line: the text column (logo row,
 * title, thesis) and one primary visual. A split graphic leads when it has
 * authored content; otherwise the ordinary hero media takes that slot. The
 * generated hex field appears only when neither slot has content.
 */
export function StoryHero({ story, company, embedded = false, editor, reviewLayout, backLink }: { story: Story; company?: StoryCompany | null; embedded?: boolean; editor?: StoryRenderEditor; reviewLayout?: StoryHeroReviewLayout; backLink?: { href: string; label: string } }) {
  const { renderLink } = useStoryEnvironment();
  const logo = heroLogo(story, company);
  const assignedCompanyName = company?.name.trim();
  const minutes = readingMinutes(story);
  const mediaSlots = resolveHeroMediaSlots(story);
  const heroCopy = editor ? { 'data-story-editor-id': 'hero-copy', 'data-story-editor-selected': editor.selectedId === 'hero-copy' || undefined } : undefined;
  const presentation = reviewLayout ?? storyHeroPresentation(story);
  const inlineSecondary = Boolean(mediaSlots.secondaryHero && presentation && ['editorial-c', 'media-first-b', 'media-first-d', 'rail-b', 'rail-d'].includes(presentation));
  const primarySelectionId = mediaSlots.primary === 'hero-media' ? 'hero-media' : 'hero-graphic';
  const showHeroSummary = presentation !== 'rail-c';
  const showReadTime = Boolean(minutes) && (Boolean(editor) || isStoryVisible(story.visibility?.readTime));
  const identity = (
    <div className={styles.identity} data-story-editor-id={editor ? 'hero-meta' : undefined} data-story-editor-selected={editor?.selectedId === 'hero-meta' || undefined}>
      {logo ? (
        <img src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} className={styles.logo} />
      ) : (
        <span className={styles.company}>{editor && !assignedCompanyName ? <InlineStoryText value={story.company} path={['company']} editor={editor} selectionId="hero-meta" label="Company" /> : assignedCompanyName || story.company}</span>
      )}
      {/* One group so that on a phone the labels take the row under the
          logo instead of wrapping beside it; wider, it dissolves back into
          the logo row (see .details). */}
      {(story.period || story.status || story.projectYear || showReadTime || editor) && (
        <span className={styles.details}>
          {(story.period || editor) && <span className={styles.period}>{editor ? <InlineStoryText value={story.period ?? ''} path={['period']} editor={editor} selectionId="hero-meta" label="Story period" placeholder="Add period" /> : story.period}</span>}
          {(story.status || editor) && <span className={styles.status}>{editor ? <InlineStoryText value={story.status ?? ''} path={['status']} editor={editor} selectionId="hero-meta" label="Story status" placeholder="Add status" /> : story.status}</span>}
          {(story.projectYear || editor) && <span className={styles.status}>{editor
            ? <InlineStoryText value={story.projectYear ?? ''} path={['projectYear']} editor={editor} selectionId="hero-meta" label="Project year" placeholder="Add year" />
            : <time dateTime={story.projectYear}>{story.projectYear}</time>}</span>}
          {showReadTime && (
            <span
              className={styles.status}
              data-story-editor-id={editor ? 'hero-read-time' : undefined}
              data-story-editor-selected={editor?.selectedId === 'hero-read-time' || undefined}
              data-story-hidden={editor && !isStoryVisible(story.visibility?.readTime) || undefined}
            >
              {minutes} min read
            </span>
          )}
        </span>
      )}
    </div>
  );

  return (
    <header
      id="top"
      className={styles.hero}
      data-embedded={embedded || undefined}
      data-review-layout={presentation}
    >
      <div className={styles.column}>
        {!embedded && backLink && renderLink({ href: backLink.href, className: styles.back, children: <><span aria-hidden="true">←</span> {backLink.label}</> })}

        <div className={styles.lead}>
          {/* The logo row heads the text, the card heads the graphic. Title
              and thesis are the selectable copy region; the card beside it
              is its own, so the two never share one rail. */}
          <div className={styles.copy}>
            {identity}
            <div className={styles.text} {...heroCopy}>
              <h1 className={styles.title}>{editor ? <InlineStoryText value={story.title} path={['title']} editor={editor} selectionId="hero-copy" label="Story title" placeholder="Add a title" /> : story.title}</h1>
              {showHeroSummary && <div className={styles.summaryCopy}>
                <p className={styles.thesis}>{editor ? <InlineStoryText value={story.thesis} path={['thesis']} editor={editor} selectionId="hero-copy" label="Story thesis" placeholder="Add a thesis" multiline /> : story.thesis}</p>
                {(story.disclosure || editor) && <p className={styles.disclosure}>{editor ? <InlineStoryText value={story.disclosure ?? ''} path={['disclosure']} editor={editor} selectionId="hero-copy" label="Story disclosure" placeholder="Add disclosure" multiline /> : story.disclosure}</p>}
              </div>}
            </div>
          </div>
          {/* One editor region either way: on the pattern, its settings
              offer adding the story's own animation. */}
          <div className={styles.graphic} data-story-editor-id={editor ? primarySelectionId : undefined} data-story-editor-selected={editor?.selectedId === primarySelectionId || undefined}>
            {mediaSlots.primary === 'split-graphic'
              ? <StoryMedia media={story.heroGraphic!} priority sizes="(min-width: 1024px) 640px, 100vw" editor={editor} path={['heroGraphic']} selectionId="hero-graphic" headingLevel={2} />
              : mediaSlots.primary === 'hero-media'
                ? <StoryMedia media={story.hero!} priority sizes="(min-width: 1024px) 640px, 100vw" editor={editor} path={['hero']} selectionId="hero-media" headingLevel={2} />
                : <HeroMorph seed={story.slug} editable={Boolean(editor)} />}
          </div>
          {inlineSecondary && mediaSlots.secondaryHero && (
            <div className={styles.secondaryGraphic}>
              <StoryMedia media={mediaSlots.secondaryHero} priority sizes="(min-width: 1024px) 640px, 100vw" editor={editor} path={['hero']} selectionId="hero-media" headingLevel={2} />
            </div>
          )}
        </div>

        {story.facts.length > 0 && (editor || isStoryVisible(story.visibility?.facts)) && (
          <dl className={styles.facts} data-story-editor-id={editor ? 'facts' : undefined} data-story-editor-selected={editor?.selectedId === 'facts' || undefined} data-story-hidden={editor && !isStoryVisible(story.visibility?.facts) || undefined}>
            {story.facts.filter((fact) => editor || !fact.hidden).map((fact) => {
              const index = story.facts.indexOf(fact);
              return (
              <div key={fact.id ?? `${index}-${fact.label}`} className={styles.fact} data-story-hidden={editor && fact.hidden || undefined}>
                <dt>{editor ? <InlineStoryText value={fact.label} path={['facts', index, 'label']} editor={editor} selectionId="facts" label={`Fact ${index + 1} label`} /> : fact.label}</dt>
                <dd>{editor ? <InlineStoryText value={fact.value} path={['facts', index, 'value']} editor={editor} selectionId="facts" label={`Fact ${index + 1} value`} /> : fact.value}</dd>
              </div>
              );
            })}
          </dl>
        )}
      </div>

      {mediaSlots.secondaryHero && !inlineSecondary && (editor || isStoryVisible(story.visibility?.heroMedia)) && (
        <div className={styles.media} data-story-editor-id={editor ? 'hero-media' : undefined} data-story-editor-selected={editor?.selectedId === 'hero-media' || undefined} data-story-hidden={editor && !isStoryVisible(story.visibility?.heroMedia) || undefined}>
          <StoryMedia media={mediaSlots.secondaryHero} priority sizes="(min-width: 1152px) 1104px, 100vw" editor={editor} path={['hero']} selectionId="hero-media" headingLevel={2} />
        </div>
      )}
    </header>
  );
}
