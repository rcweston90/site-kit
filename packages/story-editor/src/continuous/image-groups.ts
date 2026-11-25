import type { Node as ProseNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import type { StoryBlock, StoryMedia } from '@rcweston/story-core';

export function canAddImage(block: StoryBlock): boolean {
  return block.type === 'gallery' || (block.type === 'media' && block.media.kind === 'image' &&
    Boolean(block.media.src?.trim()) && (!block.media.sourceMode || block.media.sourceMode === 'media') &&
    !block.media.youtubeUrl && !block.media.pdfUrl);
}

export function appendGroupImages(block: StoryBlock, added: StoryMedia[], freshId: () => string): StoryBlock | null {
  if (!added.length || !canAddImage(block)) return null;
  if (block.type === 'gallery') {
    const items = [...block.items, ...added];
    return { ...block, items, ...(block.layout === 'horizontal' && items.length > 3 ? { layout: 'grid' as const } : {}) };
  }
  if (block.type !== 'media') return null;
  return { type: 'gallery', id: block.id ?? freshId(), hidden: block.hidden,
    layout: block.media.caption?.trim() ? 'vertical' : added.length > 2 ? 'grid' : 'horizontal', items: [block.media, ...added] };
}

export function brokenGroupBlocks(block: StoryBlock, freshId: () => string): StoryBlock[] {
  if (block.type !== 'gallery' || !block.items.length) return [];
  return [
    ...block.items.map((media, index): StoryBlock => ({
      type: 'media', id: (index === 0 ? block.id : undefined) ?? freshId(),
      hidden: block.hidden, width: 'wide', media,
    })),
    ...(block.caption?.trim() ? [{ type: 'note' as const, id: freshId(), hidden: block.hidden, text: block.caption }] : []),
  ];
}

/** The outer editor can rehydrate equivalent node attrs when the dialog takes
 * focus. Re-find only the exact anchored asset, never a matching image source. */
export function currentImageTarget(doc: ProseNode, pos: number | undefined, anchor: string | null, expected: StoryBlock) {
  const direct = typeof pos === 'number' ? doc.nodeAt(pos) : null;
  if (typeof pos === 'number' && direct?.type.name === 'storyAsset' && direct.attrs.block === expected) return { pos, block: expected };
  if (!anchor && !expected.id) return null;
  const targets: { pos: number; block: StoryBlock }[] = [];
  doc.forEach((section, sectionOffset) => {
    if (section.type.name !== 'storySection') return;
    section.forEach((node, offset) => {
      if (node.type.name !== 'storyAsset') return;
      const block = node.attrs.block as StoryBlock;
      if (expected.id ? block.id !== expected.id : node.attrs.blockAnchor !== anchor) return;
      targets.push({ pos: sectionOffset + offset + 1, block });
    });
  });
  return targets.length === 1 && JSON.stringify(targets[0].block) === JSON.stringify(expected) ? targets[0] : null;
}

/** Replace this exact direct child, never a lookalike or a stale upload position. */
export function replaceImageBlocks(state: EditorState, pos: number, expected: StoryBlock, blocks: StoryBlock[]) {
  if (!blocks.length || pos < 0 || pos >= state.doc.content.size) return null;
  const point = state.doc.resolve(pos);
  const current = point.nodeAfter;
  if (point.depth !== 1 || point.parent.type.name !== 'storySection' ||
      current?.type.name !== 'storyAsset' || current.attrs.block !== expected) return null;
  // The shared group caption becomes a normal editable margin note. Its words
  // stay distinct from each individual image caption, and keep their order.
  const nodes = blocks.map((block, index) => {
    const attrs = { block, origin: index === 0 ? current.attrs.origin : null,
      blockAnchor: index === 0 && current.attrs.blockAnchor ? current.attrs.blockAnchor : `${point.parent.attrs.key}:${block.id}` };
    if (block.type === 'note') {
      const body = block.text.split('\n').flatMap((line, i) => [
        ...(i ? [state.schema.nodes.hardBreak.create()] : []),
        ...(line ? [state.schema.text(line)] : []),
      ]);
      return state.schema.nodes.storyNote.create(attrs, body);
    }
    return current.type.create(attrs);
  });
  const tr = closeHistory(state.tr).replaceWith(pos, pos + current.nodeSize, nodes).setMeta('storyAssetBoundary', true);
  return tr.setSelection(NodeSelection.create(tr.doc, pos));
}
