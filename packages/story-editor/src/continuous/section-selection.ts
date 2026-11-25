import { NodeSelection, Selection, TextSelection, type EditorState } from '@tiptap/pm/state';

/** Editable text endpoints of the focused chapter, excluding leading/trailing
 * atoms. Mixed content between those endpoints still has native rich-copy
 * semantics. Never search for an endpoint in another chapter. */
export function focusedChapterSelection(state: EditorState, chapterKey?: string): TextSelection | null {
  const { doc, selection } = state;
  const { $head } = selection;
  let chapter: { start: number; end: number } | undefined;
  if (chapterKey !== undefined) {
    doc.forEach((node, offset) => {
      if (node.type.name === 'storySection' && node.attrs.key === chapterKey) {
        chapter = { start: offset + 1, end: offset + node.nodeSize - 1 };
      }
    });
  } else if (selection instanceof NodeSelection && selection.node.type.name === 'storySection') {
    chapter = { start: selection.from + 1, end: selection.to - 1 };
  } else {
    for (let depth = $head.depth; depth > 0; depth--) {
      if ($head.node(depth).type.name === 'storySection') {
        chapter = { start: $head.start(depth), end: $head.end(depth) };
        break;
      }
    }
  }
  if (!chapter) return null;
  const { start, end } = chapter;
  const from = Selection.findFrom(doc.resolve(start), 1, true);
  const to = Selection.findFrom(doc.resolve(end), -1, true);
  if (!(from instanceof TextSelection) || !(to instanceof TextSelection)
    || from.from < start || to.to > end || from.from > to.to) return null;
  return TextSelection.create(doc, from.from, to.to);
}
