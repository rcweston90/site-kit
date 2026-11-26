import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import { blogBlockOrder, moveBlogBlock, type BlogBlockDirection } from './blog-block-reorder.js';

export type BlogImageMoveDirection = BlogBlockDirection;

export function blogSelectedImageOrder(state: EditorState) {
  const { selection } = state;
  return selection instanceof NodeSelection ? blogBlockOrder(state, selection.from, 'image') : null;
}

/** Swap the exact selected top-level image and its adjacent authored block. */
export function moveBlogSelectedImage(state: EditorState, direction: BlogImageMoveDirection) {
  return state.selection instanceof NodeSelection ? moveBlogBlock(state, state.selection.from, 'image', direction) : null;
}
