/**
 * X-ray's canvas renderer. Every function draws in CSS pixels on a context
 * already scaled for the device; colours come from the configured palette
 * (custom properties or plain colours), resolved once (and again on a theme
 * change) into a Palette.
 */
import { getXRayConfig, paletteCss } from './config.js';
import { formatPx, rhythmFit, type Box, type Measure } from './measure.js';
import { inset, outset, type Sides } from './inspect.js';
import { contrastRatio, parseColor } from './colour.js';
import type { Issue } from './audit.js';

export interface Palette {
  content: string;
  padding: string;
  margin: string;
  border: string;
  frame: string;
  off: string;
  line: string;
  wash: string;
  panel: string;
  onPanel: string;
  onPanelMuted: string;
  font: string;
}

/**
 * Canvas can't read CSS variables, so the probe resolves each palette role.
 * The probe sits inside the dock, so custom properties set on the page or
 * on the dock both apply.
 */
export function resolvePalette(probe: HTMLElement): Palette {
  const palette = getXRayConfig().palette;
  const read = (role: Exclude<keyof Palette, 'font'>) => {
    probe.style.color = paletteCss(role, palette);
    return getComputedStyle(probe).color;
  };
  const resolved = {
    content: read('content'),
    padding: read('padding'),
    margin: read('margin'),
    border: read('border'),
    frame: read('frame'),
    off: read('off'),
    line: read('line'),
    wash: read('wash'),
    panel: read('panel'),
    onPanel: read('onPanel'),
    onPanelMuted: read('onPanelMuted'),
    font: '',
  };
  probe.style.fontFamily = paletteCss('font', palette);
  resolved.font = getComputedStyle(probe).fontFamily || 'monospace';
  probe.style.color = '';
  probe.style.fontFamily = '';
  return resolved;
}

export const LABEL_PX = 13; // labels never go below 13px
export const RULER = 24; // the rulers' thickness
const PILL_H = 20;

/** A rounded rectangle path; square where the browser lacks roundRect (iOS 15). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
const PILL_PAD = 6;
const TICK = 4;

/** Text that reads on `bg`: the panel ink or the panel itself, whichever contrasts more. */
export function inkOn(bg: string, pal: Palette): string {
  const b = parseColor(bg);
  const light = parseColor(pal.onPanel);
  const dark = parseColor(pal.panel);
  if (!b || !light || !dark) return pal.onPanel;
  return contrastRatio(b, light) >= contrastRatio(b, dark) ? pal.onPanel : pal.panel;
}

export function setFont(ctx: CanvasRenderingContext2D, pal: Palette, weight = 600) {
  ctx.font = `${weight} ${LABEL_PX}px ${pal.font}`;
  ctx.textBaseline = 'middle';
}

export function makeHatch(ctx: CanvasRenderingContext2D, colour: string): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 6;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.strokeStyle = colour;
  t.globalAlpha = 0.5;
  t.beginPath();
  t.moveTo(0, 6);
  t.lineTo(6, 0);
  t.stroke();
  return ctx.createPattern(tile, 'repeat');
}

export type Part = { text: string; muted?: boolean };

// ── Label layout ────────────────────────────────────────────────────────────
// While a frame's labels are open, every pill claims its box. A later pill
// that would land on one slides along its own line (a vertical measure's
// label moves up or down, a horizontal one's left or right) to the first
// free spot; if there's none, an optional label is dropped instead of piling
// on. Draw the important labels first.

let claimed: Box[] | null = null;
const CLEAR = 2;
const hits = (a: Box, b: Box) => a.left < b.right + CLEAR && a.right + CLEAR > b.left && a.top < b.bottom + CLEAR && a.bottom + CLEAR > b.top;

export function beginLabels() {
  claimed = [];
}

export function endLabels() {
  claimed = null;
}

export interface Placement {
  /** The axis the label may slide along to stay clear. */
  slide?: 'x' | 'y';
  /** Drop the label rather than overlap another. */
  optional?: boolean;
}

/**
 * A label pill. A halo of the page colour knocks it out of whatever it sits
 * on, the way Figma's measurement labels read on any canvas.
 */
export function pill(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  cx: number,
  cy: number,
  parts: Part[],
  bg: string,
  ink: string,
  align: 'center' | 'left' | 'right' = 'center',
  place: Placement = {},
): Box | null {
  const widths = parts.map((p) => ctx.measureText(p.text).width);
  const w = Math.ceil(widths.reduce((a, b) => a + b, 0) + PILL_PAD * 2);
  let x = Math.round(align === 'center' ? cx - w / 2 : align === 'right' ? cx - w : cx);
  let y = Math.round(cy - PILL_H / 2);
  if (claimed) {
    const step = place.slide === 'x' ? w + 4 : PILL_H + 3;
    const offsets = [0, 1, -1, 2, -2, 3, -3].map((k) => k * step);
    const at = (d: number): Box =>
      place.slide === 'x' ? { left: x + d, right: x + d + w, top: y, bottom: y + PILL_H } : { left: x, right: x + w, top: y + d, bottom: y + d + PILL_H };
    const free = offsets.map(at).find((b) => !claimed!.some((c) => hits(b, c)));
    if (!free && place.optional) return null;
    if (free) {
      x = free.left;
      y = free.top;
    }
    claimed.push({ left: x, top: y, right: x + w, bottom: y + PILL_H });
  }
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = pal.wash;
  ctx.beginPath();
  roundRect(ctx, x - 1.5, y - 1.5, w + 3, PILL_H + 3, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = bg;
  ctx.beginPath();
  roundRect(ctx, x, y, w, PILL_H, 5);
  ctx.fill();
  let tx = x + PILL_PAD;
  parts.forEach((p, i) => {
    ctx.globalAlpha = p.muted ? 0.68 : 1;
    ctx.fillStyle = ink;
    ctx.fillText(p.text, tx, y + PILL_H / 2 + 0.5);
    tx += widths[i];
  });
  ctx.globalAlpha = 1;
  return { left: x, top: y, right: x + w, bottom: y + PILL_H };
}

/** A spacing value: red when vertical and off the rhythm, named when it's a step. */
export function valuePill(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, value: number, vertical: boolean, bg: string = pal.panel, place: Placement = {}) {
  const fit = vertical ? rhythmFit(value) : null;
  if (fit?.fit === 'off') return pill(ctx, pal, cx, cy, [{ text: formatPx(value) }], pal.off, inkOn(pal.off, pal), 'center', place);
  const parts: Part[] = [{ text: formatPx(value) }];
  if (fit?.fit === 'token' && fit.name !== '0') parts.push({ text: ` ${fit.name}`, muted: true });
  return pill(ctx, pal, cx, cy, parts, bg, inkOn(bg, pal), 'center', place);
}

const rect = (ctx: CanvasRenderingContext2D, b: Box) => ctx.rect(b.left, b.top, b.right - b.left, b.bottom - b.top);

function ring(ctx: CanvasRenderingContext2D, outer: Box, inner: Box, colour: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.beginPath();
  rect(ctx, outer);
  rect(ctx, inner);
  ctx.fill('evenodd');
}

/** Every layer's box, as one faint wireframe — what you see, not every div. */
export function drawOutlines(ctx: CanvasRenderingContext2D, pal: Palette, rects: readonly DOMRect[], w: number, h: number) {
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = pal.content;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of rects) {
    if (r.bottom < 0 || r.right < 0 || r.top > h || r.left > w) continue;
    ctx.rect(Math.round(r.left) + 0.5, Math.round(r.top) + 0.5, Math.max(0, Math.round(r.width) - 1), Math.max(0, Math.round(r.height) - 1));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Margin, border, padding and content, DevTools-style, each band labelled. */
export function drawBoxModel(ctx: CanvasRenderingContext2D, pal: Palette, box: Box, m: Sides, b: Sides, p: Sides, labels: number) {
  const margin = outset(box, m);
  const padding = inset(box, b);
  const content = inset(padding, p);
  ring(ctx, margin, box, pal.margin, 0.28);
  ring(ctx, box, padding, pal.border, 0.45);
  ring(ctx, padding, content, pal.padding, 0.28);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = pal.content;
  ctx.fillRect(content.left, content.top, content.right - content.left, content.bottom - content.top);
  ctx.globalAlpha = 1;
  if (labels <= 0) return;

  // Padding labels on the centre lines, margin labels a third along, so a
  // thin band of each doesn't stack one pill on the other.
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const mx = box.left + (box.right - box.left) / 3;
  const my = box.top + (box.bottom - box.top) / 3;
  const label = (value: number, x: number, y: number, vertical: boolean, colour: string) => {
    if (Math.abs(value) >= 0.5) valuePill(ctx, pal, x, y, value, vertical, colour);
  };
  ctx.save();
  ctx.globalAlpha = labels;
  label(m.top, mx, (margin.top + box.top) / 2, true, pal.margin);
  label(m.bottom, mx, (box.bottom + margin.bottom) / 2, true, pal.margin);
  label(m.left, (margin.left + box.left) / 2, my, false, pal.margin);
  label(m.right, (box.right + margin.right) / 2, my, false, pal.margin);
  label(p.top, cx, (padding.top + content.top) / 2, true, pal.padding);
  label(p.bottom, cx, (content.bottom + padding.bottom) / 2, true, pal.padding);
  label(p.left, (padding.left + content.left) / 2, cy, false, pal.padding);
  label(p.right, (content.right + padding.right) / 2, cy, false, pal.padding);
  ctx.restore();
}

/** A dimension line with end ticks, its gap hatched, and its value. */
export interface MeasureStyle {
  /** Line colour (default: the page's ink). */
  colour?: string;
  /** Pill fill (default: the panel). */
  pill?: string;
  /** Flag vertical values off the rhythm (default true). Optical
   *  measurements to letters aren't expected to sit on it. */
  flag?: boolean;
  /** Drop the number rather than overlap another label. */
  optional?: boolean;
}

export function drawMeasure(ctx: CanvasRenderingContext2D, pal: Palette, hatch: CanvasPattern | null, m: Measure, alpha: number, style: MeasureStyle = {}) {
  const colour = style.colour ?? pal.line;
  if (alpha <= 0) return;
  ctx.save();
  const vertical = m.axis === 'y';
  if (hatch && m.span && m.value > 0.5) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hatch;
    const [s0, s1] = m.span;
    if (vertical) ctx.fillRect(s0, m.from, s1 - s0, m.to - m.from);
    else ctx.fillRect(m.from, s0, m.to - m.from, s1 - s0);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const at = Math.round(m.at) + 0.5;
  const f = Math.round(m.from) + 0.5;
  const t = Math.round(m.to) - 0.5;
  if (vertical) {
    ctx.moveTo(at, m.from);
    ctx.lineTo(at, m.to);
    ctx.moveTo(at - TICK, f);
    ctx.lineTo(at + TICK + 1, f);
    ctx.moveTo(at - TICK, t);
    ctx.lineTo(at + TICK + 1, t);
  } else {
    ctx.moveTo(m.from, at);
    ctx.lineTo(m.to, at);
    ctx.moveTo(f, at - TICK);
    ctx.lineTo(f, at + TICK + 1);
    ctx.moveTo(t, at - TICK);
    ctx.lineTo(t, at + TICK + 1);
  }
  ctx.stroke();
  if (m.guide) {
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const g = Math.round(m.guide.at) + 0.5;
    if (vertical) {
      ctx.moveTo(m.guide.from, g);
      ctx.lineTo(m.guide.to, g);
    } else {
      ctx.moveTo(g, m.guide.from);
      ctx.lineTo(g, m.guide.to);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const mid = (m.from + m.to) / 2;
  const flag = style.flag ?? true;
  const place: Placement = { slide: vertical ? 'y' : 'x', optional: style.optional };
  if (vertical) valuePill(ctx, pal, m.at, mid, m.value, flag, style.pill, place);
  else valuePill(ctx, pal, mid, m.at, m.value, false, style.pill, place);
  ctx.restore();
}

/**
 * Each line of text: its line box (what the rhythm counts) faintly, the
 * baseline solid, the cap height dashed and the x-height dotted — where the
 * letters really sit inside the box. The first two lines get their
 * baseline-to-baseline step.
 */
export function drawTextLines(ctx: CanvasRenderingContext2D, pal: Palette, lines: readonly { left: number; right: number; baseline: number; capTop: number; xTop: number; lineTop: number; lineBottom: number }[], alpha: number, h: number) {
  if (alpha <= 0 || !lines.length) return;
  ctx.save();
  for (const l of lines) {
    if (l.lineBottom < 0 || l.lineTop > h) continue;
    const w = l.right - l.left;
    ctx.globalAlpha = 0.08 * alpha;
    ctx.fillStyle = pal.content;
    ctx.fillRect(l.left, l.lineTop, w, l.lineBottom - l.lineTop);
    ctx.globalAlpha = 0.18 * alpha;
    ctx.fillStyle = pal.margin;
    ctx.fillRect(l.left, l.capTop, w, l.baseline - l.capTop);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = pal.margin;
    ctx.lineWidth = 1;
    const line = (y: number, dash: number[], a: number) => {
      ctx.globalAlpha = a * alpha;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(l.left - 4, Math.round(y) + 0.5);
      ctx.lineTo(l.right + 4, Math.round(y) + 0.5);
      ctx.stroke();
    };
    line(l.baseline, [], 1);
    line(l.capTop, [4, 3], 0.85);
    line(l.xTop, [1, 3], 0.6);
  }
  ctx.setLineDash([]);
  ctx.restore();
  // The lines are named in the dock's legend, not here: labels on the
  // canvas fought the spacing numbers for room.
  if (lines.length > 1) {
    const step = lines[1].baseline - lines[0].baseline;
    const x = Math.max(...lines.slice(0, 2).map((l) => l.right)) + 8 + 72;
    drawMeasure(ctx, pal, null, { axis: 'y', from: lines[0].baseline, to: lines[1].baseline, at: x, value: step }, alpha, { colour: pal.margin });
  }
}

/** Dimensions-style: rays from the pointer to the nearest edge each way. */
export function drawRays(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, rays: { up: number | null; down: number | null; left: number | null; right: number | null }, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = pal.off;
  ctx.lineWidth = 1;
  const px = Math.round(x) + 0.5;
  const py = Math.round(y) + 0.5;
  const ends = { up: rays.up ?? 0, down: rays.down ?? h, left: rays.left ?? 0, right: rays.right ?? w };
  ctx.beginPath();
  ctx.moveTo(px, ends.up);
  ctx.lineTo(px, ends.down);
  ctx.moveTo(ends.left, py);
  ctx.lineTo(ends.right, py);
  for (const yy of [ends.up, ends.down]) {
    ctx.moveTo(px - 5, Math.round(yy) + 0.5);
    ctx.lineTo(px + 6, Math.round(yy) + 0.5);
  }
  for (const xx of [ends.left, ends.right]) {
    ctx.moveTo(Math.round(xx) + 0.5, py - 5);
    ctx.lineTo(Math.round(xx) + 0.5, py + 6);
  }
  ctx.stroke();
  ctx.fillStyle = pal.off;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const ink = inkOn(pal.off, pal);
  const label = (cx: number, cy: number, v: number | null) => v !== null && Math.abs(v) >= 0.5 && pill(ctx, pal, cx, cy, [{ text: formatPx(v) }], pal.off, ink);
  label(x, (ends.up + y) / 2, rays.up === null ? null : y - rays.up);
  label(x, (y + ends.down) / 2, rays.down === null ? null : rays.down - y);
  label((ends.left + x) / 2, y, rays.left === null ? null : x - rays.left);
  label((x + ends.right) / 2, y, rays.right === null ? null : rays.right - x);
  // The whole space the pointer sits in, both ways.
  const spanY = rays.up !== null && rays.down !== null ? rays.down - rays.up : null;
  const spanX = rays.left !== null && rays.right !== null ? rays.right - rays.left : null;
  const parts = [spanX !== null && `${formatPx(spanX)} wide`, spanY !== null && `${formatPx(spanY)} tall`].filter(Boolean) as string[];
  if (parts.length) pill(ctx, pal, x + 12, y + 22, [{ text: parts.join(' · ') }], pal.panel, pal.onPanel, 'left');
}

/** Token coverage: on-system layers faintly green, literals outlined red. */
export function drawCoverage(ctx: CanvasRenderingContext2D, pal: Palette, items: readonly { rect: DOMRect; ok: boolean }[], w: number, h: number) {
  ctx.save();
  for (const { rect: r, ok } of items) {
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    ctx.globalAlpha = ok ? 0.5 : 0.95;
    ctx.strokeStyle = ok ? pal.padding : pal.off;
    ctx.lineWidth = ok ? 1 : 1.5;
    ctx.strokeRect(Math.round(r.left) + 0.5, Math.round(r.top) + 0.5, Math.max(0, Math.round(r.width) - 1), Math.max(0, Math.round(r.height) - 1));
    if (!ok) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = pal.off;
      ctx.fillRect(r.left, r.top, r.width, r.height);
    }
  }
  ctx.restore();
}

/** Accessibility findings: each node outlined, numbered by rule. */
export function drawA11yMarkers(ctx: CanvasRenderingContext2D, pal: Palette, items: readonly { rect: DOMRect; n: number; active: boolean }[], w: number, h: number) {
  const ink = inkOn(pal.border, pal);
  for (const { rect: r, n, active } of items) {
    if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
    ctx.save();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.setLineDash(active ? [] : [4, 3]);
    ctx.strokeRect(r.left + 0.75, r.top + 0.75, r.width - 1.5, r.height - 1.5);
    ctx.restore();
    pill(ctx, pal, r.left, r.top - 2, [{ text: String(n) }], pal.border, ink, 'left');
  }
}

/** The element's edges carried across the window — Figma's alignment guides. */
export function drawGuides(ctx: CanvasRenderingContext2D, pal: Palette, b: Box, w: number, h: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = 0.5 * alpha;
  ctx.strokeStyle = pal.content;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  for (const x of [b.left, b.right]) {
    const px = Math.round(x) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, b.top);
    ctx.moveTo(px, b.bottom);
    ctx.lineTo(px, h);
  }
  for (const y of [b.top, b.bottom]) {
    const py = Math.round(y) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(b.left, py);
    ctx.moveTo(b.right, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();
  ctx.restore();
}

/** Resolved grid tracks, DevTools-style: each column and row edge dashed. */
export function drawTracks(ctx: CanvasRenderingContext2D, pal: Palette, content: Box, cols: number[], rows: number[], colGap: number, rowGap: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = 0.75 * alpha;
  ctx.strokeStyle = pal.content;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  let x = content.left;
  cols.forEach((size) => {
    for (const edge of [x, x + size]) {
      ctx.moveTo(Math.round(edge) + 0.5, content.top);
      ctx.lineTo(Math.round(edge) + 0.5, content.bottom);
    }
    x += size + colGap;
  });
  let y = content.top;
  rows.forEach((size) => {
    for (const edge of [y, y + size]) {
      ctx.moveTo(content.left, Math.round(edge) + 0.5);
      ctx.lineTo(content.right, Math.round(edge) + 0.5);
    }
    y += size + rowGap;
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * The page frame: content capped at the configured max width, set in by the
 * gutter. Gutters are tinted; the content edges are lines.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, pal: Palette, viewportW: number, h: number, pageMax: number, gutter: number, top: number) {
  const inset = Math.max(gutter, (viewportW - pageMax) / 2 + gutter);
  const left = inset;
  const right = viewportW - inset;
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = pal.frame;
  ctx.fillRect(0, 0, left, h);
  ctx.fillRect(right, 0, viewportW - right, h);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = pal.frame;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const x of [left, right]) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  ctx.stroke();
  ctx.restore();
  const y = top + PILL_H;
  const ink = inkOn(pal.frame, pal);
  const gutterX = Math.max(left / 2, Math.min(left - 18, top + 18));
  pill(ctx, pal, gutterX, y, [{ text: formatPx(gutter) }], pal.frame, ink);
  pill(ctx, pal, viewportW - gutterX, y, [{ text: formatPx(gutter) }], pal.frame, ink);
  pill(ctx, pal, (left + right) / 2, y, [{ text: formatPx(right - left) }, { text: ` content · max ${formatPx(pageMax)} · gutter ${formatPx(gutter)}`, muted: true }], pal.frame, ink);
}

/** Numbered markers for the audit's findings that are on screen. */
export function drawAuditMarkers(ctx: CanvasRenderingContext2D, pal: Palette, issues: readonly Issue[], active: number, sx: number, sy: number, w: number, h: number) {
  const ink = inkOn(pal.off, pal);
  issues.forEach((issue, i) => {
    const x = issue.x - sx;
    const y = issue.y - sy;
    if (x < -40 || y < -40 || x > w + 40 || y > h + 40) return;
    if (issue.measure) {
      const m = { ...issue.measure, from: issue.measure.from - sy, to: issue.measure.to - sy, at: issue.measure.at - sx };
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = pal.off;
      ctx.lineWidth = i === active ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(m.at) + 0.5, m.from);
      ctx.lineTo(Math.round(m.at) + 0.5, m.to);
      ctx.stroke();
      ctx.restore();
    }
    const box = pill(ctx, pal, x, y, [{ text: String(i + 1) }], pal.off, ink, issue.kind === 'overflow' ? 'center' : issue.measure ? 'center' : 'left');
    if (i === active && box) {
      ctx.save();
      ctx.strokeStyle = pal.off;
      ctx.lineWidth = 2;
      ctx.beginPath();
      roundRect(ctx, box.left - 3, box.top - 3, box.right - box.left + 6, box.bottom - box.top + 6, 8);
      ctx.stroke();
      ctx.restore();
    }
  });
}

/** The two-part name tag: component in accent, element and size on the panel. */
export function drawNameTag(ctx: CanvasRenderingContext2D, pal: Palette, b: Box, name: string, component: string | null, w: number, minY: number) {
  const size = `  ${formatPx(b.right - b.left)} × ${formatPx(b.bottom - b.top)}`;
  const compW = component ? ctx.measureText(component).width + PILL_PAD * 2 + 2 : 0;
  const nameW = ctx.measureText(name + size).width + PILL_PAD * 2;
  const total = compW + nameW;
  const above = b.top - PILL_H / 2 - 6;
  const y = above - PILL_H / 2 >= minY ? above : b.bottom + PILL_H / 2 + 6;
  let x = Math.min(Math.max(b.left, 4), w - total - 4);
  if (component) {
    pill(ctx, pal, x, y, [{ text: component }], pal.content, inkOn(pal.content, pal), 'left');
    x += compW;
  }
  pill(ctx, pal, x, y, [{ text: name }, { text: size, muted: true }], pal.panel, pal.onPanel, 'left');
}

/** Shift-drag measuring box (Polypane's area measure). */
export function drawMeasureBox(ctx: CanvasRenderingContext2D, pal: Palette, b: Box) {
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = pal.content;
  ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.content;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.left + 0.75, b.top + 0.75, b.right - b.left - 1.5, b.bottom - b.top - 1.5);
  ctx.restore();
  valuePill(ctx, pal, (b.left + b.right) / 2, b.top - PILL_H / 2 - 6, b.right - b.left, false);
  valuePill(ctx, pal, b.right + 6 + 24, (b.top + b.bottom) / 2, b.bottom - b.top, true);
}

/**
 * Rulers on the top and left edges, in page coordinates, ticked on the
 * rhythm: every unit, longer every minor, longest every major, labelled
 * every two majors (12 · 24 · 72 · 144 with the defaults). The inspected
 * element's extent and the pointer show on both.
 */
export function drawRulers(ctx: CanvasRenderingContext2D, pal: Palette, w: number, h: number, sx: number, sy: number, target: Box | null, cursor: { x: number; y: number } | null) {
  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = pal.panel;
  ctx.fillRect(0, 0, w, RULER);
  ctx.fillRect(0, RULER, RULER, h - RULER);

  if (target) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = pal.content;
    ctx.fillRect(Math.max(RULER, target.left), 0, Math.max(0, target.right - Math.max(RULER, target.left)), RULER);
    ctx.fillRect(0, Math.max(RULER, target.top), RULER, Math.max(0, target.bottom - Math.max(RULER, target.top)));
  }

  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = pal.onPanel;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const { unit, minor, major } = getXRayConfig().rhythm;
  const labelEvery = major * 2;
  const on = (doc: number, step: number) => step > 0 && Math.abs(doc / step - Math.round(doc / step)) < 1e-6;
  const tick = (doc: number) => (on(doc, major) ? 10 : on(doc, minor) ? 6 : 3);
  for (let doc = Math.ceil((sx + RULER) / unit) * unit; doc - sx < w; doc += unit) {
    const x = Math.round(doc - sx) + 0.5;
    ctx.moveTo(x, RULER);
    ctx.lineTo(x, RULER - tick(doc));
  }
  for (let doc = Math.ceil((sy + RULER) / unit) * unit; doc - sy < h; doc += unit) {
    const y = Math.round(doc - sy) + 0.5;
    ctx.moveTo(RULER, y);
    ctx.lineTo(RULER - tick(doc), y);
  }
  ctx.stroke();

  ctx.globalAlpha = 0.68;
  ctx.fillStyle = pal.onPanel;
  ctx.font = `500 ${LABEL_PX}px ${pal.font}`;
  ctx.textBaseline = 'middle';
  for (let doc = Math.ceil((sx + RULER) / labelEvery) * labelEvery; doc - sx < w; doc += labelEvery) {
    ctx.fillText(String(doc), doc - sx + 3, RULER / 2 - 2);
  }
  for (let doc = Math.ceil((sy + RULER) / labelEvery) * labelEvery; doc - sy < h; doc += labelEvery) {
    ctx.save();
    ctx.translate(RULER / 2 - 2, doc - sy - 3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(doc), 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.content;
  ctx.lineWidth = 1;
  if (target) {
    ctx.beginPath();
    for (const x of [target.left, target.right]) {
      if (x < RULER) continue;
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, RULER);
    }
    for (const y of [target.top, target.bottom]) {
      if (y < RULER) continue;
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(RULER, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
  if (cursor) {
    ctx.strokeStyle = pal.onPanel;
    ctx.beginPath();
    ctx.moveTo(Math.round(cursor.x) + 0.5, 0);
    ctx.lineTo(Math.round(cursor.x) + 0.5, RULER);
    ctx.moveTo(0, Math.round(cursor.y) + 0.5);
    ctx.lineTo(RULER, Math.round(cursor.y) + 0.5);
    ctx.stroke();
  }
  ctx.restore();
  setFont(ctx, pal);
}
