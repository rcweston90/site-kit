/**
 * The spacing reading — X-ray's main job. For one element: its CSS padding
 * and margin, and then what they come to on screen between the things you
 * see: from its edges in to its content (inside), out to the nearest layer
 * on each side (around), between its children (between), and for text, from
 * the letters to the box they sit in (to box). In Text mode every text layer
 * is measured by its letters (cap height to baseline) instead of its line
 * boxes, which is the space the eye reads.
 */
import { childGaps, measureBetween, neighbours, type Box, type Measure } from './measure.js';
import { describe, sides, type Side, type Sides } from './inspect.js';
import { boxAround, roleOf, visualChildren, type LayerCache, type LayerFlags } from './layers.js';
import { inkOf, leadingOf, lineBoxesOf, textLines, type TextLine } from './text.js';

export type MeasureMode = 'box' | 'text';

export interface Layer {
  el: Element;
  rect: DOMRect;
  flags: LayerFlags;
}

/** Each measurement keeps what it's of, so the canvas can colour it. */
export type SpacingKind = 'inside' | 'around' | 'between' | 'toBox' | 'compare';

export interface SpacingReading {
  mode: MeasureMode;
  role: string;
  name: string;
  width: number;
  height: number;
  padding: Sides;
  margin: Sides;
  /** From its edges in to what it holds (children and text). */
  inside: Sides | null;
  /** To the nearest layer outside it, each side. */
  around: Partial<Sides>;
  /** For text: from its letters (or line boxes) out to the box it sits in. */
  toBox: Sides | null;
  boxRole: string | null;
  /** Gaps between the layers it holds. */
  between: { axis: 'x' | 'y'; value: number }[];
  /** Flex or grid: Figma's auto layout — direction and gap. */
  flow: { kind: string; row: number; column: number } | null;
  text: { lines: number; size: number; leading: number | null; step: number | null; cap: number; xHeight: number } | null;
  /** Pinned ↔ hovered (or ↔ an audit finding's other side). */
  compare: { axis: 'x' | 'y'; value: number }[] | null;
  pinned: boolean;
}

export interface SpacingResult {
  reading: SpacingReading;
  measures: { kind: SpacingKind; measure: Measure }[];
  /** The text's lines, for drawing baselines and cap heights. */
  lines: TextLine[];
  /** The box `toBox` measures to. */
  box: Box | null;
  /** What the element's own box measures as (its letters, in Text mode). */
  self: Box;
}

const toBox = (r: DOMRect | Box): Box => ({ top: r.top, right: r.right, bottom: r.bottom, left: r.left });
const union = (boxes: Box[]): Box | null =>
  boxes.length
    ? {
        top: Math.min(...boxes.map((b) => b.top)),
        right: Math.max(...boxes.map((b) => b.right)),
        bottom: Math.max(...boxes.map((b) => b.bottom)),
        left: Math.min(...boxes.map((b) => b.left)),
      }
    : null;

/** Insets from an outer box in to an inner one, as four measures. */
function insets(outer: Box, inner: Box, kind: SpacingKind): { sides: Sides; measures: { kind: SpacingKind; measure: Measure }[] } {
  const cx = (Math.max(outer.left, inner.left) + Math.min(outer.right, inner.right)) / 2;
  const cy = (Math.max(outer.top, inner.top) + Math.min(outer.bottom, inner.bottom)) / 2;
  const s: Sides = {
    top: inner.top - outer.top,
    right: outer.right - inner.right,
    bottom: outer.bottom - inner.bottom,
    left: inner.left - outer.left,
  };
  const ms: Measure[] = [
    { axis: 'y', from: outer.top, to: inner.top, at: cx, value: s.top },
    { axis: 'y', from: inner.bottom, to: outer.bottom, at: cx, value: s.bottom },
    { axis: 'x', from: outer.left, to: inner.left, at: cy, value: s.left },
    { axis: 'x', from: inner.right, to: outer.right, at: cy, value: s.right },
  ];
  return { sides: s, measures: ms.filter((m) => Math.abs(m.value) >= 0.5).map((measure) => ({ kind, measure })) };
}

export interface SpacingContext {
  layers: readonly Layer[];
  cache: LayerCache;
  mode: MeasureMode;
  maxHeight: number;
}

/** A layer's box as measured in this mode: text by its letters in Text mode. */
export function measuredBox(el: Element, rect: DOMRect | Box, flags: LayerFlags | null, mode: MeasureMode, lines?: TextLine[]): Box {
  if (mode !== 'text' || !flags?.text || flags.paints) return toBox(rect);
  return inkOf(lines ?? textLines(el)) ?? toBox(rect);
}

export function readSpacing(target: Element, other: Element | null, pinned: boolean, ctx: SpacingContext): SpacingResult {
  const { layers, cache, mode, maxHeight } = ctx;
  const cs = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  const flags = cache.get(target);
  const lines = flags?.text ? textLines(target) : [];
  const self = measuredBox(target, rect, flags, mode, lines);
  const measures: SpacingResult['measures'] = [];
  const isLayer = (n: Element) => !!cache.get(n);

  // Inside: edges → what it holds (its layers, and its own text).
  const kids = visualChildren(target, layers, isLayer);
  const kidBoxes = kids.map((k) => measuredBox(k.el, k.rect, k.flags, mode));
  const textExtent = lines.length ? (mode === 'text' ? inkOf(lines) : lineBoxesOf(lines)) : null;
  const content = union([...kidBoxes, ...(textExtent ? [textExtent] : [])]);
  let inside: Sides | null = null;
  if (content && (kids.length || flags?.paints)) {
    const r = insets(toBox(rect), content, 'inside');
    inside = r.sides;
    measures.push(...r.measures);
  }

  // Between: gaps between the layers it holds.
  const gaps = childGaps(kidBoxes);
  measures.push(...gaps.map((measure) => ({ kind: 'between' as const, measure })));

  // Around: the nearest layer on each side that isn't inside it or holding it.
  const outside = layers.filter((l) => l.el !== target && !l.el.contains(target) && !target.contains(l.el));
  const n = neighbours(self, outside.map((l) => toBox(l.rect)));
  const around: Partial<Sides> = {};
  const near = (i: number | undefined) => (i === undefined ? null : measuredBox(outside[i].el, outside[i].rect, outside[i].flags, mode));
  const above = near(n.above);
  const below = near(n.below);
  const left = near(n.left);
  const right = near(n.right);
  const push = (side: Side, ms: Measure[]) => {
    const m = ms.find((x) => (side === 'top' || side === 'bottom' ? x.axis === 'y' : x.axis === 'x'));
    if (!m || m.value < -0.5) return;
    around[side] = m.value;
    measures.push({ kind: 'around', measure: m });
  };
  if (above) push('top', measureBetween(above, self));
  if (below) push('bottom', measureBetween(self, below));
  if (left) push('left', measureBetween(left, self));
  if (right) push('right', measureBetween(self, right));

  // To box: text that sits in a painted box, measured out to its edges.
  let boxInsets: Sides | null = null;
  let box: Box | null = null;
  let boxRole: string | null = null;
  if (flags?.text && !flags.paints && textExtent) {
    const holder = boxAround(target, cache, maxHeight);
    if (holder) {
      box = toBox(holder.getBoundingClientRect());
      boxRole = `${roleOf(holder, cache.get(holder))} · ${describe(holder)}`;
      const r = insets(box, textExtent, 'toBox');
      boxInsets = r.sides;
      measures.push(...r.measures);
    }
  }

  // Compare: to the other element, box or letters per mode.
  let compare: SpacingReading['compare'] = null;
  if (other) {
    const ob = measuredBox(other, other.getBoundingClientRect(), cache.get(other), mode);
    const ms = measureBetween(self, ob);
    compare = ms.map(({ axis, value }) => ({ axis, value }));
    measures.length = 0; // comparing: just the pair
    measures.push(...ms.map((measure) => ({ kind: 'compare' as const, measure })));
  }

  const display = cs.display;
  const flow =
    display.includes('flex') || display.includes('grid')
      ? {
          kind: display.includes('grid') ? 'grid' : cs.flexDirection.startsWith('column') ? 'vertical' : 'horizontal',
          row: parseFloat(cs.rowGap) || 0,
          column: parseFloat(cs.columnGap) || 0,
        }
      : null;

  const fontSize = parseFloat(cs.fontSize) || 0;
  const lead = lines[0];
  return {
    reading: {
      mode,
      role: roleOf(target, flags),
      name: describe(target),
      width: rect.width,
      height: rect.height,
      padding: sides(cs, 'padding'),
      margin: sides(cs, 'margin'),
      inside,
      around,
      toBox: boxInsets,
      boxRole,
      between: gaps.map(({ axis, value }) => ({ axis, value })),
      flow,
      text: lead
        ? {
            lines: lines.length,
            size: fontSize,
            leading: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
            step: leadingOf(lines),
            cap: Math.round((lead.baseline - lead.capTop) * 10) / 10,
            xHeight: Math.round((lead.baseline - lead.xTop) * 10) / 10,
          }
        : null,
      compare,
      pinned,
    },
    measures,
    lines,
    box,
    self,
  };
}

// ── Redlines ────────────────────────────────────────────────────────────────

export interface Redlines {
  measures: { kind: SpacingKind; measure: Measure }[];
  /** The painted boxes inside, outlined so the spec reads as a drawing. */
  boxes: Box[];
}

const MAX_CONTAINERS = 160;

/**
 * Every spacing inside a component at once — a redline spec: each painted
 * box's insets to what it holds, and the gaps between the layers in every
 * container, wrappers seen through. Measured the same way as the hover
 * reading (box edges or letters), deduped where two containers share a gap.
 */
export function redlines(root: Element, ctx: SpacingContext): Redlines {
  const { layers, cache, mode } = ctx;
  const isLayer = (n: Element) => !!cache.get(n);
  const rootLayer: Layer = { el: root, rect: root.getBoundingClientRect(), flags: cache.get(root) ?? { paints: false, text: false, media: false } };
  const containers = [rootLayer, ...layers.filter((l) => l.el !== root && root.contains(l.el))].slice(0, MAX_CONTAINERS);
  const measures: Redlines['measures'] = [];
  const boxes: Box[] = [];
  const seen = new Set<string>();
  const push = (kind: SpacingKind, m: Measure) => {
    const key = `${m.axis}|${Math.round(m.from)}|${Math.round(m.to)}`;
    if (seen.has(key)) return;
    seen.add(key);
    measures.push({ kind, measure: m });
  };
  for (const c of containers) {
    const kids = visualChildren(c.el, layers, isLayer);
    const lines = c.flags.text ? textLines(c.el) : [];
    const textExtent = lines.length ? (mode === 'text' ? inkOf(lines) : lineBoxesOf(lines)) : null;
    const kidBoxes = kids.map((k) => measuredBox(k.el, k.rect, k.flags, mode));
    const content = union([...kidBoxes, ...(textExtent ? [textExtent] : [])]);
    if (content && (c.flags.paints || c === rootLayer)) insets(toBox(c.rect), content, 'inside').measures.forEach(({ measure }) => push('inside', measure));
    childGaps(kidBoxes).forEach((m) => push('between', m));
    if (c.flags.paints && c !== rootLayer) boxes.push(toBox(c.rect));
  }
  return { measures, boxes };
}

/** The spacing values a set of measurements uses, most common first. */
export function tallyValues(measures: readonly { measure: Measure }[], axis: 'x' | 'y'): [number, number][] {
  const counts = new Map<number, number>();
  for (const { measure } of measures) {
    if (measure.axis !== axis || Math.abs(measure.value) < 0.5) continue;
    const v = Math.round(measure.value * 10) / 10;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}
