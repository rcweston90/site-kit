/**
 * Breakpoint compare: the same element's spacing at every breakpoint, read
 * from the real page. Each width loads the page in an off-screen frame (the
 * only way to get true layout, not a guess from media queries), finds the
 * element by its path from <body>, and reads it. X-ray doesn't mount inside
 * those frames (XRay.tsx checks).
 */
import { childGaps, neighbours } from './measure.js';
import { num } from './inspect.js';
import { getXRayConfig } from './config.js';

/** The widths the compare loads: the base width, then each breakpoint's min-width. */
export function breakpointWidths(): [string, number][] {
  const { baseName, baseWidth, breakpoints } = getXRayConfig();
  return [[baseName, baseWidth], ...breakpoints.map((b): [string, number] => [b.name, b.min])];
}

export interface BreakpointRow {
  label: string;
  width: number;
  /** null when the element isn't there at this width. */
  values: {
    size: [number, number];
    padding: [number, number, number, number];
    margin: [number, number, number, number];
    gap: [number, number] | null;
    above: number | null;
    below: number | null;
    between: number[];
    font: [number, number | null] | null;
  } | null;
}

/** One step down: the nth child with this tag (X-ray's own nodes don't count). */
export type Step = { id: string } | { tag: string; n: number };

/**
 * A path to `el` that survives in another copy of the page: from the nearest
 * ancestor with an id (or <body>), the nth element of each tag. X-ray's own
 * elements are skipped — they aren't in the frames.
 */
export function pathTo(el: Element, skip: (n: Element) => boolean): Step[] {
  const path: Step[] = [];
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n.id) {
      path.unshift({ id: n.id });
      return path;
    }
    const parent = n.parentElement;
    if (!parent) return [];
    const same = Array.from(parent.children).filter((c) => c.tagName === n!.tagName && !skip(c));
    path.unshift({ tag: n.tagName, n: same.indexOf(n) });
  }
  return path;
}

function follow(doc: Document, path: Step[]): Element | null {
  let n: Element | null = doc.body;
  for (const step of path) {
    if (!n) return null;
    if ('id' in step) n = doc.getElementById(step.id);
    else n = Array.from(n.children).filter((c) => c.tagName === step.tag)[step.n] ?? null;
  }
  return n;
}

function read(win: Window, el: Element): NonNullable<BreakpointRow['values']> {
  const cs = win.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const four = (p: string) => ['top', 'right', 'bottom', 'left'].map((s) => num(cs.getPropertyValue(`${p}-${s}`))) as [number, number, number, number];
  const sibs = el.parentElement ? Array.from(el.parentElement.children).map((c) => c.getBoundingClientRect()) : [];
  const i = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : -1;
  const n = i >= 0 ? neighbours(sibs[i], sibs) : {};
  const kids = Array.from(el.children)
    .map((c) => c.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0);
  const hasText = Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.textContent?.trim());
  const isBox = cs.display.includes('flex') || cs.display.includes('grid');
  return {
    size: [r.width, r.height],
    padding: four('padding'),
    margin: four('margin'),
    gap: isBox ? [num(cs.rowGap), num(cs.columnGap)] : null,
    above: n.above !== undefined ? r.top - sibs[n.above].bottom : null,
    below: n.below !== undefined ? sibs[n.below].top - r.bottom : null,
    between: childGaps(kids)
      .filter((m) => m.axis === 'y')
      .map((m) => m.value),
    font: hasText ? [num(cs.fontSize), cs.lineHeight === 'normal' ? null : num(cs.lineHeight)] : null,
  };
}

async function measureAt(url: string, width: number, height: number, path: Step[]): Promise<BreakpointRow['values']> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:-${width + 200}px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none;visibility:hidden;`;
  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  frame.src = url;
  document.body.appendChild(frame);
  try {
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))]);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return null;
    await Promise.race([doc.fonts?.ready, new Promise((r) => setTimeout(r, 3000))]);
    // Let hydration and entrance motion settle.
    await new Promise((r) => setTimeout(r, 900));
    const el = follow(doc, path);
    return el ? read(win, el) : null;
  } catch {
    return null;
  } finally {
    frame.remove();
  }
}

/** Reads `el` at every breakpoint, two frames at a time. */
export async function compareBreakpoints(el: Element, skip: (n: Element) => boolean, onRow: (row: BreakpointRow) => void): Promise<void> {
  const path = pathTo(el, skip);
  const url = new URL(window.location.href);
  url.searchParams.delete('xray');
  url.searchParams.delete('rhythm');
  const height = window.innerHeight;
  const queue = breakpointWidths();
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [label, width] = next;
      onRow({ label, width, values: await measureAt(url.toString(), width, height, path) });
    }
  };
  await Promise.all([worker(), worker()]);
}
