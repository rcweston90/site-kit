import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, ArrowUpToLine, Check, ChevronRight, ClipboardPaste, Copy, CopyPlus, GripVertical, Image as ImageIcon,
  Columns3, ImagePlus, LayoutPanelLeft, Minus, Move, Palette, Plus, Repeat2, Rows3, Scissors, Settings2, Table2, Trash2,
} from 'lucide-react';
import type { Story, StoryBlock, StoryChapter, StoryMedia, StoryVisibility } from '@rcweston/story-core';
import { useMediaQuery } from '@rcweston/story-react';
import { chapterShortName } from '@rcweston/story-react';
import { storyLargeParagraphs, storyListItems, storySubheadings, withLargeParagraphs, withProseFormat, type StoryProseBlock, type StoryProseFormat } from '@rcweston/story-core';
import { STORY_BLOCK_LABELS } from './StoryBlockEditor.js';
import { BLOCK_GROUPS, BLOCK_ICONS } from './block-catalog.js';
import { copiedBlock, copyBlock, deleteBlockAt, duplicateBlockAt, locateBlock, moveBlockTo, pasteBlockAfter } from './block-actions.js';

/** A block dragged by its grip, carrying its selection id. */
const BLOCK_DRAG = 'application/x-story-block';
import { drawerStyles as surfaceStyles, chromeStyles } from './classes.js';
import { menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass, menuSurfaceClass } from './menu.js';
import {
  createStoryBlock,
  moveItem,
  moveStoryBlock,
  moveStoryBlockToChapter,
  removeChapterWithConfirmation,
  supportedBlockSwaps,
  swapStoryBlock,
} from './model.js';

/* Menu styling shared with the top bar's overflow menu, so every menu in the
   editor reads as one family. */
// On phones the handle sits in a 48px gutter and its menus open beside it, so
// leave that gutter plus the 12px collision margin out of the available width.
export const editorMenuContent = `${surfaceStyles.menu} ${menuContentClass}`;
export const editorMenuItem = menuItemClass;
export const editorMenuLabel = menuLabelClass;
export const editorMenuSeparator = menuSeparatorClass;
/** The ⋮⋮ menu and submenus hold short commands, so they fit their widest
 *  row instead of the shared 22rem, which left most of each row empty. */
const fittedMenuContent = `${surfaceStyles.menu} ${menuSurfaceClass} ${chromeStyles.blockHandleFittedMenuContent}`;
const menuIcon = chromeStyles.blockHandleIcon;
/** Menus stay clear of the sticky top bar instead of covering it. */
const MENU_COLLISION = { top: 60, right: 12, bottom: 12, left: 12 };
const checkSlot = chromeStyles.blockHandleCheckSlot;
/** A menu item's shortcut, right-aligned as in any desktop menu. */
const Keys = ({ children }: { children: ReactNode }) => <kbd aria-hidden="true" className={chromeStyles.blockHandleKeys}>{children}</kbd>;

const REGION_SELECTOR = '[data-story-editor-id]';

/** Hit area of each handle button (A11Y-3); the glyph inside stays small. */
const BUTTON = 44;
/** The rail sits this far left of the text column, the handle just left of it. */
const RAIL_INSET = 12;
/** Paddings above this are section spacing, not content: the rail and handle
 *  line up with the first line of text instead of the top of the padding. */
const STRUCTURAL_PADDING = 24;

const FIXED_REGION_LABELS: Record<string, string> = {
  story: 'Story settings',
  'hero-meta': 'Hero details',
  'hero-read-time': 'Hero read time',
  'hero-copy': 'Hero copy',
  'hero-media': 'Hero media',
  'hero-graphic': 'Hero graphic',
  facts: 'Hero facts',
  decisions: 'Expandable decisions',
  hindsight: 'Hindsight',
  credits: 'Credits',
};

/** Fixed regions whose visibility is a story-level flag. Decisions keep their
 *  own `hidden`; the hero graphic's is the hero layout. */
const VISIBILITY_KEYS: Partial<Record<string, keyof StoryVisibility>> = {
  'hero-media': 'heroMedia',
  'hero-read-time': 'readTime',
  facts: 'facts',
  hindsight: 'hindsight',
  credits: 'credits',
};

/* Choice lists mirror StoryBlockEditor's selects, values included, so a menu
   choice and the old form field write identical data. */
interface Choice { value: string; label: string }
const PROSE_FORMATS: Choice[] = [{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'bullets', label: 'Bulleted list' }, { value: 'numbered', label: 'Numbered list' }];
/* Quick picks for large text. Any other mix is set paragraph by paragraph in
   the text (the selection pill's Large text button), and shows as "Some". */
const LARGE_TEXT: Choice[] = [{ value: 'none', label: 'None' }, { value: 'first', label: 'First paragraph' }, { value: 'all', label: 'All paragraphs' }];
const LARGE_TEXT_NOTICES: Record<string, string> = { none: 'Large text removed', first: 'First paragraph set large', all: 'All paragraphs set large' };
const MEDIA_WIDTHS: Choice[] = [{ value: 'text', label: 'Text column' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full band' }];
const MEDIA_FRAMES: Choice[] = [{ value: '', label: 'Default' }, { value: 'mat', label: 'Mat' }, { value: 'bleed', label: 'Bleed' }];
const MAT_PADDINGS: Choice[] = [{ value: '', label: 'Default' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }];
const GROUP_LAYOUTS: Choice[] = [{ value: 'horizontal', label: 'Side by side' }, { value: 'vertical', label: 'Stacked' }, { value: 'grid', label: 'Grid' }];
const DECISION_PRESENTATIONS: Choice[] = [{ value: 'card', label: 'Card' }, { value: 'editorial', label: 'Editorial' }];
const INSIGHT_LAYOUTS: Choice[] = [{ value: 'columns', label: 'Columns' }, { value: 'split', label: 'Title beside points' }, { value: 'rows', label: 'Rows' }];
const INSIGHT_SURFACES: Choice[] = [{ value: 'card', label: 'Card' }, { value: 'panel', label: 'Dark panel' }, { value: 'open', label: 'No box' }];
const INSIGHT_TITLE_WIDTHS: Choice[] = [{ value: 'measure', label: 'Reading width' }, { value: 'full', label: 'Full width' }];
const OUTCOME_LAYOUTS: Choice[] = [{ value: 'lead', label: 'First result large' }, { value: 'even', label: 'Even' }];
const SPACER_SIZES: Choice[] = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }, { value: 'xl', label: 'Extra large' }];
const GALLERY_COLUMNS: Choice[] = [{ value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }, { value: 'four', label: 'Four' }];
const DECISION_STATUSES: Choice[] = [{ value: 'held', label: 'Held' }, { value: 'revised', label: 'Revised later' }, { value: 'reversed', label: 'Reversed' }];
const CHAPTER_DENSITIES: Choice[] = [{ value: 'default', label: 'Default' }, { value: 'compact', label: 'Compact' }];
const CHAPTER_COLUMNS: Choice[] = [{ value: 'one', label: 'One column' }, { value: 'two', label: 'Two columns' }];

/** Block types with fields the menu can't express (item lists, contribution
 *  text, alternatives): only these keep a "Settings…" entry. Media-bearing
 *  blocks get "Replace media…" instead, anchored to the media itself. */
const BLOCKS_WITH_SETTINGS = new Set<StoryBlock['type']>(['callout', 'decision', 'insight', 'metrics', 'outcomes', 'ledger', 'implemented', 'influenced', 'partners', 'contribution', 'collaboration', 'followUp', 'steps', 'custom']);
const MEDIA_BLOCKS = new Set<StoryBlock['type']>(['media', 'gallery']);
const FIXED_WITH_SETTINGS = new Set(['facts', 'decisions', 'hindsight', 'credits']);
const FIXED_MEDIA = new Set(['hero-media', 'hero-graphic']);
const STYLED_BLOCKS = new Set<StoryBlock['type']>(['prose', 'media', 'decision', 'insight', 'outcomes', 'spacer', 'gallery']);

// A section is named by its heading, never by the STAR key behind it.
const chapterLabel = (chapter: StoryChapter | undefined) => chapterShortName(chapter?.title ?? '');
const chapterSelectionLabel = (story: Story, key: string) => chapterLabel(story.chapters.find((chapter) => chapter.key === key));

/** Human name for an editor selection id, shared by the settings surfaces and the handle menus. */
export function storySelectionLabel(story: Story, selectedId: string): string {
  if (FIXED_REGION_LABELS[selectedId]) return FIXED_REGION_LABELS[selectedId];
  if (selectedId.startsWith('chapter:')) return chapterSelectionLabel(story, selectedId.slice('chapter:'.length));
  if (selectedId.startsWith('block:')) {
    const [, chapterKey, blockId] = selectedId.split(':');
    const chapter = story.chapters.find((item) => item.key === chapterKey);
    const blockIndex = chapter?.blocks.findIndex((block, index) => (block.id ?? String(index)) === blockId) ?? -1;
    const block = blockIndex >= 0 ? chapter?.blocks[blockIndex] : undefined;
    // Counted among its own kind, as a reader would: the first insight in a
    // section is "Insight 1", whatever comes before it.
    const ordinal = chapter ? chapter.blocks.slice(0, blockIndex + 1).filter((item) => item.type === block?.type).length : blockIndex + 1;
    return block ? `${chapterSelectionLabel(story, chapterKey)} · ${STORY_BLOCK_LABELS[block.type]} ${ordinal}` : chapterSelectionLabel(story, chapterKey);
  }
  return 'Story settings';
}

type Region =
  | { kind: 'block'; chapterIndex: number; blockIndex: number; chapter: StoryChapter; block: StoryBlock }
  | { kind: 'chapter'; chapterIndex: number; chapter: StoryChapter }
  | { kind: 'fixed'; id: string };

function resolveRegion(story: Story, id: string): Region | null {
  if (id.startsWith('block:')) {
    const [, chapterKey, blockId] = id.split(':');
    const chapterIndex = story.chapters.findIndex((chapter) => chapter.key === chapterKey);
    const chapter = story.chapters[chapterIndex];
    const blockIndex = chapter?.blocks.findIndex((block, index) => (block.id ?? String(index)) === blockId) ?? -1;
    return chapter && blockIndex >= 0 ? { kind: 'block', chapterIndex, blockIndex, chapter, block: chapter.blocks[blockIndex] } : null;
  }
  if (id.startsWith('chapter:')) {
    const chapterIndex = story.chapters.findIndex((chapter) => `chapter:${chapter.key}` === id);
    return chapterIndex >= 0 ? { kind: 'chapter', chapterIndex, chapter: story.chapters[chapterIndex] } : null;
  }
  return id !== 'story' && FIXED_REGION_LABELS[id] ? { kind: 'fixed', id } : null;
}

/** The ⋮⋮ menu's title: the kind of thing it acts on. The selection label
 *  leads with the section's heading, which a menu this narrow cuts off. */
function regionMenuTitle(region: Region): string {
  if (region.kind === 'block') return STORY_BLOCK_LABELS[region.block.type];
  return region.kind === 'chapter' ? 'Section' : FIXED_REGION_LABELS[region.id];
}

/** Which settings surface a region still needs once the menu has covered its
 *  toggles and choices: a form, a media popover, the story dialog, or none. */
export function regionSettingsKind(story: Story, id: string): 'form' | 'media' | 'story' | null {
  const region = resolveRegion(story, id);
  if (!region) return id === 'story' ? 'story' : null;
  if (region.kind === 'chapter') return null;
  if (region.kind === 'block') {
    if (MEDIA_BLOCKS.has(region.block.type)) return 'media';
    return BLOCKS_WITH_SETTINGS.has(region.block.type) ? 'form' : null;
  }
  if (FIXED_MEDIA.has(region.id)) return 'media';
  if (FIXED_WITH_SETTINGS.has(region.id)) return 'form';
  // The company logo is the one hero detail that isn't text on the page.
  return region.id === 'hero-meta' ? 'story' : null;
}

const withChapter = (story: Story, chapterIndex: number, change: (chapter: StoryChapter) => StoryChapter): Story => ({
  ...story,
  chapters: story.chapters.map((chapter, at) => at === chapterIndex ? change(chapter) : chapter),
});

const withBlocks = (story: Story, chapterIndex: number, change: (blocks: StoryBlock[]) => StoryBlock[]) =>
  withChapter(story, chapterIndex, (chapter) => ({ ...chapter, blocks: change(chapter.blocks) }));

const withBlock = (story: Story, chapterIndex: number, blockIndex: number, next: StoryBlock) =>
  withBlocks(story, chapterIndex, (blocks) => blocks.map((block, at) => at === blockIndex ? next : block));

function fixedVisibility(story: Story, id: string): { visible: boolean; set: (show: boolean) => Story } | null {
  if (id === 'decisions') {
    const section = story.decisions;
    if (!section) return null;
    return { visible: !section.hidden, set: (show) => ({ ...story, decisions: { ...section, hidden: show ? undefined : true } }) };
  }
  if (id === 'hero-graphic') {
    if (!story.heroGraphic) return null;
    // Hiding keeps the graphic's content; it only returns the hero to standard.
    return { visible: story.heroLayout === 'split-graphic', set: (show) => ({ ...story, heroLayout: show ? 'split-graphic' : 'standard' }) };
  }
  const key = VISIBILITY_KEYS[id];
  if (!key) return null;
  return {
    visible: story.visibility?.[key] !== false,
    set: (show) => ({ ...story, visibility: { ...story.visibility, [key]: show ? undefined : false } }),
  };
}

interface Box { top: number; bottom: number; left: number }

/** A region's on-screen box. Block wrappers are `display: contents` (no box of
 *  their own), so their box is the union of what they render. */
function regionBox(element: Element): Box | null {
  const style = getComputedStyle(element);
  if (style.display === 'contents') return unionBoxes([...element.children].map(regionBox));
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;
  const top = rect.top + (padTop > STRUCTURAL_PADDING ? padTop : 0);
  return { top, bottom: Math.max(top, rect.bottom - (padBottom > STRUCTURAL_PADDING ? padBottom : 0)), left: rect.left };
}

function unionBoxes(boxes: (Box | null)[]): Box | null {
  return boxes.reduce<Box | null>((union, box) => {
    if (!box) return union;
    if (!union) return box;
    return { top: Math.min(union.top, box.top), bottom: Math.max(union.bottom, box.bottom), left: Math.min(union.left, box.left) };
  }, null);
}

/** Left edge of the page's text column: the handle and rail live just outside it. */
function textColumnLeft(page: HTMLElement): number {
  const column = page.querySelector<HTMLElement>('[data-story] > div') ?? page;
  return column.getBoundingClientRect().left + (parseFloat(getComputedStyle(column).paddingLeft) || 0);
}

export function regionElements(page: HTMLElement | null, id: string): HTMLElement[] {
  if (!page || !id || id === 'story') return [];
  return [...page.querySelectorAll<HTMLElement>(`[data-story-editor-id="${CSS.escape(id)}"]`)];
}

const MEDIA_CONTENT = 'img, video, iframe, [role="img"]';

/** A figure's media frame: the child that holds the media. In the editor the
 *  media's heading line comes first, and quotes are figures with no media. */
function figureFrame(figure: Element | null): HTMLElement | null {
  const frame = figure && [...figure.children].find((child) => child.matches(MEDIA_CONTENT) || child.querySelector(MEDIA_CONTENT));
  return frame instanceof HTMLElement ? frame : null;
}

/** The media frame (StoryMedia's figure > frame) a click landed in, or null. */
export function mediaFrameAt(target: Element): HTMLElement | null {
  if (target.closest('figcaption')) return null;
  const frame = figureFrame(target.closest('figure'));
  return frame?.contains(target) ? frame : null;
}

/** Which image in an image group a click landed on, or undefined. */
export function mediaItemAt(target: Element): number | undefined {
  const item = target.closest<HTMLElement>('[data-media-item]')?.dataset.mediaItem;
  return item === undefined ? undefined : Number(item);
}

/** The frame of a region's first media item: what a media popover points at. */
export function regionMediaAnchor(page: HTMLElement | null, id: string): HTMLElement | null {
  const regions = regionElements(page, id);
  for (const element of regions) {
    // A media block's root is its own <figure>.
    const figures = element.matches('figure') ? [element, ...element.querySelectorAll('figure')] : [...element.querySelectorAll('figure')];
    const frame = figures.map(figureFrame).find(Boolean);
    if (frame) return frame;
  }
  return regions[0] ?? null;
}

interface Pointer { x: number; y: number }

/** A text selection on the page gets the formatting pill, which reaches into
 *  the gutter when the selection starts at the column edge — so the handle
 *  steps aside (the rail stays) instead of sitting under it. */
function hasTextSelection(page: HTMLElement): boolean {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
  const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement;
  return Boolean(anchor?.closest('[contenteditable="true"]') && page.contains(anchor));
}

/** The region the pointer is working on. Inside the page that is the innermost
 *  region under it; in the gutter it is the row it is level with, and the
 *  region it just left survives the trip across whitespace to its handle. */
function pickRegion(page: HTMLElement, handle: HTMLElement | null, pointer: Pointer, current: HTMLElement | null, gutterLeft: number): HTMLElement | null {
  const hit = document.elementFromPoint(pointer.x, pointer.y);
  if (!hit) return null;
  if (handle?.contains(hit)) return current;
  const found = hit.closest<HTMLElement>(REGION_SELECTOR);
  const region = found && page.contains(found) ? found : null;
  if (current?.isConnected) {
    const box = regionBox(current);
    const handleBox = handle?.getBoundingClientRect();
    const passingThrough = region === null || (region !== current && region.contains(current) && region.dataset.storyEditorId?.startsWith('chapter:'));
    if (box && passingThrough && pointer.x < box.left) {
      const top = Math.min(box.top, handleBox?.top ?? box.top) - RAIL_INSET;
      const bottom = Math.max(box.bottom, handleBox?.bottom ?? box.bottom) + RAIL_INSET;
      if (pointer.y >= top && pointer.y <= bottom) return current;
    }
  }
  if (region) return region;
  if (pointer.x < gutterLeft) {
    const probe = document.elementFromPoint(gutterLeft + RAIL_INSET, pointer.y)?.closest<HTMLElement>(REGION_SELECTOR);
    if (probe && page.contains(probe)) return probe;
  }
  return null;
}

/** Where a click adds a text line: a section's index to insert at, and the
 *  line drawn across its column, in viewport pixels. */
interface BlockGap { chapterKey: string; index: number; y: number; left: number; right: number }

/** Gaps narrower than this are a block's own spacing (a subhead sits 12px
 *  above what it introduces), not room for a line. A compact section's
 *  24px block gap still counts. */
const MIN_GAP = 20;
/** Below a section's last block, the band that adds to its end: one block
 *  gap (the reader styles), so the rest of the section's padding stays inert. */
const END_GAP = 48;

/** The open space between two blocks the pointer is in, or above a section's
 *  first block, or just below its last. Found by geometry rather than by what
 *  is under the pointer, since the "+" drawn there sits outside the page.
 *  Never in the gutter: that is where a block's own handle is reached. */
function blockGapAt(page: HTMLElement, story: Story, pointer: Pointer): BlockGap | null {
  for (const section of page.querySelectorAll<HTMLElement>('[data-story-editor-id^="chapter:"]')) {
    const bounds = section.getBoundingClientRect();
    if (pointer.y < bounds.top || pointer.y > bounds.bottom) continue;
    const key = section.dataset.storyEditorId?.slice('chapter:'.length) ?? '';
    const chapter = story.chapters.find((item) => item.key === key);
    const title = section.querySelector(':scope > h2');
    const body = title?.nextElementSibling?.getBoundingClientRect();
    if (!chapter || !title || !body || pointer.x < body.left || pointer.x > body.right) return null;
    const blocks = [...section.querySelectorAll<HTMLElement>(`[data-story-editor-id^="block:${CSS.escape(key)}:"]`)]
      .map((element) => {
        const blockId = element.dataset.storyEditorId?.split(':')[2];
        return { index: chapter.blocks.findIndex((block, at) => (block.id ?? String(at)) === blockId), box: regionBox(element) };
      })
      .filter((block): block is { index: number; box: Box } => block.index >= 0 && block.box !== null);
    // Each gap runs from the lowest bottom so far, so a note beside its
    // paragraph never opens a gap between the two.
    let floor = title.getBoundingClientRect().bottom;
    for (let at = 0; at <= blocks.length; at += 1) {
      const next = blocks[at];
      const bottom = next ? next.box.top : floor + END_GAP;
      if (bottom - floor >= MIN_GAP && pointer.y >= floor && pointer.y <= bottom) {
        return { chapterKey: key, index: next ? next.index : chapter.blocks.length, y: next ? (floor + bottom) / 2 : floor + END_GAP / 2, left: body.left, right: body.right };
      }
      if (next) floor = Math.max(floor, next.box.bottom);
    }
    return null;
  }
  return null;
}

/** Move the caret into a freshly added block. Tiptap mounts its contenteditable
 *  a frame or two after React renders the block, so look for a few frames. */
/** How long a new block takes to settle in (the reader styles), with room to
 *  spare: the mark comes off even when reduced motion skips the animation. */
const ENTER_MS = 400;

export function focusRegion(page: HTMLElement | null, id: string, fallback: HTMLElement | null, attempts = 12) {
  const region = regionElements(page, id)[0];
  // A block that just arrived settles into place, so the eye finds where it
  // landed — above or below, or as a duplicate.
  if (region && !region.hasAttribute('data-story-entering')) {
    region.setAttribute('data-story-entering', '');
    window.setTimeout(() => region.removeAttribute('data-story-entering'), ENTER_MS);
  }
  const editable = region?.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable) {
    editable.focus();
    editable.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (attempts <= 0) {
    region?.scrollIntoView({ block: 'nearest' });
    fallback?.focus();
    return;
  }
  window.requestAnimationFrame(() => focusRegion(page, id, fallback, attempts - 1));
}

function RadioChoices({ label, value, choices, onChange, first = false }: { label: string; value: string; choices: (Choice & { disabled?: boolean })[]; onChange: (value: string) => void; first?: boolean }) {
  return (
    <>
      {!first && <DropdownMenu.Separator className={editorMenuSeparator} />}
      <DropdownMenu.Label className={editorMenuLabel}>{label}</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
        {choices.map((choice) => (
          <DropdownMenu.RadioItem key={choice.value || 'default'} value={choice.value} disabled={choice.disabled} className={editorMenuItem}>
            <span className={checkSlot}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.blockHandleIcon2} /></DropdownMenu.ItemIndicator></span>
            {choice.label}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}

function CheckItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <DropdownMenu.CheckboxItem className={editorMenuItem} checked={checked} onCheckedChange={(next) => onChange(next === true)}>
      <span className={checkSlot}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.blockHandleIcon2} /></DropdownMenu.ItemIndicator></span>
      {label}
    </DropdownMenu.CheckboxItem>
  );
}

function SubMenu({ icon, label, children, contentClassName = fittedMenuContent }: { icon: ReactNode; label: string; children: ReactNode; contentClassName?: string }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={editorMenuItem}>
        {icon}{label}
        {/* Says it opens further, the way a doc editor's menus do. */}
        <ChevronRight aria-hidden="true" className={`${menuIcon} ${chromeStyles.blockHandleChevronRight}`} />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className={contentClassName} sideOffset={4} collisionPadding={MENU_COLLISION} data-story-editor-action>
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

/** Menus of the block catalogue widen from tablet size up, for its grid. */
const catalogueMenuContent = `${surfaceStyles.menu} ${menuSurfaceClass} ${chromeStyles.blockHandleCatalogueMenuContent}`;

/**
 * The block catalogue as menu items. From tablet width up each group is a
 * two-column grid with its name beside it, so all of it fits on screen
 * without scrolling, and the highlighted block's few words sit in the footer;
 * on phones it is a list with the words inline. Until something is
 * highlighted, the footer says where the block will go.
 */
function BlockTypeItems({ where, onAdd }: { where: string; onAdd: (type: StoryBlock['type']) => void }) {
  const [active, setActive] = useState<{ type: StoryBlock['type']; hint: string } | null>(null);
  return <>
    {BLOCK_GROUPS.map((group, index) => (
      <Fragment key={group.label}>
        {index > 0 && <DropdownMenu.Separator className={editorMenuSeparator} />}
        <DropdownMenu.Group className={chromeStyles.blockHandleGroup}>
          <DropdownMenu.Label className={`${editorMenuLabel} ${chromeStyles.blockHandleIcon3}`}>{group.label}</DropdownMenu.Label>
          <div className={chromeStyles.blockHandleStack}>
            {group.blocks.map(({ type, icon: Icon, hint }) => (
              <DropdownMenu.Item key={type} className={editorMenuItem} textValue={STORY_BLOCK_LABELS[type]} onFocus={() => setActive({ type, hint })} onSelect={() => onAdd(type)}>
                <span aria-hidden="true" className={chromeStyles.blockHandleStack2}>
                  <Icon className={chromeStyles.blockHandleIcon2} strokeWidth={1.75} />
                </span>
                <span className={chromeStyles.blockHandlePart}>
                  {STORY_BLOCK_LABELS[type]}
                  {/* Still read out with the name where the footer shows it. */}
                  <span className={chromeStyles.blockHandlePart2}>{hint}</span>
                </span>
              </DropdownMenu.Item>
            ))}
          </div>
        </DropdownMenu.Group>
      </Fragment>
    ))}
    {/* Pinned to the bottom when the list scrolls (phones). Sticky stops at
        the menu's padding, so it reaches through it to cover what's behind. */}
    <p className={chromeStyles.blockHandlePinned}>
      {active ? <><span className={chromeStyles.blockHandlePart3}>{STORY_BLOCK_LABELS[active.type]}</span> · {active.hint}</> : where}
    </p>
  </>;
}

/** Which quick pick a prose block's large text matches; 'some' for any other
 *  mix. Subheadings and list items are never large, so 'all' leaves them out. */
function largeTextChoice(block: StoryProseBlock): string {
  const large = storyLargeParagraphs(block);
  if (large.length === 0) return 'none';
  if (large.length === 1 && large[0] === 0) return 'first';
  return large.length === block.paragraphs.length - storySubheadings(block).size - storyListItems(block).size ? 'all' : 'some';
}

/** A block's presentation choices, as radio groups in its Style submenu. */
function BlockStyleItems({ block, onChange }: { block: StoryBlock; onChange: (next: StoryBlock, notice: string) => void }) {
  if (block.type === 'prose') {
    // Lists among paragraphs show as a choice of their own, which the
    // other three replace for the whole block.
    const mixed = (block.format ?? 'paragraphs') === 'paragraphs' && storyListItems(block).size > 0;
    const format = mixed ? 'mixed' : block.format ?? 'paragraphs';
    const large = largeTextChoice(block);
    return <>
      <RadioChoices first label="Format" value={format} choices={mixed ? [...PROSE_FORMATS, { value: 'mixed', label: 'Paragraphs and lists', disabled: true }] : PROSE_FORMATS} onChange={(next) => onChange(withProseFormat(block, next as StoryProseFormat), 'Format changed')} />
      {/* This whole-block shortcut is for prose; individual list rows use the inline formatting menu. */}
      {format === 'paragraphs' && <RadioChoices
        label="Large text"
        value={large}
        choices={large === 'some' ? [...LARGE_TEXT, { value: 'some', label: 'Some paragraphs', disabled: true }] : LARGE_TEXT}
        onChange={(choice) => onChange(
          withLargeParagraphs(block, choice === 'all' ? block.paragraphs.map((_, index) => index) : choice === 'first' ? [0] : []),
          LARGE_TEXT_NOTICES[choice],
        )}
      />}
    </>;
  }
  if (block.type === 'media') {
    return <>
      <RadioChoices first label="Width" value={block.width ?? 'wide'} choices={MEDIA_WIDTHS} onChange={(width) => onChange({ ...block, width: width as typeof block.width }, 'Width changed')} />
      <RadioChoices label="Frame" value={block.media.frame ?? ''} choices={MEDIA_FRAMES} onChange={(frame) => onChange({ ...block, media: { ...block.media, frame: (frame || undefined) as typeof block.media.frame } }, 'Frame changed')} />
      {/* A full band's plate runs to the window's edges, so it has no margin to set. */}
      {block.media.frame !== 'bleed' && block.width !== 'full' && <RadioChoices label="Padding" value={block.media.matPadding ?? ''} choices={MAT_PADDINGS} onChange={(matPadding) => onChange({ ...block, media: { ...block.media, matPadding: (matPadding || undefined) as typeof block.media.matPadding } }, 'Padding changed')} />}
    </>;
  }
  if (block.type === 'decision') {
    const editorial = block.presentation === 'editorial';
    return <>
      <RadioChoices first label="Presentation" value={block.presentation ?? 'card'} choices={DECISION_PRESENTATIONS} onChange={(presentation) => onChange({ ...block, presentation: presentation as typeof block.presentation }, 'Presentation changed')} />
      {/* The editorial layout doesn't print a status. */}
      {!editorial && <RadioChoices label="Status" value={block.status ?? 'held'} choices={DECISION_STATUSES} onChange={(status) => onChange({ ...block, status: status as typeof block.status }, 'Status changed')} />}
    </>;
  }
  if (block.type === 'outcomes') {
    return <RadioChoices first label="Layout" value={block.layout ?? 'lead'} choices={OUTCOME_LAYOUTS} onChange={(layout) => onChange({ ...block, layout: layout as typeof block.layout }, 'Layout changed')} />;
  }
  if (block.type === 'spacer') {
    return <RadioChoices first label="Size" value={block.size ?? 'medium'} choices={SPACER_SIZES} onChange={(size) => onChange({ ...block, size: size as typeof block.size }, 'Spacer size changed')} />;
  }
  if (block.type === 'gallery') {
    const layout = block.layout ?? 'grid';
    // A grid seats every image on one plate, so frames are a row's or a
    // stack's choice, set for the whole group.
    const frames = new Set(block.items.map((media) => media.frame ?? ''));
    const frame = frames.size > 1 ? 'mixed' : [...frames][0] ?? '';
    return <>
      <RadioChoices first label="Layout" value={layout} choices={GROUP_LAYOUTS} onChange={(next) => onChange({ ...block, layout: next as typeof block.layout }, 'Layout changed')} />
      {layout === 'grid'
        ? <RadioChoices label="Columns" value={block.columns ?? 'three'} choices={GALLERY_COLUMNS} onChange={(columns) => onChange({ ...block, columns: columns as typeof block.columns }, 'Columns changed')} />
        : <RadioChoices
          label="Frame"
          value={frame}
          choices={frame === 'mixed' ? [...MEDIA_FRAMES, { value: 'mixed', label: 'Mixed', disabled: true }] : MEDIA_FRAMES}
          onChange={(next) => onChange({ ...block, items: block.items.map((media) => ({ ...media, frame: (next || undefined) as StoryMedia['frame'] })) }, 'Frame changed')}
        />}
    </>;
  }
  if (block.type === 'insight') {
    const highlighted = block.columns.findIndex((column) => column.highlight);
    // Columns are named by their headings, as the author wrote them.
    const columnChoices = block.columns.map((column, index) => ({ value: String(index), label: column.label.trim() || `Column ${index + 1}` }));
    return <>
      <RadioChoices first label="Layout" value={block.layout ?? 'columns'} choices={INSIGHT_LAYOUTS} onChange={(layout) => onChange({ ...block, layout: layout as typeof block.layout }, 'Layout changed')} />
      <RadioChoices label="Surface" value={block.surface ?? 'card'} choices={INSIGHT_SURFACES} onChange={(surface) => onChange({ ...block, surface: surface as typeof block.surface }, 'Surface changed')} />
      <RadioChoices label="Title" value={block.titleWidth ?? 'measure'} choices={INSIGHT_TITLE_WIDTHS} onChange={(titleWidth) => onChange({ ...block, titleWidth: titleWidth as typeof block.titleWidth }, 'Title width changed')} />
      {block.columns.length > 0 && <RadioChoices
        label="Set apart"
        value={highlighted >= 0 ? String(highlighted) : 'none'}
        choices={[{ value: 'none', label: 'None' }, ...columnChoices]}
        onChange={(choice) => onChange({
          ...block,
          columns: block.columns.map((column, index) => {
            const next = { ...column };
            if (String(index) === choice) next.highlight = true;
            else delete next.highlight;
            return next;
          }),
        }, choice === 'none' ? 'Nothing set apart' : 'Column set apart')}
      />}
      <DropdownMenu.Separator className={editorMenuSeparator} />
      <CheckItem label="Label above title" checked={block.label !== undefined} onChange={(on) => {
        const next = { ...block };
        if (on) next.label = '';
        else delete next.label;
        onChange(next, on ? 'Label added' : 'Label removed');
      }} />
      <CheckItem label="Closing line" checked={Boolean(block.footer)} onChange={(on) => {
        const next = { ...block };
        if (on) next.footer = { label: 'My contribution', body: { paragraphs: [''] } };
        else delete next.footer;
        onChange(next, on ? 'Closing line added' : 'Closing line removed');
      }} />
    </>;
  }
  return null;
}

function VisibilityItem({ id, visible, set, onApply }: { id: string; visible: boolean; set: (show: boolean) => Story; onApply: (change: EditorHandleChange) => void }) {
  return <CheckItem label="Show on page" checked={visible} onChange={(show) => onApply({ story: set(show), select: id, notice: show ? 'Shown to readers' : 'Hidden from readers — ⌘Z to undo' })} />;
}

interface HandleLayout { id: string; top: number; left: number; row: boolean; hidden: boolean }
interface RailLayout { top: number; left: number; height: number }
/** The gap's line, canvas-relative, and its "+" (`x`, from the line's start). */
interface InserterLayout { chapterKey: string; index: number; top: number; left: number; width: number; x: number }

export interface EditorHandleChange {
  story: Story;
  /** Selection after the change; the caller reconciles it against the new story. */
  select: string;
  /** Short status for the top bar, announced politely. */
  notice: string;
}

type FocusAfterClose = { kind: 'region'; id: string } | { kind: 'settings' } | { kind: 'restore'; element: HTMLElement } | { kind: 'handle' } | null;

/**
 * The document's structure controls, Notion-style: one floating "+" / "⋮⋮"
 * pair in the left gutter that follows the region under the pointer (or the
 * selected region when nothing is hovered, and always on touch), plus one thin
 * rail beside the selection. Nothing is ever drawn over the content itself.
 *
 * The ⋮⋮ menu carries every toggle and choice a region has, so most changes
 * never open a form. Every change goes through `onApply`, which records it in
 * the editor's undo history, so structure edits (delete included) need no
 * confirmation; only a tapped Delete asks for a second tap.
 */
export default function EditorBlockHandle({
  canvasRef,
  pageRef,
  gripRef: externalGripRef,
  story,
  selectedId,
  pinnedId = null,
  addRequest = 0,
  actionsRequest = 0,
  onApply,
  onExtendSelection,
  onSettings,
  onMenuOpenChange,
}: {
  /** Positioned wrapper the handle and rail are placed in. */
  canvasRef: RefObject<HTMLElement | null>;
  /** The rendered page inside the canvas; regions are looked up here. */
  pageRef: RefObject<HTMLElement | null>;
  /** Receives the ⋮⋮ button, so a settings popover can anchor to it. */
  gripRef?: RefObject<HTMLButtonElement | null>;
  story: Story;
  selectedId: string;
  /** Holds the handle on this region (while its settings are open). */
  pinnedId?: string | null;
  /** Increment to open the add-block menu for the selected block or section. */
  addRequest?: number;
  /** Increment to open the ⋮⋮ menu for the selected region (⌥E). */
  actionsRequest?: number;
  onApply: (change: EditorHandleChange) => void;
  /** Shift-click on a block's grip: select the run from the selected block to it. */
  onExtendSelection?: (id: string) => void;
  /** Open a region's settings. `anchor` is what the popover points at (the
   *  handle when null); focus returns to `returnFocus` when it closes. */
  onSettings: (id: string, anchor: HTMLElement | null, returnFocus: HTMLElement | null) => void;
  /** Mirrors the contextual menu state to the phone dock, whose visible
   *  buttons open these Radix menus remotely. */
  onMenuOpenChange?: (menu: 'add' | 'actions' | null) => void;
}) {
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [layout, setLayout] = useState<HandleLayout | null>(null);
  const [rail, setRail] = useState<RailLayout | null>(null);
  const [inserter, setInserter] = useState<InserterLayout | null>(null);
  const [menu, setMenu] = useState<'add' | 'actions' | null>(null);
  /** On touch, Delete asks for a second tap; any menu change disarms it. */
  const [deleteArmed, setDeleteArmed] = useState(false);
  const showMenu = useCallback((next: 'add' | 'actions' | null) => {
    setMenu(next);
    setDeleteArmed(false);
  }, []);
  const handleRef = useRef<HTMLDivElement>(null);
  const ownGripRef = useRef<HTMLButtonElement>(null);
  const gripRef = externalGripRef ?? ownGripRef;
  const hoveredRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<Pointer | null>(null);
  const typingRef = useRef(false);
  const frameRef = useRef(0);
  const focusAfterCloseRef = useRef<FocusAfterClose>(null);
  const inputsRef = useRef({ story, selectedId, finePointer, pinnedId, menuOpen: false });

  useEffect(() => {
    inputsRef.current = { story, selectedId, finePointer, pinnedId, menuOpen: menu !== null };
  });

  useEffect(() => {
    onMenuOpenChange?.(menu);
    return () => onMenuOpenChange?.(null);
  }, [menu, onMenuOpenChange]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const page = pageRef.current;
    if (!canvas || !page) return;
    const { story: latest, selectedId: selection, finePointer: fine, pinnedId: pinned, menuOpen } = inputsRef.current;
    const handle = handleRef.current;
    const origin = canvas.getBoundingClientRect();
    const gutterLeft = textColumnLeft(page);
    // Hold still while a menu or popover is open or the handle has focus, or
    // the buttons would slide out from under the pointer or the keyboard.
    const frozen = menuOpen || Boolean(pinned) || Boolean(handle?.contains(document.activeElement));
    // Open space between blocks offers a new text line instead of a handle;
    // like the handle, it keeps out of the way while the author types.
    const pointer = pointerRef.current;
    const gap = fine && pointer && !frozen && !typingRef.current && !hasTextSelection(page) ? blockGapAt(page, latest, pointer) : null;
    if (pinned) {
      if (hoveredRef.current?.dataset.storyEditorId !== pinned) hoveredRef.current = regionElements(page, pinned)[0] ?? null;
    } else if (!frozen) {
      hoveredRef.current = fine && pointer && !gap
        ? pickRegion(page, handle, pointer, hoveredRef.current, gutterLeft)
        : null;
    }
    if (hoveredRef.current && !hoveredRef.current.isConnected) hoveredRef.current = null;

    const selected = regionElements(page, selection);
    const railX = gutterLeft - origin.left - RAIL_INSET;
    const selectedBox = unionBoxes(selected.map(regionBox));
    const nextRail = selectedBox
      ? { top: Math.round(selectedBox.top - origin.top), left: Math.round(railX), height: Math.max(2, Math.round(selectedBox.bottom - selectedBox.top)) }
      : null;

    const target = hoveredRef.current ?? selected[0] ?? null;
    const targetBox = target ? regionBox(target) : null;
    let nextLayout: HandleLayout | null = null;
    if (target && targetBox && (frozen || (!typingRef.current && !hasTextSelection(page)))) {
      const id = target.dataset.storyEditorId ?? '';
      // Fixed regions have no "+"; keep their lone ⋮⋮ in line with the others.
      const buttons = id.startsWith('block:') || id.startsWith('chapter:') ? 2 : 1;
      const right = railX - 4;
      const row = right - BUTTON * buttons >= 0;
      // Never past the viewport's left edge on phones, where the gutter is
      // narrower than a button.
      const left = row ? right - BUTTON * buttons : Math.max(right - BUTTON, -origin.left);
      nextLayout = {
        id,
        // Centre the first button on the region's first 24px line.
        top: Math.round(targetBox.top - origin.top - (BUTTON - 24) / 2),
        left: Math.round(left),
        row,
        hidden: target.dataset.storyHidden !== undefined,
      };
    }
    setRail((current) => current?.top === nextRail?.top && current?.left === nextRail?.left && current?.height === nextRail?.height ? current : nextRail);
    setLayout((current) => current && nextLayout && current.id === nextLayout.id && current.top === nextLayout.top && current.left === nextLayout.left && current.row === nextLayout.row && current.hidden === nextLayout.hidden ? current : nextLayout);
    // The "+" rides along the line under the pointer, so the click that the
    // hover invited needs no trip to a fixed spot.
    const nextInserter: InserterLayout | null = gap && pointer ? {
      chapterKey: gap.chapterKey,
      index: gap.index,
      top: Math.round(gap.y - origin.top),
      left: Math.round(gap.left - origin.left),
      width: Math.round(gap.right - gap.left),
      x: Math.round(Math.min(Math.max(pointer.x - gap.left, BUTTON / 2), gap.right - gap.left - BUTTON / 2)),
    } : null;
    setInserter((current) => current && nextInserter && current.chapterKey === nextInserter.chapterKey && current.index === nextInserter.index && current.top === nextInserter.top && current.left === nextInserter.left && current.width === nextInserter.width && current.x === nextInserter.x ? current : nextInserter);
  }, [canvasRef, pageRef]);

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    schedule();
  }, [schedule, story, selectedId, finePointer, pinnedId, menu]);

  // ⌥E: bring the handle to the selection and open its menu, then hand focus
  // back to wherever the author was when the menu closes.
  useEffect(() => {
    if (!actionsRequest) return;
    const frame = window.requestAnimationFrame(() => {
      const element = regionElements(pageRef.current, inputsRef.current.selectedId)[0];
      if (!element) return;
      hoveredRef.current = element;
      pointerRef.current = null;
      typingRef.current = false;
      const active = document.activeElement;
      focusAfterCloseRef.current = active instanceof HTMLElement && active !== document.body ? { kind: 'restore', element: active } : null;
      measure();
      showMenu('actions');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [actionsRequest, measure, pageRef, showMenu]);

  useEffect(() => {
    if (!addRequest) return;
    const frame = window.requestAnimationFrame(() => {
      const element = regionElements(pageRef.current, inputsRef.current.selectedId)[0];
      const id = inputsRef.current.selectedId;
      if (!element || (!id.startsWith('block:') && !id.startsWith('chapter:'))) return;
      hoveredRef.current = element;
      pointerRef.current = null;
      typingRef.current = false;
      const active = document.activeElement;
      focusAfterCloseRef.current = active instanceof HTMLElement && active !== document.body ? { kind: 'restore', element: active } : null;
      measure();
      showMenu('add');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [addRequest, measure, pageRef, showMenu]);

  // Drag a block by its ⋮⋮ grip, as in Notion: a line marks where it lands,
  // before or after the block under the pointer, in any section. ⌘⇧↑ / ⌘⇧↓
  // and Move up / down do the same from the keyboard.
  const dragStoryRef = useRef(story);
  const dragApplyRef = useRef(onApply);
  useEffect(() => {
    dragStoryRef.current = story;
    dragApplyRef.current = onApply;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let marked: HTMLElement | null = null;
    const clear = () => {
      if (marked) delete marked.dataset.storyBlockDrop;
      marked = null;
    };
    const targetAt = (event: DragEvent) => {
      const region = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-story-editor-id^="block:"]') : null;
      if (!region) return null;
      const rect = region.getBoundingClientRect();
      return { region, id: region.dataset.storyEditorId ?? '', placement: (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after') as 'before' | 'after' };
    };
    const onOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes(BLOCK_DRAG)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (event.clientY < 72) window.scrollBy({ top: -24, behavior: 'auto' });
      else if (event.clientY > window.innerHeight - 72) window.scrollBy({ top: 24, behavior: 'auto' });
      const target = targetAt(event);
      if (marked !== target?.region) clear();
      if (!target) return;
      marked = target.region;
      marked.dataset.storyBlockDrop = target.placement;
    };
    const onDrop = (event: DragEvent) => {
      const source = event.dataTransfer?.getData(BLOCK_DRAG);
      if (!source) return;
      event.preventDefault();
      const target = targetAt(event);
      clear();
      const current = dragStoryRef.current;
      const from = locateBlock(current, source);
      const to = target && locateBlock(current, target.id);
      const moved = from && to && target ? moveBlockTo(current, from, to, target.placement) : null;
      if (moved) dragApplyRef.current({ ...moved, notice: 'Moved — ⌘Z to undo' });
    };
    const onLeave = (event: DragEvent) => {
      if (!canvas.contains(event.relatedTarget as Node | null)) clear();
    };
    canvas.addEventListener('dragover', onOver);
    canvas.addEventListener('drop', onDrop);
    canvas.addEventListener('dragleave', onLeave);
    window.addEventListener('dragend', clear);
    return () => {
      canvas.removeEventListener('dragover', onOver);
      canvas.removeEventListener('drop', onDrop);
      canvas.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragend', clear);
    };
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const page = pageRef.current;
    if (!canvas || !page) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      typingRef.current = false;
      pointerRef.current = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = () => {
      pointerRef.current = null;
      schedule();
    };
    const onDown = () => {
      if (!typingRef.current) return;
      typingRef.current = false;
      schedule();
    };
    // Typing hides the handle (the rail stays) until the pointer moves again,
    // so nothing flickers beside the caret.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (typingRef.current || !target?.isContentEditable || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1 && !['Backspace', 'Delete', 'Enter'].includes(event.key)) return;
      typingRef.current = true;
      schedule();
    };
    // Focus leaving the handle releases it to follow the pointer again.
    const handle = handleRef.current;
    const onFocusOut = (event: FocusEvent) => {
      if (!handle?.contains(event.relatedTarget as Node | null)) schedule();
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(page);
    handle?.addEventListener('focusout', onFocusOut);
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown, { passive: true });
    canvas.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    document.addEventListener('selectionchange', schedule);
    return () => {
      document.removeEventListener('selectionchange', schedule);
      observer.disconnect();
      handle?.removeEventListener('focusout', onFocusOut);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, { capture: true });
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [canvasRef, pageRef, schedule]);

  const region = layout ? resolveRegion(story, layout.id) : null;
  const label = layout ? storySelectionLabel(story, layout.id) : '';

  const apply = (change: EditorHandleChange, focus: FocusAfterClose = null) => {
    // The status promises "⌘Z to undo", and ⌘Z inside text is the browser's
    // own undo: after a structure change, land on the handle, not in text.
    const current = focusAfterCloseRef.current;
    focusAfterCloseRef.current = focus ?? (current?.kind === 'restore' && current.element.isContentEditable ? null : current);
    onApply(change);
  };
  const openSettings = (id: string, kind: 'form' | 'media' | 'story') => {
    focusAfterCloseRef.current = { kind: 'settings' };
    if (kind === 'story') onSettings('story', null, gripRef.current);
    else onSettings(id, kind === 'media' ? regionMediaAnchor(pageRef.current, id) : null, gripRef.current);
  };
  // Radix hands focus back to the trigger when a menu closes. That is right
  // after a move or delete; after "Add" the caret belongs in the new block,
  // after "Settings…" the popover has already taken focus, and a menu opened
  // with ⌥E gives focus back to the text it was opened from.
  const onCloseAutoFocus = (event: Event) => {
    const next = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    if (!next) return;
    event.preventDefault();
    if (next.kind === 'region') window.requestAnimationFrame(() => focusRegion(pageRef.current, next.id, gripRef.current));
    if (next.kind === 'restore') (next.element.isConnected ? next.element : gripRef.current)?.focus({ preventScroll: true });
    // After a delete the handle moves to the block that took its place;
    // focus follows without scrolling, so the page stays where it was.
    if (next.kind === 'handle') window.requestAnimationFrame(() => gripRef.current?.focus({ preventScroll: true }));
  };

  /** Below a block, or at the end of a section; above a block, or at the
   *  top of a section. */
  const addBlock = (type: StoryBlock['type'], where: 'above' | 'below') => {
    if (!region || region.kind === 'fixed') return;
    const block = createStoryBlock(type);
    const id = `block:${region.chapter.key}:${block.id}`;
    const at = region.kind === 'block'
      ? (where === 'above' ? region.blockIndex : region.blockIndex + 1)
      : (where === 'above' ? 0 : region.chapter.blocks.length);
    apply({
      story: withBlocks(story, region.chapterIndex, (blocks) => [...blocks.slice(0, at), block, ...blocks.slice(at)]),
      select: id,
      notice: `Added ${STORY_BLOCK_LABELS[type]} ${where}`,
    }, { kind: 'region', id });
  };

  /** The gap's "+": an empty text line, caret in it. Typing writes; "/" turns
   *  it into any other block (the slash menu replaces an empty line whole). */
  const insertText = () => {
    if (!inserter) return;
    const chapterIndex = story.chapters.findIndex((chapter) => chapter.key === inserter.chapterKey);
    if (chapterIndex < 0) return;
    const block = createStoryBlock('prose');
    const id = `block:${inserter.chapterKey}:${block.id}`;
    // The pointer is still in a gap (now just above the new line): keep the
    // controls out of the way, as typing would, until it moves on.
    typingRef.current = true;
    setInserter(null);
    onApply({
      story: withBlocks(story, chapterIndex, (blocks) => [...blocks.slice(0, inserter.index), block, ...blocks.slice(inserter.index)]),
      select: id,
      notice: 'Text added — type / for a component',
    });
    window.requestAnimationFrame(() => focusRegion(pageRef.current, id, gripRef.current));
  };

  const blockTypeItems = (where: 'above' | 'below') => {
    if (!region || region.kind === 'fixed') return null;
    const section = chapterLabel(region.chapter);
    const place = region.kind === 'block' ? `Adds ${where} this block` : where === 'above' ? `Adds at the top of ${section}` : `Adds to the end of ${section}`;
    return <BlockTypeItems where={place} onAdd={(type) => addBlock(type, where)} />;
  };

  const settingsKind = layout ? regionSettingsKind(story, layout.id) : null;
  const settingsItem = layout && settingsKind && (
    <DropdownMenu.Item className={editorMenuItem} onSelect={() => openSettings(layout.id, settingsKind)}>
      {settingsKind === 'media'
        // The hero card shows a generated pattern until the story has its own
        // motion, so there is nothing to "replace" yet.
        ? <><ImageIcon aria-hidden="true" className={menuIcon} />{layout.id === 'hero-graphic' && !story.heroGraphic ? 'Add animation…' : 'Replace media…'}</>
        : <><Settings2 aria-hidden="true" className={menuIcon} />{settingsKind === 'story' ? 'Story settings…' : 'Settings…'}</>}
    </DropdownMenu.Item>
  );


  const actionItems = (() => {
    if (!layout || !region) return null;
    const id = layout.id;
    if (region.kind === 'block') {
      const { chapterIndex, blockIndex, chapter, block } = region;
      const swaps = supportedBlockSwaps(block).filter((type) => type !== block.type);
      const change = (next: StoryBlock, notice: string) => apply({ story: withBlock(story, chapterIndex, blockIndex, next), select: id, notice });
      // At a section's edge a move crosses into the next section, and the
      // item says where to, so the block never seems to leave without warning.
      const moveItemFor = (direction: -1 | 1) => {
        const moved = moveStoryBlock(story, chapterIndex, blockIndex, direction);
        const word = direction === -1 ? 'up' : 'down';
        const destination = moved && moved.chapterIndex !== chapterIndex ? chapterLabel(story.chapters[moved.chapterIndex]) : null;
        const movedId = moved && `block:${moved.story.chapters[moved.chapterIndex].key}:${block.id ?? String(moved.blockIndex)}`;
        return (
          <DropdownMenu.Item className={editorMenuItem} disabled={!moved} onSelect={() => {
            if (moved && movedId) apply({ story: moved.story, select: movedId, notice: destination ? `Moved to ${destination}` : `Moved ${word}` });
          }}>
            {direction === -1 ? <ArrowUp aria-hidden="true" className={menuIcon} /> : <ArrowDown aria-hidden="true" className={menuIcon} />}
            <span className={chromeStyles.blockHandleTruncated}>{destination ? `Move ${word} to ${destination}` : `Move ${word}`}</span>
            <Keys>{direction === -1 ? '⌘⇧↑' : '⌘⇧↓'}</Keys>
          </DropdownMenu.Item>
        );
      };
      const reshapes = swaps.length > 0 || STYLED_BLOCKS.has(block.type) || block.type === 'table' || block.type === 'gallery';
      // Four groups: what the block is, where it goes, whether readers see
      // it, and deleting it. Adding is the "+" button's, beside this one.
      return <>
        {swaps.length > 0 && (
          <SubMenu icon={<Repeat2 aria-hidden="true" className={menuIcon} />} label="Turn into">
            {swaps.map((type) => {
              const Icon = BLOCK_ICONS.get(type);
              return (
                <DropdownMenu.Item key={type} className={editorMenuItem} onSelect={() => {
                  const next = swapStoryBlock(block, type);
                  // A new kind of block renders new text fields: put the caret in it.
                  if (next) apply({ story: withBlock(story, chapterIndex, blockIndex, next), select: id, notice: `Turned into ${STORY_BLOCK_LABELS[type]}` }, { kind: 'region', id });
                }}>
                  {Icon ? <Icon aria-hidden="true" className={menuIcon} strokeWidth={1.75} /> : <span className={checkSlot} />}
                  {STORY_BLOCK_LABELS[type]}
                </DropdownMenu.Item>
              );
            })}
          </SubMenu>
        )}
        {STYLED_BLOCKS.has(block.type) && <SubMenu icon={<Palette aria-hidden="true" className={menuIcon} />} label="Style"><BlockStyleItems block={block} onChange={change} /></SubMenu>}
        {block.type === 'table' && (
          <SubMenu icon={<Table2 aria-hidden="true" className={menuIcon} />} label="Rows and columns">
            <DropdownMenu.Item className={editorMenuItem} onSelect={() => change({ ...block, rows: [...block.rows, block.rows[0].map(() => '')] }, 'Row added')}>
              <Rows3 aria-hidden="true" className={menuIcon} />Add row
            </DropdownMenu.Item>
            <DropdownMenu.Item className={editorMenuItem} onSelect={() => change({ ...block, rows: block.rows.map((row) => [...row, '']) }, 'Column added')}>
              <Columns3 aria-hidden="true" className={menuIcon} />Add column
            </DropdownMenu.Item>
            <DropdownMenu.Item className={editorMenuItem} disabled={block.rows.length <= 1} onSelect={() => change({ ...block, rows: block.rows.slice(0, -1) }, 'Last row removed — ⌘Z to undo')}>
              <Minus aria-hidden="true" className={menuIcon} />Remove last row
            </DropdownMenu.Item>
            <DropdownMenu.Item className={editorMenuItem} disabled={block.rows[0].length <= 1} onSelect={() => change({ ...block, rows: block.rows.map((row) => row.slice(0, -1)) }, 'Last column removed — ⌘Z to undo')}>
              <Minus aria-hidden="true" className={menuIcon} />Remove last column
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={editorMenuSeparator} />
            <CheckItem label="First row is headings" checked={block.headerRow !== false} onChange={(on) => {
              const next = { ...block };
              if (on) delete next.headerRow;
              else next.headerRow = false;
              change(next, on ? 'First row is headings' : 'First row is body text');
            }} />
          </SubMenu>
        )}
        {block.type === 'gallery' && <>
          <DropdownMenu.Item className={editorMenuItem} onSelect={() => change({ ...block, items: [...block.items, { kind: 'image', alt: '' }] }, 'Image added')}>
            <ImagePlus aria-hidden="true" className={menuIcon} />Add image
          </DropdownMenu.Item>
          {block.items.length > 1 && (
            <DropdownMenu.Item className={editorMenuItem} onSelect={() => change({ ...block, items: [...block.items].reverse() }, 'Order reversed')}>
              {block.layout === 'horizontal'
                ? <ArrowLeftRight aria-hidden="true" className={menuIcon} />
                : <ArrowUpDown aria-hidden="true" className={menuIcon} />}
              Reverse order
            </DropdownMenu.Item>
          )}
        </>}
        {reshapes && <DropdownMenu.Separator className={editorMenuSeparator} />}
        <DropdownMenu.Item className={editorMenuItem} onSelect={() => {
          const duplicated = duplicateBlockAt(story, { chapterIndex, blockIndex, block, chapterKey: chapter.key });
          apply({ ...duplicated, notice: 'Duplicated' }, { kind: 'region', id: duplicated.select });
        }}>
          <CopyPlus aria-hidden="true" className={menuIcon} />Duplicate<Keys>⌘D</Keys>
        </DropdownMenu.Item>
        {/* The grip drags and ⌘⇧↑ / ⌘⇧↓ step, so moving from the menu is
            the fallback, one level in. */}
        <SubMenu icon={<Move aria-hidden="true" className={menuIcon} />} label="Move">
          {moveItemFor(-1)}
          {moveItemFor(1)}
          <DropdownMenu.Separator className={editorMenuSeparator} />
          <DropdownMenu.Label className={editorMenuLabel}>To the end of</DropdownMenu.Label>
          {story.chapters.map((targetChapter) => {
            const current = targetChapter.key === chapter.key;
            return (
              <DropdownMenu.Item key={targetChapter.key} className={editorMenuItem} disabled={current} onSelect={() => {
                const moved = moveStoryBlockToChapter(story, chapterIndex, blockIndex, targetChapter.key);
                if (!moved) return;
                const movedId = `block:${targetChapter.key}:${block.id ?? String(moved.blockIndex)}`;
                apply({ story: moved.story, select: movedId, notice: `Moved to ${chapterLabel(targetChapter)}` }, { kind: 'handle' });
              }}>
                <span className={checkSlot}>{current && <Check aria-hidden="true" className={chromeStyles.blockHandleIcon2} />}</span>
                {/* One line each: the check says which is current. */}
                <span className={chromeStyles.blockHandleTruncated}>{chapterLabel(targetChapter)}{current && <span className={chromeStyles.blockHandleVisuallyHidden}> (current)</span>}</span>
              </DropdownMenu.Item>
            );
          })}
        </SubMenu>
        <DropdownMenu.Item className={editorMenuItem} onSelect={() => {
          copyBlock(block);
          apply({ ...deleteBlockAt(story, { chapterIndex, blockIndex, block, chapterKey: chapter.key }), notice: 'Cut — ⌘V pastes it below a block' }, { kind: 'handle' });
        }}>
          <Scissors aria-hidden="true" className={menuIcon} />Cut<Keys>⌘X</Keys>
        </DropdownMenu.Item>
        <DropdownMenu.Item className={editorMenuItem} onSelect={() => {
          copyBlock(block);
          // Nothing on the page changes, so the reducer records no step.
          apply({ story, select: id, notice: `${label} copied — ⌘V pastes it below a block` }, { kind: 'handle' });
        }}>
          <Copy aria-hidden="true" className={menuIcon} />Copy<Keys>⌘C</Keys>
        </DropdownMenu.Item>
        <DropdownMenu.Item className={editorMenuItem} disabled={!copiedBlock()} onSelect={() => {
          const pasted = pasteBlockAfter(story, { chapterIndex, blockIndex, block, chapterKey: chapter.key });
          if (pasted) apply({ ...pasted, notice: 'Pasted below' }, { kind: 'region', id: pasted.select });
        }}>
          <ClipboardPaste aria-hidden="true" className={menuIcon} />Paste below<Keys>⌘V</Keys>
        </DropdownMenu.Item>
        <DropdownMenu.Separator className={editorMenuSeparator} />
        <VisibilityItem id={id} visible={!block.hidden} set={(show) => withBlock(story, chapterIndex, blockIndex, { ...block, hidden: show ? undefined : true } as StoryBlock)} onApply={apply} />
        {settingsItem}
        <DropdownMenu.Separator className={editorMenuSeparator} />
        {/* One click with a mouse, as in any doc editor, since ⌘Z brings it
            back. A tap lands by mistake more easily, so touch asks twice. */}
        <DropdownMenu.Item className={`${editorMenuItem} ${chromeStyles.blockHandleItem} ${deleteArmed ? chromeStyles.blockHandleItemOn : ''}`} onSelect={(event) => {
          if (!finePointer && !deleteArmed) {
            event.preventDefault();
            setDeleteArmed(true);
            return;
          }
          apply({ ...deleteBlockAt(story, { chapterIndex, blockIndex, block, chapterKey: chapter.key }), notice: 'Deleted — ⌘Z to undo' }, { kind: 'handle' });
        }}>
          <Trash2 aria-hidden="true" className={chromeStyles.blockHandleIcon4} />{deleteArmed ? 'Tap again to delete' : 'Delete'}<Keys>⌫</Keys>
        </DropdownMenu.Item>
      </>;
    }
    if (region.kind === 'chapter') {
      const { chapterIndex, chapter } = region;
      const changeChapter = (next: StoryChapter, notice: string) => apply({ story: withChapter(story, chapterIndex, () => next), select: id, notice });
      return <>
        <DropdownMenu.Item className={editorMenuItem} disabled={chapterIndex === 0} onSelect={() => apply({ story: { ...story, chapters: moveItem(story.chapters, chapterIndex, -1) }, select: id, notice: 'Section moved up' })}>
          <ArrowUp aria-hidden="true" className={menuIcon} />Move up
        </DropdownMenu.Item>
        <DropdownMenu.Item className={editorMenuItem} disabled={chapterIndex === story.chapters.length - 1} onSelect={() => apply({ story: { ...story, chapters: moveItem(story.chapters, chapterIndex, 1) }, select: id, notice: 'Section moved down' })}>
          <ArrowDown aria-hidden="true" className={menuIcon} />Move down
        </DropdownMenu.Item>
        <SubMenu icon={<LayoutPanelLeft aria-hidden="true" className={menuIcon} />} label="Layout">
          <RadioChoices first label="Density" value={chapter.density ?? 'default'} choices={CHAPTER_DENSITIES} onChange={(density) => changeChapter({ ...chapter, density: density as StoryChapter['density'] }, 'Density changed')} />
          <RadioChoices label="Text columns" value={chapter.columns ?? 'one'} choices={CHAPTER_COLUMNS} onChange={(columns) => changeChapter({ ...chapter, columns: columns as StoryChapter['columns'] }, 'Columns changed')} />
        </SubMenu>
        <DropdownMenu.Separator className={editorMenuSeparator} />
        <VisibilityItem id={id} visible={!chapter.hidden} set={(show) => withChapter(story, chapterIndex, (item) => ({ ...item, hidden: show ? undefined : true }))} onApply={apply} />
        <DropdownMenu.Separator className={editorMenuSeparator} />
        <DropdownMenu.Item className={`${editorMenuItem} ${chromeStyles.blockHandleItem2}`} disabled={story.chapters.length <= 1} onSelect={() => {
          window.requestAnimationFrame(() => {
            const next = removeChapterWithConfirmation(story, chapter.key, (message) => window.confirm(message));
            if (next === story) return;
            const neighbour = next.chapters[Math.min(chapterIndex, next.chapters.length - 1)];
            apply({ story: next, select: `chapter:${neighbour.key}`, notice: 'Section and its content deleted — ⌘Z to undo' }, { kind: 'handle' });
          });
        }}>
          <Trash2 aria-hidden="true" className={chromeStyles.blockHandleIcon4} />Delete section and content…
        </DropdownMenu.Item>
      </>;
    }
    const visibility = fixedVisibility(story, region.id);
    if (!visibility && !settingsItem) return <p className={chromeStyles.blockHandleHint}>Everything here is edited on the page.</p>;
    return <>
      {visibility && <VisibilityItem id={id} visible={visibility.visible} set={visibility.set} onApply={apply} />}
      {settingsItem}
    </>;
  })();

  const buttonClass = chromeStyles.blockHandleStack3;

  return (
    <>
      {rail && (
        <div
          aria-hidden="true"
          className={chromeStyles.blockHandlePinned2}
          style={{ top: rail.top, left: rail.left, height: rail.height }}
        />
      )}
      {inserter && (
        // A pointer shortcut: the keyboard adds blocks from the handle's "+"
        // or "/" in text. The line itself is only a guide.
        <div className={chromeStyles.blockHandlePinned3} style={{ top: inserter.top, left: inserter.left, width: inserter.width }}>
          <button
            type="button"
            data-story-editor-action
            className={chromeStyles.blockHandleAddTextHere}
            style={{ left: inserter.x }}
            aria-label="Add text here"
            title="Add text here — type / for a component"
            // Close any text edit on press, so its words are saved to the story
            // (and its own undo step) before the click adds the line. Most
            // browsers move focus here on press anyway; Safari doesn't.
            onPointerDown={() => {
              const active = document.activeElement;
              if (active instanceof HTMLElement && active.isContentEditable) active.blur();
            }}
            onClick={insertText}
          >
            <span aria-hidden="true" className={chromeStyles.blockHandleStack4}>
              <Plus className={chromeStyles.blockHandleIcon2} strokeWidth={2} />
            </span>
          </button>
        </div>
      )}
      <div
        ref={handleRef}
        role="group"
        aria-label={label ? `${label} controls` : undefined}
        data-story-editor-action
        className={`${chromeStyles.blockHandleGroup2} ${layout ? '' : chromeStyles.blockHandleGroupOff}`}
        style={layout ? { transform: `translate(${layout.left}px, ${layout.top}px)` } : undefined}
      >
        <div className={`${chromeStyles.blockHandlePart4} ${layout?.row ? chromeStyles.blockHandlePartOn : chromeStyles.blockHandleStackOff}`}>
          {/* Both menus are non-modal: a modal menu locks body scroll, which
              turns <body> into a scroll container and unsticks the top bar. */}
          {region && region.kind !== 'fixed' && (
            <DropdownMenu.Root modal={false} open={menu === 'add'} onOpenChange={(open) => showMenu(open ? 'add' : null)}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={`${buttonClass} ${chromeStyles.blockHandleIcon5}`}
                  aria-label={region.kind === 'block' ? `Add block above or below ${label}` : `Add block to ${label}`}
                  title={region.kind === 'block' ? 'Add a block below, or above' : 'Add a block to this section'}
                >
                  <Plus aria-hidden="true" className={chromeStyles.blockHandleIcon2} strokeWidth={1.75} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                {/* Beside the +, not under it: a side menu can slide up or
                    down to use the window's height, so the catalogue reads
                    in one look. */}
                <DropdownMenu.Content className={catalogueMenuContent} side="right" align="start" sideOffset={4} collisionPadding={MENU_COLLISION} data-story-editor-action onCloseAutoFocus={onCloseAutoFocus}>
                  {/* Below is the common case and stays one click; above is
                      one level in, first so it's found. */}
                  <SubMenu icon={<ArrowUpToLine aria-hidden="true" className={menuIcon} />} label={region.kind === 'block' ? 'Add above' : `Add at the top of ${chapterLabel(region.chapter)}`} contentClassName={catalogueMenuContent}>
                    {blockTypeItems('above')}
                  </SubMenu>
                  <DropdownMenu.Separator className={editorMenuSeparator} />
                  {blockTypeItems('below')}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          <DropdownMenu.Root modal={false} open={menu === 'actions'} onOpenChange={(open) => showMenu(open ? 'actions' : null)}>
            <DropdownMenu.Trigger asChild>
              <button
                ref={gripRef}
                type="button"
                draggable={region?.kind === 'chapter' || region?.kind === 'block'}
                onPointerDown={(event) => {
                  // Shift-click adds this block to a run instead of opening the menu.
                  if (!event.shiftKey || region?.kind !== 'block' || !layout || !onExtendSelection) return;
                  event.preventDefault();
                  onExtendSelection(layout.id);
                }}
                onDragStart={(event) => {
                  if (region?.kind === 'block' && layout) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(BLOCK_DRAG, layout.id);
                    event.dataTransfer.setData('text/plain', label);
                    showMenu(null);
                    return;
                  }
                  if (region?.kind !== 'chapter') {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-story-section', region.chapter.key);
                  event.dataTransfer.setData('text/plain', region.chapter.title);
                  showMenu(null);
                }}
                onDragEnd={() => {
                  pageRef.current?.querySelectorAll<HTMLElement>('[data-story-section-drop]').forEach((element) => delete element.dataset.storySectionDrop);
                }}
                className={`${buttonClass} ${chromeStyles.blockHandleIcon5}`}
                aria-label={`${label} actions`}
                aria-keyshortcuts="Alt+E"
                title={region?.kind === 'chapter' ? 'Drag to move section, or open actions' : 'Drag to move, or open actions (⌥E)'}
              >
                <GripVertical aria-hidden="true" className={chromeStyles.blockHandleIcon2} strokeWidth={1.75} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              {/* Beside the grip, like the +: below it, a block mid-screen
                  left the menu half the window and a scroll. */}
              <DropdownMenu.Content className={fittedMenuContent} side="right" align="start" sideOffset={4} collisionPadding={MENU_COLLISION} data-story-editor-action onCloseAutoFocus={onCloseAutoFocus}>
                <DropdownMenu.Label className={editorMenuLabel}>{region ? regionMenuTitle(region) : label}</DropdownMenu.Label>
                {actionItems}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        {layout?.hidden && (
          <span className={chromeStyles.blockHandlePinned4}>
            Hidden
          </span>
        )}
      </div>
    </>
  );
}
