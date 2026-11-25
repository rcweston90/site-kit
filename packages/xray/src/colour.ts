/**
 * Colour maths for X-ray: parse what getComputedStyle hands back, composite
 * translucent layers, WCAG contrast, and name a colour by the page's own
 * custom properties. The pure parts are tested in test/colour.test.ts.
 */

/** sRGB channels 0–255, alpha 0–1. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Computed colours arrive as legacy or space-separated sRGB functions, or `color(srgb …)`. */
export function parseColor(css: string): RGBA | null {
  const s = css.trim().toLowerCase();
  if (!s || s === 'transparent') return s ? { r: 0, g: 0, b: 0, a: 0 } : null;
  const nums = s.match(/-?[\d.]+%?/g);
  if (!nums || nums.length < 3) return null;
  const value = (n: string, scale: number) => (n.endsWith('%') ? (parseFloat(n) / 100) * scale : parseFloat(n));
  if (s.startsWith('color(srgb')) {
    const [r, g, b, a] = nums.map((n) => value(n, 1));
    return { r: r * 255, g: g * 255, b: b * 255, a: a ?? 1 };
  }
  if (s.startsWith('rgb')) {
    const [r, g, b] = nums.slice(0, 3).map((n) => value(n, 255));
    const a = nums[3] === undefined ? 1 : value(nums[3], 1);
    return { r, g, b, a };
  }
  return null;
}

const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n)));

/** `#0055CC` — alpha is reported separately where it matters. */
export function toHex(c: RGBA): string {
  return `#${[c.r, c.g, c.b].map((n) => byte(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** A key that treats two computed colours as the same when they render the same. */
export const colourKey = (c: RGBA) => `${byte(c.r)},${byte(c.g)},${byte(c.b)},${Math.round(c.a * 100)}`;

/** `top` painted over `bottom` (source-over). */
export function over(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

export function luminance(c: RGBA): number {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.2 text contrast: large is ≥ 24px, or ≥ 18.66px at 700+. */
export function wcag(ratio: number, sizePx: number, weight: number) {
  const large = sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
  return { large, aa: ratio >= (large ? 3 : 4.5), aaa: ratio >= (large ? 4.5 : 7) };
}

/**
 * Order token names by how a designer would say them: semantic tokens
 * (`--ink`, `--brand`) first, then Tailwind's semantic aliases
 * (`--color-ink`), then the scale (`--color-blue-600`). Tailwind's
 * internals (`--tw-*`) and X-ray's own (`--xray-*`, `--xr-*`) never count.
 */
export function rankTokens(names: Iterable<string>): string[] {
  const rank = (n: string) => (!n.startsWith('--color-') ? 0 : /-\d+$/.test(n) ? 2 : 1);
  return [...new Set(names)]
    .filter((n) => n.startsWith('--') && !n.startsWith('--tw-') && !n.startsWith('--xray') && !n.startsWith('--xr-'))
    .sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b));
}

/** Every custom property the stylesheets declare, ranked (see rankTokens). */
export function collectTokenNames(): string[] {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          if (prop.startsWith('--')) names.add(prop);
        }
      }
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // cross-origin sheet — not ours to read
    }
  }
  return rankTokens(names);
}

/**
 * Names colours by token in the element's own scope: custom properties
 * inherit, so a section that sets `--card-ink` on its wrapper names
 * its text by that, not just by what `:root` declares. Each raw value is
 * resolved through the probe once and cached; readings are cached per
 * element. Make a new namer when the theme changes.
 */
export function tokenNamer(probe: HTMLElement): (el: Element) => Map<string, string[]> {
  const names = collectTokenNames();
  const keyOf = new Map<string, string | null>();
  const perElement = new WeakMap<Element, Map<string, string[]>>();
  const resolve = (raw: string): string | null => {
    let key = keyOf.get(raw);
    if (key !== undefined) return key;
    key = null;
    if (raw && raw.length <= 120) {
      probe.style.color = '';
      probe.style.color = raw;
      const c = probe.style.color ? parseColor(getComputedStyle(probe).color) : null;
      if (c) key = colourKey(c);
    }
    keyOf.set(raw, key);
    return key;
  };
  return (el) => {
    const cached = perElement.get(el);
    if (cached) return cached;
    const cs = getComputedStyle(el);
    const byColour = new Map<string, string[]>();
    for (const name of names) {
      const key = resolve(cs.getPropertyValue(name).trim());
      if (!key) continue;
      const list = byColour.get(key);
      if (list) list.push(name);
      else byColour.set(key, [name]);
    }
    probe.style.color = '';
    perElement.set(el, byColour);
    return byColour;
  };
}
