import {
  Blocks, Check, Code2, Heading2, Image as ImageIcon, Table2, LayoutGrid, Lightbulb, ListOrdered, MessageSquareMore, Minus, MousePointerClick, MoveVertical, Network,
  Pilcrow, Quote, Signpost, StickyNote, TrendingUp, Users, type LucideIcon,
} from 'lucide-react';
import type { StoryBlock } from '@rcweston/story-core';

/*
 * Every block an author can add, in one list: the + button (below, or above)
 * and the slash menu in text both offer these, in this
 * order, with these words. Grouped the way an author looks for a block, each
 * with a mark, a few words on what it's for, and the other names someone
 * might type to find it. Legacy metrics only exist in older stories; new
 * results are Outcomes, so it isn't offered.
 */

export interface BlockOffer {
  type: StoryBlock['type'];
  icon: LucideIcon;
  hint: string;
  /** Other words that find it when searching ("photo" finds Media). */
  keywords: string[];
}

export const BLOCK_GROUPS: { label: string; blocks: BlockOffer[] }[] = [
  { label: 'Text', blocks: [
    { type: 'prose', icon: Pilcrow, hint: 'Paragraphs or a list', keywords: ['text', 'paragraph', 'body', 'list', 'bullets', 'write'] },
    { type: 'subhead', icon: Heading2, hint: 'A short heading', keywords: ['heading', 'title', 'h3', 'section'] },
    { type: 'quote', icon: Quote, hint: 'Someone’s words', keywords: ['quote', 'testimonial', 'pull quote', 'citation'] },
    { type: 'callout', icon: MessageSquareMore, hint: 'A useful aside or notice', keywords: ['callout', 'aside', 'notice', 'tip', 'warning', 'info', 'box'] },
    { type: 'note', icon: StickyNote, hint: 'A remark beside the text', keywords: ['note', 'margin', 'sidenote', 'remark', 'footnote'] },
    { type: 'code', icon: Code2, hint: 'Code or fixed-width text, as typed', keywords: ['code', 'snippet', 'pre', 'monospace', 'json', 'prompt'] },
  ] },
  { label: 'Media', blocks: [
    { type: 'media', icon: ImageIcon, hint: 'One image or video', keywords: ['image', 'photo', 'picture', 'video', 'youtube', 'pdf', 'screenshot', 'figure'] },
    { type: 'gallery', icon: LayoutGrid, hint: 'Two or more, in a row, a stack or a grid', keywords: ['images', 'gallery', 'grid', 'pair', 'compare', 'before', 'after', 'side by side', 'stack'] },
    { type: 'custom', icon: Blocks, hint: 'A component from your app', keywords: ['custom', 'component', 'embed', 'interactive', 'prototype', 'demo', 'widget'] },
  ] },
  { label: 'Story', blocks: [
    { type: 'insight', icon: Lightbulb, hint: 'A finding and its points', keywords: ['insight', 'finding', 'learning', 'columns'] },
    { type: 'decision', icon: Signpost, hint: 'A call and its trade-off', keywords: ['decision', 'tradeoff', 'choice', 'call', 'alternatives'] },
    { type: 'steps', icon: ListOrdered, hint: 'A numbered sequence', keywords: ['steps', 'process', 'sequence', 'how'] },
    { type: 'outcomes', icon: TrendingUp, hint: 'Results, and how they’re known', keywords: ['outcomes', 'results', 'metrics', 'impact', 'numbers', 'kpi'] },
    { type: 'contribution', icon: Check, hint: 'Implemented, influenced, or partners', keywords: ['contribution', 'implemented', 'influenced', 'partners', 'role'] },
    { type: 'ledger', icon: Users, hint: 'Who did what', keywords: ['ledger', 'credits', 'team', 'who', 'ownership'] },
    { type: 'collaboration', icon: Network, hint: 'Who worked with whom', keywords: ['collaboration', 'map', 'stakeholders', 'partners'] },
    { type: 'followUp', icon: MessageSquareMore, hint: 'Topics for a deeper conversation', keywords: ['follow up', 'topics', 'conversation', 'more'] },
  ] },
  { label: 'Data', blocks: [
    { type: 'table', icon: Table2, hint: 'Rows and columns', keywords: ['table', 'grid', 'rows', 'columns', 'comparison', 'matrix', 'data'] },
  ] },
  { label: 'Layout', blocks: [
    { type: 'cta', icon: MousePointerClick, hint: 'A clear link to the next action', keywords: ['cta', 'button', 'link', 'action'] },
    { type: 'divider', icon: Minus, hint: 'A line between blocks', keywords: ['divider', 'line', 'rule', 'hr', 'separator', 'break'] },
    { type: 'spacer', icon: MoveVertical, hint: 'Extra room between blocks', keywords: ['spacer', 'space', 'gap', 'room'] },
  ] },
];

/** Each offered block's mark, for menus that name blocks by type. */
export const BLOCK_ICONS = new Map(BLOCK_GROUPS.flatMap((group) => group.blocks.map((offer) => [offer.type, offer.icon] as const)));

/** Whether an offer matches what someone typed: any word of its name, hint
 *  or keywords starts with each word of the query. Empty matches all. */
export function blockMatches(offer: BlockOffer, label: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [label, offer.hint, ...offer.keywords].join(' ').toLowerCase().split(/[\s/,·’'()-]+/);
  return words.every((word) => haystack.some((candidate) => candidate.startsWith(word)));
}
