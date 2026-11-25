import type { CSSProperties, ReactNode } from 'react';
import { ArrowUpRight, Layers3, Sparkles, Users, Workflow } from 'lucide-react';
import {
  EVIDENCE_LABEL,
  type Metric,
  type Quote,
  type StoryBlock,
  type StoryInsightColumn,
  type StoryLedger,
  type StoryMedia as StoryMediaData,
  type StoryOutcome,
  type StoryRichText as RichTextValue,
} from '@rcweston/story-core';
import { StoryMedia } from './StoryMedia.js';
import { calloutAppearanceAttributes, completedCta } from '@rcweston/story-core';
import { calloutIconOption, resolvedCalloutIcon } from './callout-icons.js';
import { sharedMatColor, storyMatStyle } from './media-mat.js';
import { InlineStoryAdd, InlineStoryText } from './InlineStoryText.js';
import { StoryLines, StoryRichParagraph } from './StoryRichText.js';
import { ContributionSection } from './ContributionSection.js';
import { isEmptyRichText, storyListRunRows, storyProseRuns, visibleStoryListRows, type StoryProseListRun } from '@rcweston/story-core';
import type { StoryFieldPath } from '@rcweston/story-core';
import type { StoryRenderEditor } from './editor.js';
import { useStoryEnvironment } from './context.js';
import { blockStyles as styles } from './classes.js';

/** The callout body is editable in the editor's canvas, but its icon and
 * typography are the same as the published reader. */
export function StoryCalloutIcon({ icon }: { icon?: string }) {
  const Icon = calloutIconOption(icon)?.[2];
  return Icon ? <Icon className={styles.calloutIcon} aria-hidden="true" /> : null;
}

/**
 * Chapter blocks on a 12-column grid (lg+). Prose holds a reading measure of
 * seven columns; margin notes sit beside the paragraph they annotate; media,
 * results and pairs take the full column; `full` media breaks out to the
 * viewport as a band. Below lg everything is one column and prose keeps its
 * 40rem measure.
 */
export function StoryBlocks({
  blocks,
  editor,
  chapterIndex = 0,
  blockIndexOffset = 0,
  chapterKey = 'section',
  storySlug,
}: {
  blocks: StoryBlock[];
  editor?: StoryRenderEditor;
  chapterIndex?: number;
  /** The original chapter position when showing a contiguous block subset. */
  blockIndexOffset?: number;
  chapterKey?: string;
  storySlug?: string;
}) {
  const source = blocks
    .map((block, index) => ({ block, index: index + blockIndexOffset }))
    .filter(({ block }) => editor || !block.hidden);
  return <div className={styles.grid}>{group(source).map((unit, i) => renderUnit(unit, i, editor, chapterIndex, chapterKey, storySlug))}</div>;
}
type IndexedBlock = { block: StoryBlock; index: number };
type Unit =
  | { kind: 'single'; source: IndexedBlock }
  | { kind: 'withNotes'; source: IndexedBlock; notes: IndexedBlock[] }
  | { kind: 'headed'; heading: IndexedBlock; body: Unit };

function renderUnit(unit: Unit, key: number | string, editor: StoryRenderEditor | undefined, chapterIndex: number, chapterKey: string, storySlug?: string): ReactNode {
  switch (unit.kind) {
    case 'single':
      return <Block key={key} block={unit.source.block} blockIndex={unit.source.index} editor={editor} chapterIndex={chapterIndex} chapterKey={chapterKey} storySlug={storySlug} />;
    case 'withNotes':
      return (
        <div key={key} className={styles.withNotes}>
          <Block block={unit.source.block} blockIndex={unit.source.index} editor={editor} chapterIndex={chapterIndex} chapterKey={chapterKey} storySlug={storySlug} />
          <div className={styles.notes}>
            {unit.notes.map((note) => (
              <Block key={note.block.id ?? note.index} block={note.block} blockIndex={note.index} editor={editor} chapterIndex={chapterIndex} chapterKey={chapterKey} storySlug={storySlug} />
            ))}
          </div>
        </div>
      );
    case 'headed':
      // A subhead travels with the block it introduces, a half-step away
      // rather than a full block gap.
      return (
        <div key={key} className={styles.headed}>
          <Block block={unit.heading.block} blockIndex={unit.heading.index} editor={editor} chapterIndex={chapterIndex} chapterKey={chapterKey} storySlug={storySlug} />
          {renderUnit(unit.body, 'body', editor, chapterIndex, chapterKey, storySlug)}
        </div>
      );
  }
}

/**
 * Notes attach to the prose before them, so they can sit beside it; a subhead
 * takes the block after it. A subhead's prose keeps its notes too.
 */
function group(blocks: IndexedBlock[]): Unit[] {
  const units: Unit[] = [];
  let heading: IndexedBlock | null = null;

  const push = (unit: Unit) => {
    if (heading !== null) {
      units.push({ kind: 'headed', heading, body: unit });
      heading = null;
    } else {
      units.push(unit);
    }
  };

  for (const source of blocks) {
    const { block } = source;
    if (block.type === 'subhead') {
      if (heading !== null) units.push({ kind: 'single', source: heading });
      heading = source;
      continue;
    }
    const last = units[units.length - 1];
    if (block.type === 'note' && heading === null && last) {
      const holder = last.kind === 'headed' ? last : null;
      const target = holder ? holder.body : last;
      if (target.kind === 'withNotes') {
        target.notes.push(source);
        continue;
      }
      if (target.kind === 'single' && target.source.block.type === 'prose') {
        const merged: Unit = { kind: 'withNotes', source: target.source, notes: [source] };
        if (holder) holder.body = merged;
        else units[units.length - 1] = merged;
        continue;
      }
    }
    push({ kind: 'single', source });
  }
  if (heading !== null) units.push({ kind: 'single', source: heading });
  return units;
}

/**
 * The attributes the editor shell reads to select, measure and fade a block.
 * They go on the block's own root element — never a wrapper — so the editing
 * canvas keeps the reader's DOM: the same grid placement, the same sibling
 * selectors, and a real box for the shell's gutter rail. Undefined (and so
 * absent from the markup) for readers.
 */
export interface StoryBlockIdentity {
  'data-story-block-anchor': string;
  'data-story-editor-id'?: string;
  'data-story-editor-selected'?: true;
  'data-story-hidden'?: true;
}

/**
 * A heading the author can rename. Every word on the page is editable in the
 * editor; a heading with a sensible default prints that
 * default until it's renamed, and again if it's cleared.
 */
export function StoryHeading({ value, fallback, path, editor, selectionId, label }: { value: string | undefined; fallback: string; path: StoryFieldPath; editor?: StoryRenderEditor; selectionId: string; label: string }) {
  if (!editor) return <>{value?.trim() || fallback}</>;
  return <InlineStoryText value={value ?? fallback} path={path} editor={editor} selectionId={selectionId} label={label} placeholder={fallback} />;
}

function Block({ block, blockIndex, editor, chapterIndex, chapterKey, storySlug }: { block: StoryBlock; blockIndex: number; editor?: StoryRenderEditor; chapterIndex: number; chapterKey: string; storySlug?: string }) {
  const selectionId = `block:${chapterKey}:${block.id ?? blockIndex}`;
  const path = ['chapters', chapterIndex, 'blocks', blockIndex] as const;
  const selected = editor?.selectedId === selectionId;
  const identity: StoryBlockIdentity = {
    'data-story-block-anchor': `${chapterKey}:${block.id ?? blockIndex}`,
    'data-story-editor-id': editor ? selectionId : undefined,
    'data-story-editor-selected': editor && selected || undefined,
    'data-story-hidden': editor && block.hidden || undefined,
  };
  switch (block.type) {
    case 'prose':
      if (editor) {
        return <div className={`${styles.prose} ${styles.authoringProse}`} data-paragraphs={Math.min(block.paragraphs.length, 3)} {...identity}>
          <editor.ui.Prose
            value={block}
            onChange={(next) => editor.onBlockInput(chapterIndex, blockIndex, next)}
            selectionId={selectionId}
            editor={editor}
            onInsertBlock={editor.onInsertBlock && ((type, split) => editor.onInsertBlock?.(chapterIndex, blockIndex, type, split))}
            onInsertFiles={editor.onInsertFiles && ((files, split) => editor.onInsertFiles?.(chapterIndex, blockIndex, files, split))}
          />
        </div>;
      }
      return <RichBody text={block} className={styles.prose} paragraphs={Math.min(block.paragraphs.length, 3)} identity={identity} />;

    case 'subhead':
      return <h3 className={styles.subhead} {...identity}>{editor ? <InlineStoryText value={block.text} path={[...path, 'text']} editor={editor} selectionId={selectionId} label="Subheading" placeholder="Add a subheading" /> : block.text}</h3>;

    case 'note':
      return (
        <aside className={styles.note} {...identity}>
          <p>{editor ? <InlineStoryText value={block.text} path={[...path, 'text']} editor={editor} selectionId={selectionId} label="Margin note" placeholder="Add a note" multiline /> : <StoryLines value={block.text} />}</p>
        </aside>
      );

    case 'media': {
      const width = block.width ?? 'wide';
      if (width === 'full') {
        // A band: the plate colour runs edge to edge and the media returns to
        // the page column — or, for film, the media itself runs edge to edge.
        const bleed = block.media.frame === 'bleed';
        return (
          <div className={styles.band} data-frame={bleed ? 'bleed' : 'mat'} style={bleed ? undefined : storyMatStyle(block.media.matColor)} {...identity}>
            <div className={styles.bandInner}>
              <StoryMedia media={block.media} frame={bleed ? 'edge' : 'inset'} sizes="100vw" editor={editor} path={[...path, 'media']} selectionId={selectionId} />
            </div>
          </div>
        );
      }
      return (
        <StoryMedia
          media={block.media}
          className={`${width === 'text' ? styles.mediaText : styles.mediaWide} ${block.align === 'center' ? styles.mediaCentered : ''}`}
          sizes={width === 'text' ? '(min-width: 1024px) 736px, 100vw' : '(min-width: 1152px) 1104px, 100vw'}
          editor={editor}
          path={[...path, 'media']}
          selectionId={selectionId}
          identity={identity}
        />
      );
    }

    case 'decision':
      return <Decision block={block} editor={editor} path={path} selectionId={selectionId} identity={identity} selected={selected} chapterIndex={chapterIndex} blockIndex={blockIndex} />;

    case 'cta': {
      const cta = completedCta(block.label, block.href, block.newTab);
      if (!editor && !cta) return null;
      const CtaEditor = editor?.ui.Cta;
      return <div className={styles.prose} {...identity}>
        {editor && CtaEditor ? <CtaEditor value={block} onSave={value => editor.onBlockInput(chapterIndex, blockIndex, { ...block, ...value })} />
          : cta && <a href={cta.href} target={cta.newTab ? '_blank' : undefined} rel={cta.newTab ? 'noopener noreferrer' : undefined} className={styles.cta} data-story-cta="">{cta.label}</a>}
      </div>;
    }
    case 'divider':
      // The rule is the reader's; the wrapper gives the editor a row tall
      // enough to click without moving anything (styles.css).
      return <div className={styles.divider} {...identity}><hr /></div>;

    case 'spacer': {
      const size = block.size ?? 'medium';
      // Room, not content: readers get the space and nothing to read. In the
      // editor the room itself owns its size controls, instead of sending the
      // author to a detached settings surface for an otherwise invisible row.
      return (
        <div className={styles.spacer} data-size={size} aria-hidden={editor ? undefined : true} {...identity}>
          {editor && editor.ui.SpacerControl && <div className={styles.spacerHint} data-story-editor-action>
            <editor.ui.SpacerControl
              size={size}
              onChange={(next) => {
                editor.onSelect(selectionId);
                if (size !== next) editor.onBlockInput(chapterIndex, blockIndex, { ...block, size: next });
              }}
            />
          </div>}
        </div>
      );
    }

    case 'table':
      return <StoryTable block={block} editor={editor} path={path} selectionId={selectionId} identity={identity} />;

    case 'code':
      // As typed: a fixed-width font, every space and line kept, no markup read.
      return (
        <figure className={styles.codeBlock} {...identity}>
          <pre className={styles.codePre}><code>{editor
            ? <InlineStoryText value={block.code} path={[...path, 'code']} editor={editor} selectionId={selectionId} label="Code" placeholder="Paste or type code" multiline />
            : block.code}</code></pre>
          {(block.caption || editor) && <figcaption className={styles.groupCaption}>{editor ? <InlineStoryText value={block.caption ?? ''} path={[...path, 'caption']} editor={editor} selectionId={selectionId} label="Code caption" placeholder="Add caption" multiline /> : <StoryLines value={block.caption} />}</figcaption>}
        </figure>
      );

    case 'custom':
      return <CustomBlock block={block} editor={editor} identity={identity} />;

    case 'gallery':
      return <MediaGroup block={block} editor={editor} path={path} selectionId={selectionId} identity={identity} selected={selected} chapterIndex={chapterIndex} blockIndex={blockIndex} />;

    case 'insight':
      return <Insight block={block} editor={editor} path={path} selectionId={selectionId} identity={identity} selected={selected} chapterIndex={chapterIndex} blockIndex={blockIndex} titleId={`insight-${chapterKey}-${block.id ?? blockIndex}`} />;

    case 'quote':
      return <PullQuote quote={block.quote} editor={editor} path={[...path, 'quote']} selectionId={selectionId} identity={identity} />;

    case 'callout': {
      return (
        <aside className={`${styles.callout} ${styles.calloutPalette}`} {...calloutAppearanceAttributes(block)} {...identity}>
          <div className={styles.calloutContent}>
            {(resolvedCalloutIcon(block.icon, block.appearance?.icon) || block.title || editor) && <header className={styles.calloutHeader}>
              <StoryCalloutIcon icon={resolvedCalloutIcon(block.icon, block.appearance?.icon)} />
              {(block.title || editor) && <h3 className={styles.calloutTitle}>
                {editor ? <InlineStoryText value={block.title ?? ''} path={[...path, 'title']} editor={editor} selectionId={selectionId} label="Callout title" placeholder="Add a title (optional)" /> : block.title}
              </h3>}
            </header>}
            {editor
              ? <editor.ui.Prose value={block.body} onChange={(body) => editor.onBlockInput(chapterIndex, blockIndex, { ...block, body })} selectionId={selectionId} editor={editor} label="Callout body" placeholder="Write the callout…" />
              : <RichBody text={block.body} className={styles.calloutBody} />}
          </div>
        </aside>
      );
    }

    case 'metrics':
      return <Outcomes items={block.items.map(fromMetric)} note={block.note} editor={editor} path={path} selectionId={selectionId} identity={identity} metricMode />;

    case 'outcomes':
      return <Outcomes items={block.items} note={block.note} layout={block.layout} editor={editor} path={path} selectionId={selectionId} identity={identity} />;

    case 'ledger':
      return <Ledger ledger={block.ledger} editor={editor} path={[...path, 'ledger']} selectionId={selectionId} identity={identity} />;

    case 'implemented':
    case 'influenced':
    case 'partners':
    case 'contribution':
      return <ContributionSection block={block} editor={editor} path={path} selectionId={selectionId} identity={identity} />;

    case 'collaboration':
      return (
        <figure className={styles.collaboration} {...identity}>
          <div className={styles.collaborationMap}>
            <div className={styles.collaborationCenter}>
              <span>{editor ? <InlineStoryText value={block.map.center.label} path={[...path, 'map', 'center', 'label']} editor={editor} selectionId={selectionId} label="Collaboration center label" /> : block.map.center.label}</span>
              <strong>{editor ? <InlineStoryText value={block.map.center.detail} path={[...path, 'map', 'center', 'detail']} editor={editor} selectionId={selectionId} label="Collaboration center detail" multiline /> : <StoryLines value={block.map.center.detail} />}</strong>
            </div>
            <div className={styles.collaborationGroups}>
              {block.map.groups.map((group, index) => (
                <div className={styles.collaborationGroup} key={`${index}-${group.label}`}>
                  <span>{editor ? <InlineStoryText value={group.label} path={[...path, 'map', 'groups', index, 'label']} editor={editor} selectionId={selectionId} label={`Collaboration group ${index + 1} label`} /> : group.label}</span>
                  <p>{editor ? <InlineStoryText value={group.detail} path={[...path, 'map', 'groups', index, 'detail']} editor={editor} selectionId={selectionId} label={`Collaboration group ${index + 1} detail`} multiline /> : <StoryLines value={group.detail} />}</p>
                </div>
              ))}
            </div>
          </div>
          {(block.map.note || editor) && <figcaption className={styles.collaborationNote}>{editor ? <InlineStoryText value={block.map.note ?? ''} path={[...path, 'map', 'note']} editor={editor} selectionId={selectionId} label="Collaboration note" placeholder="Add note" multiline /> : <StoryLines value={block.map.note} />}</figcaption>}
        </figure>
      );

    case 'followUp': {
      const visibleItems = block.items.map((item, index) => ({ item, index })).filter(({ item }) => editor || item.title.trim() || item.teaser.trim());
      const headingId = `follow-up-${chapterKey}-${block.id ?? blockIndex}`;
      return (
        <section className={styles.followUp} aria-labelledby={headingId} {...identity}>
          <header className={styles.followUpHeader}>
            <h3 id={headingId}>{editor ? <InlineStoryText value={block.heading} path={[...path, 'heading']} editor={editor} selectionId={selectionId} label="Follow-up section heading" placeholder="More we can talk about" multiline /> : <StoryLines value={block.heading} />}</h3>
            {(editor || block.intro?.trim()) && <p>{editor ? <InlineStoryText value={block.intro ?? ''} path={[...path, 'intro']} editor={editor} selectionId={selectionId} label="Follow-up section introduction" placeholder="Invite the reader into a deeper conversation" multiline /> : <StoryLines value={block.intro} />}</p>}
          </header>
          {visibleItems.length > 0 && <div className={styles.followUpItems}>
            {visibleItems.map(({ item, index }) => {
              const Icon = item.icon === 'sparkles' ? Sparkles : item.icon === 'workflow' ? Workflow : item.icon === 'users' ? Users : Layers3;
              return <article key={item.id ?? index} className={styles.followUpItem}>
                {item.media && (item.media.src || item.media.sourceMode === 'youtube') && <StoryMedia media={item.media} className={styles.followUpMedia} sizes="(min-width: 1024px) 320px, 100vw" editor={editor} path={[...path, 'items', index, 'media']} selectionId={selectionId} headingLevel={4} />}
                <div className={styles.followUpCopy}>
                  <div className={styles.followUpTitle}>
                    <Icon aria-hidden="true" className={styles.followUpIcon} />
                    <h4>{editor ? <InlineStoryText value={item.title} path={[...path, 'items', index, 'title']} editor={editor} selectionId={selectionId} label={`Topic ${index + 1} title`} placeholder="Add a conversation topic" multiline /> : item.link?.href && !item.link.label?.trim() ? <a href={item.link.href}><StoryLines value={item.title} /></a> : <StoryLines value={item.title} />}</h4>
                  </div>
                  <p>{editor ? <InlineStoryText value={item.teaser} path={[...path, 'items', index, 'teaser']} editor={editor} selectionId={selectionId} label={`Topic ${index + 1} teaser`} placeholder="Tease what a deeper walkthrough could cover" multiline /> : <StoryLines value={item.teaser} />}</p>
                  {(editor || item.link?.label?.trim()) && item.link && (editor ? <span className={styles.followUpLinkLabel}><InlineStoryText value={item.link.label ?? ''} path={[...path, 'items', index, 'link', 'label']} editor={editor} selectionId={selectionId} label={`Topic ${index + 1} link text`} placeholder="Explore this topic" /><ArrowUpRight aria-hidden="true" /></span> : <a className={styles.followUpLinkLabel} href={item.link.href}>{item.link.label}<ArrowUpRight aria-hidden="true" /></a>)}
                </div>
              </article>;
            })}
          </div>}
          {(editor || (block.cta?.label.trim() && block.cta.href)) && block.cta && <a className={styles.followUpCta} href={block.cta.href} onClick={editor ? (event) => event.preventDefault() : undefined}>{editor ? <InlineStoryText value={block.cta.label} path={[...path, 'cta', 'label']} editor={editor} selectionId={selectionId} label="Follow-up action text" placeholder="Continue the conversation" /> : block.cta.label}<ArrowUpRight aria-hidden="true" /></a>}
        </section>
      );
    }

    case 'steps':
      return (
        <ol className={styles.steps} {...identity}>
          {block.items.map((item, i) => (
            <li key={i}>
              <span className={styles.stepIndex} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <p className={styles.stepTitle}>{editor ? <InlineStoryText value={item.title} path={[...path, 'items', i, 'title']} editor={editor} selectionId={selectionId} label={`Step ${i + 1} title`} placeholder="Untitled step" /> : item.title}</p>
                <p className={styles.stepBody}>{editor ? <InlineStoryText value={item.body} path={[...path, 'items', i, 'body']} editor={editor} selectionId={selectionId} label={`Step ${i + 1} body`} placeholder="Add detail" multiline /> : <StoryLines value={item.body} />}</p>
              </div>
            </li>
          ))}
          {/* The next step's cell, shown in the selected block (or always, so
              an empty list can still be found and filled). */}
          {editor && (selected || block.items.length === 0) && (
            <li className={styles.stepAdd}>
              <InlineStoryAdd
                label="Add a step"
                focusLabel={`Step ${block.items.length + 1} title`}
                editor={editor}
                selectionId={selectionId}
                onAdd={() => editor.onBlockInput(chapterIndex, blockIndex, { ...block, items: [...block.items, { title: '', body: '' }] })}
              />
            </li>
          )}
        </ol>
      );
  }
}

/**
 * Rich text as readers get it: paragraphs (any of them large), subheadings
 * and lists in one flow, or one list. Large text is a paragraph style; the
 * editor's paragraphs carry the same class (story-prose-schema.ts), so both
 * render alike. `paragraphs` feeds the two-column prose layout, which reads
 * it from the element. Hard and soft returns read as the editor shows them
 * (StoryRichParagraph).
 */
function RichBody({ text, className, paragraphs, identity }: { text: RichTextValue; className: string; paragraphs?: number; identity?: StoryBlockIdentity }) {
  const format = text.format ?? 'paragraphs';
  const items = text.paragraphs.map((paragraph, index) => <StoryRichParagraph key={index} value={paragraph} />);
  if (format !== 'paragraphs') {
    const List = format === 'numbered' ? 'ol' : 'ul';
    const rows = items.map((_, index) => ({ index }));
    const visible = paragraphs === undefined ? rows : visibleStoryListRows(rows, text.paragraphs);
    return <List className={`${className} ${styles.proseList}`} data-paragraphs={paragraphs} {...identity}>{visible.map(({ index }) => <li key={index}>{items[index]}</li>)}</List>;
  }
  return (
    <div className={className} data-paragraphs={paragraphs} {...identity}>
      {storyProseRuns(text).map((run) => {
        if (run.type === 'list') return <RichList key={run.indices[0]} run={run} items={items} paragraphs={paragraphs === undefined ? undefined : text.paragraphs} />;
        if (run.type === 'heading') {
          const Heading = `h${run.level}` as const;
          return <Heading key={run.index}>{items[run.index]}</Heading>;
        }
        return <p key={run.index} className={run.large ? styles.lede : undefined} data-large={run.large || undefined}>{items[run.index]}</p>;
      })}
    </div>
  );
}

function RichList({ run, items, paragraphs }: { run: StoryProseListRun; items: ReactNode[]; paragraphs?: readonly string[] }) {
  const List = run.format === 'numbered' ? 'ol' : 'ul';
  const stored = storyListRunRows(run);
  const rows = paragraphs ? visibleStoryListRows(stored, paragraphs) : stored;
  if (!rows.length) return null;
  return <List className={styles.proseList}>{rows.map(row => (
    <li key={row.index} data-large={row.large || undefined}>
      {row.large ? <p data-large="true">{items[row.index]}</p> : items[row.index]}
      {row.children?.map(child => <RichList key={child.indices[0]} run={child} items={items} paragraphs={paragraphs} />)}
    </li>
  ))}</List>;
}

type InsightBlock = Extract<StoryBlock, { type: 'insight' }>;
const MAX_INSIGHT_COLUMNS = 4;
/** A heading with nothing under it isn't a point yet: readers skip it. Text
 *  or media makes it one. */
const insightColumnHasContent = (column: StoryInsightColumn) => !isEmptyRichText(column.body) || Boolean(column.media?.length);

/** The thin hex from the logo, as the label's mark. */
function HexMark() {
  return <svg className={styles.insightLabelMark} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7Z" /></svg>;
}

/**
 * A finding as a headline, its points as labelled columns. Everything the
 * reader sees is authored: the label, the headings, how many points there
 * are and which one is set apart. Readers never get an empty part; the
 * editor shows each one with its placeholder so it can be filled.
 */
function Insight({ block, editor, path, selectionId, identity, selected = false, chapterIndex, blockIndex, titleId }: { block: InsightBlock; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity; selected?: boolean; chapterIndex: number; blockIndex: number; titleId: string }) {
  const update = (next: InsightBlock) => editor?.onBlockInput(chapterIndex, blockIndex, next);
  const columns = block.columns.map((column, index) => ({ column, index })).filter(({ column }) => editor || insightColumnHasContent(column));
  const steps = (block.steps ?? []).map((step, index) => ({ step, index })).filter(({ step }) => editor || step.trim());
  const footer = block.footer && (editor || !isEmptyRichText(block.footer.body)) ? block.footer : null;
  const showLabel = block.label !== undefined && (editor || block.label.trim());
  const showTitle = Boolean(editor || block.title.trim());
  const bodyClass = editor ? `${styles.prose} ${styles.authoringProse} ${styles.insightBody}` : `${styles.prose} ${styles.insightBody}`;

  return (
    <section
      className={styles.insight}
      data-layout={block.layout ?? 'columns'}
      data-surface={block.surface ?? 'card'}
      // An unset title follows the section's composition: full-width in a
      // one-column chapter, measured in a two-column editorial chapter.
      // Explicit `measure` and `full` choices remain authoritative.
      data-title-width={block.titleWidth ?? 'auto'}
      aria-labelledby={showTitle ? titleId : undefined}
      {...identity}
    >
      {(showLabel || showTitle) && (
        <header className={styles.insightHead}>
          {/* A line of the author's own, above the title — not a heading. */}
          {showLabel && (
            <p className={styles.insightLabel}>
              <HexMark />
              <span className={styles.insightLabelText}>{editor ? <InlineStoryText value={block.label ?? ''} path={[...path, 'label']} editor={editor} selectionId={selectionId} label="Insight label" placeholder="Add a label" /> : block.label}</span>
            </p>
          )}
          {showTitle && (
            <h3 id={titleId} className={styles.insightTitle}>
              {editor ? <InlineStoryText value={block.title} path={[...path, 'title']} editor={editor} selectionId={selectionId} label="Insight title" placeholder="State the insight" multiline /> : <StoryLines value={block.title} />}
            </h3>
          )}
        </header>
      )}
      {columns.length > 0 && (
        <div className={styles.insightColumns} data-count={Math.min(columns.length, MAX_INSIGHT_COLUMNS)}>
          {columns.map(({ column, index }) => (
            <div key={column.id ?? index} className={styles.insightColumn} data-highlight={column.highlight || undefined}>
              {(editor || column.label.trim()) && (
                <h4 className={styles.insightColumnLabel}>
                  {editor ? <InlineStoryText value={column.label} path={[...path, 'columns', index, 'label']} editor={editor} selectionId={selectionId} label={`Column ${index + 1} heading`} placeholder="Add a heading" /> : column.label}
                </h4>
              )}
              {editor ? (
                <div className={bodyClass}>
                  <editor.ui.Prose
                    value={column.body}
                    onChange={(body) => update({ ...block, columns: block.columns.map((item, at) => (at === index ? { ...item, body } : item)) })}
                    selectionId={selectionId}
                    editor={editor}
                    label={`Column ${index + 1} text`}
                    placeholder="Add detail"
                  />
                </div>
              ) : !isEmptyRichText(column.body) && <RichBody text={column.body} className={bodyClass} />}
              {column.media && column.media.length > 0 && (
                <div className={styles.insightMedia} data-count={Math.min(column.media.length, 2)}>
                  {column.media.map((media, at) => (
                    <StoryMedia
                      key={at}
                      media={media}
                      frame="inset"
                      sizes="(min-width: 1024px) 640px, 100vw"
                      editor={editor}
                      path={[...path, 'columns', index, 'media', at]}
                      selectionId={selectionId}
                      headingLevel={4}
                    />
                  ))}
                </div>
              )}
              {/* Media joins a point on the page; order and removal are in Settings. */}
              {editor && selected && (
                <InlineStoryAdd
                  label="Add image"
                  focusLabel="Empty image placeholder"
                  editor={editor}
                  selectionId={selectionId}
                  onAdd={() => update({ ...block, columns: block.columns.map((item, at) => (at === index ? { ...item, media: [...(item.media ?? []), { kind: 'image', alt: '' }] } : item)) })}
                  className={styles.insightMediaAdd}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {/* Columns grow on the page; reordering and removing live in Settings. */}
      {editor && (selected || block.columns.length === 0) && block.columns.length < MAX_INSIGHT_COLUMNS && (
        <InlineStoryAdd
          label="Add a column"
          focusLabel={`Column ${block.columns.length + 1} heading`}
          editor={editor}
          selectionId={selectionId}
          onAdd={() => update({ ...block, columns: [...block.columns, { id: `column-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`, label: '', body: { paragraphs: [''] } }] })}
          className={styles.insightAdd}
        />
      )}
      {steps.length > 0 && (
        <ol className={styles.insightSteps} aria-label="Steps">
          {steps.map(({ step, index }, at) => (
            <li key={index}>
              <span aria-hidden="true">{String(at + 1).padStart(2, '0')}</span>
              <strong>{editor ? <InlineStoryText value={step} path={[...path, 'steps', index]} editor={editor} selectionId={selectionId} label={`Insight step ${index + 1}`} placeholder="Untitled step" /> : step}</strong>
            </li>
          ))}
        </ol>
      )}
      {editor && selected && (
        <InlineStoryAdd
          label="Add a step"
          focusLabel={`Insight step ${(block.steps ?? []).length + 1}`}
          editor={editor}
          selectionId={selectionId}
          onAdd={() => update({ ...block, steps: [...(block.steps ?? []), ''] })}
          className={styles.insightAdd}
        />
      )}
      {footer && (
        <div className={styles.insightFooter}>
          {(editor || footer.label.trim()) && (
            <h4 className={styles.insightColumnLabel}>
              {editor ? <InlineStoryText value={footer.label} path={[...path, 'footer', 'label']} editor={editor} selectionId={selectionId} label="Closing line heading" placeholder="Add a heading" /> : footer.label}
            </h4>
          )}
          {editor ? (
            <div className={bodyClass}>
              <editor.ui.Prose
                value={footer.body}
                onChange={(body) => update({ ...block, footer: { ...footer, body } })}
                selectionId={selectionId}
                editor={editor}
                label="Closing line text"
                placeholder="Add a closing line"
              />
            </div>
          ) : <RichBody text={footer.body} className={bodyClass} />}
        </div>
      )}
    </section>
  );
}

export const SPACER_SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
] as const;
export const SPACER_LABEL = Object.fromEntries(SPACER_SIZES.map((choice) => [choice.value, choice.label])) as Record<(typeof SPACER_SIZES)[number]['value'], string>;

type TableBlock = Extract<StoryBlock, { type: 'table' }>;

/**
 * A table of plain-text cells. The first row is the column headings unless
 * the author turned that off; every cell is edited where it sits,
 * and rows and columns come and go from the block's ⋮⋮ menu. On a phone a
 * wide table scrolls sideways inside its own frame, never the page.
 */
function StoryTable({ block, editor, path, selectionId, identity }: { block: TableBlock; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity }) {
  const header = block.headerRow !== false;
  const cell = (value: string, row: number, column: number, heading: boolean) => (editor
    ? <InlineStoryText value={value} path={[...path, 'rows', row, column]} editor={editor} selectionId={selectionId} label={`Row ${row + 1}, column ${column + 1}`} placeholder={heading ? 'Heading' : 'Cell'} multiline />
    : <StoryLines value={value} />);
  const [head, ...body] = header ? block.rows : [null, ...block.rows];
  const offset = header ? 1 : 0;
  return (
    <figure className={styles.table} {...identity}>
      {/* A keyboard user scrolls a wide table from its frame. */}
      <div className={styles.tableFrame} tabIndex={editor ? undefined : 0} role={editor ? undefined : 'region'} aria-label={editor ? undefined : block.caption || 'Table'}>
        <table>
          {head && <thead><tr>{head.map((value, column) => <th key={column} scope="col">{cell(value, 0, column, true)}</th>)}</tr></thead>}
          <tbody>
            {body.map((row, index) => (
              <tr key={index}>{(row ?? []).map((value, column) => <td key={column}>{cell(value, index + offset, column, false)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {(block.caption || editor) && <figcaption className={styles.groupCaption}>{editor ? <InlineStoryText value={block.caption ?? ''} path={[...path, 'caption']} editor={editor} selectionId={selectionId} label="Table caption" placeholder="Add caption" multiline /> : <StoryLines value={block.caption} />}</figcaption>}
    </figure>
  );
}

type GalleryBlock = Extract<StoryBlock, { type: 'gallery' }>;

/** The text column a row shares out, less the gaps between its images. */
const ROW_WIDTH = 1104;
const ROW_GAP = 24;

/**
 * An image group. Every image keeps its own shape — nothing is cropped to
 * make a tidy layout — and its own heading above it:
 * - `horizontal`: one row, columns sized by aspect ratio so frames of
 *   different shapes share a height; it stacks on narrow screens.
 * - `vertical`: a stack, each image at full width with its caption.
 * - `grid`: one plate, the columns running like a masonry wall.
 * A still opens full size like any other, and an empty slot in the editor
 * takes a dropped file.
 */
function MediaGroup({ block, editor, path, selectionId, identity, selected = false, chapterIndex, blockIndex }: { block: GalleryBlock; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity; selected?: boolean; chapterIndex: number; blockIndex: number }) {
  const layout = block.layout ?? 'grid';
  const columns = block.columns ?? 'three';
  const count = Math.max(block.items.length, 1);
  const alignment = layout === 'horizontal' ? block.alignment : undefined;
  const sizes = layout === 'grid'
    ? (columns === 'two' ? '(min-width: 1024px) 540px, 100vw' : '(min-width: 1024px) 360px, 50vw')
    : layout === 'vertical' ? '(min-width: 1152px) 1104px, 100vw' : `(min-width: 768px) ${Math.round((ROW_WIDTH - ROW_GAP * (count - 1)) / count)}px, 100vw`;
  const media = (item: StoryMediaData, index: number) => (
    <StoryMedia
      media={item}
      frame={layout === 'grid' ? 'inset' : undefined}
      hideCaption={layout !== 'vertical'}
      galleryAlignment={alignment}
      sizes={sizes}
      editor={editor}
      path={[...path, 'items', index]}
      selectionId={selectionId}
      headingLevel={4}
    />
  );
  const add = editor && (selected || block.items.length === 0) && (
    <InlineStoryAdd
      label="Add an image"
      focusLabel="Empty image placeholder"
      editor={editor}
      selectionId={selectionId}
      onAdd={() => editor.onBlockInput(chapterIndex, blockIndex, { ...block, items: [...block.items, { kind: 'image', alt: '' }] })}
      className={styles.groupAdd}
    />
  );
  return (
    <figure className={styles.group} data-layout={layout} data-alignment={alignment} data-columns={layout === 'grid' ? columns : undefined} {...identity}>
      {layout === 'grid' ? (
        <div className={styles.galleryPlate} style={storyMatStyle(sharedMatColor(block.items))}>
          {block.items.length > 0 && (
            <ul className={styles.galleryGrid}>
              {block.items.map((item, index) => <li key={index} data-media-item={editor ? index : undefined}>{media(item, index)}</li>)}
            </ul>
          )}
          {add}
        </div>
      ) : <>
        {block.items.length > 0 && (
          <div className={styles.groupItems} style={{ '--group-cols': block.items.map((item) => alignment ? 'minmax(0, 1fr)' : `minmax(0, ${(item.aspect ?? 1.6).toFixed(3)}fr)`).join(' ') } as CSSProperties}>
            {block.items.map((item, index) => <div key={index} className={styles.groupItem} data-media-item={editor ? index : undefined}>{media(item, index)}</div>)}
          </div>
        )}
        {add}
      </>}
      {(block.caption || editor) && <figcaption className={styles.groupCaption}>{editor ? <InlineStoryText value={block.caption ?? ''} path={[...path, 'caption']} editor={editor} selectionId={selectionId} label="Image group caption" placeholder="Add caption" multiline /> : <StoryLines value={block.caption} />}</figcaption>}
    </figure>
  );
}

const fromMetric = (m: Metric): StoryOutcome => ({
  value: m.value,
  label: m.description,
  baseline: m.baseline,
  note: m.context,
});

const STATUS_LABEL = { held: 'Held', revised: 'Revised later', reversed: 'Reversed' } as const;

/** The call, the real alternatives, what it cost, and whether it held. */
function Decision({ block, editor, path, selectionId, identity, selected = false, chapterIndex, blockIndex }: { block: Extract<StoryBlock, { type: 'decision' }>; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity; selected?: boolean; chapterIndex: number; blockIndex: number }) {
  if (block.presentation === 'editorial') {
    const mechanism = block.mechanism ?? [];
    return (
      <section className={styles.decisionEditorial} aria-labelledby={`decision-${block.call.replace(/\s+/g, '-').toLowerCase()}`} {...identity}>
        <header className={styles.decisionEditorialHead}>
          <h3 id={`decision-${block.call.replace(/\s+/g, '-').toLowerCase()}`} className={styles.decisionEditorialCall}>
            {editor ? <InlineStoryText value={block.call} path={[...path, 'call']} editor={editor} selectionId={selectionId} label="Decision call" multiline /> : <StoryLines value={block.call} />}
          </h3>
        </header>
        <div className={styles.decisionEditorialInputs}>
          {(block.context || editor) && (
            <div className={styles.decisionEditorialInput}>
              <span>{editor ? <InlineStoryText value={block.contextLabel ?? 'Known inputs'} path={[...path, 'contextLabel']} editor={editor} selectionId={selectionId} label="Known inputs label" /> : (block.contextLabel ?? 'Known inputs')}</span>
              <p>{editor ? <InlineStoryText value={block.context ?? ''} path={[...path, 'context']} editor={editor} selectionId={selectionId} label="Decision context" placeholder="Add known inputs" multiline /> : <StoryLines value={block.context} />}</p>
            </div>
          )}
          <div className={styles.decisionEditorialInput}>
            <span>{editor ? <InlineStoryText value={block.rationaleLabel ?? 'Design rationale'} path={[...path, 'rationaleLabel']} editor={editor} selectionId={selectionId} label="Design rationale label" /> : (block.rationaleLabel ?? 'Design rationale')}</span>
            <p>{editor ? <InlineStoryText value={block.because} path={[...path, 'because']} editor={editor} selectionId={selectionId} label="Decision rationale" multiline /> : <StoryLines value={block.because} />}</p>
          </div>
          {(block.cost || editor) && (
            <aside className={styles.decisionEditorialInput} data-tradeoff>
              <span>{editor ? <InlineStoryText value={block.tradeoffLabel ?? 'Page-owner trade-off'} path={[...path, 'tradeoffLabel']} editor={editor} selectionId={selectionId} label="Trade-off label" /> : (block.tradeoffLabel ?? 'Page-owner trade-off')}</span>
              <p>{editor ? <InlineStoryText value={block.cost ?? ''} path={[...path, 'cost']} editor={editor} selectionId={selectionId} label="Decision trade-off" placeholder="Add trade-off" multiline /> : <StoryLines value={block.cost} />}</p>
            </aside>
          )}
        </div>
        {mechanism.length > 0 && <ol className={styles.decisionMechanism} aria-label="How the decision worked">
          {mechanism.map((step, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span><strong>{editor ? <InlineStoryText value={step} path={[...path, 'mechanism', index]} editor={editor} selectionId={selectionId} label={`Decision mechanism step ${index + 1}`} placeholder="Untitled step" /> : step}</strong></li>)}
        </ol>}
        {/* Steps are optional, so an empty diagram stays off the canvas (as
            for readers) until the block is selected and offers the first. */}
        {editor && selected && (
          <InlineStoryAdd
            label="Add a step"
            focusLabel={`Decision mechanism step ${mechanism.length + 1}`}
            editor={editor}
            selectionId={selectionId}
            onAdd={() => editor.onBlockInput(chapterIndex, blockIndex, { ...block, mechanism: [...mechanism, ''] })}
            className={styles.decisionMechanismAdd}
          />
        )}
        {(block.mine || editor) && (
          <p className={styles.decisionOwnership}>
            <span>{editor ? <InlineStoryText value={block.contributionLabel ?? 'My contribution'} path={[...path, 'contributionLabel']} editor={editor} selectionId={selectionId} label="Contribution label" /> : (block.contributionLabel ?? 'My contribution')}</span>
            {editor ? <InlineStoryText value={block.mine ?? ''} path={[...path, 'mine']} editor={editor} selectionId={selectionId} label="My contribution" placeholder="Add contribution" multiline /> : <StoryLines value={block.mine} />}
          </p>
        )}
      </section>
    );
  }

  const heading = (key: 'contextLabel' | 'alternativesLabel' | 'rationaleLabel' | 'tradeoffLabel', fallback: string, name: string) => (
    <StoryHeading value={block[key]} fallback={fallback} path={[...path, key]} editor={editor} selectionId={selectionId} label={name} />
  );
  const rows: { key: string; label: ReactNode; body: ReactNode }[] = [];
  if (block.context || editor) rows.push({ key: 'context', label: heading('contextLabel', 'Context', 'Context heading'), body: editor ? <InlineStoryText value={block.context ?? ''} path={[...path, 'context']} editor={editor} selectionId={selectionId} label="Decision context" placeholder="Add context" multiline /> : <StoryLines value={block.context} /> });
  if (block.options?.length) {
    rows.push({
      key: 'options',
      label: heading('alternativesLabel', 'Options', 'Options heading'),
      body: (
        <ul className={styles.decisionOptions}>
          {block.options.map((o, index) => (
            <li key={`${index}-${o.label}`}>
              <span className={styles.decisionOption}>{editor ? <InlineStoryText value={o.label} path={[...path, 'options', index, 'label']} editor={editor} selectionId={selectionId} label={`Decision option ${index + 1}`} /> : o.label}</span> — {editor ? <InlineStoryText value={o.whyNot} path={[...path, 'options', index, 'whyNot']} editor={editor} selectionId={selectionId} label={`Why option ${index + 1} was not chosen`} multiline /> : <StoryLines value={o.whyNot} />}
            </li>
          ))}
        </ul>
      ),
    });
  } else if (block.over) {
    rows.push({ key: 'over', label: heading('alternativesLabel', 'Over', 'Instead of heading'), body: editor ? <InlineStoryText value={block.over} path={[...path, 'over']} editor={editor} selectionId={selectionId} label="Rejected option" /> : block.over });
  }
  rows.push({ key: 'because', label: heading('rationaleLabel', 'Because', 'Because heading'), body: editor ? <InlineStoryText value={block.because} path={[...path, 'because']} editor={editor} selectionId={selectionId} label="Decision rationale" multiline /> : <StoryLines value={block.because} /> });
  if (block.cost || editor) rows.push({ key: 'cost', label: heading('tradeoffLabel', 'Cost', 'Cost heading'), body: editor ? <InlineStoryText value={block.cost ?? ''} path={[...path, 'cost']} editor={editor} selectionId={selectionId} label="Decision cost" placeholder="Add cost" multiline /> : <StoryLines value={block.cost} /> });

  const meta = [block.status ? STATUS_LABEL[block.status] : null, block.mine].filter(Boolean);

  return (
    // Narrow media (a component, a crop) sits beside the card; wide screen
    // recordings stack under it at full width so their text stays legible.
    <div
      className={styles.decisionWrap}
      data-media={block.media ? ((block.media.aspect ?? 1.6) >= 1.3 ? 'stacked' : 'side') : undefined}
      {...identity}
    >
      <div className={styles.decision}>
        <p className={styles.decisionLabel}>
          <span><StoryHeading value={block.callLabel} fallback="The call" path={[...path, 'callLabel']} editor={editor} selectionId={selectionId} label="Call heading" /></span>
          {meta.length > 0 && <span className={styles.decisionMeta}>{meta.join(' · ')}</span>}
        </p>
        <p className={styles.decisionCall}>{editor ? <InlineStoryText value={block.call} path={[...path, 'call']} editor={editor} selectionId={selectionId} label="Decision call" multiline /> : <StoryLines value={block.call} />}</p>
        <dl className={styles.decisionWhy}>
          {rows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.body}</dd>
            </div>
          ))}
        </dl>
      </div>
      {block.media && <StoryMedia media={block.media} className={styles.decisionMedia} sizes="(min-width: 1024px) 540px, 100vw" editor={editor} path={[...path, 'media']} selectionId={selectionId} headingLevel={4} />}
    </div>
  );
}

export function attribution(quote: Quote) {
  return [quote.name, quote.role].filter(Boolean).join(', ');
}

function PullQuote({ quote, editor, path, selectionId, identity }: { quote: Quote; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity }) {
  return (
    <figure className={styles.quote} {...identity}>
      <blockquote>
        <p>{editor ? <InlineStoryText value={quote.quote} path={[...path, 'quote']} editor={editor} selectionId={selectionId} label="Quotation" placeholder="Add a quote" multiline /> : <StoryLines value={quote.quote} />}</p>
      </blockquote>
      <figcaption>
        {editor ? <><InlineStoryText value={quote.name} path={[...path, 'name']} editor={editor} selectionId={selectionId} label="Quote attribution" placeholder="Add a name" />{quote.role || editor ? ', ' : ''}<InlineStoryText value={quote.role} path={[...path, 'role']} editor={editor} selectionId={selectionId} label="Quote attribution role" placeholder="Add role" /></> : attribution(quote)}
        {(quote.context || editor) ? <span className={styles.quoteContext}>{editor ? <InlineStoryText value={quote.context ?? ''} path={[...path, 'context']} editor={editor} selectionId={selectionId} label="Quote context" placeholder="Add context" multiline /> : <StoryLines value={quote.context} />}</span> : null}
      </figcaption>
    </figure>
  );
}

function OutcomeMeta({ outcome, editor, path, selectionId, metricMode = false }: { outcome: StoryOutcome; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; metricMode?: boolean }) {
  const bits = [outcome.baseline, outcome.timeframe].filter(Boolean).join(' · ');
  return (
    <>
      {(outcome.evidence || bits || editor) && (
        <p className={styles.outcomeContext}>
          {outcome.evidence && <span className={styles.evidence}><StoryHeading value={outcome.evidenceLabel} fallback={EVIDENCE_LABEL[outcome.evidence]} path={[...path, 'evidenceLabel']} editor={editor} selectionId={selectionId} label="Evidence tag" /></span>}
          {editor ? (
            <>
              <InlineStoryText value={outcome.baseline ?? ''} path={[...path, 'baseline']} editor={editor} selectionId={selectionId} label="Outcome baseline" placeholder="Add baseline" />
              {!metricMode && <> · <InlineStoryText value={outcome.timeframe ?? ''} path={[...path, 'timeframe']} editor={editor} selectionId={selectionId} label="Outcome timeframe" placeholder="Add timeframe" /></>}
            </>
          ) : bits}
        </p>
      )}
      {(outcome.note || editor) && <p className={styles.outcomeNoteLine}>{editor ? <InlineStoryText value={outcome.note ?? ''} path={[...path, metricMode ? 'context' : 'note']} editor={editor} selectionId={selectionId} label="Outcome evidence note" placeholder="Add evidence note" multiline /> : <StoryLines value={outcome.note} />}</p>}
    </>
  );
}

/** Results read asymmetrically by default: the outcome that matters most,
 *  large, then the supporting ones as a ledger beside it. `even` sets them
 *  side by side at one size instead, for results that weigh the same. Never a
 *  centred billboard, and every number carries how it's known. */
function Outcomes({ items, note, layout = 'lead', editor, path, selectionId, identity, metricMode = false }: { items: StoryOutcome[]; note?: string; layout?: Extract<StoryBlock, { type: 'outcomes' }>['layout']; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity; metricMode?: boolean }) {
  if (items.length === 0) return editor ? <p className={styles.outcomeNote} {...identity}>No {metricMode ? 'metrics' : 'outcomes'} yet. Add one in the block’s settings.</p> : null;
  const visible = items.filter((item) => editor || !item.hidden);
  if (visible.length === 0) return null;
  const [lead, ...rest] = visible;
  const leadIndex = items.indexOf(lead);
  const row = (m: StoryOutcome) => {
    const index = items.indexOf(m);
    return (
      <li key={m.id ?? index} data-story-hidden={editor && m.hidden || undefined}>
        <p className={styles.outcomeValue}>{editor ? <InlineStoryText value={m.value} path={[...path, 'items', index, 'value']} editor={editor} selectionId={selectionId} label={`Outcome ${index + 1} value`} /> : m.value}</p>
        <div>
          <p className={styles.outcomeLabel}>{editor ? <InlineStoryText value={m.label} path={[...path, 'items', index, metricMode ? 'description' : 'label']} editor={editor} selectionId={selectionId} label={`Outcome ${index + 1} label`} multiline /> : <StoryLines value={m.label} />}</p>
          <OutcomeMeta outcome={m} editor={editor} path={[...path, 'items', index]} selectionId={selectionId} metricMode={metricMode} />
        </div>
      </li>
    );
  };
  if (layout === 'even') {
    // Up to three across; four sit two by two rather than three and one.
    const columns = visible.length === 4 ? 2 : Math.min(visible.length, 3);
    return (
      <div className={styles.outcomes} data-layout="even" {...identity}>
        <ul className={styles.outcomeGrid} style={{ '--outcome-cols': columns } as CSSProperties}>{visible.map(row)}</ul>
        {(note || editor) && <p className={styles.outcomeNote}>{editor ? <InlineStoryText value={note ?? ''} path={[...path, 'note']} editor={editor} selectionId={selectionId} label="Outcome group note" placeholder="Add group note" multiline /> : <StoryLines value={note} />}</p>}
      </div>
    );
  }
  return (
    <div className={styles.outcomes} {...identity}>
      <div className={styles.outcomeLead}>
        <p className={styles.outcomeLeadValue}>{editor ? <InlineStoryText value={lead.value} path={[...path, 'items', leadIndex, 'value']} editor={editor} selectionId={selectionId} label="Lead outcome value" /> : lead.value}</p>
        <p className={styles.outcomeLeadLabel}>{editor ? <InlineStoryText value={lead.label} path={[...path, 'items', leadIndex, metricMode ? 'description' : 'label']} editor={editor} selectionId={selectionId} label="Lead outcome label" multiline /> : <StoryLines value={lead.label} />}</p>
        <OutcomeMeta outcome={lead} editor={editor} path={[...path, 'items', leadIndex]} selectionId={selectionId} metricMode={metricMode} />
      </div>
      {rest.length > 0 && <ul className={styles.outcomeLedger}>{rest.map(row)}</ul>}
      {(note || editor) && <p className={styles.outcomeNote}>{editor ? <InlineStoryText value={note ?? ''} path={[...path, 'note']} editor={editor} selectionId={selectionId} label="Outcome group note" placeholder="Add group note" multiline /> : <StoryLines value={note} />}</p>}
    </div>
  );
}

const LEDGER_ROWS: { key: 'led' | 'made' | 'influenced' | 'notMe'; labelKey: 'ledLabel' | 'madeLabel' | 'influencedLabel' | 'notMeLabel'; label: string }[] = [
  { key: 'led', labelKey: 'ledLabel', label: 'I led' },
  { key: 'made', labelKey: 'madeLabel', label: 'I made' },
  { key: 'influenced', labelKey: 'influencedLabel', label: 'I influenced' },
  { key: 'notMe', labelKey: 'notMeLabel', label: 'Not mine' },
];

/** Who did what. Partners are named by role and what they owned. */
function Ledger({ ledger, editor, path, selectionId, identity }: { ledger: StoryLedger; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; identity?: StoryBlockIdentity }) {
  const empty = !LEDGER_ROWS.some(({ key }) => ledger[key]?.length) && !ledger.partners?.length;
  return (
    <dl className={styles.ledger} {...identity}>
      {editor && empty && <div className={styles.ledgerRow}><dt>Who did what</dt><dd className={styles.emptyHint}>Add what you led, made and influenced from the block menu<span aria-hidden="true"> (⋮⋮)</span>.</dd></div>}
      {LEDGER_ROWS.map(({ key, labelKey, label }) => {
        const items = ledger[key];
        if (!items?.length) return null;
        return (
          <div key={key} className={styles.ledgerRow}>
            <dt><StoryHeading value={ledger[labelKey]} fallback={label} path={[...path, labelKey]} editor={editor} selectionId={selectionId} label={`${label} heading`} /></dt>
            <dd>
              <ul>
                {items.map((item, index) => (
                  <li key={`${index}-${item}`}>{editor ? <InlineStoryText value={item} path={[...path, key, index]} editor={editor} selectionId={selectionId} label={`${label} item ${index + 1}`} multiline /> : <StoryLines value={item} />}</li>
                ))}
              </ul>
            </dd>
          </div>
        );
      })}
      {ledger.partners?.length ? (
        <div className={styles.ledgerRow}>
          <dt><StoryHeading value={ledger.partnersLabel} fallback="Partners" path={[...path, 'partnersLabel']} editor={editor} selectionId={selectionId} label="Partners heading" /></dt>
          <dd>
            <ul>
              {ledger.partners.map((p, index) => (
                <li key={`${index}-${p.role}`}>
                  <span className={styles.ledgerRole}>{editor ? <InlineStoryText value={p.role} path={[...path, 'partners', index, 'role']} editor={editor} selectionId={selectionId} label={`Partner ${index + 1} role`} /> : p.role}</span> — {editor ? <InlineStoryText value={p.owned} path={[...path, 'partners', index, 'owned']} editor={editor} selectionId={selectionId} label={`Partner ${index + 1} ownership`} multiline /> : <StoryLines value={p.owned} />}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

type CustomBlockData = Extract<StoryBlock, { type: 'custom' }>;

/**
 * A block the host provides, looked up by name in the `blocks` registry.
 * Readers get nothing for a name the registry doesn't know (a publish check
 * warns about it first); the editor shows a labelled placeholder so the
 * block can still be found, moved or removed.
 */
function CustomBlock({ block, editor, identity }: { block: CustomBlockData; editor?: StoryRenderEditor; identity: StoryBlockIdentity }) {
  const { blocks } = useStoryEnvironment();
  const definition = Object.prototype.hasOwnProperty.call(blocks, block.component) ? blocks[block.component] : undefined;
  if (!definition) {
    if (!editor) return null;
    return (
      <div className={styles.customMissing} role="note" data-custom-block={block.component} {...identity}>
        <strong>{block.title?.trim() || 'Custom block'}</strong>
        <span>{block.component ? `No component named “${block.component}” is registered.` : 'Choose a component for this block.'}</span>
      </div>
    );
  }
  const { Render } = definition;
  return (
    <figure className={styles.custom} data-custom-block={block.component} {...identity}>
      {block.title?.trim() && <h3 className={styles.customTitle}>{block.title}</h3>}
      <Render props={block.props ?? definition.defaultProps ?? {}} title={block.title} caption={block.caption} editing={Boolean(editor)} />
      {block.caption?.trim() && <figcaption className={styles.groupCaption}><StoryLines value={block.caption} /></figcaption>}
    </figure>
  );
}
