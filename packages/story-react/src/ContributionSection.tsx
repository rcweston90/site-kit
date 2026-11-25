import type { StoryBlock } from '@rcweston/story-core';
import { InlineStoryText } from './InlineStoryText.js';
import { StoryLines } from './StoryRichText.js';
import type { StoryFieldPath } from '@rcweston/story-core';
import type { StoryRenderEditor } from './editor.js';
import type { StoryBlockIdentity } from './StoryBlocks.js';
import { contributionStyles as styles } from './classes.js';

type ContributionBlock = Extract<StoryBlock, { type: 'implemented' | 'influenced' | 'partners' | 'contribution' }>;

const FALLBACK = { implemented: 'Implemented', influenced: 'Influenced', partners: 'Partners' } as const;

/** Independently ordered contribution evidence with a shared editorial rhythm. */
export function ContributionSection({ block, editor, path, selectionId, identity }: { block: ContributionBlock; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity }) {
  const variant = block.type === 'contribution' ? block.variant : block.type;
  const label = block.label?.trim() || FALLBACK[variant];
  const heading = editor ? <InlineStoryText value={label} path={[...path, 'label']} editor={editor} selectionId={selectionId} label={`${FALLBACK[variant]} heading`} placeholder={FALLBACK[variant]} /> : label;
  const empty = block.items.length === 0;
  return (
    <section className={styles.section} data-kind={variant} aria-label={label} {...identity}>
      <header><h3>{heading}</h3></header>
      {variant === 'partners' ? (
        <dl className={styles.partners}>
          {block.items.map((item, index) => typeof item === 'string' ? null : <div key={`${index}-${item.role}`}><dt>{edit(item.role, [...path, 'items', index, 'role'], editor, selectionId, `Partner ${index + 1} role`)}</dt><dd>{edit(item.owned, [...path, 'items', index, 'owned'], editor, selectionId, `Partner ${index + 1} ownership`)}</dd></div>)}
        </dl>
      ) : (
        <ul className={styles.items}>
          {block.items.map((item, index) => typeof item === 'string' ? <li key={`${index}-${item}`}><p>{edit(item, [...path, 'items', index], editor, selectionId, `${FALLBACK[variant]} item ${index + 1}`)}</p></li> : null)}
        </ul>
      )}
      {editor && empty && <p className={styles.empty}>Add the first item from this block’s menu.</p>}
    </section>
  );
}

function edit(value: string, path: StoryFieldPath, editor: StoryRenderEditor | undefined, selectionId: string, label: string) {
  return editor ? <InlineStoryText value={value} path={path} editor={editor} selectionId={selectionId} label={label} multiline /> : <StoryLines value={value} />;
}
