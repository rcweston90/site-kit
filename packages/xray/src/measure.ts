/**
 * The X-ray's geometry, kept free of the DOM so it can be tested: what counts
 * as on the rhythm, which boxes are neighbours, and where a distance line
 * between two boxes runs. The rhythm itself comes from the configuration
 * (config.ts), read on every call.
 */
import { getXRayConfig, type RhythmStep } from './config.js';

/** A border box in viewport pixels (a DOMRect satisfies it). */
export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One measured distance, drawn as a line from `from` to `to` along `axis`. */
export interface Measure {
  /** 'y' runs top to bottom (vertical spacing), 'x' left to right. */
  axis: 'x' | 'y';
  from: number;
  to: number;
  /** Where the line sits on the other axis. */
  at: number;
  /** to − from, in px. */
  value: number;
  /** The span both boxes share on the other axis — the gap's footprint. */
  span?: [number, number];
  /** For boxes that don't overlap on the other axis: a dashed guide from the
   *  far box's edge to the line, so the line still reads as "between" them. */
  guide?: { at: number; from: number; to: number };
}

/** The named rhythm steps in force (configureXRay sets them). */
export const rhythmSteps = (): readonly RhythmStep[] => getXRayConfig().rhythm.steps;

/** The rhythm's unit in force: every multiple of it is on the grid. */
export const rhythmUnit = (): number => getXRayConfig().rhythm.unit;

/** `3×12`: a value on the grid that has no name, as a count of units. */
export const unitsLabel = (units: number) => `${units}×${rhythmUnit()}`;
/** Layout hands back fractions (rem maths, zoom, subpixel media); half a pixel
 *  either way still reads as the intended value. */
const TOLERANCE = 0.5;

/**
 * 'token' — exactly a named step (or 0) · 'grid' — a multiple of the unit
 * that isn't a step (two gaps stacked, a step plus a unit) · 'off' — off
 * the grid.
 */
export type RhythmFit = { fit: 'token'; name: string } | { fit: 'grid'; units: number } | { fit: 'off' };

export function rhythmFit(px: number): RhythmFit {
  const { unit, steps } = getXRayConfig().rhythm;
  const v = Math.abs(px);
  if (v <= TOLERANCE) return { fit: 'token', name: '0' };
  const step = steps.find((s) => Math.abs(v - s.px) <= TOLERANCE);
  if (step) return { fit: 'token', name: step.name };
  const units = Math.round(v / unit);
  if (units > 0 && Math.abs(v - units * unit) <= TOLERANCE) return { fit: 'grid', units };
  return { fit: 'off' };
}

/** Whole pixels when they are whole, one decimal otherwise: 24, 23.5, −8. */
export function formatPx(px: number): string {
  const r = Math.round(px * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return s.replace('-', '−');
}

export const width = (b: Box) => b.right - b.left;
export const height = (b: Box) => b.bottom - b.top;
export const isEmpty = (b: Box) => width(b) <= 0 || height(b) <= 0;

/** The shared span of two intervals, or null when they only touch or miss. */
function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return hi - lo > TOLERANCE ? [lo, hi] : null;
}

/** b sits wholly below a (touching counts: a 0px gap is still a gap to show). */
const isBelow = (a: Box, b: Box) => b.top >= a.bottom - TOLERANCE;
const isRightOf = (a: Box, b: Box) => b.left >= a.right - TOLERANCE;

/**
 * The distance from `a` to `b` along one axis, when b lies past a on that
 * axis. The line runs through the middle of their shared span; with no shared
 * span it starts from a's centre and a guide runs along b's near edge.
 */
function across(a: Box, b: Box, axis: 'x' | 'y'): Measure {
  if (axis === 'y') {
    const span = overlap(a.left, a.right, b.left, b.right);
    const at = span ? (span[0] + span[1]) / 2 : (a.left + a.right) / 2;
    const guide = span ? undefined : { at: b.top, from: at, to: at < b.left ? b.left : b.right };
    return { axis, from: a.bottom, to: b.top, at, value: b.top - a.bottom, span: span ?? undefined, guide };
  }
  const span = overlap(a.top, a.bottom, b.top, b.bottom);
  const at = span ? (span[0] + span[1]) / 2 : (a.top + a.bottom) / 2;
  const guide = span ? undefined : { at: b.left, from: at, to: at < b.top ? b.top : b.bottom };
  return { axis, from: a.right, to: b.left, at, value: b.left - a.right, span: span ?? undefined, guide };
}

/**
 * Every distance worth drawing between two boxes. Apart on an axis: the gap
 * across it. Nested or overlapping: how far each edge of one sits from the
 * matching edge of the other (an inset, measured edge to edge).
 */
export function measureBetween(a: Box, b: Box): Measure[] {
  const out: Measure[] = [];
  if (isBelow(a, b)) out.push(across(a, b, 'y'));
  else if (isBelow(b, a)) out.push(across(b, a, 'y'));
  if (isRightOf(a, b)) out.push(across(a, b, 'x'));
  else if (isRightOf(b, a)) out.push(across(b, a, 'x'));
  if (out.length) return out;

  // Overlapping: the inner box's edges against the outer's. Lines run through
  // the smaller box's centre so they stay inside both.
  const small = width(a) * height(a) <= width(b) * height(b) ? a : b;
  const cx = (small.left + small.right) / 2;
  const cy = (small.top + small.bottom) / 2;
  const edges: Measure[] = [
    { axis: 'y', from: Math.min(a.top, b.top), to: Math.max(a.top, b.top), at: cx, value: Math.abs(a.top - b.top) },
    { axis: 'y', from: Math.min(a.bottom, b.bottom), to: Math.max(a.bottom, b.bottom), at: cx, value: Math.abs(a.bottom - b.bottom) },
    { axis: 'x', from: Math.min(a.left, b.left), to: Math.max(a.left, b.left), at: cy, value: Math.abs(a.left - b.left) },
    { axis: 'x', from: Math.min(a.right, b.right), to: Math.max(a.right, b.right), at: cy, value: Math.abs(a.right - b.right) },
  ];
  return edges.filter((m) => m.value > TOLERANCE);
}

/** Indices of the nearest box on each side of `target` that it overlaps on the other axis. */
export interface Neighbours {
  above?: number;
  below?: number;
  left?: number;
  right?: number;
}

/** `target` may be one of `boxes` (it's skipped by identity). */
export function neighbours(target: Box, boxes: readonly Box[]): Neighbours {
  const n: Neighbours = {};
  let above = -Infinity;
  let below = Infinity;
  let left = -Infinity;
  let right = Infinity;
  boxes.forEach((b, i) => {
    if (b === target || isEmpty(b)) return;
    if (overlap(target.left, target.right, b.left, b.right)) {
      if (isBelow(b, target) && b.bottom > above) [above, n.above] = [b.bottom, i];
      if (isBelow(target, b) && b.top < below) [below, n.below] = [b.top, i];
    }
    if (overlap(target.top, target.bottom, b.top, b.bottom)) {
      if (isRightOf(b, target) && b.right > left) [left, n.left] = [b.right, i];
      if (isRightOf(target, b) && b.left < right) [right, n.right] = [b.left, i];
    }
  });
  return n;
}

/** The distances from `target` to its nearest neighbour on each side. */
export function neighbourGaps(target: Box, boxes: readonly Box[]): Measure[] {
  const n = neighbours(target, boxes);
  const out: Measure[] = [];
  if (n.above !== undefined) out.push(across(boxes[n.above], target, 'y'));
  if (n.below !== undefined) out.push(across(target, boxes[n.below], 'y'));
  if (n.left !== undefined) out.push(across(boxes[n.left], target, 'x'));
  if (n.right !== undefined) out.push(across(target, boxes[n.right], 'x'));
  return out;
}

/**
 * The spacing inside a container: each child's gap to the nearest sibling
 * below it and to its right. Covers stacks, rows and wrapped grids alike —
 * whatever made the space (margin, gap, space-y), this is what it came to.
 */
export function childGaps(children: readonly Box[]): Measure[] {
  return childGapPairs(children).map((p) => p.measure);
}

/** childGaps, keeping which two children each gap sits between (the audit
 *  pins them). */
export function childGapPairs(children: readonly Box[]): { from: number; to: number; measure: Measure }[] {
  const out: { from: number; to: number; measure: Measure }[] = [];
  children.forEach((c, i) => {
    if (isEmpty(c)) return;
    const n = neighbours(c, children);
    if (n.below !== undefined) out.push({ from: i, to: n.below, measure: across(c, children[n.below], 'y') });
    if (n.right !== undefined) out.push({ from: i, to: n.right, measure: across(c, children[n.right], 'x') });
  });
  return out;
}

/** How far the pointer is from the nearest edge in each direction (Dimensions-style). */
export interface Rays {
  up: number | null;
  down: number | null;
  left: number | null;
  right: number | null;
}

/**
 * From (x, y), the nearest horizontal edge above and below among boxes that
 * span x, and the nearest vertical edge left and right among boxes that span
 * y — inside a box its own edges count, so the pointer in a card's padding
 * reads that padding. null where nothing stops the ray before the window edge.
 */
export function raysFrom(x: number, y: number, boxes: readonly Box[]): Rays {
  let up: number | null = null;
  let down: number | null = null;
  let left: number | null = null;
  let right: number | null = null;
  for (const b of boxes) {
    if (x >= b.left && x <= b.right) {
      for (const edge of [b.top, b.bottom]) {
        if (edge <= y && (up === null || edge > up)) up = edge;
        if (edge >= y && (down === null || edge < down)) down = edge;
      }
    }
    if (y >= b.top && y <= b.bottom) {
      for (const edge of [b.left, b.right]) {
        if (edge <= x && (left === null || edge > left)) left = edge;
        if (edge >= x && (right === null || edge < right)) right = edge;
      }
    }
  }
  return { up, down, left, right };
}
