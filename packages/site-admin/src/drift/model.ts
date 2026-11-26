import { storyLargeParagraphs, type StoryDocument, type Story, type StoryBlock, type StoryChapter, type StoryChapterKey, type StoryMedia, type StoryProseBlock } from '@rcweston/story-core';
import { describeStoryPlace } from '@rcweston/story-editor';

/*
 * What the original — the story authored in code — gained after the editor's
 * drafts were made from it, and which of those changes the current draft is
 * missing. Publishing a draft that predates a code change used to drop that
 * change silently (a hero animation, an animated diagram).
 *
 * A three-way comparison of the import base (the copy the drafts started
 * from), the original as it is now, and the draft. Only paths the ORIGINAL
 * changed are reported, so nothing the author did on their own ever shows up:
 *   draft still equals the base  → safe: bringing it in applies the original
 *   draft differs from both      → conflict: the author changed it too
 *   draft already equals original → nothing to report
 *
 * Pure and React-free so it is unit-tested on its own
 * (tests/case-study-original-drift.test.mts).
 */

export type OriginalChangeKind = 'safe' | 'conflict';

/** Which version a change is applied from: the original's, or the draft's
 *  own value from when the change was found (a conflict's "Keep mine"). */
export type OriginalChangeSide = 'original' | 'draft';

type ChapterField = 'title' | 'density' | 'columns' | 'hidden';

/** Where a change lives, with both values, so applying never needs the
 *  stories it was found in. */
export type OriginalChangeSlot =
  | {
      kind: 'fields';
      /** Story fields set together (the split graphic is its layout plus its media). */
      keys: string[];
      original: Record<string, unknown>;
      draft: Record<string, unknown>;
    }
  | { kind: 'chapter'; chapter: StoryChapterKey; field: ChapterField; original: unknown; draft: unknown }
  | {
      kind: 'block';
      chapter: StoryChapterKey;
      /** The block's key in the draft (see `blockKey`), or the key it gets when inserted. */
      blockId: string;
      /** `null` = absent on that side. */
      original: StoryBlock | null;
      draft: StoryBlock | null;
      /** Keys of the blocks it follows, nearest first, for inserting it on each side. */
      after: { original: string[]; draft: string[] };
    };

export interface OriginalChange {
  /** Stable for the same change across re-diffs of the same base and original. */
  id: string;
  kind: OriginalChangeKind;
  /** Where on the page, by the publish checklist's names ("Hero · Animation"). */
  where: string;
  /** What the original did there ("New animation", "Image replaced"). */
  what: string;
  /** Conflicts only: what the author did at the same spot. */
  yours?: 'edited' | 'removed';
  slot: OriginalChangeSlot;
}

/* ── Comparing what a reader would see ─────────────────────────────────── */

/** Editor identities and capture briefs never reach a reader. */
const UNSEEN_KEYS = new Set(['id', 'shot']);

/** A prose block with its large text in one form. An older `lede: true` and
 *  `large: [0]` print the same page, and a list prints no large text at all,
 *  so the editor rewriting one as the other is never a change. */
function readerProse(value: object): object {
  const block = value as Partial<StoryProseBlock>;
  if (block.type !== 'prose' || !Array.isArray(block.paragraphs)) return value;
  const large = storyLargeParagraphs(block as StoryProseBlock);
  const rest: Partial<StoryProseBlock> = { ...block };
  delete rest.lede;
  delete rest.large;
  return large.length ? { ...rest, large } : rest;
}

/** A value as the page renders it: unseen keys dropped, and blank text or an
 *  empty list or object the same as none (an editor toggle leaves
 *  `visibility: {}` behind; a save drops an empty `mechanism`; the page skips
 *  an empty disclosure). Key order never matters. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => canonical(item) ?? null) : undefined;
  }
  if (value && typeof value === 'object') {
    const shown = readerProse(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(shown).sort()) {
      if (UNSEEN_KEYS.has(key)) continue;
      const item = canonical((shown as Record<string, unknown>)[key]);
      if (item !== undefined) out[key] = item;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof value === 'string') return value.trim() ? value : undefined;
  return value ?? undefined;
}

/** Equal fingerprints render the same page. Shared with the review's
 *  side-by-side (original-drift-compare.ts), so both agree on what differs. */
export const fingerprint = (value: unknown): string => JSON.stringify(canonical(value) ?? null);

/** Strings that choose how something renders rather than what it says. */
const SETTING_KEYS = new Set([
  'kind', 'src', 'poster', 'href', 'type', 'evidence', 'status', 'presentation', 'width', 'frame', 'matColor', 'matPadding',
  'format', 'tone', 'density', 'columns', 'layout',
]);

/** The value with every piece of reader-facing text blanked, so two values
 *  with equal skeletons differ only in their words. A list of strings
 *  (paragraphs, steps) blanks to one marker: another paragraph is more text. */
function skeleton(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string') ? '' : value.map((item) => skeleton(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(readerProse(value)).map(([entry, item]) => [entry, skeleton(item, entry)]));
  }
  return typeof value === 'string' && !(key && SETTING_KEYS.has(key)) ? '' : value;
}

/* ── Plain-language "what" ─────────────────────────────────────────────── */

type MediaWord = 'image' | 'video' | 'animation' | 'graphic';

const mediaWord = (media: StoryMedia): MediaWord => (media.animated ? 'animation' : media.kind === 'video' ? 'video' : 'image');
/** The split graphic's clips loop like an animation; a still is a graphic. */
const graphicWord = (media: StoryMedia): MediaWord => (media.kind === 'video' || media.animated ? 'animation' : 'graphic');
const capitalised = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const withArticle = (word: MediaWord) => `${word === 'image' || word === 'animation' ? 'an' : 'a'} ${word}`;

export const isMedia = (value: unknown): value is StoryMedia => Boolean(
  value && typeof value === 'object' && !Array.isArray(value)
  && 'kind' in value && 'alt' in value
  && ((value as StoryMedia).kind === 'image' || (value as StoryMedia).kind === 'video'),
);

function describeMedia(base: StoryMedia | undefined, original: StoryMedia | undefined, word: (media: StoryMedia) => MediaWord = mediaWord): string {
  if (!base && original) return `New ${word(original)}`;
  if (base && !original) return `${capitalised(word(base))} removed`;
  if (!base || !original) return 'Settings changed';
  if (base.src !== original.src || base.kind !== original.kind || Boolean(base.animated) !== Boolean(original.animated)) {
    const before = word(base);
    const after = word(original);
    return before === after ? `${capitalised(after)} replaced` : `Replaced with ${withArticle(after)}`;
  }
  return fingerprint(skeleton(base)) === fingerprint(skeleton(original)) ? 'Text changed' : 'Settings changed';
}

/** The first media whose footage differs between two versions of the same
 *  thing, walking both in step — so a block names its image, not its text. */
function firstMediaChange(base: unknown, original: unknown): string | null {
  if (isMedia(base) || isMedia(original)) {
    const before = isMedia(base) ? base : undefined;
    const after = isMedia(original) ? original : undefined;
    if (before?.src === after?.src && Boolean(before) === Boolean(after)) return null;
    return describeMedia(before, after);
  }
  if (Array.isArray(base) || Array.isArray(original)) {
    const before = Array.isArray(base) ? base : [];
    const after = Array.isArray(original) ? original : [];
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      const found = firstMediaChange(before[index], after[index]);
      if (found) return found;
    }
    return null;
  }
  if (base && typeof base === 'object' && original && typeof original === 'object') {
    for (const key of new Set([...Object.keys(base), ...Object.keys(original)])) {
      const found = firstMediaChange((base as Record<string, unknown>)[key], (original as Record<string, unknown>)[key]);
      if (found) return found;
    }
  }
  return null;
}

function describeValue(base: unknown, original: unknown): string {
  if (canonical(base) === undefined) return 'Added';
  if (canonical(original) === undefined) return 'Removed';
  const media = firstMediaChange(base, original);
  if (media) return media;
  if (fingerprint(skeleton(base)) === fingerprint(skeleton(original))) return 'Text changed';
  // A list of items (facts, credits): say which way it moved.
  if (Array.isArray(base) && Array.isArray(original) && base.length !== original.length) {
    return original.length > base.length ? 'Item added' : 'Item removed';
  }
  return 'Settings changed';
}

function describeText(base: unknown, original: unknown): string {
  if (!base) return 'Text added';
  if (!original) return 'Text removed';
  return 'Text changed';
}

function describeBlock(base: StoryBlock | null, original: StoryBlock | null): string {
  if (!base) return 'Block added';
  if (!original) return 'Block removed';
  if (base.type !== original.type) return 'Block changed';
  return describeValue(base, original);
}

/* ── Story fields ──────────────────────────────────────────────────────── */

/** In page order: the hero's lines, its graphic and facts, then its media. */
const LEADING_FIELDS = ['company', 'companyLogo', 'period', 'status', 'title', 'thesis', 'disclosure', 'heroGraphic', 'facts', 'hero'];
/** After the chapters: the closing sections, then settings that aren't on the page. */
const TRAILING_FIELDS = ['decisions', 'hindsight', 'credits', 'tone', 'summary', 'related', 'visibility', 'outcomes'];
/** Never rendered (glance, its presentation, the counterfactual), handled
 *  elsewhere (chapters, the split graphic's layout), or not this review's
 *  to change (the address). `outcomes` stays: it is the /work card's metric. */
const IGNORED_FIELDS = new Set(['slug', 'chapters', 'heroLayout', 'glance', 'glancePresentation', 'counterfactual']);
const TEXT_FIELDS = new Set(['company', 'period', 'status', 'title', 'thesis', 'disclosure', 'summary']);
/** Pure switches and slugs: whatever moved, it's a setting. */
const SETTING_FIELDS = new Set(['tone', 'related', 'visibility']);
/** Visibility switches for sections that no longer render. */
const UNSEEN_VISIBILITY = ['glance', 'headlineOutcomes', 'counterfactual'];

const fieldKeys = (key: string) => (key === 'heroGraphic' ? ['heroLayout', 'heroGraphic'] : [key]);

/** A field as the reader meets it. The split graphic only shows with the
 *  split layout, so the two are one change. */
function fieldValue(story: Story, key: string): unknown {
  if (key === 'heroGraphic') {
    return story.heroLayout === 'split-graphic' && story.heroGraphic ? story.heroGraphic : undefined;
  }
  if (key === 'visibility') {
    const shown: Record<string, unknown> = { ...story.visibility };
    for (const unseen of UNSEEN_VISIBILITY) delete shown[unseen];
    return shown;
  }
  return (story as unknown as Record<string, unknown>)[key];
}

function pickFields(story: Story, keys: readonly string[]): Record<string, unknown> {
  const record = story as unknown as Record<string, unknown>;
  return Object.fromEntries(keys.map((key) => [key, structuredClone(record[key])]));
}

function describeField(key: string, base: unknown, original: unknown): string {
  if (key === 'heroGraphic') return describeMedia(base as StoryMedia | undefined, original as StoryMedia | undefined, graphicWord);
  if (key === 'hero') return describeMedia(base as StoryMedia | undefined, original as StoryMedia | undefined);
  if (key === 'companyLogo') return !base ? 'New logo' : !original ? 'Logo removed' : 'Logo replaced';
  if (TEXT_FIELDS.has(key)) return describeText(base, original);
  if (SETTING_FIELDS.has(key)) return 'Settings changed';
  return describeValue(base, original);
}

/** Named from whichever story has the thing, so an animation the draft
 *  lacks is still called an animation. */
function fieldPlace(key: string, original: Story, draft: Story): string {
  if (key === 'heroGraphic') return describeStoryPlace(original.heroGraphic ? original : draft, ['heroGraphic']);
  if (key === 'hero') return describeStoryPlace(original.hero ? original : draft, ['hero']);
  return describeStoryPlace(draft, [key]);
}

/** One comparison of the three versions at a spot: null when the original
 *  didn't change it or the draft already matches the original. */
function classify(base: unknown, original: unknown, draft: unknown): Pick<OriginalChange, 'kind' | 'yours'> | null {
  const before = fingerprint(base);
  const after = fingerprint(original);
  if (before === after) return null;
  const mine = fingerprint(draft);
  if (mine === after) return null;
  if (mine === before) return { kind: 'safe' };
  return { kind: 'conflict', yours: canonical(draft) === undefined ? 'removed' : 'edited' };
}

/* ── Chapters and blocks ───────────────────────────────────────────────── */

const CHAPTER_FIELDS: ChapterField[] = ['title', 'density', 'columns', 'hidden'];

/**
 * A block's identity: its id, or — for a block without one, as every authored
 * block is — the id the editor gives it on load (normalizeStoryForEditor in
 * app/admin/case-studies/story-admin-model.ts): `block-<slug>-<chapter>-<n>`
 * by position in the version it was loaded from. A draft made from the base
 * keeps those, so a draft block still answers to its base block's key.
 */
function blockKey(slug: string, chapter: StoryChapterKey, block: StoryBlock, index: number): string {
  return block.id ?? `block-${slug}-${chapter}-${index + 1}`;
}

/** A block the original added gets its own key when brought in, so it is
 *  recognised (and left alone) even after the author edits it. */
function addedBlockKey(slug: string, chapter: StoryChapterKey, block: StoryBlock, index: number): string {
  return block.id ?? `block-${slug}-${chapter}-original-${index + 1}`;
}

function findBlock(story: Story, key: string): { chapterIndex: number; blockIndex: number; block: StoryBlock } | null {
  for (const [chapterIndex, chapter] of story.chapters.entries()) {
    const blockIndex = chapter.blocks.findIndex((block, index) => blockKey(story.slug, chapter.key, block, index) === key);
    if (blockIndex >= 0) return { chapterIndex, blockIndex, block: chapter.blocks[blockIndex] };
  }
  return null;
}

interface BlockEntry { base: number | null; original: number | null }

/**
 * Pairs the base's blocks with the original's. Blocks with ids pair by id.
 * Without ids, identical blocks pair first wherever they moved (a move alone
 * is no change, and never reads as one block removed and another added);
 * then blocks of the same type pair in order, so one edited block is one
 * change even when the original also reordered the section. What's left
 * over was added or removed: a block inserted mid-section is one "Block
 * added", not every block after it "changed".
 */
function alignBlocks(base: readonly StoryBlock[], original: readonly StoryBlock[]): BlockEntry[] {
  const pairs = new Map<number, number>();
  const used = new Set<number>();
  const pair = (originalIndex: number, baseIndex: number) => {
    pairs.set(originalIndex, baseIndex);
    used.add(baseIndex);
  };

  if ([...base, ...original].every((block) => block.id)) {
    const baseIndex = new Map(base.map((block, index) => [block.id!, index]));
    original.forEach((block, index) => {
      const match = baseIndex.get(block.id!);
      if (match !== undefined) pair(index, match);
    });
  } else {
    const before = base.map(fingerprint);
    original.map(fingerprint).forEach((print, index) => {
      const match = before.findIndex((candidate, at) => !used.has(at) && candidate === print);
      if (match >= 0) pair(index, match);
    });
    original.forEach((block, index) => {
      if (pairs.has(index)) return;
      const match = base.findIndex((candidate, at) => !used.has(at) && candidate.type === block.type);
      if (match >= 0) pair(index, match);
    });
  }

  const entries: BlockEntry[] = original.map((_, index) => ({ base: pairs.get(index) ?? null, original: index }));
  base.forEach((_, index) => { if (!used.has(index)) entries.push({ base: index, original: null }); });
  return entries;
}

function chapterChanges(key: StoryChapterKey, base: Story, original: Story, draft: Story): OriginalChange[] {
  const baseChapter = base.chapters.find((chapter) => chapter.key === key);
  const originalChapter = original.chapters.find((chapter) => chapter.key === key);
  const draftChapterIndex = draft.chapters.findIndex((chapter) => chapter.key === key);
  const draftChapter = draft.chapters[draftChapterIndex];
  // Every story has all four; a missing one has nothing to compare against.
  if (!baseChapter || !originalChapter || !draftChapter) return [];
  const changes: OriginalChange[] = [];

  for (const field of CHAPTER_FIELDS) {
    const result = classify(baseChapter[field], originalChapter[field], draftChapter[field]);
    if (!result) continue;
    changes.push({
      id: `chapter:${key}:${field}`,
      ...result,
      where: describeStoryPlace(draft, ['chapters', draftChapterIndex, field]),
      what: field === 'title'
        ? describeText(baseChapter.title, originalChapter.title)
        : field === 'hidden'
          ? (originalChapter.hidden ? 'Section hidden' : 'Section shown')
          : 'Layout changed',
      slot: { kind: 'chapter', chapter: key, field, original: structuredClone(originalChapter[field]), draft: structuredClone(draftChapter[field]) },
    });
  }

  const entries = alignBlocks(baseChapter.blocks, originalChapter.blocks);
  const originalIndex = original.chapters.indexOf(originalChapter);
  /** The draft key each original block has, or will have once brought in. */
  const draftKeyForOriginal = new Map<number, string>();
  for (const entry of entries) {
    if (entry.original === null) continue;
    draftKeyForOriginal.set(entry.original, entry.base !== null
      ? blockKey(base.slug, key, baseChapter.blocks[entry.base], entry.base)
      : addedBlockKey(original.slug, key, originalChapter.blocks[entry.original], entry.original));
  }
  const precedingInOriginal = (index: number | null) => (index === null ? [] : Array.from({ length: index }, (_, offset) => draftKeyForOriginal.get(index - 1 - offset)!));

  for (const entry of entries) {
    const baseBlock = entry.base === null ? null : baseChapter.blocks[entry.base];
    const originalBlock = entry.original === null ? null : originalChapter.blocks[entry.original];
    if (baseBlock && originalBlock && fingerprint(baseBlock) === fingerprint(originalBlock)) continue;

    if (!baseBlock && originalBlock && entry.original !== null) {
      const blockId = addedBlockKey(original.slug, key, originalBlock, entry.original);
      const content = fingerprint(originalBlock);
      // Already brought in (perhaps edited since), or already written by hand.
      if (findBlock(draft, blockId) || draftChapter.blocks.some((block) => fingerprint(block) === content)) continue;
      changes.push({
        id: `block:${key}:original-${entry.original}`,
        kind: 'safe',
        where: describeStoryPlace(original, ['chapters', originalIndex, 'blocks', entry.original]),
        what: 'Block added',
        slot: { kind: 'block', chapter: key, blockId, original: structuredClone(originalBlock), draft: null, after: { original: precedingInOriginal(entry.original), draft: [] } },
      });
      continue;
    }
    if (!baseBlock || entry.base === null) continue;

    const blockId = blockKey(base.slug, key, baseBlock, entry.base);
    const found = findBlock(draft, blockId);
    const result = classify(baseBlock, originalBlock, found?.block ?? null);
    if (!result) continue;
    const foundChapter = found ? draft.chapters[found.chapterIndex] : null;
    changes.push({
      id: `block:${key}:base-${entry.base}`,
      ...result,
      where: found
        ? describeStoryPlace(draft, ['chapters', found.chapterIndex, 'blocks', found.blockIndex])
        : describeStoryPlace(original, ['chapters', originalIndex, 'blocks', entry.original ?? 0]),
      what: describeBlock(baseBlock, originalBlock),
      slot: {
        kind: 'block',
        chapter: foundChapter?.key ?? key,
        blockId,
        original: originalBlock ? structuredClone(originalBlock) : null,
        draft: found ? structuredClone(found.block) : null,
        after: {
          original: precedingInOriginal(entry.original),
          draft: found && foundChapter
            ? foundChapter.blocks.slice(0, found.blockIndex).map((block, index) => blockKey(draft.slug, foundChapter.key, block, index)).reverse()
            : [],
        },
      },
    });
  }
  return changes;
}

/* ── The comparison ────────────────────────────────────────────────────── */

/** The document a saved version's content came from: the version it
 *  restored, or else the one it was saved over. */
function contentParent<T extends Pick<StoryDocument, 'id' | 'sourceKind' | 'sourceRef' | 'parentDocumentId'>>(document: T, byId: ReadonlyMap<string, T>): string | null {
  if (document.sourceKind === 'restore' && byId.has(document.sourceRef)) return document.sourceRef;
  return document.parentDocumentId;
}

function lineage<T extends Pick<StoryDocument, 'id' | 'sourceKind' | 'sourceRef' | 'parentDocumentId'>>(start: T, byId: ReadonlyMap<string, T>): string[] {
  const seen: string[] = [];
  let current: T | undefined = start;
  while (current && !seen.includes(current.id)) {
    seen.push(current.id);
    const parent: string | null = contentParent(current, byId);
    current = parent ? byId.get(parent) : undefined;
  }
  return seen;
}

/**
 * The copy the draft and the published version both grew from: their nearest
 * common ancestor, following each save's content parent (the version a
 * restore brought back, or else the version it was saved over). None when the
 * published version is already in the draft's history — the draft holds
 * everything published, so there is nothing to warn about — when nothing is
 * published, or when the two share no history.
 */
export function findDriftBase<T extends Pick<StoryDocument, 'id' | 'sourceKind' | 'sourceRef' | 'parentDocumentId'>>(
  documents: readonly T[],
  publishedDocumentId: string | null,
  draftDocumentId: string | null = documents[0]?.id ?? null,
): T | null {
  if (!publishedDocumentId || !draftDocumentId || publishedDocumentId === draftDocumentId) return null;
  const byId = new Map(documents.map((document) => [document.id, document]));
  const published = byId.get(publishedDocumentId);
  const draft = byId.get(draftDocumentId);
  if (!published || !draft) return null;
  const draftLine = new Set(lineage(draft, byId));
  if (draftLine.has(published.id)) return null;
  const shared = lineage(published, byId).find((id) => draftLine.has(id));
  return shared ? byId.get(shared) ?? null : null;
}

/**
 * Changes the original made since `base` that `draft` doesn't have, in page
 * order. `base` is the authored copy the drafts were made from (the newest
 * document imported from the authored file); without one there is nothing to
 * compare against, and the caller shows nothing.
 */
export function diffOriginal({ base, original, draft }: { base: Story; original: Story; draft: Story }): OriginalChange[] {
  const fieldChange = (key: string): OriginalChange | null => {
    const result = classify(fieldValue(base, key), fieldValue(original, key), fieldValue(draft, key));
    if (!result) return null;
    const keys = fieldKeys(key);
    return {
      id: `field:${key}`,
      ...result,
      where: fieldPlace(key, original, draft),
      what: describeField(key, fieldValue(base, key), fieldValue(original, key)),
      slot: { kind: 'fields', keys, original: pickFields(original, keys), draft: pickFields(draft, keys) },
    };
  };
  const fields = (keys: readonly string[]) => keys.map(fieldChange).filter((change): change is OriginalChange => change !== null);

  // A field added to the story type later is still compared, under Story settings.
  const known = new Set([...LEADING_FIELDS, ...TRAILING_FIELDS, ...IGNORED_FIELDS]);
  const later = [...new Set([base, original, draft].flatMap((story) => Object.keys(story)))].filter((key) => !known.has(key)).sort();

  return [
    ...fields(LEADING_FIELDS),
    // The draft's section order: what the author sees, top to bottom.
    ...draft.chapters.flatMap((chapter) => chapterChanges(chapter.key, base, original, draft)),
    ...fields([...TRAILING_FIELDS, ...later]),
  ];
}

/* ── Applying ──────────────────────────────────────────────────────────── */

function setChapterField(chapter: StoryChapter, field: ChapterField, value: unknown): StoryChapter {
  const next = { ...chapter } as Record<string, unknown>;
  if (value === undefined) delete next[field];
  else next[field] = structuredClone(value);
  return next as unknown as StoryChapter;
}

/**
 * The story with one change applied from `side`: the original's value (bring
 * in / use original), or the draft's value from when the change was found
 * (keep mine, after choosing the original). Blocks are found by key wherever
 * the author moved them; a replaced block keeps the draft's id, so the
 * selection and the next comparison still recognise it.
 */
export function applyOriginalChange(story: Story, change: OriginalChange, side: OriginalChangeSide = 'original'): Story {
  const { slot } = change;
  if (slot.kind === 'fields') {
    const values = side === 'original' ? slot.original : slot.draft;
    const next = { ...story } as unknown as Record<string, unknown>;
    for (const key of slot.keys) {
      if (values[key] === undefined) delete next[key];
      else next[key] = structuredClone(values[key]);
    }
    return next as unknown as Story;
  }
  if (slot.kind === 'chapter') {
    const value = side === 'original' ? slot.original : slot.draft;
    return { ...story, chapters: story.chapters.map((chapter) => (chapter.key === slot.chapter ? setChapterField(chapter, slot.field, value) : chapter)) };
  }

  const value = side === 'original' ? slot.original : slot.draft;
  const found = findBlock(story, slot.blockId);
  const withBlocks = (chapterIndex: number, blocks: StoryBlock[]): Story => ({
    ...story,
    chapters: story.chapters.map((chapter, index) => (index === chapterIndex ? { ...chapter, blocks } : chapter)),
  });
  if (found) {
    const blocks = [...story.chapters[found.chapterIndex].blocks];
    if (!value) {
      blocks.splice(found.blockIndex, 1);
    } else {
      const replacement = structuredClone(value) as StoryBlock & { id?: string };
      if (found.block.id) replacement.id = found.block.id;
      else delete replacement.id;
      blocks[found.blockIndex] = replacement;
    }
    return withBlocks(found.chapterIndex, blocks);
  }
  if (!value) return story;
  const chapterIndex = story.chapters.findIndex((chapter) => chapter.key === slot.chapter);
  if (chapterIndex < 0) return story;
  const chapter = story.chapters[chapterIndex];
  const keys = chapter.blocks.map((block, index) => blockKey(story.slug, chapter.key, block, index));
  const anchors = side === 'original' ? slot.after.original : slot.after.draft;
  const anchor = anchors.map((key) => keys.indexOf(key)).find((index) => index >= 0) ?? -1;
  const blocks = [...chapter.blocks];
  blocks.splice(anchor + 1, 0, { ...structuredClone(value), id: slot.blockId });
  return withBlocks(chapterIndex, blocks);
}

/** Several changes in order, as one edit (so one undo reverts them all). */
export function applyOriginalChanges(story: Story, changes: readonly OriginalChange[], side: OriginalChangeSide = 'original'): Story {
  return changes.reduce((next, change) => applyOriginalChange(next, change, side), story);
}
