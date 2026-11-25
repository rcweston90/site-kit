/**
 * Token coverage: which layers are built from the system and which aren't.
 * A layer is on-system when its colours resolve to a token in its own scope
 * and its spacing sits on the scale — vertical on the configured rhythm,
 * horizontal on its horizontal step (4px by default, Tailwind's spacing
 * unit) or the page gutter. Anything else is a literal, and the overlay
 * marks it so it reads at a glance.
 *
 * Two data attributes let components speak for themselves:
 * `data-xray-spacing-scale="micro"` accepts 2px steps inside dense controls,
 * and `data-xray-token-source="…"` marks values that are deliberately derived
 * (a responsive clamp, a token mix) as intentional rather than literal.
 */
import { colourKey, parseColor } from './colour.js';
import { getXRayConfig } from './config.js';
import { describe, num } from './inspect.js';
import { rhythmFit, formatPx } from './measure.js';
import type { Layer } from './spacing.js';

export interface CoverageResult {
  el: Element;
  ok: boolean;
  status: 'system' | 'intentional' | 'literal';
  source?: string;
  /** What's off-system, in words: `padding-left 13`, `text #273138`. */
  misses: string[];
}

export function spacingOnScale(value: number, vertical: boolean, scale: string | undefined, gutter: number, border = 0) {
  if (vertical) {
    if (rhythmFit(value).fit !== 'off') return true;
    if (border > 0 && rhythmFit(Math.abs(value) + Math.abs(border)).fit !== 'off') return true;
    return scale === 'micro' && Math.abs(value / 2 - Math.round(value / 2)) < 0.01;
  }
  return onHorizontalScale(value) || Math.abs(Math.abs(value) - gutter) < 0.5;
}

/** On the horizontal step (4px by default), allowing for layout rounding. */
export function onHorizontalScale(value: number) {
  const step = getXRayConfig().rhythm.horizontal;
  return Math.abs(value / step - Math.round(value / step)) < 0.13;
}

export function runCoverage(layers: readonly Layer[], tokensFor: (el: Element) => Map<string, string[]>, gutter: number): CoverageResult[] {
  return layers.map(({ el, flags }) => {
    const cs = getComputedStyle(el);
    const misses: string[] = [];
    const tokens = tokensFor(el);
    const scale = el.closest<HTMLElement>('[data-xray-spacing-scale]')?.dataset.xraySpacingScale;
    const colour = (label: string, value: string) => {
      const c = parseColor(value);
      if (!c || c.a === 0) return;
      if (!tokens.has(colourKey(c)) && !tokens.has(colourKey({ ...c, a: 1 }))) misses.push(`${label} colour`);
    };
    if (flags.text) colour('text', cs.color);
    if (flags.paints) colour('fill', cs.backgroundColor);
    if (flags.paints && num(cs.borderTopWidth) > 0) colour('border', cs.borderTopColor);

    for (const prop of ['padding', 'margin'] as const) {
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const v = num(cs.getPropertyValue(`${prop}-${side}`));
        if (Math.abs(v) < 0.5) continue;
        const vertical = side === 'top' || side === 'bottom';
        const border = prop === 'padding' && vertical ? num(cs.getPropertyValue(`border-${side}-width`)) : 0;
        const onScale = spacingOnScale(v, vertical, scale, gutter, border);
        if (!onScale) misses.push(`${prop}-${side} ${formatPx(v)}`);
      }
    }
    if (cs.display.includes('flex') || cs.display.includes('grid')) {
      const row = num(cs.rowGap);
      const col = num(cs.columnGap);
      if (row >= 0.5 && !spacingOnScale(row, true, scale, gutter)) misses.push(`row-gap ${formatPx(row)}`);
      if (col >= 0.5 && !onHorizontalScale(col)) misses.push(`column-gap ${formatPx(col)}`);
    }
    const source = el.closest<HTMLElement>('[data-xray-token-source]')?.dataset.xrayTokenSource;
    const status = misses.length === 0 ? 'system' : source ? 'intentional' : 'literal';
    return { el, ok: status !== 'literal', status, source, misses };
  });
}

export interface CoverageGroup {
  key: string;
  status: 'intentional' | 'literal';
  source?: string;
  misses: string[];
  items: CoverageResult[];
}

/** Collapse duplicate layer findings without losing their inspectable members. */
export function groupCoverage(results: readonly CoverageResult[]): CoverageGroup[] {
  const groups = new Map<string, CoverageGroup>();
  results.filter((result) => result.status !== 'system').forEach((result) => {
    const status: CoverageGroup['status'] = result.status === 'intentional' ? 'intentional' : 'literal';
    const key = `${status}|${result.source ?? ''}|${[...result.misses].sort().join('|')}`;
    const existing = groups.get(key);
    if (existing) existing.items.push(result);
    else groups.set(key, { key, status, source: result.source, misses: result.misses, items: [result] });
  });
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

export const coverageLabel = (r: CoverageResult) => `${describe(r.el)} — ${r.misses.join(', ')}`;
