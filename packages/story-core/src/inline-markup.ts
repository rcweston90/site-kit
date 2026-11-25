import { protectInlineEscapes, restoreInlineEscapes } from './inline-markup-escapes.js';

/*
 * Prose is stored as a small inline markup:
 *   **bold** · *italic* · ++underlined++ · ~~struck~~ · ==highlighted== · `code` · [text](href)
 * A link explicitly set to open in a new tab is `[text](href "_blank")`.
 * (`__bold__` and `_italic_` read the same; the saver uses them only where a
 * `*` delimiter would touch another). A highlight in any colour but the
 * default (orange) names it first: =={green}highlighted==. Marks nest: a
 * link can hold bold text, bold can hold italic, and never span a line
 * break. Code is literal: no markup is read inside it. This one parser feeds
 * both the public renderer (StoryRichText) and the editor's loader
 * (inlineStoryMarkupToHtml), so the page and the canvas can't disagree about
 * what a string means.
 */

export type InlineMark = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'code';

/** Highlight colours besides the default; each is a --highlight-* token. */
export const HIGHLIGHT_COLORS = ['yellow', 'red', 'green', 'teal', 'blue', 'purple', 'grey'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export function highlightColor(value: unknown): HighlightColor | null {
  return HIGHLIGHT_COLORS.find((color) => color === value) ?? null;
}

/** The colour named at `at`, as `{green}`, or undefined. */
const highlightColorAt = (value: string, at: number) => HIGHLIGHT_COLORS.find((color) => value.startsWith(`{${color}}`, at));

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'mark'; mark: Exclude<InlineMark, 'code'>; color?: HighlightColor; children: InlineNode[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; newTab?: true; children: InlineNode[] };

/** Delimiters, longest first, so `**` is tried before `*`. */
const DELIMITERS: { open: string; mark: Exclude<InlineMark, 'code'> }[] = [
  { open: '**', mark: 'bold' },
  { open: '__', mark: 'bold' },
  { open: '++', mark: 'underline' },
  { open: '~~', mark: 'strike' },
  { open: '==', mark: 'highlight' },
  { open: '*', mark: 'italic' },
  { open: '_', mark: 'italic' },
];

export function safeInlineHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  return /^(?:https?:\/\/|mailto:|\/|#)/i.test(href) ? href : null;
}

const runLength = (value: string, at: number, char: string) => {
  let end = at;
  while (value[end] === char) end += 1;
  return end - at;
};

/** Where a code span opened at `at` closes, or -1. */
function codeEnd(value: string, at: number, end: number): number {
  for (let index = at + 1; index < end; index += 1) {
    if (value[index] === '\n') return -1;
    if (value[index] === '`') return index > at + 1 ? index : -1;
  }
  return -1;
}

/** A link opened at `at`: its text range, its href and where it ends. */
function linkAt(value: string, at: number, end: number): { textEnd: number; href: string; newTab: boolean; next: number } | null {
  const close = value.indexOf(']', at + 1);
  if (close <= at + 1 || close >= end || value.slice(at + 1, close).includes('\n')) return null;
  const href = value.slice(close + 1, end).match(/^\(([^\s)]+)( "_blank")?\)/);
  return href ? { textEnd: close, href: href[1], newTab: Boolean(href[2]), next: close + 1 + href[0].length } : null;
}

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** Where a run of three or more `*` (or `_`) opened at `at` closes: the
 *  next run of the same length that follows a word. Three is bold around
 *  italic; four or more, typed as italic closing into bold, is bold. */
function sameRunEnd(value: string, at: number, end: number): number {
  const char = value[at];
  const length = runLength(value, at, char);
  for (let index = at + length + 1; index < end; index += 1) {
    if (value[index] === '\n') return -1;
    if (value[index] !== char) continue;
    const run = runLength(value, index, char);
    if (run === length && index + length <= end && !isSpace(value[index - 1])) return index;
    index += run - 1;
  }
  return -1;
}

/**
 * Where the delimiter opened before `from` closes, or -1. A run of three or
 * more that follows a space opens marks of its own, so it's skipped whole; a
 * `***` that follows a word closes with its last characters (`***x***`
 * inside bold). A `*` run of two inside italic is a nested bold, not the close.
 */
function closingAt(value: string, from: number, end: number, open: string): number {
  const char = open[0];
  for (let index = from; index < end; index += 1) {
    const at = value[index];
    if (at === '\n') return -1;
    if (at === '`') {
      const close = codeEnd(value, index, end);
      if (close > 0) index = close;
      continue;
    }
    if (at === '[') {
      const link = linkAt(value, index, end);
      if (link) index = link.next - 1;
      continue;
    }
    if (at !== char) continue;
    const run = Math.min(runLength(value, index, char), end - index);
    // Adjacent highlight colors write a close and an open as `====`,
    // even after a selected space. Repeated-star nesting does not apply.
    if (open === '==' && run >= 2) return index;
    if (run >= 3 && isSpace(value[index - 1])) {
      const close = sameRunEnd(value, index, end);
      if (close > 0) {
        index = close + run - 1;
        continue;
      }
    }
    if (open.length === 2) {
      // `***` is italic closing inside bold; `****` closes one bold and
      // opens the next.
      if (run === 3) return index + 1;
      if (run >= 2) return index;
    } else if (run === 1 || run === 3) {
      return index + run - 1;
    }
    index += run - 1;
  }
  return -1;
}

function parseRange(value: string, start: number, end: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = start;
  const flush = (to: number) => {
    if (to > text) {
      const last = nodes.at(-1);
      const piece = restoreInlineEscapes(value.slice(text, to));
      if (last?.type === 'text') last.text += piece;
      else nodes.push({ type: 'text', text: piece });
    }
  };
  let index = start;
  while (index < end) {
    const char = value[index];
    if (char === '`') {
      const close = codeEnd(value, index, end);
      if (close > 0) {
        flush(index);
        nodes.push({ type: 'code', text: restoreInlineEscapes(value.slice(index + 1, close)) });
        index = close + 1;
        text = index;
        continue;
      }
    }
    if (char === '[') {
      const link = linkAt(value, index, end);
      const href = link && safeInlineHref(restoreInlineEscapes(link.href));
      if (link) {
        flush(index);
        const children = parseRange(value, index + 1, link.textEnd);
        // An unsafe href keeps the words and drops the link, as it always has.
        if (href) nodes.push({ type: 'link', href, ...(link.newTab ? { newTab: true as const } : {}), children });
        else nodes.push(...children);
        index = link.next;
        text = index;
        continue;
      }
    }
    const run = char === '*' || char === '_' ? runLength(value, index, char) : 0;
    if (run >= 3) {
      const close = sameRunEnd(value, index, end);
      if (close > 0) {
        flush(index);
        const inner = parseRange(value, index + run, close);
        nodes.push({ type: 'mark', mark: 'bold', children: run === 3 ? [{ type: 'mark', mark: 'italic', children: inner }] : inner });
        index = close + run;
        text = index;
        continue;
      }
    }
    const delimiter = DELIMITERS.find(({ open }) => value.startsWith(open, index));
    if (delimiter) {
      const color = delimiter.mark === 'highlight' ? highlightColorAt(value, index + delimiter.open.length) : undefined;
      const inner = index + delimiter.open.length + (color ? color.length + 2 : 0);
      const close = closingAt(value, inner + 1, end, delimiter.open);
      if (close > 0) {
        flush(index);
        nodes.push({ type: 'mark', mark: delimiter.mark, ...(color ? { color } : {}), children: parseRange(value, inner, close) });
        index = close + delimiter.open.length;
        text = index;
        continue;
      }
      // An unmatched run is text; skip it whole so its tail isn't retried.
      index += runLength(value, index, char);
      continue;
    }
    index += 1;
  }
  flush(end);
  return nodes;
}

/** The marks and links in a stored string, as a tree. */
export function parseInlineMarkup(markup: string): InlineNode[] {
  const value = protectInlineEscapes(markup);
  return parseRange(value, 0, value.length);
}

/* --- Saving ------------------------------------------------------------- */

/** Characters that would read as markup. `+`, `~` and `=` only mark up in
 *  pairs, and they are common on their own ("~3 weeks", "1 + 1"), so a lone
 *  one is escaped only where it touches the edge of its run of text, next to
 *  a delimiter. */
export function escapeInlineText(value: string): string {
  return value
    .replace(/[\\*_[\]`]/g, '\\$&')
    .replace(/\+{2,}|~{2,}|={2,}/g, (run) => run.replace(/./g, '\\$&'))
    .replace(/^[+~=]|(?<!\\)[+~=]$/g, '\\$&');
}

export interface InlineRun {
  text: string;
  marks: InlineMark[];
  href?: string;
  newTab?: true;
  /** The highlight's colour, when it isn't the default. */
  highlight?: HighlightColor;
  /** A soft return inside the paragraph. */
  hardBreak?: boolean;
}

type OpenMark = { mark: InlineMark | 'link'; href?: string; newTab?: true; color?: HighlightColor; delimiter: string };

const ORDER: (InlineMark | 'link')[] = ['link', 'bold', 'italic', 'underline', 'strike', 'highlight', 'code'];

/**
 * Runs of text, each with its full set of marks, written as nested markup.
 * A mark stays open across neighbouring runs that share it, so bold text with
 * an italic word inside is `**a *b* c**`, never `**a ****b**...`.
 */
export function serializeInlineRuns(runs: readonly InlineRun[]): string {
  let output = '';
  const open: OpenMark[] = [];
  const closeTo = (depth: number) => {
    while (open.length > depth) {
      const entry = open.pop()!;
      output += entry.mark === 'link' ? `](${entry.href}${entry.newTab ? ' "_blank"' : ''})` : entry.delimiter;
    }
  };
  for (const run of runs) {
    if (run.hardBreak) {
      // Marks never span a line break.
      closeTo(0);
      output += '\n';
      continue;
    }
    if (!run.text) continue;
    const wanted = ORDER.filter((mark) => (mark === 'link' ? Boolean(run.href) : run.marks.includes(mark)));
    let keep = 0;
    while (keep < open.length && wanted.includes(open[keep].mark)
      && (open[keep].mark !== 'link' || (open[keep].href === run.href && open[keep].newTab === run.newTab))
      && (open[keep].mark !== 'highlight' || open[keep].color === run.highlight)) keep += 1;
    closeTo(keep);
    for (const mark of wanted) {
      if (open.some((entry) => entry.mark === mark)) continue;
      // Two `*` delimiters side by side would read as one run, so the one
      // that would touch another takes its underscore form.
      const starry = output.endsWith('*');
      const delimiter = mark === 'bold' ? (starry ? '__' : '**')
        : mark === 'italic' ? (starry ? '_' : '*')
          : mark === 'underline' ? '++' : mark === 'strike' ? '~~' : mark === 'highlight' ? '==' : mark === 'code' ? '`' : '[';
      const color = mark === 'highlight' ? run.highlight : undefined;
      output += color ? `${delimiter}{${color}}` : delimiter;
      open.push({ mark, href: mark === 'link' ? run.href : undefined, newTab: mark === 'link' ? run.newTab : undefined, color, delimiter });
    }
    const text = escapeInlineText(run.text);
    // Words that open with a colour's name in braces, straight after `==`,
    // would read as that colour.
    output += output.endsWith('==') && highlightColorAt(text, 0) ? `\\${text}` : text;
  }
  closeTo(0);
  return output;
}
