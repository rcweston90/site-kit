import { storyLargeParagraphs, type StoryMedia, type StoryProseBlock } from '@rcweston/story-core';
import { fingerprint, isMedia, type OriginalChange } from './model.js';

/*
 * The review's side-by-side. For one change from the original, the parts
 * that differ between the author's draft and the original — each as text or
 * as media, in the editor's own words — and, inside text, the words that
 * differ. A row that said only "Text changed" gave no way to judge which
 * version to keep.
 *
 * Pure and React-free so it is unit-tested with the comparison itself
 * (tests/case-study-original-drift.test.mts).
 */

export type CompareValue =
  | { kind: 'text'; text: string }
  | { kind: 'media'; media: StoryMedia }
  | { kind: 'none' };

export interface ComparePart {
  /** What this part is, as the page or the editor names it ("Design
   *  rationale", "Caption"). Empty when the part is the whole change. */
  label: string;
  yours: CompareValue;
  original: CompareValue;
}

export interface OriginalComparison {
  /** A side the thing doesn't exist on: a block the original added, or one
   *  removed on either side. Its card says so instead of listing blanks. */
  absent: { yours: boolean; original: boolean };
  parts: ComparePart[];
}

const NONE: CompareValue = { kind: 'none' };
const text = (value: string): CompareValue => ({ kind: 'text', text: value });

/** Editor identities, capture briefs and the block's kind (named separately
 *  when it changed) never read as content. */
const SKIPPED = new Set(['id', 'shot', 'type', 'lede']);

/* A decision's four editorial headings are its own to rename; blank, the
   page prints these (StoryBlocks.tsx). Each field's part is named by the
   heading over it. */
const DECISION_HEADINGS: Record<string, { field: string; heading: string }> = {
  contextLabel: { field: 'context', heading: 'Known inputs' },
  rationaleLabel: { field: 'because', heading: 'Design rationale' },
  tradeoffLabel: { field: 'cost', heading: 'Page-owner trade-off' },
  contributionLabel: { field: 'mine', heading: 'My contribution' },
  callLabel: { field: 'call', heading: 'The call' },
  alternativesLabel: { field: 'options', heading: 'Options' },
};

/* Everything else by the editor's names for it. */
const LABELS: Record<string, string> = {
  call: 'The call',
  over: 'Instead of',
  options: 'Options',
  status: 'Status',
  mechanism: 'Mechanism',
  presentation: 'Style',
  paragraphs: 'Text',
  large: 'Large text',
  format: 'Format',
  text: 'Text',
  attribution: 'Attribution',
  media: 'Media',
  caption: 'Caption',
  alt: 'Alt text',
  width: 'Width',
  frame: 'Frame',
  matColor: 'Matte color',
  matPadding: 'Matte padding',
  aspect: 'Shape',
  framing: 'Framing',
  poster: 'Poster',
  before: 'Before',
  after: 'After',
  items: 'Items',
  company: 'Company',
  companyLogo: 'Company logo',
  period: 'Period',
  projectYear: 'Project year',
  hero: 'Hero media',
  heroGraphic: 'Hero graphic',
  heroLayout: 'Hero layout',
  facts: 'Facts',
  density: 'Density',
  columns: 'Text columns',
  hidden: 'Visibility',
  related: 'Related stories',
  layout: 'Layout',
  surface: 'Surface',
  titleWidth: 'Title',
  highlight: 'Set apart',
  body: 'Text',
  footer: 'Closing line',
  size: 'Size',
};

/* Settings by the words their menus use (EditorBlockHandle.tsx). */
const VALUE_WORDS: Record<string, Record<string, string>> = {
  width: { text: 'Text column', wide: 'Wide', full: 'Full band' },
  frame: { mat: 'Mat', bleed: 'Bleed' },
  matColor: { page: 'Page', grey: 'Grey', cool: 'Cool', warm: 'Warm', amber: 'Amber', teal: 'Teal', ink: 'Ink' },
  matPadding: { small: 'Small', medium: 'Medium', large: 'Large' },
  status: { held: 'Held', revised: 'Revised later', reversed: 'Reversed' },
  presentation: { card: 'Card', editorial: 'Editorial' },
  format: { paragraphs: 'Paragraphs', bullets: 'Bulleted list', numbered: 'Numbered list' },
  density: { default: 'Default', compact: 'Compact' },
  columns: { one: 'One column', two: 'Two columns' },
  layout: { columns: 'Columns', split: 'Title beside points', rows: 'Rows' },
  surface: { card: 'Card', panel: 'Dark panel', open: 'No box' },
  titleWidth: { measure: 'Reading width', full: 'Full width' },
  size: { small: 'Small', medium: 'Medium', large: 'Large', xl: 'Extra large' },
};

const sentenceCase = (key: string) => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const labelFor = (key: string) => LABELS[key] ?? sentenceCase(key);
/** "Items" → "Item 2": one entry of a list. */
const entryLabel = (label: string, index: number) => `${label.replace(/s$/, '') || 'Item'} ${index + 1}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const holdsMedia = (value: unknown): boolean =>
  isMedia(value) || (Array.isArray(value) ? value.some(holdsMedia) : isRecord(value) && Object.values(value).some(holdsMedia));

/** A prose block's large text in one form, as the comparison reads it: an
 *  older `lede` and `large: [0]` are the same page. */
function readerFields(record: Record<string, unknown>): Record<string, unknown> {
  if (isMedia(record) && record.frame === 'mat') {
    // The mat is every frame's default (StoryMedia.tsx).
    const rest = { ...record } as Record<string, unknown>;
    delete rest.frame;
    return rest;
  }
  if (record.type === 'decision') {
    // A blank heading prints the default: the same page as typing it.
    const headings = { ...record };
    for (const [key, { heading }] of Object.entries(DECISION_HEADINGS)) {
      if (typeof headings[key] !== 'string' || !(headings[key] as string).trim()) headings[key] = heading;
    }
    return headings;
  }
  if (record.type !== 'prose' || !Array.isArray(record.paragraphs)) return record;
  const rest = { ...record };
  delete rest.lede;
  delete rest.large;
  const large = storyLargeParagraphs(record as unknown as StoryProseBlock);
  return large.length ? { ...rest, large } : rest;
}

const FOOTAGE_KEYS = new Set(['src', 'kind', 'animated', 'alt', 'aspect', 'poster', 'loop']);
const aroundFootage = (media: StoryMedia | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(media ? readerFields(media as unknown as Record<string, unknown>) : {}).filter(([key]) => !FOOTAGE_KEYS.has(key)));

/** Every piece of text in a value, in order, for a list entry with no media. */
function leafText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(leafText).filter(Boolean).join(' · ');
  if (isRecord(value)) {
    return Object.entries(value).filter(([key]) => !SKIPPED.has(key)).map(([, item]) => leafText(item)).filter(Boolean).join(' · ');
  }
  return '';
}

function asValue(key: string | undefined, value: unknown): CompareValue {
  if (key === 'hidden') return text(value ? 'Hidden' : 'Shown');
  if (isMedia(value)) return { kind: 'media', media: value };
  const words = key ? VALUE_WORDS[key] : undefined;
  if (fingerprint(value) === 'null') return words ? text('Default') : NONE;
  if (typeof value === 'string') return text(words?.[value] ?? value);
  if (typeof value === 'boolean') return text(value ? 'On' : 'Off');
  if (typeof value === 'number') return text(key === 'aspect' ? `${Number(value.toFixed(2))} : 1` : String(value));
  if (Array.isArray(value)) {
    if (key === 'large') return text(value.map((index) => `Paragraph ${Number(index) + 1}`).join(', '));
    const lines = value.map(leafText).filter(Boolean);
    return lines.length ? text(lines.join(key === 'paragraphs' ? '\n\n' : '\n')) : NONE;
  }
  const leaves = leafText(value);
  return leaves ? text(leaves) : NONE;
}

/** The parts of one value that differ, depth first: an object by its fields,
 *  media by its footage (or, for the same footage, what's around it), a list
 *  of media entry by entry, and anything else whole. */
function walk(out: ComparePart[], label: string, key: string | undefined, yours: unknown, original: unknown) {
  if (fingerprint(yours) === fingerprint(original)) return;

  if (isMedia(yours) || isMedia(original)) {
    const mine = isMedia(yours) ? yours : undefined;
    const theirs = isMedia(original) ? original : undefined;
    const sameFootage = mine && theirs && mine.src === theirs.src && mine.kind === theirs.kind && Boolean(mine.animated) === Boolean(theirs.animated);
    if (sameFootage) {
      walkFields(out, mine as unknown as Record<string, unknown>, theirs as unknown as Record<string, unknown>);
      return;
    }
    out.push({ label: label || 'Media', yours: mine ? asValue(key, mine) : NONE, original: theirs ? asValue(key, theirs) : NONE });
    // What travels with the footage (its alt text, shape, poster) the footage
    // shows; a caption or frame that differs is said beside it.
    walkFields(out, aroundFootage(mine), aroundFootage(theirs));
    return;
  }
  if (isRecord(yours) && isRecord(original)) {
    walkFields(out, yours, original);
    return;
  }
  if (Array.isArray(yours) && Array.isArray(original) && (holdsMedia(yours) || holdsMedia(original))) {
    for (let index = 0; index < Math.max(yours.length, original.length); index += 1) {
      walk(out, entryLabel(label, index), undefined, yours[index], original[index]);
    }
    return;
  }
  out.push({ label, yours: asValue(key, yours), original: asValue(key, original) });
}

/** Field by field, in the original's order (the authored file's, which reads
 *  top to bottom; a saved draft's keys come back sorted by length). */
function walkFields(out: ComparePart[], yours: Record<string, unknown>, original: Record<string, unknown>) {
  const mine = readerFields(yours);
  const theirs = readerFields(original);
  // A decision's fields go by the headings the author sees on their own page.
  const headingFor = new Map<string, string>();
  for (const [key, { field }] of Object.entries(DECISION_HEADINGS)) {
    const heading = mine[key] ?? theirs[key];
    if (typeof heading === 'string') headingFor.set(field, heading);
  }
  for (const key of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    if (SKIPPED.has(key)) continue;
    const label = DECISION_HEADINGS[key] ? `${DECISION_HEADINGS[key].heading} heading` : headingFor.get(key) ?? labelFor(key);
    walk(out, label, key, mine[key], theirs[key]);
  }
}

export function compareOriginalChange(change: OriginalChange): OriginalComparison {
  const { slot } = change;
  const parts: ComparePart[] = [];

  if (slot.kind === 'fields') {
    // The split graphic brings its layout with it (see fieldKeys): the
    // graphic is the part, its layout no news.
    const keys = slot.keys.includes('heroGraphic') ? slot.keys.filter((key) => key !== 'heroLayout') : slot.keys;
    for (const key of keys) walk(parts, labelFor(key), key, slot.draft[key], slot.original[key]);
    // A hero graphic only one side has is a whole thing added or removed.
    const empty = (values: Record<string, unknown>) => keys.every((key) => fingerprint(values[key]) === 'null');
    return { absent: { yours: empty(slot.draft), original: empty(slot.original) }, parts };
  }
  if (slot.kind === 'chapter') {
    walk(parts, labelFor(slot.field), slot.field, slot.draft, slot.original);
    return { absent: { yours: false, original: false }, parts };
  }

  const absent = { yours: !slot.draft, original: !slot.original };
  const mine = (slot.draft ?? {}) as Record<string, unknown>;
  const theirs = (slot.original ?? {}) as Record<string, unknown>;
  if (slot.draft && slot.original && slot.draft.type !== slot.original.type) {
    parts.push({ label: 'Kind of block', yours: text(sentenceCase(slot.draft.type)), original: text(sentenceCase(slot.original.type)) });
  }
  walkFields(parts, mine, theirs);
  // Footage first: a block is named by its image, not its settings.
  const footage = (part: ComparePart) => (part.yours.kind === 'media' || part.original.kind === 'media' ? 0 : 1);
  return { absent, parts: parts.sort((a, b) => footage(a) - footage(b)) };
}

/* ── Words that differ ─────────────────────────────────────────────────── */

export interface DiffSpan {
  text: string;
  /** Not on the other side. */
  changed: boolean;
}

/** Past this many word pairs the table costs more than it tells: texts that
 *  long and that different read as different without marks. */
const MAX_DIFF_CELLS = 250_000;

function spans(tokens: string[], kept: boolean[]): DiffSpan[] {
  const out: DiffSpan[] = [];
  tokens.forEach((token, index) => {
    // A space between two changed words is part of the change, so a changed
    // phrase marks as one run instead of word by word.
    const space = /^\s+$/.test(token);
    const changed = space
      ? !kept[index] || (index > 0 && index < tokens.length - 1 && !kept[index - 1] && !kept[index + 1])
      : !kept[index];
    const last = out[out.length - 1];
    if (last && last.changed === changed) last.text += token;
    else out.push({ text: token, changed });
  });
  // Edge spaces stay unmarked.
  return out.flatMap((span) => {
    if (!span.changed) return [span];
    const [, lead, body, trail] = span.text.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? ['', '', span.text, ''];
    return [
      ...(lead ? [{ text: lead, changed: false }] : []),
      ...(body ? [{ text: body, changed: true }] : []),
      ...(trail ? [{ text: trail, changed: false }] : []),
    ];
  });
}

/**
 * Two texts as runs of words, each marked where the other side lacks it — a
 * longest-common-subsequence over words and the spaces between them.
 */
export function diffWords(yours: string, original: string): { yours: DiffSpan[]; original: DiffSpan[] } {
  const a = yours.match(/\s+|[^\s]+/g) ?? [];
  const b = original.match(/\s+|[^\s]+/g) ?? [];
  if (a.length * b.length > MAX_DIFF_CELLS) {
    return { yours: [{ text: yours, changed: false }], original: [{ text: original, changed: false }] };
  }
  const same = (x: string, y: string) => x === y || (/^\s+$/.test(x) && /^\s+$/.test(y));
  // lengths[i][j]: the longest common run of a[i..] and b[j..].
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = same(a[i], b[j]) ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const keptA = new Array<boolean>(a.length).fill(false);
  const keptB = new Array<boolean>(b.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      keptA[i] = true;
      keptB[j] = true;
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { yours: spans(a, keptA), original: spans(b, keptB) };
}
