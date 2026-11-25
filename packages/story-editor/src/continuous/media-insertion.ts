import { Extension } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseNode, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';

type Anchor = { id: symbol; pos: number };
export const mediaAnchorKey = new PluginKey<Anchor | null>('continuousMediaAnchor');

/**
 * Keep the drop/paste point with the text if the author types or moves the
 * caret while bytes upload. This state never enters the saved story.
 */
export const MediaAnchor = Extension.create({
  name: 'continuousMediaAnchor',
  addProseMirrorPlugins: () => [new Plugin<Anchor | null>({
    key: mediaAnchorKey,
    state: {
      init: () => null,
      apply(transaction, anchor) {
        const command = transaction.getMeta(mediaAnchorKey) as Anchor | null | undefined;
        if (command !== undefined) return command;
        if (!anchor || !transaction.docChanged) return anchor;
        const mapped = transaction.mapping.mapResult(anchor.pos, -1);
        return mapped.deleted ? null : { ...anchor, pos: mapped.pos };
      },
    },
  })],
});

/** Only body positions accept uploads. Titles and the hero never split. */
export function mediaInsertionPoint(doc: ProseNode, pos: number): ResolvedPos | null {
  const point = doc.resolve(pos);
  for (let depth = point.depth; depth > 0; depth--) {
    if (point.node(depth).type.name !== 'storySection') continue;
    const afterTitle = point.start(depth) + point.node(depth).firstChild!.nodeSize;
    return pos >= afterTitle ? point : null;
  }
  return null;
}

/** A paragraph may split at the caret. Headings and list runs stay intact. */
export function insertMediaAt(state: EditorState, pos: number, asset: ProseNode) {
  const point = mediaInsertionPoint(state.doc, pos);
  if (!point) return null;
  const tr = closeHistory(state.tr);
  if (point.parent.type.name === 'storySection') return tr.insert(pos, asset);
  if (point.parent.type.name === 'paragraph' && point.depth === 2) {
    if (!point.parent.content.size && point.parent.attrs.landing) return tr.insert(point.before(), asset);
    if (point.parentOffset === 0) return tr.insert(point.before(), asset);
    if (point.parentOffset === point.parent.content.size) return tr.insert(point.after(), asset);
    return tr.split(pos).insert(pos + 1, asset);
  }
  return tr.insert(point.after(2), asset);
}
