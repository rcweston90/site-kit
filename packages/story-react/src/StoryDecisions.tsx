import type { StoryDecisionSection } from '@rcweston/story-core';
import type { StoryRenderEditor } from './editor.js';
import { InlineStoryText } from './InlineStoryText.js';
import { StoryRichText } from './StoryRichText.js';
import { decisionStyles as styles } from './classes.js';

export function StoryDecisions({ section, editor }: { section: StoryDecisionSection; editor?: StoryRenderEditor }) {
  if (!editor && (section.hidden || section.items.length === 0)) return null;

  return (
    <section
      className={styles.section}
      aria-labelledby="story-decisions-title"
      data-story-editor-id={editor ? 'decisions' : undefined}
      data-story-editor-selected={editor?.selectedId === 'decisions' || undefined}
      data-story-hidden={editor && section.hidden || undefined}
    >
      <header className={styles.header}>
        <h2 id="story-decisions-title" className={styles.title}>
          {editor ? <InlineStoryText value={section.title} path={['decisions', 'title']} editor={editor} selectionId="decisions" label="Decisions section title" /> : section.title}
        </h2>
        {section.intro !== undefined && (
          <p className={styles.intro}>
            {editor ? <InlineStoryText value={section.intro} path={['decisions', 'intro']} editor={editor} selectionId="decisions" label="Decisions section introduction" multiline /> : <StoryRichText value={section.intro} />}
          </p>
        )}
      </header>
      <div className={styles.list}>
        {section.items.map((item, index) => (
          <details key={item.id ?? `${index}-${item.title}`} className={styles.item} open={Boolean(editor) || item.expanded || undefined}>
            <summary onClick={editor ? (event) => event.preventDefault() : undefined}>
              {editor ? <InlineStoryText value={item.title} path={['decisions', 'items', index, 'title']} editor={editor} selectionId="decisions" label={`Decision ${index + 1} title`} /> : item.title}
            </summary>
            <div className={styles.detail}>
              {editor ? <InlineStoryText value={item.detail} path={['decisions', 'items', index, 'detail']} editor={editor} selectionId="decisions" label={`Decision ${index + 1} detail`} multiline /> : <StoryRichText value={item.detail} />}
            </div>
          </details>
        ))}
        {editor && section.items.length === 0 && <p className={styles.empty}>No decisions yet. Add one in settings — readers see this section once it has one.</p>}
      </div>
    </section>
  );
}
