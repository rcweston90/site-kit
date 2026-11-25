/**
 * Where text actually sits. An element's box is its line boxes — line height
 * included — but the eye measures from the letters: the cap height at the
 * top, the baseline at the bottom. This reads both, per line, from the
 * browser's own text layout (Range rects) and the font's metrics (canvas).
 * The grouping maths is pure and tested in test/text.test.ts.
 */
import type { Box } from './measure.js';

/** One run of text on one line, with its font's vertical metrics. */
export interface Fragment {
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Font ascent and descent: the content area the browser lays text in. */
  ascent: number;
  descent: number;
  /** Cap height and x-height, from the baseline up. */
  cap: number;
  xHeight: number;
  /** Computed line height in px, or null for `normal`. */
  lineHeight: number | null;
}

export interface TextLine extends Box {
  baseline: number;
  /** Top of the capitals. */
  capTop: number;
  /** Top of the lower case. */
  xTop: number;
  /** The CSS line box (line height), which is what the rhythm counts. */
  lineTop: number;
  lineBottom: number;
}

/** The baseline inside a fragment's rect: the content area centred in it,
 *  ascent down from its top (absorbs the browser's rounding of the rect). */
const baselineOf = (f: Fragment) => f.top + (f.bottom - f.top - (f.ascent + f.descent)) / 2 + f.ascent;

/**
 * Fragments → lines. Runs that share most of their height are one line; the
 * largest run sets the line's baseline, cap height and line box (inline runs
 * share a baseline, and the biggest text is what the eye reads).
 */
export function groupLines(frags: readonly Fragment[]): TextLine[] {
  const sorted = frags.filter((f) => f.right - f.left > 0 && f.bottom - f.top > 0).sort((a, b) => a.top - b.top || a.left - b.left);
  const groups: Fragment[][] = [];
  for (const f of sorted) {
    const g = groups[groups.length - 1];
    if (g) {
      const top = Math.min(...g.map((x) => x.top));
      const bottom = Math.max(...g.map((x) => x.bottom));
      const shared = Math.min(bottom, f.bottom) - Math.max(top, f.top);
      if (shared > 0.5 * Math.min(bottom - top, f.bottom - f.top)) {
        g.push(f);
        continue;
      }
    }
    groups.push([f]);
  }
  return groups.map((g) => {
    const lead = g.reduce((a, b) => (b.ascent + b.descent > a.ascent + a.descent ? b : a));
    const baseline = baselineOf(lead);
    const content = lead.ascent + lead.descent;
    const lh = lead.lineHeight ?? content;
    const lineTop = baseline - lead.ascent - (lh - content) / 2;
    return {
      top: Math.min(...g.map((f) => f.top)),
      bottom: Math.max(...g.map((f) => f.bottom)),
      left: Math.min(...g.map((f) => f.left)),
      right: Math.max(...g.map((f) => f.right)),
      baseline,
      capTop: baseline - Math.max(...g.map((f) => f.cap)),
      xTop: baseline - lead.xHeight,
      lineTop,
      lineBottom: lineTop + lh,
    };
  });
}

/** The letters' extent: first line's cap height down to the last baseline. */
export function inkOf(lines: readonly TextLine[]): Box | null {
  if (!lines.length) return null;
  return {
    top: lines[0].capTop,
    bottom: lines[lines.length - 1].baseline,
    left: Math.min(...lines.map((l) => l.left)),
    right: Math.max(...lines.map((l) => l.right)),
  };
}

/** The text's line boxes, end to end — what its layout takes up. */
export function lineBoxesOf(lines: readonly TextLine[]): Box | null {
  if (!lines.length) return null;
  return {
    top: lines[0].lineTop,
    bottom: lines[lines.length - 1].lineBottom,
    left: Math.min(...lines.map((l) => l.left)),
    right: Math.max(...lines.map((l) => l.right)),
  };
}

/** Baseline to baseline — the line spacing as set (null for one line). */
export const leadingOf = (lines: readonly TextLine[]) => (lines.length > 1 ? lines[1].baseline - lines[0].baseline : null);

// ── Reading the page ────────────────────────────────────────────────────────

type Metrics = Pick<Fragment, 'ascent' | 'descent' | 'cap' | 'xHeight'>;
const metricsCache = new Map<string, Metrics>();
let measureCtx: CanvasRenderingContext2D | null = null;

function metricsFor(cs: CSSStyleDeclaration): Metrics {
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const cached = metricsCache.get(font);
  if (cached) return cached;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const size = parseFloat(cs.fontSize) || 16;
  let m: Metrics = { ascent: size * 0.9, descent: size * 0.25, cap: size * 0.7, xHeight: size * 0.5 };
  if (measureCtx) {
    measureCtx.font = font;
    const H = measureCtx.measureText('H');
    const x = measureCtx.measureText('x');
    m = {
      ascent: H.fontBoundingBoxAscent || m.ascent,
      descent: H.fontBoundingBoxDescent || m.descent,
      cap: H.actualBoundingBoxAscent || m.cap,
      xHeight: x.actualBoundingBoxAscent || m.xHeight,
    };
  }
  // Fonts arrive late; don't remember a fallback measurement for good.
  if (document.fonts?.status !== 'loading') metricsCache.set(font, m);
  return m;
}

const MAX_FRAGMENTS = 400;

/**
 * The lines of text an element sets: its own text and any inline runs inside
 * it (links, emphasis), but not text in block children — those are layers of
 * their own.
 */
export function textLines(el: Element): TextLine[] {
  const frags: Fragment[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const inlineChain = new Map<Element, boolean>();
  const inline = (node: Element): boolean => {
    if (node === el) return true;
    let ok = inlineChain.get(node);
    if (ok === undefined) {
      ok = getComputedStyle(node).display.startsWith('inline') && !!node.parentElement && inline(node.parentElement);
      inlineChain.set(node, ok);
    }
    return ok;
  };
  for (let n = walker.nextNode(); n && frags.length < MAX_FRAGMENTS; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || !n.textContent?.trim() || !inline(parent)) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === 'hidden') continue;
    const m = metricsFor(cs);
    const lineHeight = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      if (r.width <= 0 || r.height <= 0) continue;
      frags.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, ...m, lineHeight });
    }
  }
  range.detach();
  return groupLines(frags);
}
