import type { Node as ProseNode, ResolvedPos } from '@tiptap/pm/model';
import { NodeSelection, Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

function lane($pos: ResolvedPos): string {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.attrs.blockAnchor) return String(node.attrs.blockAnchor);
    if (node.type.name === 'storySection') return `section:${node.attrs.key}`;
  }
  return 'document';
}

const visibleText = (node: ProseNode) => node.textBetween(0, node.content.size, '', '\n');

/** Map an inline offset over the changed middle, leaving matching ends alone. */
export function restoredTextOffset(before: string, after: string, offset: number) {
  if (before === after) return offset;
  let head = 0, tail = 0;
  while (head < Math.min(before.length, after.length) && before[head] === after[head]) head++;
  while (tail < Math.min(before.length - head, after.length - head)
    && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  if (offset < head) return offset;
  if (offset >= before.length - tail) return after.length - (before.length - offset);
  return head + Math.min(offset - head, after.length - head - tail);
}

function textblocks(doc: ProseNode, key: string) {
  const blocks: { node: ProseNode; at: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (lane(doc.resolve(pos + 1)) === key) blocks.push({ node, at: pos + 1 });
    return false;
  });
  return blocks;
}

export function restoredStorySelection(previous: Selection, doc: ProseNode) {
  if (previous instanceof NodeSelection && previous.node.attrs.blockAnchor) {
    let at: number | undefined;
    doc.descendants((node, pos) => {
      if (node.type === previous.node.type && node.attrs.blockAnchor === previous.node.attrs.blockAnchor) at ??= pos;
      return at === undefined;
    });
    if (at !== undefined && NodeSelection.isSelectable(doc.nodeAt(at)!)) return { selection: NodeSelection.create(doc, at), anchored: true };
  }
  let anchored = true;
  const endpoint = ($pos: ResolvedPos) => {
    if ($pos.parent.isTextblock) {
      const key = lane($pos);
      const before = textblocks($pos.doc, key);
      const after = textblocks(doc, key);
      const index = before.findIndex(block => block.at === $pos.start());
      const text = visibleText($pos.parent);
      const matches = after.map((block, index) => ({ block, index })).filter(({ block }) => visibleText(block.node) === text);
      const match = matches.sort((a, b) => Math.abs(a.index - index) - Math.abs(b.index - index))[0]?.block ?? after[index];
      if (match) return match.at + restoredTextOffset(text, visibleText(match.node), $pos.parentOffset);
    }
    anchored = false;
    return Math.min($pos.pos, doc.content.size);
  };
  const $anchor = doc.resolve(endpoint(previous.$anchor));
  const $head = previous.empty ? $anchor : doc.resolve(endpoint(previous.$head));
  return { selection: TextSelection.between($anchor, $head), anchored };
}

/** Avoid recreating unrelated DOM nodes, especially the focused chapter. */
export function storySnapshotTransaction(state: EditorState, next: ProseNode) {
  const start = state.doc.content.findDiffStart(next.content);
  if (start === null) return state.tr;
  const end = state.doc.content.findDiffEnd(next.content);
  if (end) {
    try {
      const partial = state.tr.replace(start, Math.max(start, end.a), next.slice(start, Math.max(start, end.b)));
      if (partial.doc.eq(next)) return partial;
    } catch { /* A structural replacement may require the full valid snapshot. */ }
  }
  return state.tr.replaceWith(0, state.doc.content.size, next.content);
}

/** Preserve actual visible context, not merely the document's raw scrollY.
 * PM may focus the restored selection while replacing the canvas DOM. */
export function preserveStoryHistoryViewport(view: EditorView) {
  const scrollers: HTMLElement[] = [];
  for (let node = view.dom.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)) scrollers.push(node);
  }
  const root = document.scrollingElement;
  if (root instanceof HTMLElement && !scrollers.includes(root)) scrollers.push(root);
  const saved = scrollers.map(node => ({ node, top: node.scrollTop, left: node.scrollLeft, overflowAnchor: node.style.overflowAnchor }));
  for (const { node } of saved) node.style.overflowAnchor = 'none';
  const rect = () => {
    try { return view.coordsAtPos(view.state.selection.head); } catch { return null; }
  };
  const focused = view.hasFocus();
  const caret = focused ? rect() : null;
  const viewport = window.visualViewport;
  const frameTop = viewport?.offsetTop ?? 0;
  const bar = view.dom.closest('[data-story-document-shell]')?.querySelector('[data-story-workspace-bar]');
  const top = Math.max(frameTop, bar?.getBoundingClientRect().bottom ?? 0);
  const bottom = frameTop + (viewport?.height ?? window.innerHeight);
  const visibleCaret = caret && caret.top >= top && caret.bottom <= bottom;
  const visibleBlocks = () => [...view.dom.querySelectorAll<HTMLElement>('[data-story-block-anchor]')];
  const sample = (top + bottom) / 2;
  const nearest = !visibleCaret ? visibleBlocks().filter(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.top < bottom && bounds.bottom > top;
  }).sort((a, b) => Math.abs(a.getBoundingClientRect().top - sample) - Math.abs(b.getBoundingClientRect().top - sample))[0] : null;
  const anchor = nearest ? { key: nearest.dataset.storyBlockAnchor, text: nearest.textContent, top: nearest.getBoundingClientRect().top } : null;
  const restore = (mapped: boolean) => {
    if (focused && !view.hasFocus()) view.focus();
    for (const { node, top, left } of saved) {
      node.scrollTo({ top, left, behavior: 'instant' });
    }
    const scroller = scrollers[0];
    if (!scroller) return;
    if (mapped && visibleCaret) {
      const next = rect();
      if (next) scroller.scrollTo({ top: scroller.scrollTop + next.top - caret.top, behavior: 'instant' });
    } else if (anchor) {
      const counterparts = visibleBlocks().filter(node => node.dataset.storyBlockAnchor === anchor.key);
      const exact = counterparts.find(node => node.textContent === anchor.text);
      if (exact) scroller.scrollTo({ top: scroller.scrollTop + exact.getBoundingClientRect().top - anchor.top, behavior: 'instant' });
    }
  };
  const cleanup = () => {
    for (const { node, overflowAnchor } of saved) node.style.overflowAnchor = overflowAnchor;
  };
  return { restore, cleanup };
}
