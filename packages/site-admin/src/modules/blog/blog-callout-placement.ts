import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Selection, type EditorState } from '@tiptap/pm/state';

/** The endpoint follows existing Blog insert-after-selection semantics. */
export function blogAfterCallout(state: Pick<EditorState, 'selection'>): number | null {
  const { $to } = state.selection;
  for (let depth = 1; depth <= $to.depth; depth++) {
    if ($to.node(depth).type.name === 'blogCallout') return $to.after(depth);
  }
  return null;
}

/** Direct schema-checked insertion never asks ProseMirror to fit and split the callout. */
export function insertBlogAfterCallout(state: EditorState, at: number, asset: ProseNode) {
  if (blogAfterCallout(state) !== at) return null;
  const edge = state.doc.resolve(at);
  if (!edge.parent.canReplaceWith(edge.index(), edge.index(), asset.type)) return null;
  const tr = closeHistory(state.tr).insert(at, asset);
  return tr.setSelection(Selection.near(tr.doc.resolve(at + asset.nodeSize), 1));
}
