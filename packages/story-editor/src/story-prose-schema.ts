import { Extension, Mark, Node, markInputRule, markPasteRule, mergeAttributes, textInputRule, type Editor } from '@tiptap/react';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { canJoin, liftTarget } from '@tiptap/pm/transform';
import { closeHistory } from '@tiptap/pm/history';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { EDITOR_LINK_OPTIONS, EditorLinkTarget } from './editor-link.js';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { isStoryHeadingLevel, STORY_HEADING_LEVELS, STORY_LIST_MAX_DEPTH, type StoryHeadingLevel } from '@rcweston/story-core';
import { highlightColor, safeInlineHref } from '@rcweston/story-core';

/* Story prose admits paragraphs, subheadings and lists. A list item
 * has one editable paragraph with independent scale and optional sublists.
 * The blog keeps its broader HTML schema and shares the formatting commands. */
type ProseState = Editor['state'];
type ProseDoc = ProseState['doc'];
type ProseNode = ProseDoc;
type ProseSlice = ReturnType<ProseDoc['slice']>;
export type StoryProsePosition = ReturnType<ProseDoc['resolve']>;
export type StoryListKind = 'bulletList' | 'orderedList';

const isList = (node: ProseNode | null | undefined) => node?.type.name === 'bulletList' || node?.type.name === 'orderedList';
const isParagraph = (node: ProseNode | null | undefined) => node?.type.name === 'paragraph';

const LIST_BOUNDARY_ATTRS = ['origin', 'blockAnchor', 'blockStart', 'blockKind'] as const;
function listBoundaryAttrs(node: ProseNode, destination: ProseNode['type'], fallback?: ProseNode) {
  const attrs = { ...node.attrs };
  for (const key of LIST_BOUNDARY_ATTRS) {
    if (destination.spec.attrs?.[key] && attrs[key] == null && fallback?.attrs[key] != null) attrs[key] = fallback.attrs[key];
  }
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => Boolean(destination.spec.attrs?.[key])));
}

function listOrigin(list: ProseNode): string | null {
  const origin = list.attrs.origin ?? list.firstChild?.firstChild?.attrs.origin;
  return origin ? `${origin.chapterKey}:${origin.block?.id ?? origin.blockIndex}` : null;
}

/** Join lists under the actual touched rich-text parent (Case section and
 * Callout aren't document-root children). Existing content boundaries and an
 * explicit ordered restart aren't part of this formatting action. */
function joinTouchedLists(tr: Transaction, touched: readonly { pos: number; node: ProseNode }[], wrapped: readonly number[]) {
  const starts = new Map<number, ProseNode>();
  const spans = touched.map(({ pos, node }) => ({
    from: tr.mapping.map(pos + 1, -1), to: tr.mapping.map(pos + node.nodeSize - 1, 1),
  }));
  for (const { from } of spans) {
    const point = tr.doc.resolve(Math.max(0, Math.min(tr.doc.content.size, from)));
    for (let depth = point.depth; depth >= 0; depth--) {
      const node = point.node(depth);
      if (depth === 0 || node.type.name === 'storySection' || node.type.name === 'calloutBody') {
        starts.set(point.start(depth), node);
        break;
      }
    }
  }
  const wrappedPositions = wrapped.map(pos => tr.mapping.map(pos + 1, 1));
  const joins: number[] = [];
  for (const [start, parent] of starts) {
    let previous: ProseNode | null = null;
    parent.forEach((node, offset) => {
      const boundary = start + offset;
      if (previous && isList(node) && node.type === previous.type && listOrigin(node) === listOrigin(previous)
        && (node.type.name !== 'orderedList'
          || wrappedPositions.some(pos => pos > boundary && pos < boundary + node.nodeSize)
          || node.attrs.start === (previous.attrs.start ?? 1) + previous.childCount)
        && spans.some(span => span.from < boundary + node.nodeSize && span.to >= boundary - previous!.nodeSize)
        && canJoin(tr.doc, boundary)) joins.push(boundary);
      previous = node;
    });
  }
  for (const pos of joins.sort((a, b) => b - a)) tr.join(pos);
}


const StoryDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(paragraph | heading | bulletList | orderedList)+',
});

// Keep one text paragraph per story item to match its story storage.
const StoryListItem = Node.create({
  name: 'listItem',
  content: 'paragraph (bulletList | orderedList)*',
  defining: true,
  parseHTML() { return [{ tag: 'li' }]; },
  renderHTML({ HTMLAttributes }) { return ['li', mergeAttributes(HTMLAttributes), 0]; },
});

/* --- Large text: paragraph scale, independent of list structure. */

/**
 * The `large` attribute on paragraphs. It survives a split, so Enter in large
 * text keeps writing large text. It renders as the reader's own large-text
 * class, so a paragraph looks on the canvas exactly as it publishes; the
 * data attribute is what proseBlockToHtml and the clipboard carry.
 */
export const StoryParagraphStyle = Extension.create<{ largeClass?: string }>({
  name: 'storyParagraphStyle',
  addOptions() { return { largeClass: undefined }; },
  addGlobalAttributes() {
    const { largeClass } = this.options;
    return [{
      types: ['paragraph'],
      attributes: {
        large: {
          default: false,
          keepOnSplit: true,
          parseHTML: (element) => element.hasAttribute('data-large'),
          renderHTML: (attributes) => (attributes.large ? { 'data-large': 'true', ...(largeClass ? { class: largeClass } : {}) } : {}),
        },
      },
    }];
  },
});

/** The paragraph with the given style, or itself if it already has it. */
const styled = (paragraph: ProseNode, large: boolean) => (paragraph.attrs.large === large ? paragraph : paragraph.type.create({ ...paragraph.attrs, large }, paragraph.content));

/** The paragraphs a selection touches, including list items. A range that only
 *  reaches the start of a paragraph (a drag that ends there) doesn't count. */
function touchedParagraphs(state: ProseState): { node: ProseNode; pos: number }[] {
  const { from, to, empty } = state.selection;
  const found: { node: ProseNode; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!isParagraph(node)) return true;
    if (empty || from > pos || to > pos + 1) found.push({ node, pos });
    return false;
  });
  return found;
}

/** Whether every paragraph the selection touches is large. A mixed selection
 *  isn't, so the toggle makes it all large. */
export function storyLargeActive(state: ProseState): boolean {
  const paragraphs = touchedParagraphs(state);
  return paragraphs.length > 0 && paragraphs.every(({ node }) => node.attrs.large === true);
}

/** Large or body scale for every selected paragraph, without changing structure. */
export function setStoryLarge(editor: Editor, large: boolean): boolean {
  const paragraphs = touchedParagraphs(editor.state);
  if (paragraphs.length === 0) return false;
  return editor.chain().command(({ tr }) => {
    // Restyling never changes a node's size, so every position stays valid.
    for (const { node, pos } of paragraphs) if (node.attrs.large !== large) tr.setNodeMarkup(pos, undefined, { ...node.attrs, large });
    return true;
  }).run();
}

/** The selection pill's Large text button. */
export function toggleStoryLarge(editor: Editor): boolean {
  return setStoryLarge(editor, !storyLargeActive(editor.state));
}

/**
 * Enter in an empty large paragraph returns it to body text instead of adding
 * another: press Enter twice to leave large text, as you leave a list. Every
 * other Enter is the default split, which keeps the style.
 */
export function enterInStoryLargeText(editor: Editor): boolean {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!selection.empty || $from.depth !== 1 || !isParagraph($from.parent)) return false;
  if ($from.parent.content.size > 0 || $from.parent.attrs.large !== true) return false;
  return setStoryLarge(editor, false);
}

/** A list marker typed by hand at the start of a paragraph: "- ", "• ", "1. ". */
const TYPED_LIST_MARKER = /^(?:[-–—•*+]|\d+[.)])\s+/;

/** The textblocks a selection touches, in or out of lists. A range that only
 *  reaches the start of one (a drag that ends there) doesn't count. */
function touchedTextblocks({ doc, selection }: Pick<Transaction, 'doc' | 'selection'>): { node: ProseNode; pos: number }[] {
  const { from, to, empty } = selection;
  const found: { node: ProseNode; pos: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (empty || from > pos || to > pos + 1) found.push({ node, pos });
    return false;
  });
  return found;
}

/** List is independent of type scale. Ineligible textblocks veto the whole
 * operation before a transaction can move or flatten them. */
export function listToggleState(state: Pick<ProseState, 'doc' | 'selection'>): { enabled: boolean; kind: StoryListKind | null } {
  const touched = touchedTextblocks(state);
  if (!touched.length || touched.some(({ node, pos }) => {
    const point = state.doc.resolve(pos);
    return !isParagraph(node) || Array.from({ length: point.depth }, (_, i) => point.node(i + 1))
      .some(parent => parent.type.name === 'blockquote');
  })) return { enabled: false, kind: null };
  const kinds = new Set(touched.map(({ pos }) => {
    const point = state.doc.resolve(pos);
    return point.depth >= 2 && point.parent.type.name === 'listItem' ? point.node(-1).type.name : null;
  }));
  const kind = kinds.size === 1 ? [...kinds][0] : null;
  return { enabled: true, kind: kind === 'bulletList' || kind === 'orderedList' ? kind : null };
}

/** The range around the textblock at `pos`, for wrapping or lifting it. */
const rangeAround = (doc: ProseDoc, pos: number) => {
  const node = doc.nodeAt(pos);
  return node ? doc.resolve(pos + 1).blockRange(doc.resolve(pos + node.nodeSize - 1)) : null;
};

/**
 * The list buttons, as in a doc editor. Every paragraph the selection touches
 * becomes an item (existing scale stays), and a list
 * of the other kind it touches switches kind; if all it touches are already
 * items of this kind, they go back to paragraphs, splitting their list where
 * needed. The rest of the block is left as it is, and neighbouring lists of
 * one kind become one. A marker someone typed by hand before the list
 * existed ("- point") goes when its paragraph becomes an item, since the
 * list now draws one.
 *
 * Written here rather than with Tiptap's toggleList, whose wrapping first
 * gathers the selected paragraphs into one item, which a one-paragraph item
 * refuses, so selecting two paragraphs did nothing.
 */
export function toggleStoryList(editor: Editor, kind: StoryListKind): boolean {
  if (!listToggleState(editor.state).enabled) return false;
  if (inListItem(editor.state.selection.$from) && inListItem(editor.state.selection.$to)) {
    const from = editor.state.selection.$from, to = editor.state.selection.$to;
    let levels = 0;
    for (let depth = from.depth - 1; depth > 0; depth--) if (isList(from.node(depth))) levels++;
    const containsSublists = from.node(-2).children.some(item => item.childCount > 1);
    if (from.before(-2) === to.before(-2) && (levels > 1 || containsSublists)) {
      return editor.chain().command(({ tr }) => { closeHistory(tr).setMeta('storyListBoundary', true); return true; }).toggleList(kind, 'listItem').run();
    }
  }
  return editor.chain().command(({ tr }) => {
    const { schema } = tr.doc.type;
    const listType = schema.nodes[kind];
    const touched = touchedTextblocks(tr);
    if (touched.length === 0 || touched.some(({ node }) => !isParagraph(node))) return false;
    closeHistory(tr).setMeta('storyListBoundary', true);
    const listAt = (pos: number) => {
      const point = tr.doc.resolve(pos);
      return point.parent.type.name === 'listItem' ? { list: point.node(-1), pos: point.before(-1) } : null;
    };
    const unwrap = touched.every(({ pos }) => listAt(pos)?.list.type === listType);
    const wrapped = touched.filter(({ pos }) => !listAt(pos)).map(({ pos }) => pos);
    // Last to first, so each change leaves the positions before it alone.
    for (const { node, pos } of [...touched].reverse()) {
      const inList = listAt(pos);
      if (unwrap) {
        if (inList?.list.attrs.origin && !node.attrs.origin) {
          const attrs = listBoundaryAttrs(node, node.type, inList.list);
          if (tr.doc.resolve(pos).index(-1) !== 0) attrs.blockStart = false;
          tr.setNodeMarkup(pos, node.type, attrs);
        }
        const range = rangeAround(tr.doc, pos);
        const target = range && liftTarget(range);
        if (range && target !== null) tr.lift(range, target);
      } else if (inList) {
        if (inList.list.type !== listType) tr.setNodeMarkup(inList.pos, listType);
      } else {
        const marker = node.firstChild?.isText ? node.firstChild.text?.match(TYPED_LIST_MARKER) : null;
        if (marker) tr.delete(pos + 1, pos + 1 + marker[0].length);
        const range = rangeAround(tr.doc, pos);
        if (range) tr.wrap(range, [{ type: listType, attrs: listBoundaryAttrs(node, listType) }, { type: schema.nodes.listItem }]);
      }
    }
    if (!unwrap) joinTouchedLists(tr, touched, wrapped);
    return true;
  }).run();
}

const inListItem = ($pos: StoryProsePosition) => $pos.depth >= 3 && $pos.node(-1).type.name === 'listItem';

export function selectedListKind(state: ProseState): StoryListKind | null {
  const { $from } = state.selection;
  for (let depth = $from.depth - 1; depth > 0; depth--) {
    const node = $from.node(depth);
    if (isList(node)) return node.type.name as StoryListKind;
  }
  return null;
}

export function canChangeListIndent(editor: Editor, direction: -1 | 1): boolean {
  const { $from, $to, from, to } = editor.state.selection;
  if (!inListItem($from) || !inListItem($to) || $from.before(-2) !== $to.before(-2)) return false;
  if (direction === -1) return editor.can().liftListItem('listItem');
  const limit = editor.extensionManager.extensions.some(extension => extension.name === 'storyListIndent') ? STORY_LIST_MAX_DEPTH + 1 : Infinity;
  const ancestors = Array.from({ length: $from.depth }, (_v, i) => $from.node(i)).filter(node => node.type.name === 'listItem').length;
  const levelCount = (node: ProseNode): number => {
    let max = 0;
    node.forEach(child => { max = Math.max(max, levelCount(child)); });
    return (node.type.name === 'listItem' ? 1 : 0) + max;
  };
  let deepest = ancestors;
  $from.node(-2).forEach((item, offset) => {
    const itemPos = $from.start(-2) + offset;
    if (itemPos <= to && itemPos + item.nodeSize > from) deepest = Math.max(deepest, ancestors - 1 + levelCount(item));
  });
  return deepest < limit && editor.can().sinkListItem('listItem');
}

export function changeListIndent(editor: Editor, direction: -1 | 1): boolean {
  if (!canChangeListIndent(editor, direction)) return false;
  const item = editor.schema.nodes.listItem;
  const command = direction === 1 ? sinkListItem(item) : liftListItem(item);
  return command(editor.state, changed => {
    // PM's built-in list commands force scrollIntoView. For an explicit
    // indent, replay the same steps and mapped selection without that flag.
    // The phone toolbar can still reveal an actually obscured caret.
    const tr = closeHistory(editor.state.tr);
    changed.steps.forEach(step => tr.step(step));
    tr.setSelection(changed.selection.getBookmark().resolve(tr.doc));
    if (changed.storedMarksSet) tr.setStoredMarks(changed.storedMarks);
    editor.view.dispatch(tr);
  });
}

/** Tab on a nestable row indents; unsupported operations leave native focus navigation alone. */
const StoryListIndent = Extension.create({
  name: 'storyListIndent',
  priority: 1001,
  addKeyboardShortcuts() {
    return { Tab: () => changeListIndent(this.editor, 1), 'Shift-Tab': () => changeListIndent(this.editor, -1) };
  },
});

/**
 * Enter inside a list. A non-empty item splits as usual; an empty one leaves
 * the list as a paragraph where it stood (splitting the list if it was in the
 * middle), so Enter twice ends a list.
 */
export function enterInStoryList(editor: Editor): boolean {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!inListItem($from)) return false;
  if (!selection.empty || $from.parent.content.size > 0) return editor.commands.splitListItem('listItem');
  return editor.commands.liftListItem('listItem');
}

/**
 * Backspace removes an empty item's marker at any sibling position. At a
 * boundary immediately after a nested list, use the same explicit lift for
 * a nonempty item: the default join would move this row into its predecessor.
 * Plain sibling joins and deletion within a paragraph stay native.
 */
export function backspaceAtListBoundary(editor: Editor, liftFirst = false): boolean {
  const { selection } = editor.state;
  const { $from } = selection;
  if (!selection.empty || $from.parentOffset > 0) return false;
  if (!inListItem($from)) {
    // A second Backspace after taking off a marker must not rewrap this blank
    // or send the caret into a preceding item's last (deepest) sublist.
    if ($from.depth < 1 || !isParagraph($from.parent) || $from.parent.content.size) return false;
    const index = $from.index(-1);
    const parent = $from.node(-1);
    const list = index > 0 && parent.type.name !== 'listItem' ? parent.child(index - 1) : null;
    const lastRow = list?.lastChild;
    const lastParagraph = lastRow?.firstChild;
    if (!isList(list) || !lastRow || !lastParagraph || !isParagraph(lastParagraph)) return false;
    // Do not erase a separate anchored content block or cross an enclosing node.
    if ($from.parent.attrs.blockStart || !parent.canReplace(index, index + 1)) return true;
    const start = $from.before();
    const endOfRowText = start - 1 - lastRow.nodeSize + lastParagraph.nodeSize;
    const tr = editor.state.tr.delete(start, $from.after());
    tr.setSelection(TextSelection.create(tr.doc, endOfRowText));
    editor.view.dispatch(closeHistory(tr).setMeta('storyListBoundary', true).scrollIntoView());
    return true;
  }
  if ($from.index(-1) !== 0) return false;
  const index = $from.index(-2);
  const previous = index > 0 ? $from.node(-2).child(index - 1) : null;
  const hasNestedPredecessor = previous?.lastChild && isList(previous.lastChild);
  if ($from.parent.content.size && !hasNestedPredecessor && !(liftFirst && index === 0)) return false;
  if (editor.commands.undoInputRule()) return true;
  // Never fall through to a destructive join if this schema cannot lift here.
  editor.commands.liftListItem('listItem');
  return true;
}

/** Story prose also removes the marker from a nonempty first item. */
export function backspaceInStoryList(editor: Editor): boolean {
  return backspaceAtListBoundary(editor, true);
}

/** Equivalent unmodified backward-delete gestures must use the same list
 * boundary policy before ProseMirror's platform/native default can join. */
export const StoryListBackwardDelete = Extension.create<{ liftFirst: boolean }>({
  name: 'storyListBackwardDelete',
  priority: 1002,
  addOptions() { return { liftFirst: false }; },
  addKeyboardShortcuts() {
    const remove = () => backspaceAtListBoundary(this.editor, this.options.liftFirst);
    return {
      Backspace: remove,
      'Shift-Backspace': remove,
      'Ctrl-h': () => typeof navigator !== 'undefined' && /Mac|iP(?:ad|hone|od)/.test(navigator.platform) && remove(),
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleDOMEvents: {
      beforeinput: (_view, event: InputEvent) => {
        if (!event.cancelable || event.isComposing || event.inputType !== 'deleteContentBackward') return false;
        if (!backspaceAtListBoundary(this.editor, this.options.liftFirst)) return false;
        event.preventDefault();
        return true;
      },
    } } })];
  },
});

/* --- One style per paragraph ------------------------------------------------
 * What the selection toolbar's Style menu (and the slash menu) choose from:
 * every paragraph is exactly one of these. */

export type StoryTextFamily = 'text' | 'large' | `heading${StoryHeadingLevel}`;
export type StoryTextStyle = StoryTextFamily | 'bullets' | 'numbered';

function storyTextNodeFamily(node: ProseNode): StoryTextFamily | null {
  if (node.type.name === 'sectionTitle') return 'heading2';
  if (node.type.name === 'heading' && isStoryHeadingLevel(node.attrs.level)) return `heading${node.attrs.level}`;
  if (isParagraph(node)) return node.attrs.large ? 'large' : 'text';
  return null;
}

/** A structural section title remains an editable H2, not body prose. */
export function storyTextFamilyState(state: ProseState): { family: StoryTextFamily | 'mixed'; locked: boolean } {
  const nodes = touchedTextblocks(state);
  const families = new Set(nodes.map(({ node }) => storyTextNodeFamily(node)));
  return {
    family: families.size > 1 ? 'mixed' : [...families][0] ?? 'text',
    locked: !nodes.length || nodes.some(({ node }) => !isParagraph(node) && node.type.name !== 'heading'),
  };
}

export function storyTextStyle(editor: Editor): StoryTextStyle {
  const list = selectedListKind(editor.state);
  if (list) return list === 'bulletList' ? 'bullets' : 'numbered';
  return storyTextNodeFamily(editor.state.selection.$from.parent) ?? 'text';
}

/** Apply a text family in one transaction, keeping prose IDs, marks and selection.
 * Section titles and constrained containers must not be silently transformed. */
export function applyStoryTextFamily(tr: Transaction, style: StoryTextFamily): boolean {
  const level = style.startsWith('heading') ? Number(style.slice('heading'.length)) : null;
  if (level !== null && !isStoryHeadingLevel(level)) return false;
  const type = tr.doc.type.schema.nodes[level ? 'heading' : 'paragraph'];
  const touched = touchedTextblocks(tr);
  if (!type || !touched.length || touched.some(({ node, pos }) => {
    if (!isParagraph(node) && node.type.name !== 'heading') return true;
    const point = tr.doc.resolve(pos);
    return !point.parent.canReplaceWith(point.index(), point.index() + 1, type);
  })) return false;
  for (const { node, pos } of touched) {
    if (node.type === type && storyTextNodeFamily(node) === style) continue;
    const attrs = listBoundaryAttrs(node, type);
    if (level) attrs.level = level;
    else attrs.large = style === 'large';
    tr.setNodeMarkup(pos, type, attrs);
  }
  if (tr.docChanged) closeHistory(tr).setMeta('storyTextFamilyBoundary', true);
  return true;
}

export function setStoryTextStyle(editor: Editor, style: StoryTextStyle): boolean {
  if (style === 'bullets' || style === 'numbered') {
    const kind = style === 'bullets' ? 'bulletList' : 'orderedList';
    const current = listToggleState(editor.state);
    return current.enabled && (current.kind === kind || toggleStoryList(editor, kind));
  }
  const state = editor.state;
  const { $from, $to } = state.selection;
  if (style.startsWith('heading') && inListItem($from) && inListItem($to) && $from.before(-1) === $to.before(-1)) {
    // A successful lift and heading conversion are one action. An unsupported
    // nested row must not be lifted without also becoming the chosen heading.
    let lifted = false;
    liftListItem(state.schema.nodes.listItem)(state, tr => {
      if (!applyStoryTextFamily(tr, style)) return;
      editor.view.dispatch(tr);
      lifted = true;
    });
    if (lifted) editor.commands.focus(undefined, { scrollIntoView: false });
    return lifted;
  }
  const changed = editor.commands.command(({ tr }) => applyStoryTextFamily(tr, style));
  if (changed) editor.commands.focus(undefined, { scrollIntoView: false });
  return changed;
}

/** Highlighted words, saved as ==text== (or =={green}text== for a colour
 *  besides the default); the reader styles style <mark>. */
export const StoryHighlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => highlightColor(element.getAttribute('data-color')),
        renderHTML: ({ color }) => (color ? { 'data-color': color } : {}),
      },
    };
  },
  parseHTML() { return [{ tag: 'mark' }]; },
  renderHTML({ HTMLAttributes }) { return ['mark', mergeAttributes(HTMLAttributes), 0]; },
  addKeyboardShortcuts() { return { 'Mod-Shift-h': () => this.editor.commands.toggleMark(this.name) }; },
  addInputRules() { return [markInputRule({ find: /(?:^|\s)(==(?!\s)([^=]+)(?<!\s)==)$/, type: this.type })]; },
  addPasteRules() { return [markPasteRule({ find: /(?:^|\s)(==(?!\s)([^=]+)(?<!\s)==)/g, type: this.type })]; },
});

/**
 * Typography as you type, like a word processor: -- is an em dash, ... an
 * ellipsis, -> and <- arrows, and straight quotes curl the right way. Each is
 * an input rule, so Backspace straight after puts back what was typed.
 * Nothing changes inside inline code.
 */
export const StoryTypography = Extension.create({
  name: 'storyTypography',
  addInputRules() {
    const open = /(?:^|[\s{[(<'"\u2018\u201C])/.source;
    return [
      textInputRule({ find: /--$/, replace: '—' }),
      textInputRule({ find: /\.\.\.$/, replace: '…' }),
      textInputRule({ find: /->$/, replace: '→' }),
      textInputRule({ find: /<-$/, replace: '←' }),
      textInputRule({ find: new RegExp(`${open}(")$`), replace: '“' }),
      textInputRule({ find: /"$/, replace: '”' }),
      textInputRule({ find: new RegExp(`${open}(')$`), replace: '‘' }),
      textInputRule({ find: /'$/, replace: '’' }),
    ];
  },
});

/* --- Slash menu -------------------------------------------------------------
 * "/" at the start of a line or after a space opens a menu at the caret (the
 * menu itself is StorySlashMenu, loaded only in the editor); the word typed
 * after it filters. The plugin only tracks where the slash and its query are;
 * while the menu is open it hands the keys a menu needs to the menu. */

export interface StorySlashState {
  active: boolean;
  /** The slash's position; the query runs from just after it to `to`. */
  from: number;
  to: number;
  query: string;
  /** A slash the author closed with Escape stays closed until it's retyped. */
  dismissed: number | null;
}

export const storySlashKey = new PluginKey<StorySlashState>('storySlash');
const SLASH_QUERY = /(?:^|\s)\/([\p{L}\p{N}-]{0,24})$/u;
const SLASH_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape', 'Home', 'End']);

/** The slash and query the caret sits just after, or null: "/" at the start
 *  of a line or after a space, a short word after it, outside inline code. */
export function storySlashAt(selection: ProseState['selection']): { from: number; to: number; query: string } | null {
  const $from = selection.$from;
  if (!selection.empty || !$from.parent.isTextblock || $from.marks().some((mark) => mark.type.name === 'code')) return null;
  const match = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc').match(SLASH_QUERY);
  return match ? { from: $from.pos - match[1].length - 1, to: $from.pos, query: match[1] } : null;
}

export const StorySlash = Extension.create<Record<string, never>, { onKey: ((event: KeyboardEvent) => boolean) | null }>({
  name: 'storySlash',
  addStorage() { return { onKey: null }; },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [new Plugin<StorySlashState>({
      key: storySlashKey,
      state: {
        init: () => ({ active: false, from: 0, to: 0, query: '', dismissed: null }),
        apply: (tr, previous, _old, state) => {
          const meta = tr.getMeta(storySlashKey) as { dismiss?: number } | undefined;
          let dismissed = meta?.dismiss ?? previous.dismissed;
          const slash = storySlashAt(state.selection);
          if (!slash) return { active: false, from: 0, to: 0, query: '', dismissed: null };
          if (dismissed !== null && dismissed !== slash.from) dismissed = null;
          if (dismissed === slash.from) return { active: false, from: 0, to: 0, query: '', dismissed };
          return { active: true, ...slash, dismissed: null };
        },
      },
      props: {
        handleKeyDown: (view, event) => {
          if (!storySlashKey.getState(view.state)?.active || !SLASH_KEYS.has(event.key) || event.isComposing) return false;
          return storage.onKey?.(event) ?? false;
        },
      },
    })];
  },
});

/** Gives the open slash menu its keys (null takes them back). */
export function setStorySlashKeys(editor: Editor, onKey: ((event: KeyboardEvent) => boolean) | null): void {
  (editor.storage as unknown as Record<string, { onKey: typeof onKey }>).storySlash.onKey = onKey;
}

/** Closes the slash menu where it is, leaving the typed text alone. */
export function dismissStorySlash(editor: Editor): void {
  const state = storySlashKey.getState(editor.state);
  if (state?.active) editor.view.dispatch(editor.state.tr.setMeta(storySlashKey, { dismiss: state.from }));
}

const StoryProseKeymap = Extension.create({
  name: 'storyProseKeymap',
  // Ahead of StarterKit's list shortcuts, so a typed marker goes there too,
  // its paragraph shortcut (Mod-Alt-0), and the core Enter and Backspace.
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => enterInStoryList(this.editor) || enterInStoryLargeText(this.editor),
      'Mod-Shift-8': () => { toggleStoryList(this.editor, 'bulletList'); return true; },
      'Mod-Shift-7': () => { toggleStoryList(this.editor, 'orderedList'); return true; },
      'Mod-Alt-1': () => setStoryTextStyle(this.editor, 'large'),
      ...Object.fromEntries(STORY_HEADING_LEVELS.map(level => [`Mod-Alt-${level}`, () => setStoryTextStyle(this.editor, `heading${level}`)])),
      // Clear formatting, as in a doc editor: the marks go, the paragraph
      // keeps its style.
      'Mod-\\': () => this.editor.chain().focus().unsetAllMarks().run(),
      // Reset scale without unwrapping an existing list.
      'Mod-Alt-0': () => setStoryTextStyle(this.editor, 'text'),
    };
  },
});

/** The style pasted paragraphs take at a paste or drop point: its
 *  paragraph's. Undefined between blocks, where the paste keeps its own
 *  styles. */
function storyLandingLarge($pos: StoryProsePosition): boolean | undefined {
  return $pos.depth === 1 && isParagraph($pos.parent) ? $pos.parent.attrs.large === true : undefined;
}

/** The list a paste or drop point is inside, if any. */
function landingList($pos: StoryProsePosition): ProseNode | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) if ($pos.node(depth).type.name === 'listItem') return $pos.node(depth - 1);
  return null;
}

/**
 * Pasted or dropped content lands as it was copied (paragraphs, subheadings
 * and lists), except inside a list, where several paragraphs or lists become
 * items of that list rather than splitting it. Both ends stay open, so the
 * first and last pasted lines join the text around the caret.
 *
 * Pasted paragraphs take the style of the paragraph they land in, the way
 * pasted text takes its paragraph's style in a doc editor. Otherwise a copied
 * large paragraph would arrive large in body text and take the rest of the
 * line after the caret with it. Between blocks they keep their own style. A
 * list is body text.
 */
export function coercePastedSlice(slice: ProseSlice, $landing: StoryProsePosition): ProseSlice {
  const top: ProseNode[] = [];
  slice.content.forEach((node) => { top.push(node); });
  if (top.length === 0 || top.some((node) => !node.isBlock)) return slice;
  const listNode = landingList($landing);
  const style = listNode ? Boolean($landing.parent.attrs.large) : storyLandingLarge($landing);
  const restyle = (node: ProseNode): ProseNode => {
    if (style === undefined || isList(node)) return node;
    if (isParagraph(node)) return styled(node, style);
    if (node.isTextblock) return node;
    const children: ProseNode[] = [];
    node.forEach((child) => { children.push(restyle(child)); });
    return children.every((child, index) => child === node.child(index)) ? node : node.type.create(node.attrs, children);
  };
  const { schema } = $landing.doc.type;
  const fitsList = (top.length === 1 && isParagraph(top[0])) || top.every((node) => isList(node) || node.type.name === 'listItem');
  if (!listNode || fitsList) {
    const restyled = top.map(restyle);
    if (restyled.every((node, index) => node === top[index])) return slice;
    // Same nodes, same open ends: only the paragraphs' style changed.
    const shaped = schema.topNodeType.create(null, restyled);
    return shaped.slice(slice.openStart, shaped.content.size - slice.openEnd);
  }

  // Within a list, normal paragraphs become rows, but pasted list rows keep
  // their descendants and explicit scale instead of being flattened.
  const items = top.flatMap(node => {
    if (isList(node)) { const rows: ProseNode[] = []; node.forEach(row => rows.push(row)); return rows; }
    if (node.type.name === 'listItem') return [node];
    if (!node.isTextblock) return [];
    const paragraph = isParagraph(node) ? restyle(node) : schema.nodes.paragraph.create(null, node.content);
    return [schema.nodes.listItem.create(null, paragraph)];
  });
  if (!items.length) return slice;
  const list = listNode.type.create(null, items);
  const shaped = schema.topNodeType.create(null, list);
  return shaped.slice(3, shaped.content.size - 3);
}

/** Every extension the story prose editor runs, schema first. `listClass`
 *  and `largeClass` are the reader's classes for lists and large text; marks
 *  and code are styled from the story root, as on the page. */
export function storyProseExtensions({ listClass, largeClass, placeholder = 'Write, or type / for a component' }: { listClass?: string; largeClass?: string; placeholder?: string } = {}) {
  const listAttributes = listClass ? { HTMLAttributes: { class: listClass } } : {};
  return [
    StarterKit.configure({
      document: false,
      listItem: false,
      // Built for items that hold several paragraphs; its Backspace moves a
      // paragraph after a list into the last item, which one-paragraph items
      // reject. backspaceInStoryList and core joinBackward / joinForward
      // cover the rest.
      listKeymap: false,
      heading: { levels: [...STORY_HEADING_LEVELS] }, blockquote: false, codeBlock: false, horizontalRule: false, link: { ...EDITOR_LINK_OPTIONS },
      // Would append an empty paragraph after a list, saved as a blank one.
      trailingNode: false,
      bulletList: listAttributes,
      orderedList: listAttributes,
    }),
    StoryDocument,
    StoryListItem,
    StoryListIndent,
    StoryParagraphStyle.configure({ largeClass }),
    StoryProseKeymap,
    StoryListBackwardDelete.configure({ liftFirst: true }),
    StoryHighlight,
    StoryTypography,
    StorySlash,
    EditorLinkTarget,
    Placeholder.configure({ placeholder }),
  ];
}
