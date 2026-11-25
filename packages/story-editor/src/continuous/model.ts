import { resolvedCalloutIcon } from '@rcweston/story-react';
import type { JSONContent } from '@tiptap/react';
import type { Story, StoryBlock, StoryChapter, StoryRichText } from '@rcweston/story-core';
import { parseInlineMarkup, type InlineNode } from '@rcweston/story-core';
import { storyListRunRows, storyProseRuns, tiptapDocToProseBlock, type StoryProseListRun } from '@rcweston/story-core';

function inline(nodes: InlineNode[], marks: NonNullable<JSONContent['marks']> = []): JSONContent[] {
  return nodes.flatMap((node): JSONContent[] => {
    if (node.type === 'mark') return inline(node.children, [...marks, { type: node.mark, ...(node.color ? { attrs: { color: node.color } } : {}) }]);
    if (node.type === 'link') return inline(node.children, [...marks, { type: 'link', attrs: { href: node.href, ...(node.newTab ? { target: '_blank' } : {}) } }]);
    const active = node.type === 'code' ? [...marks, { type: 'code' }] : marks;
    return node.text.split('\n').flatMap((text, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(text ? [{ type: 'text', text, marks: active }] : [])]);
  });
}
const text = (value: string) => inline(parseInlineMarkup(value));
const savedText = (node: JSONContent) => tiptapDocToProseBlock({ type: 'doc', content: [{ type: 'paragraph', content: node.content }] }, { paragraphs: [] }).paragraphs[0] ?? '';

type Origin = { chapterKey: string; blockIndex: number; block: StoryBlock };
const blockAnchor = (origin: Origin) => `${origin.chapterKey}:${origin.block.id ?? origin.blockIndex}`;
const originIdentity = (origin: Origin | null) => origin
  ? `${origin.chapterKey}:${origin.blockIndex}:${origin.block.id ?? ''}`
  : '';

type CalloutBlock = Extract<StoryBlock, { type: 'callout' }>;

function richNodes(block: StoryRichText, attrsAt?: (index: number) => JSONContent['attrs']): JSONContent[] {
  const listNode = (run: StoryProseListRun, attrs?: JSONContent['attrs']): JSONContent => ({
    type: run.format === 'numbered' ? 'orderedList' : 'bulletList',
    attrs,
    content: storyListRunRows(run).map(row => ({
      type: 'listItem',
      content: [
        { type: 'paragraph', ...(row.large ? { attrs: { large: true } } : {}), content: text(block.paragraphs[row.index]) },
        ...(row.children ?? []).map(child => listNode(child)),
      ],
    })),
  });
  return storyProseRuns(block).map((run, index) => {
    const attrs = attrsAt?.(index);
    if (run.type === 'list') return listNode(run, attrs);
    return { type: run.type === 'heading' ? 'heading' : 'paragraph', attrs: { ...attrs, ...(run.type === 'heading' ? { level: run.level } : { large: run.large }) }, content: text(block.paragraphs[run.index]) };
  });
}

export function calloutNode(block: CalloutBlock, origin?: Origin): JSONContent {
  const body = richNodes(block.body);
  return {
    type: 'storyCallout',
    attrs: { block, origin: origin ?? null, blockAnchor: origin ? blockAnchor(origin) : null },
    content: [
      { type: 'calloutTitle', attrs: { icon: resolvedCalloutIcon(block.icon, block.appearance?.icon) ?? null }, content: block.title ? [{ type: 'text', text: block.title }] : [] },
      { type: 'calloutBody', content: body.length ? body : [{ type: 'paragraph' }] },
    ],
  };
}

type NoteBlock = Extract<StoryBlock, { type: 'note' }>;
type QuoteBlock = Extract<StoryBlock, { type: 'quote' }>;

function plainLines(value: string): JSONContent[] {
  return value.split('\n').flatMap((line, index) => [
    ...(index ? [{ type: 'hardBreak' }] : []),
    ...(line ? [{ type: 'text', text: line }] : []),
  ]);
}

const plainText = (value: string): JSONContent[] => value ? [{ type: 'text', text: value }] : [];

const savedLines = (node: JSONContent): string => (node.content ?? []).map(child => child.type === 'hardBreak' ? '\n' : child.text ?? '').join('');

export function noteNode(block: NoteBlock, origin?: Origin): JSONContent {
  return { type: 'storyNote', attrs: { block, origin: origin ?? null, blockAnchor: origin ? blockAnchor(origin) : null }, content: plainLines(block.text) };
}

export function quoteNode(block: QuoteBlock, origin?: Origin): JSONContent {
  const { quote } = block;
  return {
    type: 'storyQuote', attrs: { block, origin: origin ?? null, blockAnchor: origin ? blockAnchor(origin) : null },
    content: [
      { type: 'quoteText', content: plainLines(quote.quote) },
      { type: 'quoteByline', content: [
        { type: 'quoteName', content: plainText(quote.name) },
        { type: 'quoteRole', content: plainText(quote.role) },
        { type: 'quoteContext', content: plainLines(quote.context ?? '') },
      ] },
    ],
  };
}

function savedNote(node: JSONContent): NoteBlock {
  const block = node.attrs?.block as NoteBlock | undefined;
  if (block?.type !== 'note') throw new Error('A note could not be read safely. Undo to restore it.');
  return { ...block, text: savedLines(node) };
}

function savedQuote(node: JSONContent): QuoteBlock {
  const block = node.attrs?.block as QuoteBlock | undefined;
  const [text, byline] = node.content ?? [];
  const [name, role, context] = byline?.content ?? [];
  if (block?.type !== 'quote' || text?.type !== 'quoteText' || byline?.type !== 'quoteByline' ||
      name?.type !== 'quoteName' || role?.type !== 'quoteRole' || context?.type !== 'quoteContext') {
    throw new Error('A quote could not be read safely. Undo to restore it.');
  }
  const contextText = savedLines(context);
  return { ...block, quote: {
    ...block.quote, quote: savedLines(text), name: savedLines(name), role: savedLines(role),
    ...(contextText !== (block.quote.context ?? '') ? { context: contextText || undefined } : {}),
  } };
}

function savedCallout(node: JSONContent): CalloutBlock {
  const block = node.attrs?.block as CalloutBlock | undefined;
  const [titleNode, bodyNode] = node.content ?? [];
  if (block?.type !== 'callout' || titleNode?.type !== 'calloutTitle' || bodyNode?.type !== 'calloutBody') throw new Error('A callout could not be read safely. Undo to restore it.');
  const title = titleNode.content?.map(child => child.text ?? '').join('') ?? '';
  const body = tiptapDocToProseBlock(bodyNode, block.body);
  const baseline = tiptapDocToProseBlock({ type: 'doc', content: richNodes(block.body) }, block.body);
  // Compare formats as the reader sees them, then keep the exact original
  // representation (including legacy list flags and escaped markup) if unchanged.
  return {
    ...block,
    ...(title !== (block.title ?? '') ? { title: title || undefined } : {}),
    body: JSON.stringify(body) === JSON.stringify(baseline) ? block.body : body,
  };
}

function proseNodes(block: Extract<StoryBlock, { type: 'prose' }>, origin: Origin): JSONContent[] {
  return richNodes(block, index => ({ origin, blockAnchor: blockAnchor(origin), blockStart: index === 0, blockKind: block.type }));
}

/** A view adapter, not a migration: unknown modules and metadata stay intact. */
export function storyToDocument(story: Story): JSONContent {
  return { type: 'doc', content: [
    { type: 'storyHero' },
    ...story.chapters.map((chapter) => ({ type: 'storySection', attrs: {
      key: chapter.key,
      columns: chapter.columns ?? 'one',
      density: chapter.density ?? 'default',
      hidden: chapter.hidden ?? false,
    }, content: [
      { type: 'sectionTitle', content: text(chapter.title) },
      ...chapter.blocks.flatMap((block, bi): JSONContent[] => {
        const origin: Origin = { chapterKey: chapter.key, blockIndex: bi, block: structuredClone(block) };
        if (block.type === 'callout') return [calloutNode(block, origin)];
        if (block.type === 'note') return [noteNode(block, origin)];
        if (block.type === 'quote') return [quoteNode(block, origin)];
        if (!block.hidden && block.type === 'prose') return proseNodes(block, origin);
        if (!block.hidden && block.type === 'subhead') return [{ type: 'heading', attrs: { level: 3, origin, blockAnchor: blockAnchor(origin), blockStart: true, blockKind: block.type }, content: text(block.text) }];
        return [{ type: 'storyAsset', attrs: { block, origin, blockAnchor: blockAnchor(origin) } }];
      }),
      // A trailing text landing zone lets Enter continue after any asset.
      { type: 'paragraph', attrs: { landing: true } },
    ] })),
    ...(story.decisions ? [{ type: 'storyDecisions' }] : []),
    ...(story.hindsight ? [{ type: 'storyHindsight' }] : []),
    ...(story.credits?.length ? [{ type: 'storyCredits' }] : []),
  ] };
}

/** Retains authored settings/identity; only text and explicit node order change. */
export function documentToStory(doc: JSONContent, source: Story, visitAsset?: (node: JSONContent, chapterKey: string, blockIndex: number) => void): Story {
  const children = doc.content ?? [];
  const chapters: StoryChapter[] = [];
  const usedIds = new Set<string>();
  const sectionKeys = new Set<string>();
  for (const section of children.filter(node => node.type === 'storySection')) {
    const original = source.chapters.find(chapter => chapter.key === section.attrs?.key);
    if (sectionKeys.has(section.attrs?.key)) throw new Error('Duplicate sections are not supported. Undo to keep the original structure.');
    sectionKeys.add(section.attrs?.key);
    if (!original) throw new Error('This section cannot be mapped safely. Your original story is unchanged.');
    const blocks: StoryBlock[] = [];
    let pending: JSONContent[] = [];
    let origin: Origin | null = null;
    const sourceBlock = (value: Origin | null) => {
      if (!value) return undefined;
      const currentChapter = source.chapters.find(chapter => chapter.key === value.chapterKey);
      const current = currentChapter?.blocks[value.blockIndex];
      if (value.block.id) return currentChapter?.blocks.find(block => block.id === value.block.id) ?? value.block;
      return current?.type === value.block.type ? current : value.block;
    };
    const append = (block: StoryBlock) => {
      if (block.id && usedIds.has(block.id)) block = { ...block, id: undefined };
      if (block.id) usedIds.add(block.id);
      blocks.push(block);
    };
    const flush = () => {
      if (!pending.length) return;
      const before = sourceBlock(origin);
      if (before?.type === 'subhead' && pending.length === 1 && pending[0].type === 'heading' && pending[0].attrs?.level === 3) append({ ...before, text: savedText(pending[0]) });
      else {
        const seed: Extract<StoryBlock, { type: 'prose' }> = before?.type === 'prose' ? before : { type: 'prose', paragraphs: [], ...(before?.id ? { id: before.id } : {}) };
        const next = tiptapDocToProseBlock({ type: 'doc', content: pending }, seed);
        // Preserve exact untouched representation (including legacy format flags).
        const normalizedBefore = before?.type === 'prose' && origin ? proseNodes(before, origin) : null;
        append(normalizedBefore && JSON.stringify(normalizedBefore) === JSON.stringify(pending) ? before! : next);
      }
      pending = [];
    };
    const appendAsset = (node: JSONContent, block: StoryBlock) => {
      visitAsset?.(node, original.key, blocks.length);
      append(block);
    };
    for (const node of section.content ?? []) {
      if (node.type === 'sectionTitle') continue;
      if (node.type === 'storyNote') { flush(); appendAsset(node, savedNote(node)); origin = null; continue; }
      if (node.type === 'storyQuote') { flush(); appendAsset(node, savedQuote(node)); origin = null; continue; }
      if (node.type === 'storyCallout') { flush(); appendAsset(node, savedCallout(node)); origin = null; continue; }
      if (node.type === 'storyAsset') { if (!node.attrs?.block?.type) throw new Error('An asset could not be read safely. Undo to restore it.'); flush(); appendAsset(node, structuredClone(node.attrs.block as StoryBlock)); origin = null; continue; }
      if (node.attrs?.landing && !node.content?.length) continue;
      const key = node.attrs?.origin && typeof node.attrs.origin === 'object' ? node.attrs.origin as Origin : null;
      if (originIdentity(key) !== originIdentity(origin)) { flush(); origin = key; }
      pending.push(node);
    }
    flush();
    chapters.push({ ...original, title: savedText(section.content?.find(node => node.type === 'sectionTitle') ?? {}), blocks });
  }
  if (chapters.length !== source.chapters.length) throw new Error('A section cannot be removed here. Undo to restore it.');
  if (!children.some(node => node.type === 'storyHero')) throw new Error('The story header has to stay. Undo to restore it.');
  return {
    ...source,
    chapters,
  };
}

/** Resolve the clicked document node, not the saved origin index: unsaved
 * reorders and split paragraphs can shift an ID-less asset. */
export function assetSettingsId(doc: JSONContent, source: Story, sectionIndex: number, nodeIndex: number): string | null {
  const selected = doc.content?.[sectionIndex]?.content?.[nodeIndex];
  if (!selected) return null;
  let result: string | null = null;
  try {
    documentToStory(doc, source, (node, key, index) => {
      if (node !== selected) return;
      const block = source.chapters.find(chapter => chapter.key === key)?.blocks[index];
      const origin = node.attrs?.block as StoryBlock | undefined;
      if (!block || !origin || block.type !== origin.type || block.id !== origin.id) return;
      result = `block:${key}:${block.id ?? index}`;
    });
  } catch { return null; }
  return result;
}
