import { closeHistory } from '@tiptap/pm/history';
import { Fragment, type Node as ProseNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';

import { rebaseSplitProse } from './prose-continuation.js';

const movableTypes = new Set(['storyAsset', 'storyCallout', 'storyNote', 'storyQuote']);
const landing = (node: ProseNode | null) => node?.type.name === 'paragraph' && node.attrs.landing && !node.content.size;

export function movableAsset(doc: ProseNode, pos: number) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= doc.content.size) return null;
  const point = doc.resolve(pos);
  return point.parent.type.name === 'storySection' && point.nodeAfter && movableTypes.has(point.nodeAfter.type.name)
    ? point.nodeAfter : null;
}

/** A chapter's title, nested content, and the artificial empty landing line cannot split. */
export function assetDropPoint(doc: ProseNode, pos: number): number | null {
  if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) return null;
  const point = doc.resolve(pos);
  if (point.parent.type.name === 'storySection' && point.index() > 0) {
    return landing(point.nodeBefore) ? pos - point.nodeBefore!.nodeSize : pos;
  }
  if (point.depth !== 2 || point.parent.type.name !== 'paragraph' || point.node(1).type.name !== 'storySection') return null;
  if (!point.parentOffset) return point.before();
  if (point.parentOffset === point.parent.content.size) return point.after();
  return pos;
}

/** Up/down moves across one visible body sibling or to the adjacent chapter. */
export function adjacentAssetTarget(doc: ProseNode, from: number, direction: -1 | 1): number | null {
  const asset = movableAsset(doc, from);
  if (!asset) return null;
  const point = doc.resolve(from);
  const sibling = direction === -1 ? point.nodeBefore : doc.resolve(from + asset.nodeSize).nodeAfter;
  if (sibling && sibling.type.name !== 'sectionTitle' && !landing(sibling)) {
    return direction === -1 ? from - sibling.nodeSize : from + asset.nodeSize + sibling.nodeSize;
  }
  const sectionIndex = point.index(0) + direction;
  if (sectionIndex < 0 || sectionIndex >= doc.childCount) return null;
  const section = doc.child(sectionIndex);
  if (section.type.name !== 'storySection') return null;
  return direction === -1
    ? point.before() - 1 - (landing(section.lastChild) ? section.lastChild!.nodeSize : 0)
    : point.after() + 1 + section.firstChild!.nodeSize;
}

/** Move the node itself, not its DOM/clipboard copy. Null means no change. */
export function moveStoryAsset(state: EditorState, from: number, drop: number, suffixId: () => string = () => crypto.randomUUID()) {
  const asset = movableAsset(state.doc, from);
  const target = assetDropPoint(state.doc, drop);
  if (!asset || target === null || target >= from && target <= from + asset.nodeSize) return null;
  const tr = closeHistory(state.tr);
  tr.delete(from, from + asset.nodeSize);
  const at = tr.mapping.map(target);
  const point = tr.doc.resolve(at);
  const section = point.node(1);
  const origin = asset.attrs.origin;
  const block = asset.attrs.block;
  const id = block?.id ?? suffixId();
  const moved = asset.type.create({
    ...asset.attrs,
    // Keep the authored block identity and source metadata; preview anchors
    // derive their prefix from the chapter that now actually owns the block.
    block: { ...block, id },
    blockAnchor: `${section.attrs.key}:${id}`,
    origin,
  }, asset.content, asset.marks);
  let insertedAt = at;
  if (point.parent.type.name === 'storySection') {
    if (!section.canReplaceWith(point.index(), point.index(), asset.type)) return null;
    tr.insert(at, moved);
  } else {
    const paragraph = point.parent;
    const offset = point.parentOffset;
    // One existing soft line break becomes the structural separator. Other
    // breaks on either side and every authored text mark stay in their slice.
    const beforeBreak = point.nodeBefore?.type.name === 'hardBreak';
    const afterBreak = !beforeBreak && point.nodeAfter?.type.name === 'hardBreak';
    const left = paragraph.content.cut(0, offset - (beforeBreak ? 1 : 0));
    const right = paragraph.content.cut(offset + (afterBreak ? 1 : 0));
    const parts: ProseNode[] = [];
    if (left.size) parts.push(paragraph.copy(left));
    if (right.size) {
      const suffix = paragraph.copy(right);
      insertedAt = point.before() + (parts[0]?.nodeSize ?? 0);
      parts.push(moved, suffix);
    } else {
      insertedAt = point.before() + (parts[0]?.nodeSize ?? 0);
      parts.push(moved);
    }
    const index = point.index(1);
    const replacement = Fragment.fromArray(parts);
    if (!section.canReplace(index, index + 1, replacement)) return null;
    tr.replaceWith(point.before(), point.after(), parts);
  }
  rebaseSplitProse(tr, insertedAt, moved.nodeSize, section.attrs.key, suffixId);
  return { transaction: tr.setSelection(NodeSelection.create(tr.doc, insertedAt)), insertedAt, chapterKey: section.attrs.key as string };
}

/** Interprets the pointer within this editor, without native ProseMirror
 * slice fitting. Asset bodies only offer before/after through their chrome. */
export function assetPointerTarget(view: EditorView, element: Element, x: number, y: number) {
  const section = element.closest('[data-document-section]');
  if (!section || !view.dom.contains(section) || element.closest('[data-document-node="sectionTitle"]')) return null;
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const asset = element.closest('[data-document-asset]');
  if (asset) {
    if (element.closest('[data-callout-body], [data-callout-title], [contenteditable="true"]:not(.ProseMirror)')) return null;
    // Node-view starts are boundaries. Resolve the enclosing section child
    // when coords point into the node's rendered preview.
    const point = view.state.doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos);
    const pos = point.depth > 1 ? point.before(2) : point.pos;
    const node = movableAsset(view.state.doc, pos);
    if (!node) return null;
    const rect = asset.getBoundingClientRect();
    const bottom = y >= rect.top + rect.height / 2;
    const target = assetDropPoint(view.state.doc, bottom ? pos + node.nodeSize : pos);
    return target === null ? null : { pos: target, left: rect.left, top: bottom ? rect.bottom : rect.top, width: rect.width };
  }
  const target = assetDropPoint(view.state.doc, hit.pos);
  if (target === null) return null;
  const bounds = section.getBoundingClientRect();
  const caret = view.coordsAtPos(target);
  const point = view.state.doc.resolve(target);
  const inText = point.depth === 2;
  return { pos: target, left: bounds.left, top: inText ? caret.bottom : caret.top, width: bounds.width, ...(inText ? { caretX: caret.left } : {}) };
}
