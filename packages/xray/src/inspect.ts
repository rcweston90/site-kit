/**
 * Reading the page: everything X-ray says about an element — its box,
 * spacing, type, colours and where it comes from — gathered in one place so
 * the canvas, the dock and the copied spec all tell the same story.
 */
import { colourKey, contrastRatio, over, parseColor, toHex, wcag, type RGBA } from './colour.js';
import { getXRayConfig } from './config.js';
import type { Box } from './measure.js';
import type { SpacingReading } from './spacing.js';

export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];
export type Sides = Record<Side, number>;

export const num = (v: string) => parseFloat(v) || 0;

export function sides(cs: CSSStyleDeclaration, prop: 'margin' | 'padding' | 'border'): Sides {
  const key = (s: Side) => (prop === 'border' ? `border-${s}-width` : `${prop}-${s}`);
  return {
    top: num(cs.getPropertyValue(key('top'))),
    right: num(cs.getPropertyValue(key('right'))),
    bottom: num(cs.getPropertyValue(key('bottom'))),
    left: num(cs.getPropertyValue(key('left'))),
  };
}

export const inset = (b: Box, s: Sides): Box => ({
  top: b.top + s.top,
  right: Math.max(b.left + s.left, b.right - s.right),
  bottom: Math.max(b.top + s.top, b.bottom - s.bottom),
  left: b.left + s.left,
});

export const outset = (b: Box, s: Sides): Box => ({
  top: b.top - s.top,
  right: b.right + s.right,
  bottom: b.bottom + s.bottom,
  left: b.left - s.left,
});

export const hasAny = (s: Sides) => SIDES.some((k) => Math.abs(s[k]) >= 0.5);

// ── Names ───────────────────────────────────────────────────────────────────

/** `PricingCard-module__lu3UTG__title` → PricingCard.module.css / title (the class names CSS modules emit in development). */
export function cssModuleOf(className: string): { file: string; local: string } | null {
  const m = className.match(/^([A-Za-z][\w-]*?)-module__[\w-]+?__([\w-]+)$/);
  return m ? { file: `${m[1]}.module.css`, local: m[2] } : null;
}

const moduleOf = (el: Element) => {
  for (const c of Array.from(el.classList)) {
    const m = cssModuleOf(c);
    if (m) return m;
  }
  return null;
};

/** `div#hero.grid.gap-6…` — enough to find it in the source. */
export function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const mod = moduleOf(el);
  if (mod) return `${tag}${id}.${mod.local}`;
  const classes = Array.from(el.classList);
  const shown = classes.slice(0, 2).map((c) => `.${c}`).join('');
  return `${tag}${id}${shown}${classes.length > 2 ? '…' : ''}`;
}

/** A breadcrumb label: the CSS-module name where there is one, else the tag. */
export function crumbLabel(el: Element): string {
  const mod = moduleOf(el);
  if (mod) return mod.local;
  if (el.id) return `#${el.id}`;
  return el.tagName.toLowerCase();
}

// Framework components a designer never wrote and never wants to see.
const FRAMEWORK =
  /^(Global|Inner|Outer)?(LayoutRouter|Layout|ScrollAndFocus|Redirect|NotFound|Error|Loading|HTTPAccessFallback|RenderFromTemplate|ClientPage|ClientSegment|Segment|Template|AppRouter|Router|HotReload|Head|DevRoot|Root|Suspense|MotionConfig|LazyMotion|AnimatePresence|PresenceChild|PopChild|Portal)|(Context|Provider|Boundary|Handler)$/;

/**
 * The React component that rendered an element, read from its fiber. Names
 * survive in development; production minifies them, and then the CSS-module
 * file stands in (`PricingCard.module.css` → PricingCard).
 */
export function componentOf(el: Element): string | null {
  try {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    type Fiber = { type?: unknown; return?: Fiber | null };
    let fiber = key ? ((el as unknown as Record<string, Fiber>)[key] ?? null) : null;
    for (let hops = 0; fiber && hops < 60; hops++, fiber = fiber.return ?? null) {
      const t = fiber.type as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | string | undefined;
      if (!t || typeof t === 'string') continue;
      const name = t.displayName || t.name || t.render?.name || t.type?.name;
      if (name && /^[A-Z][A-Za-z0-9]{2,}$/.test(name) && !FRAMEWORK.test(name)) return name;
    }
  } catch {
    // fibers are React internals; if they move, fall back quietly
  }
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const mod = moduleOf(node);
    if (mod) return mod.file.replace(/\.module\.css$/, '');
  }
  return null;
}

/** A short, unique-enough CSS path for the copied spec. */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.body && parts.length < 6; node = node.parentElement) {
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const tag = node.tagName.toLowerCase();
    const same = node.parentElement ? Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName) : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
  }
  return parts.join(' > ');
}

export function layoutOf(cs: CSSStyleDeclaration): string {
  const d = cs.display;
  if (d.includes('flex')) return `${d} ${cs.flexDirection}${cs.flexWrap === 'wrap' ? ' wrap' : ''}`;
  return d;
}

/** The configured breakpoint a width falls in (Tailwind's defaults unless configured). */
export function breakpointOf(width: number): string {
  const { breakpoints, baseName } = getXRayConfig();
  let name = baseName;
  for (const bp of breakpoints) if (width >= bp.min) name = bp.name;
  return name;
}

// ── Type ────────────────────────────────────────────────────────────────────

/** `__Inter_d65c78, __Inter_Fallback_d65c78, system-ui` → Inter. */
export function prettyFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const nextFont = first.match(/^_+(.+?)(?:_Fallback)?_[a-f0-9]{5,}$/i);
  return (nextFont ? nextFont[1] : first).replace(/_/g, ' ');
}

/** The configured tracking token for a letter-spacing in em (Tailwind's scale unless configured). */
export const trackingToken = (em: number): string | null => getXRayConfig().tracking.find((t) => Math.abs(em - t.em) < 0.004)?.name ?? null;

export interface TypeInfo {
  family: string;
  /** The full computed font stack, so a specimen can be set in it. */
  stack: string;
  weight: number;
  size: number;
  /** null when the line height is `normal` — never on the grid. */
  leading: number | null;
  /** Letter spacing in em. */
  tracking: number;
  trackingToken: string | null;
  transform: string;
}

export function typeInfo(_el: Element, cs: CSSStyleDeclaration): TypeInfo {
  const size = num(cs.fontSize);
  const weight = num(cs.fontWeight) || 400;
  const ls = cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing);
  const tracking = size ? Math.round((ls / size) * 1000) / 1000 : 0;
  const family = prettyFamily(cs.fontFamily);
  return {
    family,
    stack: cs.fontFamily,
    weight,
    size,
    leading: cs.lineHeight === 'normal' ? null : num(cs.lineHeight),
    tracking,
    trackingToken: trackingToken(tracking),
    transform: cs.textTransform,
  };
}

/** Sets text itself (not just through children) — so its type is worth showing. */
export const hasOwnText = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());

// ── Colour ──────────────────────────────────────────────────────────────────

export interface Swatch {
  hex: string;
  /** 0–1; below 1 the colour is translucent. */
  alpha: number;
  /** Token names that resolve to exactly this colour, semantic first. */
  tokens: string[];
}

export interface ColourInfo {
  text: Swatch;
  /** What the text actually sits on: translucent layers composited down. */
  background: Swatch & { overImage: boolean };
  border: Swatch | null;
  contrast: { ratio: number; large: boolean; aa: boolean; aaa: boolean } | null;
}

const PAGE_CANVAS: RGBA = { r: 255, g: 255, b: 255, a: 1 };

export function effectiveBackground(el: Element): { colour: RGBA; overImage: boolean } {
  const layers: RGBA[] = [];
  let overImage = false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const c = parseColor(cs.backgroundColor);
    if (c && c.a > 0) layers.push(c);
    if (c && c.a >= 1) break;
    if (cs.backgroundImage !== 'none') overImage = true;
  }
  const colour = layers.reduceRight<RGBA>((acc, layer) => over(layer, acc), PAGE_CANVAS);
  return { colour, overImage };
}

const swatch = (c: RGBA, index: Map<string, string[]>): Swatch => ({
  hex: toHex(c),
  alpha: Math.round(c.a * 100) / 100,
  tokens: index.get(colourKey(c)) ?? (c.a < 1 ? [] : (index.get(colourKey({ ...c, a: 1 })) ?? [])),
});

// ── The whole reading ───────────────────────────────────────────────────────

/** Everything the dock shows and the spec copies about one element. */
export interface Inspection {
  name: string;
  /** The React component (or CSS-module file) it came from. */
  component: string | null;
  selector: string;
  /** Ancestors outermost first, ending with the element itself. */
  crumbs: string[];
  width: number;
  height: number;
  layout: string;
  margin: Sides;
  padding: Sides;
  border: Sides;
  gap: { row: number; column: number } | null;
  /** Resolved grid track sizes, px. */
  tracks: { columns: number[]; rows: number[] } | null;
  /** Edge-to-edge distance to the nearest sibling on each side. */
  space: Partial<Record<'above' | 'below' | 'left' | 'right', number>>;
  /** The gaps between its children. */
  children: { axis: 'x' | 'y'; value: number }[];
  type: TypeInfo | null;
  colour: ColourInfo;
  pinned: boolean;
  /** Pinned ↔ hovered, when both are set. */
  between: { axis: 'x' | 'y'; value: number }[] | null;
  /** The spacing reading the Spacing tab and the canvas share. */
  spacing?: SpacingReading;
}

/** `264px 264px 264px` → [264, 264, 264]; `none` → []. */
export const tracksOf = (template: string): number[] =>
  template === 'none' ? [] : (template.match(/-?[\d.]+px/g) ?? []).map((t) => num(t));

export function colourInfo(el: Element, cs: CSSStyleDeclaration, index: Map<string, string[]>, withContrast: boolean): ColourInfo {
  const text = parseColor(cs.color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const bg = effectiveBackground(el);
  const borderWidth = num(cs.borderTopWidth) + num(cs.borderRightWidth) + num(cs.borderBottomWidth) + num(cs.borderLeftWidth);
  const border = borderWidth > 0 ? parseColor(cs.borderTopColor) : null;
  const ink = over(text, bg.colour);
  const ratio = contrastRatio(ink, bg.colour);
  return {
    text: swatch(text, index),
    background: { ...swatch(bg.colour, index), overImage: bg.overImage },
    border: border && border.a > 0 ? swatch(border, index) : null,
    contrast: withContrast ? { ratio: Math.round(ratio * 100) / 100, ...wcag(ratio, num(cs.fontSize), num(cs.fontWeight) || 400) } : null,
  };
}
