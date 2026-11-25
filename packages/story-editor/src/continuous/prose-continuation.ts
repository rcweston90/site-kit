import type { Node as ProseNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';

const sameProseOrigin = (left: ProseNode | null, right: ProseNode | null) => {
  const a = left?.attrs.origin, b = right?.attrs.origin;
  return a?.block?.type === 'prose' && b?.block?.type === 'prose' &&
    a.chapterKey === b.chapterKey && a.blockIndex === b.blockIndex && a.block.id === b.block.id;
};

/** Once an asset separates an authored prose run, give the continuation a distinct saved anchor. */
export function rebaseSplitProse(tr: Transaction, insertedAt: number, assetSize: number, chapterKey: string, suffixId: () => string = () => crypto.randomUUID()) {
  const left = tr.doc.resolve(insertedAt).nodeBefore;
  let next = insertedAt + assetSize;
  if (sameProseOrigin(left, tr.doc.resolve(next).nodeAfter)) {
    const id = suffixId();
    let first = true;
    for (;;) {
      const child = tr.doc.resolve(next).nodeAfter;
      if (!child || !sameProseOrigin(left, child)) break;
      const origin = child.attrs.origin;
      tr.setNodeMarkup(next, undefined, {
        ...child.attrs, blockAnchor: `${chapterKey}:${id}`, blockStart: first,
        origin: { ...origin, block: { ...origin.block, id } },
      });
      next += child.nodeSize;
      first = false;
    }
  }
}
