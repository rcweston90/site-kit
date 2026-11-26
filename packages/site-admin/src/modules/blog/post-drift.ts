import { blogPlainText, type BlogPostContent } from '@rcweston/site-data/client';
import type { ComparePart, CompareValue } from '../../drift/compare.js';

/*
 * The post editor's version of the case-study drift review: when the
 * published version gained changes after the draft was made from an earlier
 * one (a draft restored from before the last publish, say), find what the
 * published version has that the draft doesn't, by a three-way comparison
 * from the versions' common ancestor.
 *
 * Fields compare as values. The body compares as its top-level HTML blocks
 * (paragraphs, headings, lists, callouts, images, cards): runs of blocks the
 * published version changed are one change each, safe when the draft still
 * holds the ancestor's blocks there, a conflict when the draft changed them
 * too. Pure and React-free, so it is unit-tested on its own.
 */

export type PostChangeKind = 'safe' | 'conflict';
export type PostField = 'title' | 'description' | 'tags' | 'imageUrl';

export type PostChangeSlot =
  | { kind: 'field'; field: PostField; original: string | string[]; draft: string | string[] }
  | {
      kind: 'body';
      /** The published version's blocks for this run. */
      original: string[];
      /** The draft's blocks at the same spot when the change was found. */
      draft: string[];
      /** The draft block the run follows, null at the start. */
      after: string | null;
    };

export interface PostChange {
  id: string;
  kind: PostChangeKind;
  where: string;
  what: string;
  yours?: 'edited' | 'removed';
  slot: PostChangeSlot;
}

const FIELDS: { field: PostField; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'description', label: 'Summary' },
  { field: 'tags', label: 'Tags' },
  { field: 'imageUrl', label: 'Cover image' },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A post body as its top-level blocks, each as the HTML it was saved as.
 * Text between blocks (rare in editor output) is its own block.
 */
export function postBlocks(html: string): string[] {
  if (!html.trim()) return [];
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks: string[] = [];
  template.content.childNodes.forEach((node) => {
    if (node.nodeType === 1) blocks.push((node as Element).outerHTML);
    else if (node.nodeType === 3 && node.textContent?.trim()) blocks.push(node.textContent);
  });
  return blocks;
}

/** Index pairs of the longest common run of two block lists. */
function matchBlocks(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { pairs.push([i, j]); i += 1; j += 1; }
    else if (lengths[i + 1][j] >= lengths[i][j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

interface Hunk { baseStart: number; baseEnd: number; blocks: string[] }

/** Where `next` differs from `base`: runs of base blocks and what replaced them. */
function hunks(base: readonly string[], next: readonly string[]): Hunk[] {
  const out: Hunk[] = [];
  let i = 0;
  let j = 0;
  for (const [bi, nj] of [...matchBlocks(base, next), [base.length, next.length] as [number, number]]) {
    if (bi > i || nj > j) out.push({ baseStart: i, baseEnd: bi, blocks: next.slice(j, nj) });
    i = bi + 1;
    j = nj + 1;
  }
  return out;
}

/** A short, readable name for a run of blocks. */
export function blockLabel(blocks: readonly string[]): string {
  const text = blogPlainText(blocks.join('\n')).replace(/\s+/g, ' ').trim();
  if (!text) return blocks.some((block) => /^<(img|a)\b/i.test(block) || /<img\b/i.test(block)) ? 'Image' : blocks.some((block) => /^<hr\b/i.test(block)) ? 'Divider' : 'Block';
  const words = text.split(' ');
  return words.length > 8 ? `“${words.slice(0, 8).join(' ')}…”` : `“${text}”`;
}

/**
 * What the published version (`original`) changed since `base` that `draft`
 * doesn't have, fields first, then the body top to bottom.
 */
export function diffPost({ base, original, draft }: { base: BlogPostContent; original: BlogPostContent; draft: BlogPostContent }): PostChange[] {
  const changes: PostChange[] = [];
  for (const { field, label } of FIELDS) {
    const was = base[field];
    const now = original[field];
    const mine = draft[field];
    if (same(was, now) || same(mine, now)) continue;
    const conflict = !same(mine, was);
    const empty = Array.isArray(mine) ? mine.length === 0 : !mine.trim();
    changes.push({
      id: `field:${field}`,
      kind: conflict ? 'conflict' : 'safe',
      where: label,
      what: (Array.isArray(now) ? now.length === 0 : !now.trim()) ? 'Removed' : (Array.isArray(was) ? was.length === 0 : !was.trim()) ? 'Added' : 'Changed',
      ...(conflict ? { yours: empty ? 'removed' as const : 'edited' as const } : {}),
      slot: { kind: 'field', field, original: structuredClone(now), draft: structuredClone(mine) },
    });
  }

  const baseBlocks = postBlocks(base.html);
  const draftBlocks = postBlocks(draft.html);
  // Where each base block sits in the draft, if it's still there unchanged.
  const inDraft = new Map(matchBlocks(baseBlocks, draftBlocks));
  for (const hunk of hunks(baseBlocks, postBlocks(original.html))) {
    // The draft's span for this run: between the draft positions of the
    // nearest base blocks on either side that the draft still holds.
    let before = -1;
    for (let index = hunk.baseStart - 1; index >= 0; index -= 1) {
      const at = inDraft.get(index);
      if (at !== undefined) { before = at; break; }
    }
    let after = draftBlocks.length;
    for (let index = hunk.baseEnd; index < baseBlocks.length; index += 1) {
      const at = inDraft.get(index);
      if (at !== undefined) { after = at; break; }
    }
    const ancestor = baseBlocks.slice(hunk.baseStart, hunk.baseEnd);
    // The draft still holds the ancestor's blocks right where they were (it
    // may have added its own after them): only those are this change's span.
    const kept = ancestor.length > 0 && same(draftBlocks.slice(before + 1, before + 1 + ancestor.length), ancestor);
    // A pure insertion goes right after its anchor, whatever the draft added there.
    const insertion = ancestor.length === 0;
    const mine = kept ? ancestor : insertion ? [] : draftBlocks.slice(before + 1, after);
    // Already in the draft where the published version has it.
    if (same(mine, hunk.blocks) || (hunk.blocks.length > 0 && same(draftBlocks.slice(before + 1, before + 1 + hunk.blocks.length), hunk.blocks))) continue;
    const conflict = !kept && !insertion;
    const anchor = before >= 0 ? draftBlocks[before] : null;
    changes.push({
      id: `body:${hunk.baseStart}:${hunk.baseEnd}:${hunk.blocks.length}`,
      kind: conflict ? 'conflict' : 'safe',
      where: `Body · ${blockLabel(hunk.blocks.length ? hunk.blocks : ancestor)}`,
      what: hunk.blocks.length === 0 ? 'Removed' : ancestor.length === 0 ? 'New in the published version' : 'Changed',
      ...(conflict ? { yours: mine.length === 0 ? 'removed' as const : 'edited' as const } : {}),
      slot: { kind: 'body', original: hunk.blocks, draft: mine, after: anchor },
    });
  }
  return changes;
}

/** The post with one change applied from the published side, or the draft's own value. */
export function applyPostChange(post: BlogPostContent, change: PostChange, side: 'original' | 'draft' = 'original'): BlogPostContent {
  const { slot } = change;
  if (slot.kind === 'field') return { ...post, [slot.field]: structuredClone(side === 'original' ? slot.original : slot.draft) };
  const blocks = postBlocks(post.html);
  const from = side === 'original' ? slot.draft : slot.original;
  const to = side === 'original' ? slot.original : slot.draft;
  const start = slot.after === null ? 0 : blocks.indexOf(slot.after) + 1;
  if (slot.after !== null && start === 0) return post;
  // The span must still be where it was found, or the change no longer applies.
  if (!same(blocks.slice(start, start + from.length), from)) return post;
  blocks.splice(start, from.length, ...to);
  return { ...post, html: blocks.join('') };
}

/** Several changes in order, as one edit. */
export function applyPostChanges(post: BlogPostContent, changes: readonly PostChange[]): BlogPostContent {
  return changes.reduce((next, change) => applyPostChange(next, change), post);
}

const text = (value: string): CompareValue => (value.trim() ? { kind: 'text', text: value } : { kind: 'none' });

/** The two sides of a change as the review shows them. */
export function comparePostChange(change: PostChange): { absent: { yours: boolean; original: boolean }; parts: ComparePart[] } {
  const { slot } = change;
  if (slot.kind === 'field') {
    const show = (value: string | string[]) => text(Array.isArray(value) ? value.join(', ') : value);
    return { absent: { yours: false, original: false }, parts: [{ label: '', yours: show(slot.draft), original: show(slot.original) }] };
  }
  const show = (blocks: string[]) => text(blocks.map((block) => blogPlainText(block).trim() || `[${blockLabel([block])}]`).join('\n\n'));
  return {
    absent: { yours: slot.draft.length === 0, original: slot.original.length === 0 },
    parts: [{ label: '', yours: show(slot.draft), original: show(slot.original) }],
  };
}
