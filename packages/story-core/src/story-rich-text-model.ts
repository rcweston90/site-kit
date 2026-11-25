import { STORY_LIST_MAX_DEPTH, isStoryHeadingLevel, type StoryHeadingLevel, type StoryBlock, type StoryRichText } from './types.js';
import { escapeInlineText, highlightColor, parseInlineMarkup, safeInlineHref, serializeInlineRuns, type InlineMark, type InlineNode, type InlineRun } from './inline-markup.js';

export type StoryProseBlock = Extract<StoryBlock, { type: 'prose' }>;
export type StoryProseFormat = NonNullable<StoryRichText['format']>;
export type StoryListFormat = Exclude<StoryProseFormat, 'paragraphs'>;
type RichNode = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type?: string; attrs?: Record<string, unknown> }[]; content?: RichNode[] };

/* --- Large text and lists ---------------------------------------------------
 * Large text is a paragraph style: `large` lists the paragraphs that carry it.
 * Documents written before it say `lede: true`, which meant the first
 * paragraph; they are read that way and keep that field until the styling is
 * actually changed. List depth and size are row metadata, separate from the
 * legacy paragraph style (which was never rendered on a list).
 */

const isList = (block: Pick<StoryRichText, 'format'>) => (block.format ?? 'paragraphs') !== 'paragraphs';

/** The paragraphs a reader sees as list items, by position: all of them in a
 *  list block, otherwise the ones `listItems` names. */
export function storyListItems<T extends StoryRichText>(block: T): Map<number, StoryListFormat> {
  const count = Array.isArray(block.paragraphs) ? block.paragraphs.length : 0;
  if (isList(block)) return new Map(Array.from({ length: count }, (_, index) => [index, block.format as StoryListFormat]));
  const entries = (block.listItems ?? [])
    .filter(({ index, format }) => Number.isInteger(index) && index >= 0 && index < count && (format === 'bullets' || format === 'numbered'))
    .map(({ index, format }) => [index, format] as const);
  return new Map(entries);
}

/** The paragraphs a reader sees in large text, by position, ascending. */
export function storyLargeParagraphs<T extends StoryRichText>(block: T): number[] {
  if (isList(block)) return [];
  const count = Array.isArray(block.paragraphs) ? block.paragraphs.length : 0;
  const items = storyListItems(block);
  const listed = Array.isArray(block.large) ? block.large : block.lede ? [0] : [];
  return [...new Set(listed)].filter((index) => Number.isInteger(index) && index >= 0 && index < count && !items.has(index)).sort((a, b) => a - b);
}

export function storySubheadings<T extends StoryRichText>(block: T): Map<number, StoryHeadingLevel> {
  if (isList(block)) return new Map();
  const count = Array.isArray(block.paragraphs) ? block.paragraphs.length : 0;
  const items = storyListItems(block);
  const entries = (block.headings ?? [])
    .filter(({ index, level }) => Number.isInteger(index) && index >= 0 && index < count && !items.has(index) && isStoryHeadingLevel(level))
    .map(({ index, level }) => [index, level] as const);
  return new Map(entries);
}

export type StoryProseListRun = { type: 'list'; format: StoryListFormat; indices: number[]; rows?: StoryProseListRow[] };
export type StoryProseListRow = { index: number; large?: true; children?: StoryProseListRun[] };

export type StoryProseRun =
  | { type: 'paragraph'; index: number; large: boolean }
  | { type: 'heading'; index: number; level: StoryHeadingLevel }
  | StoryProseListRun;

export const storyListRunRows = (run: StoryProseListRun): StoryProseListRow[] => run.rows ?? run.indices.map(index => ({ index }));

/** Reader-only cleanup. Keep internal empty rows (ordered numbering) and
 * parents with children. The editor and stored document retain all rows. */
export function visibleStoryListRows<T extends StoryProseListRow>(rows: readonly T[], paragraphs: readonly string[]): readonly T[] {
  let end = rows.length;
  while (end > 0 && !rows[end - 1].children?.length && !paragraphs[rows[end - 1].index]?.trim()) end--;
  return end === rows.length ? rows : rows.slice(0, end);
}

/** Rebuild each list inside its owning row, or retain the old flat run shape. */
export function storyProseRuns<T extends StoryRichText>(block: T): StoryProseRun[] {
  const items = storyListItems(block);
  const meta = new Map(isList(block) ? [] : (block.listItems ?? []).map(item => [item.index, item] as const));
  const large = new Set(storyLargeParagraphs(block));
  const headings = storySubheadings(block);
  const runs: StoryProseRun[] = [];
  const parents: StoryProseListRow[] = [];
  const compress = (run: StoryProseListRun) => {
    for (const row of run.rows ?? []) row.children?.forEach(compress);
    if (!run.rows?.some(row => row.large || row.children?.length)) delete run.rows;
  };
  block.paragraphs.forEach((_, index) => {
    const format = items.get(index);
    if (!format) {
      parents.length = 0;
      const level = headings.get(index);
      runs.push(level ? { type: 'heading', index, level } : { type: 'paragraph', index, large: large.has(index) });
      return;
    }

    const stored = meta.get(index);
    const depth = Math.min(parents.length, STORY_LIST_MAX_DEPTH, Math.max(0, stored?.depth && Number.isInteger(stored.depth) ? stored.depth : 0));
    parents.length = depth;
    const parent = parents[depth - 1];
    const siblings = parent ? (parent.children ??= []) : runs;
    const previous = siblings.at(-1);
    const run: StoryProseListRun = previous?.type === 'list' && previous.format === format
      ? previous
      : { type: 'list', format, indices: [], rows: [] };
    if (run !== previous) siblings.push(run);
    run.indices.push(index);
    const row: StoryProseListRow = { index, ...(stored?.large === true ? { large: true } : {}) };
    run.rows!.push(row);
    parents.push(row);
  });
  for (const run of runs) if (run.type === 'list') compress(run);
  return runs;
}

const sameIndices = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** The block with exactly these paragraphs large, in the current form. */
export function withLargeParagraphs<T extends StoryRichText>(block: T, indices: readonly number[]): T {
  const next = { ...block };
  delete next.lede;
  delete next.large;
  const headingPositions = storySubheadings(next);
  const large = storyLargeParagraphs({ ...next, large: [...indices].filter((index) => !headingPositions.has(index)) });
  return large.length ? { ...next, large } : next;
}

/** The whole block in another format. For structured lists, switching
 *  marker kind preserves ancestry and visible size. Converting to paragraphs
 *  intentionally removes the list outline but keeps authored scale. Dormant
 *  legacy list metadata remains ignored, even after a format conversion. */
export function withProseFormat<T extends StoryRichText>(block: T, format: StoryProseFormat): T {
  if (format === (block.format ?? 'paragraphs') && !block.listItems?.length) return block;
  const structuredRows = isList(block) ? [] : block.listItems?.filter(item => item.large || item.depth) ?? [];
  const large = new Set([...storyLargeParagraphs(block), ...structuredRows.filter(row => row.large).map(row => row.index)]);
  if (structuredRows.length || large.size) {
    const old = new Map((block.listItems ?? []).map(row => [row.index, row]));
    const next = { ...block };
    delete next.format;
    delete next.listItems;
    if (format === 'paragraphs') return withLargeParagraphs(next, [...large]);
    delete next.headings;
    delete next.lede;
    delete next.large;
    next.listItems = block.paragraphs.map((_, index) => {
      const row = old.get(index);
      return { index, format, ...(row?.depth ? { depth: row.depth } : {}), ...(large.has(index) ? { large: true as const } : {}) };
    });
    return next;
  }
  const next: T = { ...block, format };
  if (format === 'paragraphs') delete next.format;
  delete next.lede;
  delete next.large;
  delete next.listItems;
  if (format !== 'paragraphs') delete next.headings;
  return next;
}

export const safeStoryHref = safeInlineHref;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

const MARK_TAGS: Record<Exclude<InlineMark, 'code'>, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', highlight: 'mark' };

function inlineNodesToHtml(nodes: InlineNode[]): string {
  // A soft return is saved as a newline. ProseMirror reads a bare newline in
  // HTML as a space, so it goes back in as the <br> it was typed as.
  const text = (value: string) => escapeHtml(value).replace(/\n/g, '<br>');
  return nodes.map((node) => {
    if (node.type === 'text') return text(node.text);
    if (node.type === 'code') return `<code>${escapeHtml(node.text)}</code>`;
    if (node.type === 'link') return `<a href="${escapeHtml(node.href)}"${node.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inlineNodesToHtml(node.children)}</a>`;
    const tag = MARK_TAGS[node.mark];
    return `<${tag}${node.color ? ` data-color="${node.color}"` : ''}>${inlineNodesToHtml(node.children)}</${tag}>`;
  }).join('');
}

export function inlineStoryMarkupToHtml(markup: string): string {
  return inlineNodesToHtml(parseInlineMarkup(markup));
}

/**
 * A blank paragraph loads as an empty element. ProseMirror reads
 * `<p><br></p>` as a paragraph holding a soft return, which saved every blank
 * line back as "\n"; a paragraph that holds nothing but that is blank too.
 */
export function proseBlockToHtml<T extends StoryRichText>(block: T): string {
  const items = block.paragraphs.map((paragraph) => (paragraph.trim() ? inlineStoryMarkupToHtml(paragraph) : ''));
  const listHtml = (run: StoryProseListRun): string => {
    const tag = run.format === 'numbered' ? 'ol' : 'ul';
    return `<${tag}>${storyListRunRows(run).map(row =>
      `<li><p${row.large ? ' data-large="true"' : ''}>${items[row.index]}</p>${row.children?.map(listHtml).join('') ?? ''}</li>`
    ).join('')}</${tag}>`;
  };
  return storyProseRuns(block).map((run) => {
    if (run.type === 'list') return listHtml(run);
    const item = items[run.index];
    if (run.type === 'heading') return `<h${run.level}>${item}</h${run.level}>`;
    return `<p${run.large ? ' data-large="true"' : ''}>${item}</p>`;
  }).join('');
}

const SAVED_MARKS = new Set<string>(['bold', 'italic', 'underline', 'strike', 'highlight', 'code']);

/** Tiptap's inline nodes as runs of marked text, then as markup. */
function serializeInline(nodes: RichNode[] = []): string {
  const runs: InlineRun[] = nodes.map((node) => {
    if (node.type === 'hardBreak') return { text: '', marks: [], hardBreak: true };
    const marks = (node.marks ?? []).map((mark) => mark.type).filter((type): type is InlineMark => Boolean(type && SAVED_MARKS.has(type)));
    const link = node.marks?.find((mark) => mark.type === 'link');
    const href = link ? safeInlineHref(link.attrs?.href) ?? undefined : undefined;
    const highlight = highlightColor(node.marks?.find((mark) => mark.type === 'highlight')?.attrs?.color);
    return { text: node.text ?? '', marks, ...(href ? { href, ...(link?.attrs?.target === '_blank' ? { newTab: true as const } : {}) } : {}), ...(highlight ? { highlight } : {}) };
  });
  return serializeInlineRuns(runs);
}

/**
 * The block the editor's document describes, on top of `source` (the block it
 * was loaded from, for its id and settings). One list throughout is saved as
 * the block's `format`, as list blocks always have been; lists among
 * paragraphs as `listItems`. Large text is written as `large` only when it
 * differs from what `source` already renders: a block that still says
 * `lede: true` keeps saying it until its large text actually changes.
 */
export function tiptapDocToProseBlock<T extends StoryRichText>(document: RichNode, source: T): T {
  const paragraphs: string[] = [];
  const large: number[] = [];
  const headings: { index: number; level: StoryHeadingLevel }[] = [];
  const listItems: NonNullable<StoryRichText['listItems']> = [];
  const saveList = (list: RichNode, depth = 0) => {
    const format = list.type === 'orderedList' ? 'numbered' : 'bullets';
    for (const item of list.content ?? []) {
      const [body, ...children] = item.content ?? [];
      listItems.push({ index: paragraphs.length, format, ...(depth ? { depth } : {}), ...(body?.attrs?.large === true ? { large: true as const } : {}) });
      paragraphs.push(serializeInline(body?.content));
      for (const child of children) if (child.type === 'bulletList' || child.type === 'orderedList') saveList(child, depth + 1);
    }
  };
  for (const node of document.content ?? []) {
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      saveList(node);
    } else if (node.type === 'paragraph' || node.type === 'heading') {
      if (node.type === 'heading' && isStoryHeadingLevel(node.attrs?.level)) headings.push({ index: paragraphs.length, level: node.attrs.level });
      if (node.attrs?.large === true) large.push(paragraphs.length);
      paragraphs.push(serializeInline(node.content));
    }
  }
  if (paragraphs.length === 0) paragraphs.push('');
  const next: T = { ...source, paragraphs };
  delete next.format;
  delete next.headings;
  delete next.listItems;
  if (listItems.length === paragraphs.length && listItems.every(({ format, depth, large }) => !depth && !large && format === listItems[0].format)) {
    next.format = listItems[0].format;
    delete next.lede;
    delete next.large;
    return next;
  }
  if (headings.length) next.headings = headings;
  if (listItems.length) next.listItems = listItems;
  const unchanged = !isList(source) && !listItems.length && source.large === undefined && sameIndices(large, storyLargeParagraphs(next));
  return unchanged ? next : withLargeParagraphs(next, large);
}

/** Rich text holding nothing a reader would see. */
export function isEmptyRichText(text: StoryRichText | undefined): boolean {
  return !text || !text.paragraphs.some((paragraph) => paragraph.trim());
}

/**
 * Plain text, as rich text: each line a paragraph, with the characters the
 * markup gives meaning to escaped so they print as typed. When every line
 * opens with a dash or bullet ("- point"), the lines were a list typed by
 * hand, and become one.
 */
export function richTextFromPlain(value: string | undefined): StoryRichText {
  const lines = (value ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { paragraphs: [''] };
  const marker = /^[-\u2013\u2014\u2022*]\s+/;
  const listed = lines.length > 1 && lines.every((line) => marker.test(line));
  const paragraphs = lines.map((line) => escapeInlineText(listed ? line.replace(marker, '') : line));
  return listed ? { paragraphs, format: 'bullets' } : { paragraphs };
}
