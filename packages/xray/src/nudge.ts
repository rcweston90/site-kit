/**
 * Nudge — try a spacing change on the live page (VisBug's padding and margin
 * tools, stepping on the configured rhythm). Edits are inline styles, undone
 * on Reset or when X-ray closes; Copy writes them up as Tailwind-style
 * classes to make it real: a named step becomes `pt-<name>`, a value on the
 * horizontal step `pt-<n>`, anything else an arbitrary value. Vertical steps
 * are one unit, horizontal one horizontal step; Shift steps 1px.
 */
import { getXRayConfig } from './config.js';
import { formatPx, rhythmSteps } from './measure.js';
import { describe, num, type Side } from './inspect.js';

export type NudgeProp = 'padding' | 'margin' | 'gap';

export interface NudgeChange {
  el: Element;
  name: string;
  property: string;
  from: number;
  to: number;
}

const PREFIX: Record<string, string> = {
  'padding-top': 'pt',
  'padding-right': 'pr',
  'padding-bottom': 'pb',
  'padding-left': 'pl',
  'margin-top': 'mt',
  'margin-right': 'mr',
  'margin-bottom': 'mb',
  'margin-left': 'ml',
  'row-gap': 'gap-y',
  'column-gap': 'gap-x',
};

/** The class that sets `px` on `property`: a named rhythm step, the horizontal scale, or arbitrary. */
export function classFor(property: string, px: number): string {
  const prefix = PREFIX[property] ?? property;
  const neg = px < 0 ? '-' : '';
  const v = Math.abs(px);
  const step = rhythmSteps().find((s) => Math.abs(s.px - v) < 0.5);
  if (step) return `${neg}${prefix}-${step.name}`;
  if (v === 0) return `${prefix}-0`;
  const scale = getXRayConfig().rhythm.horizontal;
  if (Number.isInteger(v / scale)) return `${neg}${prefix}-${v / scale}`;
  return `${neg}${prefix}-[${formatPx(v).replace('−', '')}px]`;
}

export function propertyFor(prop: NudgeProp, side: Side): string {
  if (prop === 'gap') return side === 'top' || side === 'bottom' ? 'row-gap' : 'column-gap';
  return `${prop}-${side}`;
}

export function createNudger() {
  // Each element's original inline values, so Reset puts back exactly what was there.
  const originals = new Map<Element, Map<string, string>>();
  const changes = new Map<string, NudgeChange>();

  const nudge = (el: Element, prop: NudgeProp, side: Side, delta: number): NudgeChange | null => {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return null;
    const property = propertyFor(prop, side);
    const now = num(getComputedStyle(el).getPropertyValue(property));
    const to = Math.max(prop === 'margin' ? -999 : 0, now + delta);
    let saved = originals.get(el);
    if (!saved) originals.set(el, (saved = new Map()));
    if (!saved.has(property)) saved.set(property, el.style.getPropertyValue(property));
    const key = `${property}@${describe(el)}`;
    const first = changes.get(key)?.from ?? now;
    el.style.setProperty(property, `${to}px`);
    const change = { el, name: describe(el), property, from: first, to };
    if (Math.abs(to - first) < 0.5) changes.delete(key);
    else changes.set(key, change);
    return change;
  };

  const reset = () => {
    originals.forEach((props, el) => {
      const style = (el as HTMLElement).style;
      props.forEach((value, property) => (value ? style.setProperty(property, value) : style.removeProperty(property)));
    });
    originals.clear();
    changes.clear();
  };

  const list = () => [...changes.values()];

  const summary = () =>
    list()
      .map((c) => `- \`${c.name}\` ${c.property}: ${formatPx(c.from)} → ${formatPx(c.to)}px — \`${classFor(c.property, c.to)}\``)
      .join('\n');

  return { nudge, reset, list, summary };
}

export type Nudger = ReturnType<typeof createNudger>;
