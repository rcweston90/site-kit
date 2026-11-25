import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, Extension, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { getMarkRange } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, PanelTopDashed, Plus, Settings2, Trash2 } from 'lucide-react';
import type { EditorView } from '@tiptap/pm/view';
import type { Story, StoryBlock, StoryMedia as StoryMediaData } from '@rcweston/story-core';
import type { StoryCompany } from '@rcweston/story-react';
import { EDITOR_UI } from '../editing-slots.js';
import { preserveStoryHistoryViewport, restoredStorySelection, storySnapshotTransaction } from './history-viewport.js';
import { hasInlineAssetCopy, inlineAssetPath, type InlineAssetTarget } from './asset-copy.js';
import { calloutAppearanceAttributes } from '@rcweston/story-core';
import { StoryBlocks, StoryCalloutIcon } from '@rcweston/story-react';
import { StoryMediaEmptyEditorContext } from '@rcweston/story-react';
import { EmptyAsset } from './empty-asset.js';
import { AddGroupImages } from './AddGroupImages.js';
import { appendGroupImages, brokenGroupBlocks, canAddImage, currentImageTarget, replaceImageBlocks } from './image-groups.js';
import { emptyAssetState, emptyMediaState } from './empty-asset-state.js';
import { StoryHero } from '@rcweston/story-react';
import { StoryCredits, StoryHindsight } from '@rcweston/story-react';
import { StoryDecisions } from '@rcweston/story-react';
import { resolveHeroMediaSlots } from '@rcweston/story-react';
import { HighlightMenu, isTextStyleOption, LinkPopover, ListToggleButton, MoreInlineFormats, TEXT_STYLES } from '../TiptapAuthoringToolbar.js';
import { highlightColor } from '@rcweston/story-core';
import { mediaEditorLabel } from '@rcweston/story-core';
import { applyStoryTextFamily, listToggleState, setStoryTextStyle, storyProseExtensions, toggleStoryList, storyTextFamilyState, type StoryTextFamily } from '../story-prose-schema.js';
import { storyHeroPresentation } from '@rcweston/story-react';
import { updateStoryField, updateStoryFieldValue } from '@rcweston/story-core';
import { type StoryRenderEditor } from '@rcweston/story-react';
import { BLOCK_GROUPS, blockMatches } from '../block-catalog.js';
import { AuthoringCommandMenu, AuthoringCommandRow } from '../AuthoringCommandMenu.js';
import { AUTHORING_COMMAND_MENU_MAX_HEIGHT } from '../menu.js';
import { createStoryBlock } from '../model.js';
import { assetSettingsId, calloutNode, noteNode, quoteNode, storyToDocument, documentToStory } from './model.js';
import { insertMediaAt, MediaAnchor, mediaAnchorKey, mediaInsertionPoint } from './media-insertion.js';
import { StoryMediaObjectPreviewContext, storyMediaFiles, uploadStoryMedia, useStoryMediaUploadTarget } from '../media-upload-client.js';
import { adjacentAssetTarget, assetPointerTarget, movableAsset, moveStoryAsset } from './asset-reorder.js';
import { focusedChapterSelection } from './section-selection.js';
import { bodyInsertionLine, bodyInsertPlacement, insertBodyAsset } from './body-insert.js';
import { continuousStyles as styles, chromeStyles } from '../classes.js';
import { blockStyles as blockStyles } from '@rcweston/story-react';
import { storyStyles as storyStyles } from '@rcweston/story-react';

const TEXT_COMMANDS = {
  paragraph: 'text', large: 'large', heading2: 'heading2', heading: 'heading3',
  subheading: 'heading4', heading5: 'heading5', heading6: 'heading6', bullets: 'bullets',
} as const satisfies Record<string, StoryTextFamily | 'bullets'>;
const ASSET_COMMANDS = ['media', 'gallery', 'callout', 'note', 'quote', 'cta', 'divider', 'spacer'] as const;
type AssetKind = typeof ASSET_COMMANDS[number];
type TextKind = keyof typeof TEXT_COMMANDS;
type InsertKind = TextKind | AssetKind;
const SLASH_ACTIONS: InsertKind[] = [...(Object.keys(TEXT_COMMANDS) as TextKind[]), ...ASSET_COMMANDS];
const isTextCommand = (kind: InsertKind): kind is TextKind => Object.hasOwn(TEXT_COMMANDS, kind);
const COMMAND_ALIASES: Partial<Record<InsertKind, string[]>> = {
  paragraph: ['text', 'body', 'normal'], large: ['large', 'lede'],
  heading2: ['h2'], heading: ['heading', 'h3'], subheading: ['subheading', 'heading4', 'h4'],
  heading5: ['h5'], heading6: ['h6'], bullets: ['bullets', 'list'],
};
const COMMAND_LABELS: Partial<Record<InsertKind, string>> = {
  media: 'Image or media', gallery: 'Image group', note: 'Margin note',
  callout: 'Callout', quote: 'Quote', cta: 'Button', divider: 'Divider', spacer: 'Spacer',
};
const BLOCK_OFFERS = new Map(BLOCK_GROUPS.flatMap(group => group.blocks.map(offer => [offer.type, offer] as const)));
const matchingCommands = (command?: SlashCommand | null) => {
  const query = command?.text.slice(1).toLowerCase() ?? '';
  if (!query) return [...SLASH_ACTIONS];
  return SLASH_ACTIONS.filter(kind => {
    const offer = isTextCommand(kind) ? null : BLOCK_OFFERS.get(kind as StoryBlock['type']);
    return offer ? blockMatches(offer, COMMAND_LABELS[kind] ?? kind, query)
      : [kind, ...(COMMAND_ALIASES[kind] ?? [])].some(word => word.startsWith(query));
  });
};
const PLAIN_ASSET_FIELDS = new Set(['calloutTitle', 'storyNote', 'quoteText', 'quoteName', 'quoteRole', 'quoteContext']);
const INLINE_ASSETS = new Set(['storyCallout', 'storyNote', 'storyQuote']);

type SlashCommand = { from: number; to: number; text: string };
function slashCommandAtCaret(state: EditorState): SlashCommand | null {
  if (!(state.selection instanceof TextSelection) || !state.selection.empty) return null;
  const { $from } = state.selection;
  if ($from.depth !== 2 || $from.parent.type.name !== 'paragraph' || $from.parentOffset !== $from.parent.content.size) return null;
  const text = $from.parent.textContent;
  return /^\/\S*$/.test(text) ? { from: $from.start(), to: $from.end(), text } : null;
}

function sameSlashCommand(expected: SlashCommand, current: SlashCommand | null) {
  return current?.from === expected.from && current.to === expected.to && current.text === expected.text;
}

const ASSET_MOVE_MIME = 'application/x-story-asset-reorder';
type AssetDrag = { getPos: () => number | undefined; node: NodeViewProps['node'] };

type AssetContextValue = {
  requestSectionRemoval: (key: string, trigger: HTMLButtonElement) => void;
  openImageGroupUpload: (trigger: HTMLButtonElement, onAdd: (media: StoryMediaData[]) => boolean) => void;
  startAssetDrag: (drag: AssetDrag, event: ReactDragEvent<HTMLElement>) => void;
  moveAsset: (view: EditorView, from: number, to: number, label: string, focus?: 'up' | 'down') => void;
  story: Story;
  company?: StoryCompany | null;
  onChange: (story: Story) => void;
  onTextDraftChange: StoryRenderEditor['onTextDraftChange'];
  onEditStart: () => void;
  onEditEnd: () => void;
  onSettings: (id: string, element: HTMLElement, item?: number) => void;
  onHeroSettings: (id: 'hero-media' | 'hero-graphic', element: HTMLElement) => void;
  onRegionSettings: (id: 'hero-meta' | 'facts' | 'decisions' | 'hindsight' | 'credits', element: HTMLElement) => void;
};
const AssetContext = createContext<AssetContextValue | null>(null);

const regionEditor = (context: AssetContextValue, selectedId: string): StoryRenderEditor => ({
  selectedId,
  onSelect: () => undefined,
  onTextInput: (path, value) => context.onChange(updateStoryField(context.story, path, value)),
  // The contenteditable owns its draft DOM until blur. Committing each key to
  // the outer story would rebuild the Tiptap document and move its caret.
  onTextDraftChange: context.onTextDraftChange,
  onTextEditStart: context.onEditStart,
  onTextEditEnd: context.onEditEnd,
  onTextEditLeave: context.onEditEnd,
  onBlockInput: () => undefined,
  onChapterDrop: () => undefined,
  ui: EDITOR_UI,
});

function AssetView({ node, selected, deleteNode, editor, getPos }: NodeViewProps) {
  const context = useContext(AssetContext)!;
  const canUploadImage = Boolean(useStoryMediaUploadTarget());
  const block = node.attrs.block as StoryBlock;
  const origin = node.attrs.origin as InlineAssetTarget | null;
  const target = origin && ['metrics', 'outcomes', 'steps'].includes(block.type) ? { ...origin, block } : null;
  const assetPath = target && inlineAssetPath(context.story, target);
  const chapterIndex = typeof assetPath?.[1] === 'number' ? assetPath[1] : null;
  const blockIndex = typeof assetPath?.[3] === 'number' ? assetPath[3] : null;
  const chapterKey = chapterIndex !== null ? context.story.chapters[chapterIndex]?.key : undefined;
  const editableAsset = Boolean(target && chapterKey && hasInlineAssetCopy(block));
  const inlineCallout = node.type.name === 'storyCallout' && block.type === 'callout';
  const inlineNote = node.type.name === 'storyNote' && block.type === 'note';
  const inlineQuote = node.type.name === 'storyQuote' && block.type === 'quote';
  const label = block.type === 'media' ? mediaEditorLabel(block.media)
    : block.type === 'cta' ? 'Button' : block.type === 'gallery' ? 'Gallery' : block.type === 'custom' ? 'Custom block' : block.type;
  const availability = useEditorState({ editor, selector: ({ editor }) => {
    const pos = getPos();
    return {
      up: typeof pos === 'number' && adjacentAssetTarget(editor.state.doc, pos, -1) !== null,
      down: typeof pos === 'number' && adjacentAssetTarget(editor.state.doc, pos, 1) !== null,
    };
  } });
  const nudge = (direction: -1 | 1) => {
    const from = getPos();
    if (typeof from !== 'number') return;
    const to = adjacentAssetTarget(editor.state.doc, from, direction);
    if (to !== null) context.moveAsset(editor.view, from, to, label, direction === -1 ? 'up' : 'down');
  };
  const addAfter = () => {
    const pos = getPos();
    if (pos === undefined) return;
    editor.chain().insertContentAt(pos + node.nodeSize, { type: 'paragraph' }).setTextSelection(pos + node.nodeSize + 1).focus().run();
  };
  const commitAsset = (update: (current: StoryBlock) => StoryBlock) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const current = editor.state.doc.nodeAt(pos);
    if (current?.type.name !== 'storyAsset') return;
    const live = current.attrs.block as StoryBlock;
    if (live.type !== block.type || (block.id ? live.id !== block.id : live !== block)) return;
    const next = update(live);
    if (JSON.stringify(next) === JSON.stringify(live)) return;
    // Mutate only the asset attrs. Routing through outer setContent would
    // remount all node views while the author tabs to the next field.
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, block: next }));
  };
  const assetEditor: StoryRenderEditor | undefined = editableAsset && target && chapterKey && blockIndex !== null ? {
    ...regionEditor(context, `block:${chapterKey}:${block.id ?? blockIndex}`),
    onTextInput: (path, value) => {
      if (path[0] !== 'chapters' || path[2] !== 'blocks') return;
      commitAsset(current => updateStoryFieldValue(current, path.slice(4), value));
    },
    onTextDraftChange: (path, value, changed) => {
      const suffix = path.slice(4);
      context.onTextDraftChange(path, value, changed, current => {
        const latest = inlineAssetPath(current, target);
        return latest ? [...latest, ...suffix] : null;
      });
    },
    onBlockInput: (_chapterIndex, _blockIndex, next) => commitAsset(current => current.type === 'steps' && next.type === 'steps'
      ? { ...current, items: next.items } : current),
  } : undefined;
  const emptyState = emptyAssetState(block, Boolean(assetEditor));
  const open = (element: HTMLButtonElement, item?: number) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const point = editor.state.doc.resolve(pos);
    if (point.depth !== 1 || point.parent.type.name !== 'storySection') return;
    const id = block.id
      ? `block:${point.parent.attrs.key}:${block.id}`
      : assetSettingsId(editor.getJSON(), context.story, point.index(0), point.index(1));
    if (id) context.onSettings(id, element, item);
  };
  const replaceImages = (next: StoryBlock[]) => {
    if (editor.isDestroyed) return false;
    const live = currentImageTarget(editor.state.doc, getPos(), node.attrs.blockAnchor, block);
    if (!live) return false;
    const tr = replaceImageBlocks(editor.state, live.pos, live.block, next);
    if (!tr) return false;
    editor.view.dispatch(tr);
    return true;
  };
  const freshBlockId = () => createStoryBlock('media').id!;
  return <NodeViewWrapper data-document-asset="" data-asset-kind={block.type} data-story-block-anchor={node.attrs.blockAnchor || undefined} data-block={JSON.stringify(block)} className={styles.asset} data-selected={selected || undefined} contentEditable={inlineCallout || inlineNote || inlineQuote ? undefined : false}>
    <div className={styles.assetActions} contentEditable={false} role="group" aria-label={`${label} controls`}>
      <span>{block.hidden ? 'Hidden · ' : ''}{label}</span>
      <div className={styles.assetButtons}>
        <span draggable className={styles.dragAsset} data-asset-drag-grip="" aria-hidden="true" title={`Drag ${label}`}
          onDragStart={event => context.startAssetDrag({ getPos, node }, event)}><GripVertical aria-hidden="true" size={16} /></span>
        <button type="button" data-asset-reorder="up" aria-label={`Move ${label} up`} title="Move up" disabled={!availability?.up} onClick={() => nudge(-1)}><ArrowUp aria-hidden="true" size={16} /></button>
        <button type="button" data-asset-reorder="down" aria-label={`Move ${label} down`} title="Move down" disabled={!availability?.down} onClick={() => nudge(1)}><ArrowDown aria-hidden="true" size={16} /></button>
        {!inlineNote && !inlineQuote && <button type="button" aria-label={inlineCallout ? 'Callout appearance' : `Edit ${label}`}
          data-story-image-settings-trigger={block.type === 'media' && label === 'Image' ? block.id ?? '' : undefined} onClick={(event) => open(event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>{inlineCallout ? 'Appearance' : ['note', 'quote', 'media', 'gallery'].includes(block.type) ? 'Edit content' : 'Edit'}</span></button>}
        {canUploadImage && canAddImage(block) && <button type="button" aria-label="Add image" title="Add image" data-image-group-action
          onClick={event => context.openImageGroupUpload(event.currentTarget, media => {
            const next = appendGroupImages(block, media, freshBlockId);
            return Boolean(next && replaceImages([next]));
          })}><ImagePlus size={16} aria-hidden="true" /><span>Add image</span></button>}
        {block.type === 'gallery' && block.items.length > 0 && <button type="button" aria-label="Break up image group" title="Break up image group" data-image-group-action onClick={() => {
          if (replaceImages(brokenGroupBlocks(block, freshBlockId))) editor.view.focus();
        }}><PanelTopDashed size={16} aria-hidden="true" /><span>Break up</span></button>}
        <button type="button" className={styles.addTextBelow} onClick={addAfter}>Add text below</button>
        <button type="button" aria-label="Remove asset (Undo available)" onClick={deleteNode}><Trash2 size={16} aria-hidden="true" /></button>
      </div>
    </div>
    {inlineCallout ? <aside className={`${blockStyles.callout} ${blockStyles.calloutPalette}`} {...calloutAppearanceAttributes(block)}>
      <NodeViewContent className={blockStyles.calloutContent} />
    </aside> : inlineNote ? <aside className={blockStyles.note}>
      <NodeViewContent<'p'> as="p" className={styles.plainAssetField} aria-label="Margin note" data-plain-asset-placeholder="Add a note" />
    </aside> : inlineQuote ? <figure className={blockStyles.quote}>
      <NodeViewContent />
    </figure> : block.type === 'cta' ? <div className={styles.assetContent} data-inline-copy>
      <button type="button" data-story-cta-editor="" data-story-editor-action="" onClick={event => open(event.currentTarget)}>{block.label || 'Set up button'}</button>
    </div> : <div
      className={styles.assetContent}
      data-inline-copy={Boolean(assetEditor) || undefined}
      onPointerDown={block.type === 'custom' ? event => event.stopPropagation() : undefined}
    >
      <StoryMediaObjectPreviewContext.Provider value>
        <StoryMediaEmptyEditorContext.Provider value={(media, path) => {
          const last = path.at(-1);
          return <EmptyAsset state={emptyMediaState(media)} onOpen={element => open(element, block.type === 'gallery' && typeof last === 'number' ? last : undefined)} />;
        }}>
        {emptyState && <EmptyAsset state={emptyState} onOpen={open} />}
        {(!emptyState || emptyState.keepContent) && <StoryBlocks blocks={[assetEditor ? block : { ...block, hidden: false }]} editor={assetEditor} chapterIndex={chapterIndex ?? undefined}
          chapterKey={chapterKey} blockIndexOffset={blockIndex ?? undefined} storySlug={context.story.slug} />}
        </StoryMediaEmptyEditorContext.Provider>
      </StoryMediaObjectPreviewContext.Provider>
    </div>}
  </NodeViewWrapper>;
}

function HeroView() {
  const context = useContext(AssetContext)!;
  const slots = resolveHeroMediaSlots(context.story);
  const primaryId = slots.primary === 'split-graphic' ? 'hero-graphic' : 'hero-media';
  return <NodeViewWrapper className={`${styles.asset} ${styles.interactiveRegion}`} data-document-hero="" contentEditable={false}>
    <div className={styles.assetActions} aria-label="Story header controls">
      <span>Header</span>
      <div className={styles.assetButtons}>
        <button type="button" aria-label="Edit story identity" onClick={(event) => context.onRegionSettings('hero-meta', event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>Identity</span></button>
        <button type="button" aria-label="Edit primary hero image or media" onClick={(event) => context.onHeroSettings(primaryId, event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>Primary media</span></button>
        {slots.secondaryHero && <button type="button" aria-label="Edit secondary hero image or media" onClick={(event) => context.onHeroSettings('hero-media', event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>Secondary media</span></button>}
        <button type="button" aria-label="Edit story facts" onClick={(event) => context.onRegionSettings('facts', event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>Facts</span></button>
      </div>
    </div>
    <div className={styles.heroContent}><StoryHero story={context.story} company={context.company} embedded editor={regionEditor(context, 'hero-copy')} /></div>
  </NodeViewWrapper>;
}

function DecisionsView() {
  const context = useContext(AssetContext)!;
  if (!context.story.decisions) return null;
  return <NodeViewWrapper className={`${styles.asset} ${styles.interactiveRegion}`} data-document-decisions="" data-story-hidden={context.story.decisions.hidden || undefined} contentEditable={false}>
    <div className={styles.assetActions} aria-label="Decisions controls">
      <span>Decisions</span>
      <div className={styles.assetButtons}><button type="button" aria-label="Edit decisions" onClick={(event) => context.onRegionSettings('decisions', event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>Edit</span></button></div>
    </div>
    <div className={styles.assetContent}><StoryDecisions section={context.story.decisions} editor={regionEditor(context, 'decisions')} /></div>
  </NodeViewWrapper>;
}

function ClosingRegionView({ kind }: { kind: 'hindsight' | 'credits' }) {
  const context = useContext(AssetContext)!;
  const visible = kind === 'hindsight' ? context.story.hindsight : context.story.credits?.length;
  if (!visible) return null;
  const hidden = kind === 'hindsight' ? context.story.visibility?.hindsight === false : context.story.visibility?.credits === false;
  const inlineEditor = regionEditor(context, kind);
  return <NodeViewWrapper className={`${styles.asset} ${styles.interactiveRegion}`} data-document-closing-region={kind} data-story-hidden={hidden || undefined} contentEditable={false}>
    <div className={styles.assetActions} aria-label={`${kind} controls`}>
      <span>{kind}</span>
      <div className={styles.assetButtons}>
        <button type="button" aria-label={`Edit ${kind}`} onClick={(event) => context.onRegionSettings(kind, event.currentTarget)}><Settings2 size={16} aria-hidden="true" /><span>Edit</span></button>
      </div>
    </div>
    <div className={styles.assetContent}>
      {kind === 'hindsight' && context.story.hindsight
        ? <StoryHindsight title={context.story.hindsight.title} paragraphs={context.story.hindsight.paragraphs} editor={inlineEditor} hidden={hidden} />
        : <StoryCredits credits={context.story.credits ?? []} title={context.story.creditsTitle} editor={inlineEditor} hidden={hidden} />}
    </div>
  </NodeViewWrapper>;
}

const Document = Node.create({ name: 'doc', topNode: true, content: 'storyHero storySection+ storyDecisions? storyHindsight? storyCredits?' });
const titleNode = (name: string, tag: string, className: string) => Node.create({
  name, content: 'inline*', defining: true, marks: '_',
  parseHTML: () => [{ tag: `[data-document-node="${name}"]` }],
  renderHTML: () => [tag, { 'data-document-node': name, class: className }, 0],
  addKeyboardShortcuts() { return { Enter: () => {
    if (this.editor.state.selection.$from.parent.type.name !== name) return false;
    const { $from } = this.editor.state.selection;
    const next = $from.after();
    this.editor.view.dispatch(this.editor.state.tr.setSelection(TextSelection.near(this.editor.state.doc.resolve(next), 1)));
    return true;
  } }; },
});
/** The section action is adjacent to its heading, but not part of the
 * editable title or selected/copied document content. */
function SectionTitleView({ editor, getPos, node }: NodeViewProps) {
  const context = useContext(AssetContext);
  return <NodeViewWrapper>
    <NodeViewContent<"h2"> as="h2" data-document-node="sectionTitle" className={styles.sectionTitle} />
    <button type="button" contentEditable={false} data-story-editor-action data-section-remove className={styles.sectionRemove}
      aria-label={`Remove section: ${node.textContent || 'Untitled section'}`}
      aria-disabled={(context?.story.chapters.length ?? 0) <= 1}
      title={(context?.story.chapters.length ?? 0) <= 1 ? 'Keep at least one section' : 'Remove section…'}
      onClick={event => {
        const pos = getPos();
        if (pos === undefined || editor.isDestroyed || !context || context.story.chapters.length <= 1) return;
        const section = editor.state.doc.resolve(pos).parent;
        if (section.type.name === 'storySection') context.requestSectionRemoval(String(section.attrs.key), event.currentTarget);
      }}>
      <Trash2 aria-hidden="true" size={16} />
    </button>
  </NodeViewWrapper>;
}

const SectionTitle = titleNode('sectionTitle', 'h2', styles.sectionTitle).extend({
  addNodeView: () => ReactNodeViewRenderer(SectionTitleView, { contentDOMElementTag: 'span', className: styles.sectionHeading }),
});
const Section = Node.create({
  name: 'storySection', content: 'sectionTitle (paragraph | heading | bulletList | orderedList | storyCallout | storyNote | storyQuote | storyAsset)*', defining: true,
  addAttributes: () => ({
    key: {
      default: '',
      parseHTML: element => element.getAttribute('data-section-key') ?? '',
      renderHTML: attributes => ({ 'data-section-key': attributes.key }),
    },
    columns: {
      default: 'one',
      parseHTML: element => element.getAttribute('data-columns') ?? 'one',
      renderHTML: attributes => ({ 'data-columns': attributes.columns }),
    },
    density: {
      default: 'default',
      parseHTML: element => element.getAttribute('data-density') ?? 'default',
      renderHTML: attributes => ({ 'data-density': attributes.density }),
    },
    hidden: {
      default: false,
      parseHTML: element => element.hasAttribute('data-story-hidden'),
      renderHTML: attributes => attributes.hidden ? { 'data-story-hidden': '' } : {},
    },
  }),
  parseHTML: () => [{ tag: '[data-document-section]' }],
  renderHTML: ({ HTMLAttributes }) => ['section', { ...HTMLAttributes, 'data-document-section': '', class: styles.section }, 0],
});
const Asset = Node.create({
  name: 'storyAsset', group: 'block', atom: true,
  addAttributes: () => ({
    block: { default: null, parseHTML: element => { try { return JSON.parse(element.getAttribute('data-block') || 'null'); } catch { return null; } }, renderHTML: attrs => ({ 'data-block': JSON.stringify(attrs.block) }) },
    origin: { default: null, rendered: false },
    blockAnchor: { default: null, rendered: false },
  }),
  parseHTML: () => [{ tag: '[data-document-asset]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-document-asset': '' }],
  addNodeView: () => ReactNodeViewRenderer(AssetView),
});
const Callout = Node.create({
  name: 'storyCallout', group: 'block', content: 'calloutTitle calloutBody', defining: true, isolating: true,
  addAttributes: () => ({
    block: { default: null, parseHTML: element => { try { return JSON.parse(element.getAttribute('data-block') || 'null'); } catch { return null; } }, renderHTML: attrs => ({ 'data-block': JSON.stringify(attrs.block) }) },
    origin: { default: null, rendered: false },
    blockAnchor: { default: null, rendered: false },
  }),
  parseHTML: () => [{ tag: '[data-document-callout]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-document-callout': '' }, 0],
  addNodeView: () => ReactNodeViewRenderer(AssetView),
});
const CalloutTitle = titleNode('calloutTitle', 'h3', blockStyles.calloutTitle).extend({
  content: 'text*',
  marks: '',
  addAttributes: () => ({
    icon: { default: null, parseHTML: element => element.getAttribute('data-callout-icon'), renderHTML: attrs => attrs.icon ? { 'data-callout-icon': attrs.icon } : {} },
  }),
  addNodeView: () => ReactNodeViewRenderer(({ node }: NodeViewProps) =>
    <NodeViewWrapper as="header" className={blockStyles.calloutHeader}>
      <span contentEditable={false} className={styles.calloutIcon}><StoryCalloutIcon icon={node.attrs.icon} /></span>
      <NodeViewContent<'h3'> as="h3" className={`${blockStyles.calloutTitle} ${styles.calloutTitle}`} aria-label="Callout title" data-callout-title="" />
    </NodeViewWrapper>, { contentDOMElementTag: 'span' }),
});
const CalloutBody = Node.create({
  name: 'calloutBody', content: '(paragraph | heading | bulletList | orderedList)+', defining: true,
  parseHTML: () => [{ tag: '[data-callout-body]' }],
  renderHTML: () => ['div', { 'data-callout-body': '', 'aria-label': 'Callout body', class: `${blockStyles.calloutBody} ${styles.calloutBody}` }, 0],
});

function plainFieldBreak(editor: NodeViewProps['editor'], name: string): boolean {
  const { selection: { $from, $to } } = editor.state;
  if ($from.parent.type.name !== name || !$from.sameParent($to)) return false;
  return editor.commands.insertContent({ type: 'hardBreak' });
}

const Note = Callout.extend({
  name: 'storyNote', content: '(text | hardBreak)*', marks: '', code: true,
  parseHTML: () => [{ tag: '[data-document-note]' }],
  renderHTML: ({ HTMLAttributes }) => ['aside', { ...HTMLAttributes, 'data-document-note': '' }, 0],
  addNodeView: () => ReactNodeViewRenderer(AssetView, { contentDOMElementTag: 'span' }),
  addKeyboardShortcuts() { const lineBreak = () => plainFieldBreak(this.editor, this.name); return { Enter: lineBreak, 'Shift-Enter': lineBreak }; },
});
const Quote = Callout.extend({
  name: 'storyQuote', content: 'quoteText quoteByline',
  parseHTML: () => [{ tag: '[data-document-quote]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', { ...HTMLAttributes, 'data-document-quote': '' }, 0],
});
const QuoteText = Node.create({
  name: 'quoteText', content: '(text | hardBreak)*', marks: '', defining: true, code: true,
  parseHTML: () => [{ tag: 'blockquote[data-document-node="quoteText"]', contentElement: 'p' }],
  renderHTML: () => ['blockquote', { 'data-document-node': 'quoteText' }, ['p', { class: styles.plainAssetField, 'aria-label': 'Quotation', 'data-plain-asset-placeholder': 'Add a quote' }, 0]],
  addKeyboardShortcuts() { const lineBreak = () => plainFieldBreak(this.editor, this.name); return { Enter: lineBreak, 'Shift-Enter': lineBreak }; },
});
const QuoteByline = Node.create({
  name: 'quoteByline', content: 'quoteName quoteRole quoteContext', defining: true,
  parseHTML: () => [{ tag: 'figcaption[data-document-node="quoteByline"]' }],
  renderHTML: () => ['figcaption', { 'data-document-node': 'quoteByline' }, 0],
});
function quoteCreditField(name: 'quoteName' | 'quoteRole' | 'quoteContext', label: string, placeholder: string, className: string) {
  const multiline = name === 'quoteContext';
  return titleNode(name, 'span', className).extend({
    content: multiline ? '(text | hardBreak)*' : 'text*', marks: '', code: true,
    renderHTML: () => ['span', {
      'data-document-node': name, 'aria-label': label, 'data-plain-asset-placeholder': placeholder,
      class: `${className} ${styles.plainAssetField}`,
    }, 0],
    ...(multiline ? { addKeyboardShortcuts() { const lineBreak = () => plainFieldBreak(this.editor, this.name); return { Enter: lineBreak, 'Shift-Enter': lineBreak }; } } : {}),
  });
}
const QuoteName = quoteCreditField('quoteName', 'Quote attribution', 'Add a name', styles.quoteName);
const QuoteRole = quoteCreditField('quoteRole', 'Quote attribution role', 'Add a role', styles.quoteRole);
const QuoteContext = quoteCreditField('quoteContext', 'Quote context', 'Add context', blockStyles.quoteContext);

const Hero = Node.create({
  name: 'storyHero', atom: true, selectable: false,
  parseHTML: () => [{ tag: '[data-document-hero]' }],
  renderHTML: () => ['div', { 'data-document-hero': '' }],
  addNodeView: () => ReactNodeViewRenderer(HeroView),
});
const Decisions = Node.create({
  name: 'storyDecisions', atom: true, selectable: false,
  parseHTML: () => [{ tag: '[data-document-decisions]' }],
  renderHTML: () => ['div', { 'data-document-decisions': '' }],
  addNodeView: () => ReactNodeViewRenderer(DecisionsView),
});
const Hindsight = Node.create({
  name: 'storyHindsight', atom: true, selectable: false,
  parseHTML: () => [{ tag: '[data-document-closing-region="hindsight"]' }],
  renderHTML: () => ['div', { 'data-document-closing-region': 'hindsight' }],
  addNodeView: () => ReactNodeViewRenderer(() => <ClosingRegionView kind="hindsight" />),
});
const Credits = Node.create({
  name: 'storyCredits', atom: true, selectable: false,
  parseHTML: () => [{ tag: '[data-document-closing-region="credits"]' }],
  renderHTML: () => ['div', { 'data-document-closing-region': 'credits' }],
  addNodeView: () => ReactNodeViewRenderer(() => <ClosingRegionView kind="credits" />),
});
const Origin = Extension.create({
  name: 'documentOrigin',
  addGlobalAttributes: () => [{ types: ['paragraph', 'heading', 'bulletList', 'orderedList'], attributes: {
    origin: { default: null, rendered: false, keepOnSplit: true },
    blockAnchor: {
      default: null,
      keepOnSplit: true,
      parseHTML: element => element.getAttribute('data-story-block-anchor'),
      renderHTML: attributes => attributes.blockAnchor ? { 'data-story-block-anchor': attributes.blockAnchor } : {},
    },
    blockStart: {
      default: false,
      keepOnSplit: false,
      parseHTML: element => element.hasAttribute('data-document-block-start'),
      renderHTML: attributes => attributes.blockStart ? { 'data-document-block-start': '' } : {},
    },
    blockKind: {
      default: null,
      keepOnSplit: true,
      parseHTML: element => element.getAttribute('data-document-block-kind'),
      renderHTML: attributes => attributes.blockKind ? { 'data-document-block-kind': attributes.blockKind } : {},
    },
    landing: { default: false, rendered: false, keepOnSplit: false },
  } }],
});
const extensions = [
  ...storyProseExtensions({ placeholder: 'Write something, or use / to insert…' }).filter(extension => !['doc', 'storySlash'].includes(extension.name)),
  Document, Hero, Section, SectionTitle, Asset, Callout, CalloutTitle, CalloutBody, Note, Quote, QuoteText, QuoteByline, QuoteName, QuoteRole, QuoteContext, Decisions, Hindsight, Credits, Origin, MediaAnchor,
];

/** A single text document with rich asset nodes; the stored story format is unchanged. */
function assetOrder(doc: ProseMirrorNode) {
  const assets: string[] = [];
  doc.forEach(section => {
    if (section.type.name !== 'storySection') return;
    section.forEach(node => {
      if (node.type.name === 'storyAsset' || INLINE_ASSETS.has(node.type.name)) assets.push(String(node.attrs.blockAnchor ?? ''));
    });
    assets.push(String(section.attrs.key));
  });
  return JSON.stringify(assets);
}

export default function ContinuousStoryEditor({ story, company, onChange, onCanvasChange, onCanvasHistory, historyRevision = 0, onTextDraftChange, onSettings, onHeroSettings, onRegionSettings, onEditStart, onEditEnd, onValidityChange, focusTextRef, onRemoveSection }: {
  story: Story; company?: StoryCompany | null; onChange: (story: Story) => void;
  onCanvasChange?: (story: Story, boundary: boolean) => void;
  onCanvasHistory?: (direction: 'undo' | 'redo') => boolean;
  historyRevision?: number;
  onTextDraftChange: StoryRenderEditor['onTextDraftChange'];
  onSettings: (id: string, element: HTMLElement, item?: number) => void;
  onHeroSettings: (id: 'hero-media' | 'hero-graphic', element: HTMLElement) => void;
  onRegionSettings: (id: 'hero-meta' | 'facts' | 'decisions' | 'hindsight' | 'credits', element: HTMLElement) => void;
  onEditStart: () => void; onEditEnd: () => void;
  onValidityChange: (error: string | null) => void;
  onRemoveSection: (story: Story, nextKey: string) => void;
  focusTextRef?: React.RefObject<((node: HTMLElement) => boolean) | null>;
}) {
  const seenHistory = useRef(historyRevision);
  const source = useRef(story);
  const emitted = useRef(story);
  const callbacks = useRef({ onChange, onCanvasChange, onCanvasHistory, onTextDraftChange, onEditStart, onEditEnd });
  const [error, setError] = useState('');
  const assetDrag = useRef<AssetDrag | null>(null);
  const [assetDrop, setAssetDrop] = useState<ReturnType<typeof assetPointerTarget>>(null);
  const [reorderStatus, setReorderStatus] = useState({ count: 0, text: '' });
  const clearAssetDrag = () => { assetDrag.current = null; setAssetDrop(null); };
  const startAssetDrag: AssetContextValue['startAssetDrag'] = (drag, event) => {
    const from = drag.getPos();
    if (typeof from !== 'number') { event.preventDefault(); return; }
    event.stopPropagation();
    event.dataTransfer.setData(ASSET_MOVE_MIME, 'move');
    event.dataTransfer.effectAllowed = 'move';
    assetDrag.current = drag;
  };
  const moveAsset: AssetContextValue['moveAsset'] = (view, from, to, label, focus) => {
    const moved = moveStoryAsset(view.state, from, to);
    if (!moved) return;
    const title = source.current.chapters.find(chapter => chapter.key === moved.chapterKey)?.title;
    view.dispatch(moved.transaction.setMeta('storyAssetBoundary', true));
    setReorderStatus(current => ({ count: current.count + 1, text: `${label} moved${title ? ` to ${title}` : ''}.` }));
    if (!focus) return;
    requestAnimationFrame(() => {
      if (view.isDestroyed) return;
      const element = view.nodeDOM(moved.insertedAt);
      if (!(element instanceof HTMLElement)) return;
      const button = element.querySelector<HTMLButtonElement>(`[data-asset-reorder="${focus}"]:not(:disabled)`)
        ?? element.querySelector<HTMLButtonElement>('[data-asset-reorder]:not(:disabled)');
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    });
  };
  const handleAssetDrag = (event: ReactDragEvent<HTMLElement>, drop: boolean) => {
    const drag = assetDrag.current;
    if (!drag || !event.dataTransfer.types.includes(ASSET_MOVE_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const view = editor?.view;
    const from = drag.getPos();
    const node = from === undefined || !view ? null : movableAsset(view.state.doc, from);
    const point = view && event.target instanceof Element
      ? assetPointerTarget(view, event.target, event.clientX, event.clientY) : null;
    const valid = node === drag.node && from !== undefined && point && (point.pos < from || point.pos > from + node.nodeSize);
    if (drop) {
      clearAssetDrag();
      if (valid && view && point && from !== undefined) {
        const block = node.attrs.block as StoryBlock;
        moveAsset(view, from, point.pos, block.type === 'media' ? mediaEditorLabel(block.media) : block.type);
      }
    } else {
      event.dataTransfer.dropEffect = valid ? 'move' : 'none';
      setAssetDrop(previous => valid && point
        ? previous?.pos === point.pos && previous.top === point.top && previous.left === point.left && previous.width === point.width && previous.caretX === point.caretX ? previous : point
        : null);
    }
  };
  const [linkRequest, setLinkRequest] = useState({ desktop: 0, mobile: 0 });
  const [slashOpen, setSlashOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [placement, setPlacement] = useState<ReturnType<typeof bodyInsertPlacement>>(null);
  const plusButton = useRef<HTMLButtonElement>(null);
  const insertMenu = useRef<HTMLDivElement>(null);
  const plusRange = useRef<{ doc: EditorState['doc']; pos: number } | null>(null);
  const slashRange = useRef<SlashCommand | null>(null);
  const dismissSlash = () => { slashRange.current = null; setSlashOpen(false); };
  const dismissPlus = () => { plusRange.current = null; setPlusOpen(false); };
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);
  const syncVersion = useRef(0);
  const validityCallback = useRef(onValidityChange);
  useEffect(() => { callbacks.current = { onChange, onCanvasChange, onCanvasHistory, onTextDraftChange, onEditStart, onEditEnd }; });
  useEffect(() => { validityCallback.current = onValidityChange; });
  useEffect(() => () => validityCallback.current(null), []);
  const uploadTarget = useStoryMediaUploadTarget();
  const [groupUpload, setGroupUpload] = useState<{ trigger: HTMLButtonElement; onAdd: (media: StoryMediaData[]) => boolean } | null>(null);
  const mediaTransfer = useRef<{ abort: AbortController; view: EditorView } | null>(null);
  const [mediaStatus, setMediaStatus] = useState<{ text: string; busy?: boolean; failed?: boolean } | null>(null);
  useEffect(() => () => mediaTransfer.current?.abort.abort(), []);
  const cancelMediaTransfer = () => {
    const active = mediaTransfer.current;
    if (!active) return;
    active.abort.abort();
    mediaTransfer.current = null;
    if (!active.view.isDestroyed) active.view.dispatch(active.view.state.tr.setMeta(mediaAnchorKey, null));
    setMediaStatus({ text: 'Upload canceled. Nothing was inserted.' });
  };
  const receiveMediaFiles = (view: EditorView, files: File[], pos: number | null) => {
    if (!uploadTarget) return false;
    if (mediaTransfer.current) {
      setMediaStatus({ text: 'An upload is in progress. Wait for it to finish or cancel it first.', busy: true });
      return true;
    }
    if (pos === null || !mediaInsertionPoint(view.state.doc, pos)) {
      setMediaStatus({ text: 'Place the cursor in the body text to add media.', failed: true });
      return true;
    }
    const id = Symbol('media upload');
    const abort = new AbortController();
    mediaTransfer.current = { abort, view };
    view.dispatch(view.state.tr.setMeta(mediaAnchorKey, { id, pos }));
    const description = files.length === 1 ? files[0].name : `${files.length} files`;
    setMediaStatus({ text: `Adding ${description}…`, busy: true });
    void Promise.allSettled(files.map(file => uploadStoryMedia(file, uploadTarget, abort.signal))).then(results => {
      if (abort.signal.aborted || view.isDestroyed) return;
      mediaTransfer.current = null;
      const anchor = mediaAnchorKey.getState(view.state);
      const added: StoryMediaData[] = [];
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { kind, src, aspect } = result.value;
          added.push({ kind, src, alt: '', ...(aspect ? { aspect } : {}) });
        } else {
          const message = result.reason instanceof Error ? result.reason.message : 'Try adding this file again.';
          errors.push(`${files[index].name}: ${message}`);
        }
      });
      const blockId = createStoryBlock('media').id;
      const block: StoryBlock = added.length === 1
        ? { type: 'media', id: blockId, media: added[0], width: 'wide' }
        : { type: 'gallery', id: blockId, layout: added.length > 3 ? 'grid' : 'horizontal', items: added };
      const transaction = anchor?.id === id && added.length
        ? insertMediaAt(view.state, anchor.pos, view.state.schema.nodes.storyAsset.create({ block }))
        : null;
      view.dispatch((transaction ?? view.state.tr).setMeta(mediaAnchorKey, null));
      const guidance = transaction
        ? `${added.length === 1 ? 'Media added' : `${added.length} files added`}. Use Edit to add a description.`
        : added.length ? 'The insertion point was removed. Place the cursor and try again.' : '';
      setMediaStatus({ text: [guidance, ...errors].filter(Boolean).join(' '), failed: !transaction || errors.length > 0 });
    });
    return true;
  };
  const editor = useEditor({
    immediatelyRender: false, extensions, content: storyToDocument(story),
    editorProps: { attributes: { class: [styles.content, storyStyles.proseHighlights].join(' '), 'aria-label': 'Continuous story document', 'aria-description': 'Write directly. Enter adds paragraphs. Select text to format. Use the plus on an empty body line, or type slash for headings and assets.' },
      handleKeyDown: (view, event) => {
        if (!event.isComposing && event.key === 'Escape' && (slashRange.current || plusRange.current)) {
          event.preventDefault();
          dismissSlash();
          dismissPlus();
          return true;
        }
        if (!event.isComposing && event.altKey && event.key === 'F10' && plusButton.current) {
          event.preventDefault();
          plusButton.current.focus({ preventScroll: true });
          return true;
        }
        if (!event.isComposing && (slashRange.current || plusRange.current) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          const buttons = insertMenu.current?.querySelectorAll<HTMLButtonElement>('button');
          if (buttons?.length) {
            event.preventDefault();
            buttons[event.key === 'ArrowUp' ? buttons.length - 1 : 0].focus({ preventScroll: true });
            return true;
          }
        }

        if (!event.isComposing && event.key === 'Enter' && slashRange.current?.text.length && slashRange.current.text.length > 1) {
          const command = slashRange.current;
          const results = matchingCommands(command);
          const query = command.text.slice(1).toLowerCase();
          const kind = results.length === 1 ? results[0]
            : results.find(result => result === query || COMMAND_ALIASES[result]?.includes(query));
          if (kind && sameSlashCommand(command, slashCommandAtCaret(view.state))) {
            event.preventDefault();
            action(kind, 'slash');
            return true;
          }
        }
        if (event.target === view.dom && (event.metaKey || event.ctrlKey) && !event.altKey && !event.isComposing
          && event.key.toLowerCase() === 'z' && callbacks.current.onCanvasHistory?.(event.shiftKey ? 'redo' : 'undo')) {
          event.preventDefault();
          return true;
        }
        const inPlainAssetField = PLAIN_ASSET_FIELDS.has(view.state.selection.$from.parent.type.name);
        if (event.altKey && event.key === 'F10' && !inPlainAssetField && !view.state.selection.empty) {
          event.preventDefault();
          const toolbar = toolbarRef.current?.getClientRects().length ? toolbarRef.current : mobileToolbarRef.current;
          toolbar?.querySelector<HTMLElement>('select:not([disabled]), button:not([disabled])')?.focus({ preventScroll: true });
          return true;
        }
        if (!inPlainAssetField && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k' && !event.isComposing) {
          const selection = view.state.selection;
          if (!(selection instanceof TextSelection)) return false;
          if (selection.empty) {
            const range = getMarkRange(selection.$from, view.state.schema.marks.link);
            if (!range) return false;
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)));
          }
          event.preventDefault();
          const target = window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
          setLinkRequest(current => ({ ...current, [target]: current[target] + 1 }));
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const files = storyMediaFiles(event.clipboardData);
        return files.length > 0 && receiveMediaFiles(view, files, view.state.selection.to);
      },
      handleDOMEvents: {
        dragover: (view, event) => {
          const transfer = event.dataTransfer;
          if (event.defaultPrevented || !uploadTarget || !transfer || !Array.from(transfer.items).some(item => item.kind === 'file' && /^(image|video)\//.test(item.type))) return false;
          const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!point || !mediaInsertionPoint(view.state.doc, point.pos)) return false;
          event.preventDefault();
          transfer.dropEffect = 'copy';
          return true;
        },
        drop: (view, event) => {
          const files = storyMediaFiles(event.dataTransfer);
          if (event.defaultPrevented || !files.length) return false;
          const point = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!receiveMediaFiles(view, files, point?.pos ?? null)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
    onMount: ({ editor }) => editor.view.dom.classList.remove('tiptap'),
    onFocus: () => { setFocused(true); callbacks.current.onEditStart(); },
    onBlur: ({ event }) => {
      const target = event.relatedTarget;
      if (!(target instanceof window.Node) || (target !== plusButton.current && !insertMenu.current?.contains(target))) {
        setFocused(false);
        dismissSlash();
        dismissPlus();
      }
      callbacks.current.onEditEnd();
    },
    onSelectionUpdate: ({ editor }) => {
      const command = slashRange.current;
      if (command && !sameSlashCommand(command, slashCommandAtCaret(editor.state))) dismissSlash();
      if (plusRange.current && bodyInsertionLine(editor.state)?.pos !== plusRange.current.pos) dismissPlus();
    },
    onUpdate: ({ editor, transaction }) => {
      try {
        const next = documentToStory(editor.getJSON(), source.current);
        emitted.current = next;
        const boundary = transaction.getMeta('storyAssetBoundary') === true || transaction.getMeta('storyListBoundary') === true
          || transaction.getMeta('storyTextFamilyBoundary') === true
          || assetOrder(transaction.before) !== assetOrder(editor.state.doc);
        if (callbacks.current.onCanvasChange) callbacks.current.onCanvasChange(next, boundary);
        else callbacks.current.onChange(next);
        setError('');
        validityCallback.current(null);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'This edit could not be mapped safely. Undo it to continue.';
        setError(message);
        validityCallback.current(message);
      }
      const command = slashCommandAtCaret(editor.state);
      if (command) {
        slashRange.current = command;
        dismissPlus();
        setSlashOpen(true);
      } else dismissSlash();
    },
  });
  const selectionState = useEditorState({ editor, selector: ({ editor }) => ({
    from: editor?.state.selection.from,
    insertLine: editor ? bodyInsertionLine(editor.state) : null,
    slashCommand: editor ? slashCommandAtCaret(editor.state) : null,
    empty: editor?.state.selection.empty ?? true,
    inPlainAssetField: editor ? PLAIN_ASSET_FIELDS.has(editor.state.selection.$from.parent.type.name) : false,
    inInlineAsset: editor?.state.selection.$from.depth && editor.state.selection.$from.depth >= 2
      ? INLINE_ASSETS.has(editor.state.selection.$from.node(2).type.name) : false,
    bold: editor?.isActive('bold') ?? false,
    italic: editor?.isActive('italic') ?? false,
    highlight: editor?.isActive('highlight') ?? false,
    highlightColor: editor?.isActive('highlight') ? highlightColor(editor.getAttributes('highlight').color) : null,
    textFamily: editor ? storyTextFamilyState(editor.state) : { family: 'text' as const, locked: false },
    lists: editor ? listToggleState(editor.state) : { enabled: false, kind: null },
    link: editor?.isActive('link') ?? false,
  }) });
  const anchor = slashOpen ? selectionState?.from : focused || plusOpen ? selectionState?.insertLine?.pos : undefined;
  useLayoutEffect(() => {
    if (!editor || anchor === undefined) return;
    let frame = 0;
    const update = () => {
      if (editor.isDestroyed || !editor.view.dom.getClientRects().length || anchor > editor.state.doc.content.size) {
        setPlacement(null);
        return;
      }
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const workspace = editor.view.dom.closest<HTMLElement>('[data-story-insert-workspace]');
      const header = workspace?.closest('[data-story-document-shell]')?.querySelector<HTMLElement>('[data-story-workspace-bar]');
      const toolbar = mobileToolbarRef.current;
      setPlacement(bodyInsertPlacement(editor.view.coordsAtPos(anchor), {
        left, right: left + (viewport?.width ?? window.innerWidth), top: Math.max(top, header?.getBoundingClientRect().bottom ?? 0),
        bottom: toolbar?.getClientRects().length ? Math.min(bottom, toolbar.getBoundingClientRect().top) : bottom,
      }));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(editor.view.dom);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [editor, anchor]);
  useEffect(() => {
    if (!plusOpen && !slashOpen) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof window.Node) || event.target === plusButton.current || plusButton.current?.contains(event.target) || insertMenu.current?.contains(event.target)) return;
      dismissPlus();
      dismissSlash();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [plusOpen, slashOpen]);
  useEffect(() => {
    if (!editor || !focusTextRef) return;
    focusTextRef.current = (target) => {
      const view = editor.view;
      if (view.isDestroyed || !view.dom.contains(target)) return false;
      const point = view.state.doc.resolve(view.posAtDOM(target, 0));
      const selection = TextSelection.near(point, 1);
      if (!(selection instanceof TextSelection) || !target.contains(view.domAtPos(selection.from).node)) return false;
      view.focus();
      view.dispatch(view.state.tr.setSelection(selection));
      return true;
    };
    return () => { focusTextRef.current = null; };
  }, [editor, focusTextRef]);
  useLayoutEffect(() => {
    const isHistory = seenHistory.current !== historyRevision;
    seenHistory.current = historyRevision;
    if (!editor || story === emitted.current) return;
    source.current = story; emitted.current = story;
    const version = ++syncVersion.current;
    if (!isHistory) {
      // Keep the existing synchronization path for settings, Find, and other
      // external updates whose caller may already manage focus and scrolling.
      const { from, to } = editor.state.selection;
      const hadEditorFocus = editor.isFocused;
      const left = window.scrollX, top = window.scrollY;
      queueMicrotask(() => {
        if (editor.isDestroyed || version !== syncVersion.current) return;
        editor.chain().setMeta('addToHistory', false).setContent(storyToDocument(story), { emitUpdate: false }).run();
        setError('');
        validityCallback.current(null);
        const max = Math.max(1, editor.state.doc.content.size);
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
        if (hadEditorFocus) editor.commands.focus(undefined, { scrollIntoView: false });
        window.scrollTo({ left, top, behavior: 'instant' });
      });
      return;
    }
    const viewport = preserveStoryHistoryViewport(editor.view);
    let frame = 0;
    let canceled = false;
    const stop = () => {
      if (canceled) return;
      canceled = true;
      cancelAnimationFrame(frame);
      viewport.cleanup();
      for (const event of ['keydown', 'pointerdown', 'wheel', 'touchstart']) window.removeEventListener(event, stop, true);
    };
    queueMicrotask(() => {
      if (canceled || editor.isDestroyed || version !== syncVersion.current) { stop(); return; }
      const { state, view } = editor;
      const next = editor.schema.nodeFromJSON(storyToDocument(story));
      const transaction = storySnapshotTransaction(state, next).setMeta('addToHistory', false).setMeta('preventUpdate', true);
      const restored = restoredStorySelection(state.selection, transaction.doc);
      view.dispatch(transaction.setSelection(restored.selection));
      viewport.restore(restored.anchored);
      setError('');
      validityCallback.current(null);
      for (const event of ['keydown', 'pointerdown', 'wheel', 'touchstart']) window.addEventListener(event, stop, { capture: true, passive: true });
      // Mobile selection scrolling can settle after React and one paint.
      // Correct for three frames at most, and yield to the next user gesture.
      let settleFrames = 3;
      const settle = () => {
        if (editor.isDestroyed) { stop(); return; }
        viewport.restore(restored.anchored);
        if (--settleFrames) frame = requestAnimationFrame(settle);
        else stop();
      };
      frame = requestAnimationFrame(settle);
    });
    return stop;
  }, [story, editor, historyRevision]);
  const action = (kind: InsertKind, source: 'toolbar' | 'slash' | 'plus') => {
    if (!editor) return;
    const command = source === 'slash' ? slashRange.current : null;
    const plus = source === 'plus' ? plusRange.current : null;
    if (source === 'slash' && (!command || !sameSlashCommand(command, slashCommandAtCaret(editor.state)))) { dismissSlash(); return; }
    if (source === 'plus' && (!plus || plus.doc !== editor.state.doc || bodyInsertionLine(editor.state)?.pos !== plus.pos)) { dismissPlus(); return; }
    const parent = editor.state.selection.$from.parent.type.name;
    if (['storyTitle', 'storyThesis', 'sectionTitle'].includes(parent) || PLAIN_ASSET_FIELDS.has(parent)) {
      setError('Place the cursor in the body text to change its style or insert an asset. Titles keep their document hierarchy.');
      return;
    }
    let chain = editor.chain().focus(undefined, { scrollIntoView: false });
    if (!isTextCommand(kind)) {
      if (selectionState?.inInlineAsset) return;
      const block = createStoryBlock(kind);
      const node = block.type === 'callout' ? calloutNode(block) : block.type === 'note' ? noteNode(block)
        : block.type === 'quote' ? quoteNode(block) : { type: 'storyAsset', attrs: { block } };
      if (source === 'toolbar') {
        chain.insertContent([node, { type: 'paragraph' }]).run();
      } else {
        const tr = insertBodyAsset(editor.state, editor.schema.nodeFromJSON(node), command ?? undefined);
        if (!tr) return;
        editor.view.dispatch(tr);
        editor.view.dom.focus({ preventScroll: true });
      }
    } else {
      if (command) chain = chain.deleteRange(command);
      const family = TEXT_COMMANDS[kind];
      if (family === 'bullets') {
        if (!listToggleState(editor.state).enabled) return;
        if (command) chain.toggleBulletList().run();
        else toggleStoryList(editor, 'bulletList');
      }
      else chain.command(({ tr }) => applyStoryTextFamily(tr, family)).run();
    }
    dismissSlash();
    dismissPlus();
  };
  const openPlus = () => {
    if (!editor) return;
    const line = bodyInsertionLine(editor.state);
    if (!line) return;
    if (plusOpen) { dismissPlus(); return; }
    dismissSlash();
    plusRange.current = { doc: editor.state.doc, pos: line.pos };
    setPlusOpen(true);
  };
  const onInsertKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editor || !['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') {
      dismissSlash();
      dismissPlus();
      editor.view.dom.focus({ preventScroll: true });
      return;
    }
    const buttons = [...event.currentTarget.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
    buttons[next]?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  };
  const changeTextStyle = (style: StoryTextFamily) => {
    if (!editor || storyTextFamilyState(editor.state).locked) return;
    setStoryTextStyle(editor, style);
  };

  const onToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editor || !(event.target instanceof HTMLElement) || !event.currentTarget.contains(event.target) || event.target.closest('[data-story-prose-surface]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      editor.chain().setTextSelection(editor.state.selection.to).focus().run();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled])')];
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? controls.length - 1
        : event.key === 'ArrowRight' ? (current + 1) % controls.length
          : (current - 1 + controls.length) % controls.length;
    controls[next]?.focus({ preventScroll: true });
  };
  const menuCommands = matchingCommands(slashOpen ? selectionState?.slashCommand : null)
    .filter(kind => !plusOpen || !selectionState?.insertLine?.atBreak || !isTextCommand(kind));
  const menuItems = menuCommands.flatMap<{ key: InsertKind; group: string; label: string; icon: (typeof TEXT_STYLES)[number]['icon']; keys?: string }>(kind => {
    const style = TEXT_STYLES.find(entry => isTextCommand(kind) && entry.value === TEXT_COMMANDS[kind]);
    if (style) return [{ key: kind, group: 'Turn into', label: style.label, icon: style.icon, keys: style.keys }];
    const offer = BLOCK_OFFERS.get(kind as StoryBlock['type']);
    return offer ? [{ key: kind, group: 'Insert', label: COMMAND_LABELS[kind] ?? kind, icon: offer.icon, keys: undefined }] : [];
  });
  useLayoutEffect(() => { if (insertMenu.current) insertMenu.current.scrollTop = 0; }, [slashOpen, plusOpen, selectionState?.slashCommand?.text]);
  if (!editor) return <p role="status">Opening document…</p>;
  const textFamily = selectionState?.textFamily ?? { family: 'text', locked: false };
  const textStyleControl = <select aria-label="Text style" value={textFamily.family} disabled={textFamily.locked}
    title={textFamily.locked ? 'Section titles keep their document hierarchy' : undefined}
    onChange={event => changeTextStyle(event.target.value as StoryTextFamily)}>
    {textFamily.family === 'mixed' && <option value="mixed" disabled>Mixed text styles</option>}
    {TEXT_STYLES.filter(isTextStyleOption).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
  const requestSectionRemoval: AssetContextValue['requestSectionRemoval'] = (key, trigger) => {
    if (error || editor.isDestroyed) return;
    // Resolve the current draft through the standard lossless bridge before
    // structural edits; its invariants still reject accidental deletes.
    let current: Story;
    try { current = documentToStory(editor.getJSON(), source.current); }
    catch { return; }
    const index = current.chapters.findIndex(chapter => chapter.key === key);
    if (index < 0 || current.chapters.length <= 1) return;
    const chapter = current.chapters[index];
    if (!window.confirm(`Remove “${chapter.title.trim() || 'Untitled section'}” and everything inside it from this draft? This includes nested headings, text, and media placements. Uploaded files are kept. You can undo this change.`)) {
      trigger.focus({ preventScroll: true });
      return;
    }
    const chapters = current.chapters.filter(chapter => chapter.key !== key);
    const nextKey = chapters[Math.min(index, chapters.length - 1)].key;
    onRemoveSection({ ...current, chapters }, nextKey);
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return;
      // React's controlled draft sync is queued in an effect. Wait until the
      // next frame and locate the live neighbor by key rather than offset.
      requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const title = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-section-key]')]
          .find(section => section.dataset.sectionKey === nextKey)
          ?.querySelector<HTMLElement>('[data-document-node="sectionTitle"]');
        if (title) focusTextRef?.current?.(title);
      });
    });
  };
  const lists = selectionState?.lists ?? { enabled: false, kind: null };
  return <AssetContext.Provider value={{ requestSectionRemoval, openImageGroupUpload: (trigger, onAdd) => setGroupUpload({ trigger, onAdd }), startAssetDrag, moveAsset, story, company, onChange, onTextDraftChange, onEditStart, onEditEnd, onSettings, onHeroSettings, onRegionSettings }}>
    <div className={`${styles.workspace} ${storyStyles.mediaEnvironment}`} data-hero-presentation={storyHeroPresentation(story)} data-story={story.slug} data-tone={story.tone ?? 'neutral'} data-story-insert-workspace=""
      onKeyDownCapture={event => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || !(event.metaKey || event.ctrlKey)
          || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'a') return;
        const view = editor.view;
        const target = event.target;
        if (!(target instanceof HTMLElement) || !view.dom.contains(target)) return;
        const fromCanvas = target === view.dom;
        if (!fromCanvas) {
          // A caption, inspector input, or another nested editor owns its text.
          const field = target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
          if (field && field !== view.dom) return;
        }
        const chapterControl = !fromCanvas ? target.closest('[data-document-asset], [data-section-remove]') : null;
        const chapterKey = chapterControl?.closest<HTMLElement>('[data-document-section]')?.dataset.sectionKey;
        if (!fromCanvas && chapterKey === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        const selection = focusedChapterSelection(view.state, chapterKey);
        if (selection) {
          if (!fromCanvas) view.focus();
          view.dispatch(view.state.tr.setSelection(selection));
        } else if (fromCanvas && !view.state.selection.empty && view.state.selection.$head.depth === 0) {
          // Do not leave a stale document-wide selection armed after trying
          // Select All without a focused chapter.
          const cursor = Selection.findFrom(view.state.selection.$head, -1, true)
            ?? Selection.findFrom(view.state.selection.$head, 1, true);
          if (cursor) view.dispatch(view.state.tr.setSelection(cursor));
        }
      }}
      onDragOverCapture={event => handleAssetDrag(event, false)}
      onDropCapture={event => handleAssetDrag(event, true)}
      onDragEndCapture={clearAssetDrag}
      onDragLeaveCapture={event => {
        if (!(event.relatedTarget instanceof window.Node) || !event.currentTarget.contains(event.relatedTarget)) setAssetDrop(null);
      }}>
      <BubbleMenu
        ref={toolbarRef}
        editor={editor}
        updateDelay={0}
        options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 12 } }}
        shouldShow={({ state }) => !state.selection.empty && state.selection instanceof TextSelection && !PLAIN_ASSET_FIELDS.has(state.selection.$from.parent.type.name)}
        className={styles.toolbar}
        aria-label="Selected text formatting"
        role="toolbar"
        onKeyDown={onToolbarKeyDown}
      >
        {textStyleControl}
        <button type="button" aria-label="Bold" aria-pressed={editor.isActive('bold')} onPointerDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" aria-label="Italic" aria-pressed={editor.isActive('italic')} onPointerDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <ListToggleButton editor={editor} kind="bulletList" state={lists} className={styles.listToggle} />
        <ListToggleButton editor={editor} kind="orderedList" state={lists} className={styles.listToggle} />
        <HighlightMenu editor={editor} active={selectionState?.highlight ?? false} color={selectionState?.highlightColor ?? null} compact />
        <LinkPopover editor={editor} active={selectionState?.link ?? false} request={linkRequest.desktop} compact />
        <MoreInlineFormats editor={editor} />
        {!selectionState?.inInlineAsset && <><span className={styles.divider} aria-hidden="true" />
        <button type="button" className={styles.insertButton} onPointerDown={event => event.preventDefault()} onClick={() => action('media', 'toolbar')}><ImagePlus aria-hidden="true" size={17} /><span>Insert asset</span></button></>}
      </BubbleMenu>
      {selectionState && <div hidden={selectionState.empty || selectionState.inPlainAssetField} ref={mobileToolbarRef} className={styles.mobileToolbar} aria-label="Selected text formatting" role="toolbar" onKeyDown={onToolbarKeyDown}>
        {textStyleControl}
        <button type="button" aria-label="Bold" aria-pressed={selectionState.bold} onPointerDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
        <button type="button" aria-label="Italic" aria-pressed={selectionState.italic} onPointerDown={event => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <ListToggleButton editor={editor} kind="bulletList" state={lists} className={styles.listToggle} />
        <ListToggleButton editor={editor} kind="orderedList" state={lists} className={styles.listToggle} />
        <HighlightMenu editor={editor} active={selectionState?.highlight ?? false} color={selectionState?.highlightColor ?? null} compact />
        <LinkPopover editor={editor} active={selectionState?.link ?? false} request={linkRequest.mobile} compact />
        <MoreInlineFormats editor={editor} />
      </div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {mediaStatus && <div className={`${styles.mediaStatus} ${chromeStyles.continuousStoryEditorPart}`}>
        <span role={mediaStatus.failed ? 'alert' : 'status'}>{mediaStatus.text}</span>
        {mediaStatus.busy
          ? <button type="button" onClick={cancelMediaTransfer}>Cancel upload</button>
          : <button type="button" onClick={() => setMediaStatus(null)}>Dismiss</button>}
      </div>}
      {placement && anchor !== undefined && createPortal(<>
        {!slashOpen && selectionState?.insertLine && <button type="button" ref={plusButton} className={styles.insertGutter}
          style={placement.plus} aria-label="Add at this line" aria-haspopup="menu" aria-expanded={plusOpen}
          onPointerDown={event => event.preventDefault()} onClick={openPlus}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); dismissPlus(); editor.view.dom.focus({ preventScroll: true }); }
            if (event.key === 'ArrowDown' && plusOpen) { event.preventDefault(); insertMenu.current?.querySelector('button')?.focus({ preventScroll: true }); }
          }}><Plus size={18} aria-hidden="true" /></button>}
        {(slashOpen || plusOpen) && placement.menu.maxHeight >= 44 && <AuthoringCommandMenu
          ref={insertMenu} role="menu" tabIndex={-1} aria-label="Insert into document"
          style={{ left: placement.menu.left, top: placement.menu.top, width: placement.menu.width, maxHeight: Math.min(placement.menu.maxHeight, AUTHORING_COMMAND_MENU_MAX_HEIGHT) }}
          data-open-up={placement.menu.up || undefined}
          onKeyDown={onInsertKeyDown}
          items={menuItems}
          empty="No matching block"
          footer="↑↓ move · ↵ choose · esc close"
          renderItem={(item, index) => <AuthoringCommandRow as="button" role="menuitem" data-document-command={item.key}
            data-command-first={index === 0 ? '' : undefined}
            label={item.label} icon={item.icon} keys={item.keys}
            onPointerDown={event => event.preventDefault()} onClick={() => action(item.key, slashOpen ? 'slash' : 'plus')} />}
        />}
      </>, document.body)}
      <span className={chromeStyles.continuousStoryEditorVisuallyHidden} role="status"><span key={reorderStatus.count}>{reorderStatus.text}</span></span>
      {assetDrop && <div aria-hidden="true" data-asset-drop-marker="" className={styles.assetDrop}
        style={{ left: assetDrop.left, top: assetDrop.top, width: assetDrop.width }}>
        {assetDrop.caretX !== undefined && <span style={{ left: assetDrop.caretX - assetDrop.left }} />}
      </div>}
      <EditorContent editor={editor} />
    </div>
    {groupUpload && <AddGroupImages {...groupUpload} onClose={() => setGroupUpload(null)} />}
  </AssetContext.Provider>;
}
