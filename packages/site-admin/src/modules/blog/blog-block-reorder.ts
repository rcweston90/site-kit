import { closeHistory } from '@tiptap/pm/history';
import { Fragment } from '@tiptap/pm/model';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';

export type BlogBlockDirection = 'up' | 'down';

/** Only whole top-level blocks are eligible; positions inside them never are. */
export function blogBlockOrder(state: EditorState, pos: number | undefined, nodeType: string) {
  if (pos === undefined || pos < 0 || pos >= state.doc.content.size) return null;
  const at = state.doc.resolve(pos);
  if (at.depth !== 0 || at.nodeAfter?.type.name !== nodeType) return null;
  const index = at.index();
  return { index, count: state.doc.childCount, canUp: index > 0, canDown: index + 1 < state.doc.childCount };
}

export function moveBlogBlock(state: EditorState, pos: number, nodeType: string, direction: BlogBlockDirection) {
  const order = blogBlockOrder(state, pos, nodeType);
  const up = direction === 'up';
  if (!order || (up ? !order.canUp : !order.canDown)) return null;
  const { doc } = state;
  const block = doc.child(order.index);
  const neighbor = doc.child(order.index + (up ? -1 : 1));
  const from = up ? pos - neighbor.nodeSize : pos;
  const to = pos + block.nodeSize + (up ? 0 : neighbor.nodeSize);
  const reordered = Fragment.fromArray(up ? [block, neighbor] : [neighbor, block]);
  const tr = closeHistory(state.tr).replaceWith(from, to, reordered);
  const nextPos = up ? from : from + neighbor.nodeSize;
  return { tr: tr.setSelection(NodeSelection.create(tr.doc, nextPos)).scrollIntoView(), nextPos };
}
