import { Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { authoringCommandMenuWidth } from '../../menu/index.js';

export function inBlogBodyParagraph(state: EditorState) {
  const { selection } = state;
  return selection instanceof TextSelection && selection.empty &&
    selection.$from.depth === 1 && selection.$from.parent.type.name === 'paragraph';
}

export function blankBlogLine(state: EditorState): number | null {
  return inBlogBodyParagraph(state) && state.selection.$from.parent.content.size === 0 ? state.selection.from : null;
}

/** Insert before the blank paragraph rather than replacing it. The existing
 * writing line retains its identity/marks and remains the continuation. */
export function dividerBeforeBlankBlogLine(state: EditorState) {
  const caret = blankBlogLine(state);
  const divider = state.schema.nodes.horizontalRule;
  if (caret === null || !divider) return null;
  const transaction = closeHistory(state.tr).insert(state.selection.$from.before(1), divider.create());
  return transaction.setSelection(TextSelection.create(transaction.doc, transaction.mapping.map(caret)));
}

/** Plain text keeps the usual caret behavior; a container is never split to fit a divider. */
export function blogToolbarDividerTarget({ selection }: Pick<EditorState, 'selection'>): 'cursor' | number | null {
  const { $from, $to } = selection;
  if ($from.depth <= 1 && $to.depth <= 1) return 'cursor';
  if ($from.depth === 0 || $to.depth === 0 || $from.index(0) !== $to.index(0)) return null;
  const block = $to.node(1).type.name;
  if (!['blogCallout', 'bulletList', 'orderedList', 'blockquote'].includes(block)) return null;
  return $to.after(1);
}

export function dividerAfterBlogContainer(state: EditorState) {
  const at = blogToolbarDividerTarget(state);
  const type = state.schema.nodes.horizontalRule;
  if (typeof at !== 'number' || !type) return null;
  const edge = state.doc.resolve(at);
  if (!edge.parent.canReplaceWith(edge.index(), edge.index(), type)) return null;
  const divider = type.create();
  const tr = closeHistory(state.tr).insert(at, divider);
  return tr.setSelection(Selection.near(tr.doc.resolve(at + divider.nodeSize), 1));
}

interface ViewBounds { left: number; right: number; top: number; bottom: number }
interface Caret { left: number; top: number; bottom: number }
const EDGE = 8;
const TARGET = 44;

export function blogCaretMenuPlacement(caret: Caret, viewport: ViewBounds, editor: Pick<ViewBounds, 'left'|'right'>) {
  if (caret.bottom <= viewport.top + EDGE || caret.top >= viewport.bottom - EDGE || viewport.right - viewport.left < 160) return null;
  const before = caret.top - viewport.top - EDGE * 2;
  const after = viewport.bottom - caret.bottom - EDGE * 2;
  const up = after < 3 * TARGET && before > after;
  const width = authoringCommandMenuWidth(viewport.right - viewport.left);
  return {
    plus: {
      left: caret.left - TARGET - EDGE >= Math.max(editor.left - TARGET, viewport.left + EDGE)
        ? caret.left - TARGET - EDGE
        : Math.max(viewport.left + EDGE, Math.min(editor.right, viewport.right - EDGE) - TARGET),
      top: Math.max(viewport.top + EDGE, Math.min((caret.top + caret.bottom - TARGET) / 2, viewport.bottom - TARGET - EDGE)),
    },
    menu: {
      left: Math.max(viewport.left + EDGE, Math.min(caret.left, viewport.right - width - EDGE)),
      top: up ? caret.top - EDGE : caret.bottom + EDGE,
      width,
      maxHeight: Math.max(0, up ? before : after),
      up,
    },
  };
}
