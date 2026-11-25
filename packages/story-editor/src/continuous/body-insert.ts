import { authoringCommandMenuWidth } from '../menu.js';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { rebaseSplitProse } from './prose-continuation.js';
import { TextSelection, type EditorState } from '@tiptap/pm/state';

export type BodyInsertionLine = { pos: number; atBreak: boolean };

export function bodyInsertionLine(state: EditorState): BodyInsertionLine | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $from } = selection;
  if ($from.depth !== 2 || $from.parent.type.name !== 'paragraph' || $from.node(1).type.name !== 'storySection') return null;
  const atBreak = $from.nodeBefore?.type.name === 'hardBreak' || $from.nodeAfter?.type.name === 'hardBreak';
  return !$from.parent.content.size || atBreak ? { pos: $from.pos, atBreak } : null;
}

/** Replace the chosen blank line or a single exact line break with a new
 * asset; neither suffix text nor its marks enter a string round trip. */
export function insertBodyAsset(state: EditorState, asset: ProseNode, command?: { from: number; to: number }) {
  const line = bodyInsertionLine(state);
  if (!line && !command) return null;
  const tr = closeHistory(state.tr);
  if (command) tr.delete(command.from, command.to);
  const point = tr.doc.resolve(tr.mapping.map(command?.from ?? line!.pos));
  if (point.depth !== 2 || point.parent.type.name !== 'paragraph') return null;
  const paragraph = point.parent;
  const section = point.node(1);
  if (asset.attrs.block?.id) asset = asset.type.create({
    ...asset.attrs, blockAnchor: `${section.attrs.key}:${asset.attrs.block.id}`,
  }, asset.content, asset.marks);
  const beforeBreak = point.nodeBefore?.type.name === 'hardBreak';
  const afterBreak = !beforeBreak && point.nodeAfter?.type.name === 'hardBreak';
  const left = paragraph.content.cut(0, point.parentOffset - (beforeBreak ? 1 : 0));
  const right = paragraph.content.cut(point.parentOffset + (afterBreak ? 1 : 0));
  const parts = [
    ...(left.size ? [paragraph.copy(left)] : []),
    asset,
    right.size ? paragraph.copy(right) : state.schema.nodes.paragraph.create(),
  ];
  tr.replaceWith(point.before(), point.after(), parts);
  const insertedAt = point.before() + (left.size ? parts[0].nodeSize : 0);
  rebaseSplitProse(tr, insertedAt, asset.nodeSize, section.attrs.key);
  return tr.setSelection(TextSelection.create(tr.doc, insertedAt + asset.nodeSize + 1));
}

type Caret = { left: number; top: number; bottom: number };
type ViewBounds = { left: number; right: number; top: number; bottom: number };
const EDGE = 8;
const PLUS = 44;
export function bodyInsertPlacement(caret: Caret, view: ViewBounds) {
  if (caret.bottom <= view.top + EDGE || caret.top >= view.bottom - EDGE || view.right - view.left < 160) return null;
  const above = caret.top - view.top - EDGE * 2;
  const below = view.bottom - caret.bottom - EDGE * 2;
  const up = below < 3 * PLUS && above > below;
  const width = authoringCommandMenuWidth(view.right - view.left);
  const menuLeft = Math.max(view.left + EDGE, Math.min(caret.left, view.right - width - EDGE));
  const plusLeft = caret.left - PLUS - EDGE >= view.left + EDGE
    ? caret.left - PLUS - EDGE : view.right - PLUS - EDGE;
  return {
    plus: { left: plusLeft, top: Math.max(view.top + EDGE, Math.min((caret.top + caret.bottom - PLUS) / 2, view.bottom - PLUS - EDGE)) },
    menu: { left: menuLeft, width, maxHeight: Math.max(0, up ? above : below), top: up ? caret.top - EDGE : caret.bottom + EDGE, up },
  };
}
