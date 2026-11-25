import type { StoryChapter as StoryChapterData, StoryCredit } from '@rcweston/story-core';
import { StoryBlocks, StoryHeading } from './StoryBlocks.js';
import { chapterStyles as styles } from './classes.js';
import { blockStyles } from './classes.js';
import { InlineStoryText } from './InlineStoryText.js';
import { StoryLines } from './StoryRichText.js';
import type { StoryRenderEditor } from './editor.js';

/**
 * One chapter. Its title says what happened in it — a statement, and the
 * section's only name: the rail and the editor call it by this heading,
 * never by the STAR key it is stored under.
 */
export function StoryChapter({ chapter, chapterIndex = 0, editor, storySlug }: { chapter: StoryChapterData; chapterIndex?: number; editor?: StoryRenderEditor; storySlug?: string }) {
  const id = `${chapter.key}-title`;
  return (
    // Dragging starts from the editor-only button; the semantic section is the
    // drop target so its heading and every child always move as one unit.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      id={chapter.key}
      aria-labelledby={id}
      className={styles.chapter}
      data-density={chapter.density ?? 'default'}
      data-columns={chapter.columns ?? 'one'}
      data-story-editor-id={editor ? `chapter:${chapter.key}` : undefined}
      data-story-editor-selected={editor?.selectedId === `chapter:${chapter.key}` || undefined}
      data-story-hidden={editor && chapter.hidden || undefined}
      onDragOver={editor ? (event) => {
        if (!event.dataTransfer.types.includes('application/x-story-section')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (event.clientY < 72) window.scrollBy({ top: -24, behavior: 'auto' });
        else if (event.clientY > window.innerHeight - 72) window.scrollBy({ top: 24, behavior: 'auto' });
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dataset.storySectionDrop = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      } : undefined}
      onDragLeave={editor ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) delete event.currentTarget.dataset.storySectionDrop;
      } : undefined}
      onDrop={editor ? (event) => {
        const sourceKey = event.dataTransfer.getData('application/x-story-section');
        if (!sourceKey) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        delete event.currentTarget.dataset.storySectionDrop;
        editor.onChapterDrop(sourceKey, chapter.key, placement);
      } : undefined}
    >
      <h2 id={id} className={styles.title}>
        {editor ? <InlineStoryText value={chapter.title} path={['chapters', chapterIndex, 'title']} editor={editor} selectionId={`chapter:${chapter.key}`} label={`Section ${chapterIndex + 1} title`} placeholder="Add a section title" multiline /> : <StoryLines value={chapter.title} />}
      </h2>
      <div className={styles.body}>
        <StoryBlocks blocks={chapter.blocks} editor={editor} chapterIndex={chapterIndex} chapterKey={chapter.key} storySlug={storySlug} />
      </div>
    </section>
  );
}

/** Hindsight closes the story: what I'd do differently, in my own words. */
export function StoryHindsight({ title, paragraphs, editor, hidden = false }: { title: string; paragraphs: string[]; editor?: StoryRenderEditor; hidden?: boolean }) {
  return (
    <section aria-labelledby="hindsight-title" className={styles.chapter} data-story-editor-id={editor ? 'hindsight' : undefined} data-story-editor-selected={editor?.selectedId === 'hindsight' || undefined} data-story-hidden={editor && hidden || undefined}>
      <h2 id="hindsight-title" className={styles.title}>
        {editor ? <InlineStoryText value={title} path={['hindsight', 'title']} editor={editor} selectionId="hindsight" label="Hindsight title" multiline /> : <StoryLines value={title} />}
      </h2>
      <div className={styles.body}>
        {editor ? (
          // The reader's prose block, field by field: same grid, measure and
          // paragraph rhythm, with each paragraph editable in place.
          <div className={blockStyles.grid}>
            <div className={blockStyles.prose} data-paragraphs={Math.min(paragraphs.length, 3)}>
              {paragraphs.map((paragraph, index) => <p key={index}><InlineStoryText value={paragraph} path={['hindsight', 'paragraphs', index]} editor={editor} selectionId="hindsight" label={`Hindsight paragraph ${index + 1}`} placeholder="Add what you would do differently" multiline /></p>)}
            </div>
          </div>
        ) : <StoryBlocks blocks={[{ type: 'prose', paragraphs }]} />}
      </div>
    </section>
  );
}

/** Named collaborators, closing the story — credit makes the rest believable. */
export function StoryCredits({ credits, title, editor, hidden = false }: { credits: StoryCredit[]; title?: string; editor?: StoryRenderEditor; hidden?: boolean }) {
  return (
    <section aria-labelledby="credits-title" className={styles.credits} data-story-editor-id={editor ? 'credits' : undefined} data-story-editor-selected={editor?.selectedId === 'credits' || undefined} data-story-hidden={editor && hidden || undefined}>
      <h2 id="credits-title" className={styles.creditsTitle}>
        <StoryHeading value={title} fallback="Made with" path={['creditsTitle']} editor={editor} selectionId="credits" label="Credits heading" />
      </h2>
      <ul className={styles.creditsList}>
        {credits.filter((credit) => editor || !credit.hidden).map((c) => {
          const index = credits.indexOf(c);
          return (
          <li key={c.id ?? `${index}-${c.name}-${c.role}`} data-story-hidden={editor && c.hidden || undefined}>
            <span className={styles.creditName}>{editor ? <InlineStoryText value={c.name} path={['credits', index, 'name']} editor={editor} selectionId="credits" label={`Credit ${index + 1} name`} /> : c.name}</span>
            <span className={styles.creditRole}>{editor ? <InlineStoryText value={c.role} path={['credits', index, 'role']} editor={editor} selectionId="credits" label={`Credit ${index + 1} role`} multiline /> : <StoryLines value={c.role} />}</span>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
