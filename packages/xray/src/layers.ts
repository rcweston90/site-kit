/**
 * Layers: the page as a designer sees it. Most elements are wrappers that
 * draw nothing; what the eye measures between is text, media, and boxes that
 * paint something (a fill, a border, a shadow). X-ray hovers, outlines and
 * measures between these — Figma's layers, not the DOM's divs — and walks
 * the DOM only when you ask it to (arrow keys).
 */
import { parseColor } from './colour.js';
import { hasOwnText, num } from './inspect.js';

export interface LayerFlags {
  /** Draws a fill, border or shadow. */
  paints: boolean;
  /** Sets text of its own. */
  text: boolean;
  /** An image, video, canvas, embed or icon. */
  media: boolean;
}

const MEDIA = /^(IMG|SVG|VIDEO|CANVAS|IFRAME|PICTURE|OBJECT|EMBED)$/;

function bordered(cs: CSSStyleDeclaration): boolean {
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const w = num(cs.getPropertyValue(`border-${side.toLowerCase()}-width`));
    if (w <= 0 || cs.getPropertyValue(`border-${side.toLowerCase()}-style`) === 'none') continue;
    const c = parseColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`));
    if (c && c.a > 0.02) return true;
  }
  return false;
}

/** What an element draws, or null for a wrapper that draws nothing. */
export function flagsOf(el: Element, cs: CSSStyleDeclaration): LayerFlags | null {
  // Inside an SVG only the outermost <svg> is a layer.
  if (el instanceof SVGElement && !(el instanceof SVGSVGElement && !(el.parentElement instanceof SVGElement))) return null;
  if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden' || num(cs.opacity) === 0) return null;
  const media = MEDIA.test(el.tagName.toUpperCase());
  const text = !media && hasOwnText(el);
  const bg = parseColor(cs.backgroundColor);
  const paints = (!!bg && bg.a > 0.02) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || bordered(cs);
  return media || text || paints ? { paints, text, media } : null;
}

/** A plain-words name for what an element is: Heading 2, Text, Button … */
export function roleOf(el: Element, flags: LayerFlags | null): string {
  const tag = el.tagName.toUpperCase();
  if (/^H[1-6]$/.test(tag)) return `Heading ${tag[1]}`;
  if (tag === 'BUTTON' || el.getAttribute('role') === 'button') return 'Button';
  if (tag === 'A') return flags?.paints ? 'Button link' : 'Link';
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return 'Field';
  if (tag === 'IMG' || tag === 'PICTURE') return 'Image';
  if (tag === 'SVG') return 'Icon';
  if (tag === 'VIDEO') return 'Video';
  if (tag === 'CANVAS') return 'Canvas';
  if (tag === 'IFRAME') return 'Embed';
  if (tag === 'LI') return 'List item';
  if (/^(UL|OL)$/.test(tag)) return 'List';
  if (tag === 'HR') return 'Divider';
  if (flags?.text && flags.paints) return 'Label';
  if (flags?.text) return tag === 'P' ? 'Paragraph' : 'Text';
  if (flags?.paints) return 'Box';
  if (/^(SECTION|ARTICLE|HEADER|FOOTER|NAV|ASIDE|MAIN)$/.test(tag)) return tag[0] + tag.slice(1).toLowerCase();
  return 'Group';
}

/**
 * Remembers flags per element (styles rarely change while you inspect), and
 * forgets an element when it mutates. `reset` forgets everything — on theme
 * changes and every few seconds, for whatever animated quietly.
 */
export function createLayerCache() {
  let flags = new WeakMap<Element, LayerFlags | null>();
  const get = (el: Element): LayerFlags | null => {
    if (flags.has(el)) return flags.get(el)!;
    const f = flagsOf(el, getComputedStyle(el));
    flags.set(el, f);
    return f;
  };
  return {
    get,
    forget: (el: Element) => flags.delete(el),
    reset: () => {
      flags = new WeakMap();
    },
  };
}

export type LayerCache = ReturnType<typeof createLayerCache>;

/**
 * The layer a pointer is over: the nearest element up from `from` that draws
 * something. Page-sized painters (a background that runs the whole page)
 * aren't layers you'd measure — they're the canvas.
 */
export function layerAt(from: Element, cache: LayerCache, isUi: (el: Element) => boolean, maxHeight: number): Element | null {
  for (let n: Element | null = from; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (isUi(n)) return null;
    const f = cache.get(n);
    if (!f) continue;
    const r = n.getBoundingClientRect();
    if (r.height > maxHeight) return null;
    return n;
  }
  return null;
}

/** The nearest ancestor that paints — the card, button or band text sits in. */
export function boxAround(el: Element, cache: LayerCache, maxHeight: number, includeSelf = false): Element | null {
  for (let n: Element | null = includeSelf ? el : el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const f = cache.get(n);
    if (!f?.paints) continue;
    if (n.getBoundingClientRect().height > maxHeight) return null;
    return n;
  }
  return null;
}

/** Every layer on the page, with its box — the set measurements run against. */
export function collectLayers(cache: LayerCache, isUi: (el: Element) => boolean, maxHeight: number): { el: Element; rect: DOMRect; flags: LayerFlags }[] {
  const out: { el: Element; rect: DOMRect; flags: LayerFlags }[] = [];
  for (const el of Array.from(document.body.getElementsByTagName('*'))) {
    const f = cache.get(el);
    if (!f) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1 || rect.height > maxHeight) continue;
    if (isUi(el)) continue;
    out.push({ el, rect, flags: f });
  }
  return out;
}

/** Layers inside `el` with no other layer between them and it. */
export function visualChildren<T extends { el: Element }>(el: Element, layers: readonly T[], isLayer: (n: Element) => boolean): T[] {
  return layers.filter(({ el: child }) => {
    if (child === el || !el.contains(child)) return false;
    for (let n = child.parentElement; n && n !== el; n = n.parentElement) if (isLayer(n)) return false;
    return true;
  });
}
