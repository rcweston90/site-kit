'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { setRhythmGrid, useRhythmGrid } from './RhythmGrid.js';
import { useLocalStorageState } from './useLocalStorageState.js';
import { getXRayConfig, useXRayConfig } from './config.js';
import { showInTopLayer } from './store.js';
import { raysFrom, type Box } from './measure.js';
import { tokenNamer } from './colour.js';
import { breakpointOf, colourInfo, componentOf, crumbLabel, describe, num, selectorFor, sides, tracksOf, typeInfo, type Inspection, type Side } from './inspect.js';
import { boxAround, collectLayers, createLayerCache, layerAt, roleOf } from './layers.js';
import { readSpacing, redlines, tallyValues, type Layer, type MeasureMode, type Redlines, type SpacingKind, type SpacingResult } from './spacing.js';
import { textLines, inkOf } from './text.js';
import { runAudit, tally, groupIssues, KIND_LABEL, type Issue } from './audit.js';
import { groupCoverage, runCoverage, type CoverageResult } from './coverage.js';
import { createNudger, type NudgeProp } from './nudge.js';
import { compareBreakpoints, type BreakpointRow } from './responsive.js';
import { buildSpec } from './spec.js';
import { snapshot } from './snapshot.js';
import type { A11yIssue } from './a11y.js';
import {
  beginLabels,
  endLabels,
  drawA11yMarkers,
  drawAuditMarkers,
  drawBoxModel,
  drawCoverage,
  drawFrame,
  drawGuides,
  drawMeasure,
  drawMeasureBox,
  drawNameTag,
  drawOutlines,
  drawRays,
  drawRulers,
  drawTextLines,
  makeHatch,
  resolvePalette,
  setFont,
  RULER,
  type MeasureStyle,
  type Palette,
} from './draw.js';
import { Dock, DOCK_DEFAULTS, TABS, type A11yView, type AuditView, type CoverageView, type DockOptions, type NudgeView, type RedlineView } from './Dock.js';
import { styles } from './classes.js';
import type { XRayInspectorProps } from './XRay.types.js';

/** What the dock can ask of the canvas loop. */
interface InspectorApi {
  redraw: () => void;
  pinCrumb: (index: number) => void;
  selectIssue: (index: number) => void;
  selectA11y: (rule: number, node: number) => void;
  selectCoverage: (index: number) => void;
  rescan: () => void;
  scanTokens: () => void;
  scanA11y: () => void;
  compare: () => void;
  copy: () => void;
  snapshot: () => void;
  nudgeReset: () => void;
  nudgeCopy: () => void;
  redline: () => void;
  reset: () => void;
  reconfigure: () => void;
}
const noop = () => {};
const IDLE: InspectorApi = {
  redraw: noop,
  pinCrumb: noop,
  selectIssue: noop,
  selectA11y: noop,
  selectCoverage: noop,
  rescan: noop,
  scanTokens: noop,
  scanA11y: noop,
  compare: noop,
  copy: noop,
  snapshot: noop,
  nudgeReset: noop,
  nudgeCopy: noop,
  redline: noop,
  reset: noop,
  reconfigure: noop,
};

/** Measurements longer than this are listed, not drawn. */
const MAX_DRAWN = 240;

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function visibleSibling(el: Element, dir: 'previousElementSibling' | 'nextElementSibling') {
  for (let s = el[dir]; s; s = s[dir]) if (visible(s)) return s;
  return null;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const toBox = (r: DOMRect | Box): Box => ({ top: r.top, right: r.right, bottom: r.bottom, left: r.left });
const shift = (b: Box, dx: number, dy: number): Box => ({ top: b.top + dy, right: b.right + dx, bottom: b.bottom + dy, left: b.left + dx });
const distance = (a: Box, b: Box) => Math.abs(a.top - b.top) + Math.abs(a.left - b.left) + Math.abs(a.right - b.right) + Math.abs(a.bottom - b.bottom);

/** The page frame's two numbers (configured as CSS lengths), resolved through the probe. */
function frameOf(probe: HTMLElement) {
  const { max, gutter } = getXRayConfig().frame;
  probe.style.width = gutter;
  probe.style.maxWidth = max;
  const cs = getComputedStyle(probe);
  const frame = { gutter: num(cs.width), pageMax: num(cs.maxWidth) || 1440 };
  probe.style.width = '';
  probe.style.maxWidth = '';
  return frame;
}

/** How each kind of spacing draws: inside in padding green, text-to-box in
 *  accent blue, the rest in ink — letters' spacing never flagged red. */
function styleFor(kind: SpacingKind, mode: MeasureMode, pal: Palette): MeasureStyle {
  const flag = mode === 'box';
  if (kind === 'inside') return { colour: pal.padding, pill: pal.padding, flag };
  if (kind === 'toBox') return { colour: pal.content, pill: pal.content, flag: false };
  if (kind === 'compare') return { colour: pal.margin, flag };
  return { flag };
}

/**
 * XRayInspector — the part of X-ray that loads on demand.
 *
 * Spacing first: hover snaps to what you see (text, media, painted boxes),
 * and the canvas shows the space inside it, around it, between its children
 * and — for text — from the letters to the box they sit in. Box mode
 * measures layout boxes; Text mode measures letters (cap height to
 * baseline). Hold ⌥ for rays from the pointer to the nearest edges; E
 * nudges spacing live. The dock reads it all out, with type, colour (by
 * token), the rhythm audit, token coverage and an accessibility check as
 * context. Clicks pin instead of acting.
 */
export default function XRayInspector({ onExit, pathname, axe }: XRayInspectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const config = useXRayConfig();
  const [opts, setOpts] = useLocalStorageState<DockOptions>('xray-dock-3', DOCK_DEFAULTS);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [coverage, setCoverage] = useState<CoverageView | null>(null);
  const [a11y, setA11y] = useState<A11yView | null>(null);
  const [activeIssue, setActiveIssue] = useState(-1);
  const [breakpoints, setBreakpoints] = useState<{ rows: BreakpointRow[]; running: boolean; name: string } | null>(null);
  const [nudge, setNudge] = useState<NudgeView>({ prop: null, changes: [] });
  const [redlineView, setRedlineView] = useState<RedlineView | null>(null);
  // Devices that can't hover start in tap language; a first mouse move switches it.
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches);
  const [viewport, setViewport] = useState({ width: 0, breakpoint: 'base' });
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const grid = useRhythmGrid();

  // The canvas loop reads these through refs; React state stays the dock's.
  const optsRef = useRef(opts);
  const helpRef = useRef(help);
  const gridRef = useRef(grid);
  const onExitRef = useRef(onExit);
  const axeRef = useRef(axe);
  const api = useRef<InspectorApi>(IDLE);

  const set = useCallback((patch: Partial<DockOptions>) => setOpts((o) => ({ ...DOCK_DEFAULTS, ...o, ...patch })), [setOpts]);

  useEffect(() => {
    optsRef.current = { ...DOCK_DEFAULTS, ...opts };
    helpRef.current = help;
    gridRef.current = grid;
    onExitRef.current = onExit;
    axeRef.current = axe;
    api.current.redraw();
  }, [opts, help, grid, onExit, axe]);

  // A new configuration (rhythm, palette, frame) re-reads what depends on it.
  useEffect(() => {
    api.current.reconfigure();
  }, [config]);

  // Context tabs scan when they open; a client navigation starts over.
  useEffect(() => {
    if (opts.tab === 'audit') api.current.rescan();
    if (opts.tab === 'a11y') api.current.scanA11y();
  }, [opts.tab]);
  useEffect(() => {
    if (opts.tokens) api.current.scanTokens();
  }, [opts.tokens]);
  useEffect(() => {
    api.current.reset();
  }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dock = dockRef.current;
    const probe = probeRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !dock || !probe || !ctx) return;

    // Top layer: above the nav, players, modals and the grid without a z-index.
    showInTopLayer(canvas);
    showInTopLayer(dock);

    // X-ray's own surfaces, and anything a host marks as part of its trigger.
    const isUi = (el: Element) => canvas.contains(el) || dock.contains(el) || !!el.closest('[data-xray-toggle], [data-xray-ui]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cache = createLayerCache();
    const nudger = createNudger();
    let pal = resolvePalette(probe);
    let hatch = makeHatch(ctx, pal.line);
    let tokens = tokenNamer(probe);
    let frame = frameOf(probe);
    const maxHeight = () => window.innerHeight * 1.5;

    let hovered: Element | null = null;
    let pinned: Element | null = null;
    let compare: Element | null = null;
    let cursor: { x: number; y: number } | null = null;
    let alt = false;
    let nudgeProp: NudgeProp | null = null;
    // Redlines: every spacing inside the pinned component, at once.
    let redline = false;
    let redlineCache: { key: string; root: Element; result: Redlines } | null = null;
    // Touch has no hover: the second tap measures to the first instead of re-pinning.
    let lastPointer = window.matchMedia('(hover: none)').matches ? 'touch' : 'mouse';
    let drag: { x0: number; y0: number; x1: number; y1: number } | null = null; // document coords
    let dragged = false;
    let issues: Issue[] = [];
    let auditTruncated = false;
    let active = -1;
    let cover: CoverageResult[] = [];
    let a11yIssues: A11yIssue[] = [];
    let a11yActive: { rule: number; node: number } | null = null;

    // What doesn't follow the pointer — the dim, the frame, outlines, the
    // overlays — is drawn into a layer that's only redrawn when the page
    // moves or changes. Hovering redraws the rest.
    const base = document.createElement('canvas');
    const baseCtx = base.getContext('2d');
    let baseDirty = true;
    let generation = 0;
    let layers: Layer[] = [];
    const inkCache = new Map<Element, Box | null>();

    // The highlight glides between elements (document coords, so scrolling
    // never lags); measurements fade in once it lands.
    let shown: Box | null = null;
    let shownFor: Element | null = null;
    let settledAt = 0;
    let lastFrame = 0;
    let frameId = 0;

    // The spacing reading is cached until the target, mode or page moves.
    let reading: { key: string; target: Element; other: Element | null; result: SpacingResult } | null = null;
    // The dock's copy of it is handed to React at most every 50ms.
    let publishedKey = '';
    let crumbEls: Element[] = [];
    let pending: Inspection | null = null;
    let publishTimer = 0;
    let readFor: Element | null = null;
    let readOther: Element | null = null;
    let readMode: MeasureMode | null = null;
    let readAt = 0;

    const publish = (next: Inspection | null) => {
      const key = next ? JSON.stringify(next) : '';
      if (key === publishedKey) return;
      publishedKey = key;
      pending = next;
      if (!publishTimer) {
        publishTimer = window.setTimeout(() => {
          publishTimer = 0;
          setInspection(pending);
        }, 50);
      }
    };

    const spacingFor = (target: Element, other: Element | null): SpacingResult => {
      const mode = optsRef.current.mode;
      const key = `${generation}|${mode}|${pinned === target}`;
      if (reading && reading.key === key && reading.target === target && reading.other === other) return reading.result;
      const result = readSpacing(target, other, pinned === target, { layers, cache, mode, maxHeight: maxHeight() });
      reading = { key, target, other, result };
      return result;
    };

    const redlinesFor = (root: Element): Redlines => {
      const mode = optsRef.current.mode;
      const key = `${generation}|${mode}`;
      if (redlineCache && redlineCache.key === key && redlineCache.root === root) return redlineCache.result;
      const result = redlines(root, { layers, cache, mode, maxHeight: maxHeight() });
      redlineCache = { key, root, result };
      publishRedline(root, result);
      return result;
    };

    let redlineShown = '';
    const publishRedline = (root: Element | null, spec: Redlines | null) => {
      const view =
        root && spec
          ? {
              name: `${roleOf(root, cache.get(root))} · ${describe(root)}`,
              count: spec.measures.length,
              vertical: tallyValues(spec.measures, 'y'),
              horizontal: tallyValues(spec.measures, 'x'),
            }
          : null;
      const key = JSON.stringify(view);
      if (key === redlineShown) return;
      redlineShown = key;
      setRedlineView(view);
    };

    const inspect = (target: Element, result: SpacingResult): Inspection => {
      const cs = getComputedStyle(target);
      const chain: Element[] = [];
      for (let n: Element | null = target; n && n !== document.documentElement && chain.length < 5; n = n.parentElement) chain.unshift(n);
      crumbEls = chain;
      const s = result.reading;
      const isBox = cs.display.includes('flex') || cs.display.includes('grid');
      return {
        name: describe(target),
        component: componentOf(target),
        selector: selectorFor(target),
        crumbs: chain.map(crumbLabel),
        width: s.width,
        height: s.height,
        layout: cs.display,
        margin: s.margin,
        padding: s.padding,
        border: sides(cs, 'border'),
        gap: isBox ? { row: num(cs.rowGap), column: num(cs.columnGap) } : null,
        tracks: cs.display.includes('grid') ? { columns: tracksOf(cs.gridTemplateColumns), rows: tracksOf(cs.gridTemplateRows) } : null,
        space: { above: s.around.top, below: s.around.bottom, left: s.around.left, right: s.around.right },
        children: s.between,
        type: s.text ? typeInfo(target, cs) : null,
        colour: colourInfo(target, cs, tokens(target), !!s.text),
        pinned: s.pinned,
        between: s.compare,
        spacing: s,
      };
    };

    /** A text layer's letters, cached for this page position. */
    const inkFor = (l: Layer): Box => {
      if (!l.flags.text || l.flags.paints) return toBox(l.rect);
      if (!inkCache.has(l.el)) inkCache.set(l.el, inkOf(textLines(l.el)));
      return inkCache.get(l.el) ?? toBox(l.rect);
    };

    const drawBase = (w: number, h: number, dpr: number, top: number) => {
      if (!baseCtx) return;
      const o = optsRef.current;
      baseDirty = false;
      generation++;
      inkCache.clear();
      layers = collectLayers(cache, isUi, maxHeight());
      base.width = canvas.width;
      base.height = canvas.height;
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseCtx.clearRect(0, 0, w, h);
      setFont(baseCtx, pal);
      if (o.dim) {
        baseCtx.globalAlpha = 0.72;
        baseCtx.fillStyle = pal.wash;
        baseCtx.fillRect(0, 0, w, h);
        baseCtx.globalAlpha = 1;
      }
      if (o.frame) drawFrame(baseCtx, pal, document.documentElement.clientWidth, h, frame.pageMax, frame.gutter, top);
      if (o.outlines) drawOutlines(baseCtx, pal, layers.map((l) => l.rect), w, h);
      if (o.tokens && cover.length) {
        const rects = new Map(layers.map((l) => [l.el, l.rect]));
        drawCoverage(
          baseCtx,
          pal,
          cover.flatMap((c) => (rects.has(c.el) ? [{ rect: rects.get(c.el)!, ok: c.ok }] : [])),
          w,
          h,
        );
      }
      if (o.tab === 'audit' && o.auditView === 'rhythm' && issues.length) drawAuditMarkers(baseCtx, pal, issues, active, window.scrollX, window.scrollY, w, h);
      if (o.tab === 'a11y' && a11yIssues.length) {
        drawA11yMarkers(
          baseCtx,
          pal,
          a11yIssues.flatMap((rule, ri) =>
            rule.nodes.map((n, ni) => ({ rect: n.el.getBoundingClientRect(), n: ri + 1, active: !!a11yActive && a11yActive.rule === ri && a11yActive.node === ni })),
          ),
          w,
          h,
        );
      }
    };

    const draw = (now: number) => {
      frameId = 0;
      const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
      lastFrame = now;
      const o = optsRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const sx = window.scrollX;
      const sy = window.scrollY;
      const top = o.rulers ? RULER : 0;
      let again = false;

      if (baseDirty || base.width !== canvas.width || base.height !== canvas.height) drawBase(w, h, dpr, top);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setFont(ctx, pal);

      if (pinned && !pinned.isConnected) pinned = null;
      if (hovered && !hovered.isConnected) hovered = null;
      if (compare && !compare.isConnected) compare = null;

      // Hold ⌥: rays from the pointer to the nearest edge each way.
      if (alt && cursor && !nudgeProp && !drag) {
        const spanning = layers.filter((l) => (cursor!.x >= l.rect.left && cursor!.x <= l.rect.right) || (cursor!.y >= l.rect.top && cursor!.y <= l.rect.bottom));
        const boxes = spanning.map((l) => (o.mode === 'text' ? inkFor(l) : toBox(l.rect)));
        drawRays(ctx, pal, cursor.x, cursor.y, raysFrom(cursor.x, cursor.y, boxes), w, h);
        if (o.rulers) drawRulers(ctx, pal, w, h, sx, sy, null, cursor);
        return;
      }

      const target = pinned ?? (drag ? null : hovered);
      const other = pinned && hovered && hovered !== pinned && !drag ? hovered : pinned && compare ? compare : null;

      let targetBox: Box | null = null;
      if (target) {
        const r = target.getBoundingClientRect();
        const real = shift(toBox(r), sx, sy);
        if (!shown || shownFor === null || reduced.matches) {
          shown = real;
          settledAt = now;
        } else if (shownFor !== target || distance(shown, real) > 0.5) {
          const k = 1 - Math.exp(-dt / 55);
          shown = {
            top: shown.top + (real.top - shown.top) * k,
            right: shown.right + (real.right - shown.right) * k,
            bottom: shown.bottom + (real.bottom - shown.bottom) * k,
            left: shown.left + (real.left - shown.left) * k,
          };
          if (distance(shown, real) < 0.5) {
            shown = real;
            settledAt = now;
          } else {
            settledAt = Infinity;
            again = true;
          }
        }
        shownFor = target;
        const box = shift(shown, -sx, -sy);
        targetBox = box;
        const settled = settledAt !== Infinity;
        const fade = reduced.matches ? 1 : settled ? Math.min(1, (now - settledAt) / 160) : 0;
        if (fade < 1) again = true;

        let named = false;
        const cs = getComputedStyle(target);
        // The CSS box: padding and margin tinted, the numbers in the dock.
        drawBoxModel(ctx, pal, box, sides(cs, 'margin'), sides(cs, 'border'), sides(cs, 'padding'), 0);
        if (o.guides && fade > 0) drawGuides(ctx, pal, box, w, h, fade);

        if (settled) {
          beginLabels();
          const result = spacingFor(target, other);
          if (other) {
            const hr = other.getBoundingClientRect();
            ctx.save();
            ctx.strokeStyle = pal.margin;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(hr.left + 0.75, hr.top + 0.75, hr.width - 1.5, hr.height - 1.5);
            ctx.restore();
          }
          if (result.box) {
            ctx.save();
            ctx.globalAlpha = 0.8 * fade;
            ctx.strokeStyle = pal.content;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(result.box.left + 0.5, result.box.top + 0.5, result.box.right - result.box.left - 1, result.box.bottom - result.box.top - 1);
            ctx.restore();
          }
          drawTextLines(ctx, pal, result.lines, fade, h);
          drawNameTag(ctx, pal, box, nudgeProp ? `Nudging ${nudgeProp}` : roleOf(target, cache.get(target)), null, w, top + 4);
          named = true;
          if (redline && pinned === target) {
            // The whole component's spec: insets first, gaps after, and a gap's
            // number gives way rather than land on another.
            const spec = redlinesFor(target);
            ctx.save();
            ctx.globalAlpha = 0.55 * fade;
            ctx.strokeStyle = pal.padding;
            ctx.setLineDash([3, 3]);
            spec.boxes.forEach((b) => ctx.strokeRect(b.left + 0.5, b.top + 0.5, b.right - b.left - 1, b.bottom - b.top - 1));
            ctx.restore();
            for (const kind of ['inside', 'between'] as const) {
              spec.measures
                .filter((m) => m.kind === kind)
                .forEach(({ measure }) =>
                  drawMeasure(ctx, pal, kind === 'between' ? hatch : null, measure, fade, { ...styleFor(kind, o.mode, pal), optional: true }),
                );
            }
          } else {
            // Long reaches (a neighbour across the page) stay in the table; on
            // the canvas they'd only be lines through everything in between.
            // Order is priority: what was asked for first, the context last.
            const ORDER: SpacingKind[] = ['compare', 'inside', 'toBox', 'around', 'between'];
            for (const k of ORDER) {
              result.measures
                .filter(({ kind }) => kind === k)
                .forEach(({ kind, measure }) => {
                  if (kind !== 'between' && kind !== 'compare' && Math.abs(measure.value) > MAX_DRAWN) return;
                  drawMeasure(ctx, pal, kind === 'between' || kind === 'around' ? hatch : null, measure, fade, {
                    ...styleFor(kind, o.mode, pal),
                    optional: kind === 'between' || kind === 'around',
                  });
                });
            }
          }
          endLabels();

          if (target !== readFor || other !== readOther || o.mode !== readMode || now - readAt > 300) {
            readFor = target;
            readOther = other;
            readMode = o.mode;
            readAt = now;
            publish(inspect(target, result));
          }
        }

        // The element itself, outlined and named in plain words.
        ctx.save();
        ctx.strokeStyle = nudgeProp ? pal.margin : pal.content;
        ctx.lineWidth = pinned === target ? 2 : 1.5;
        if (nudgeProp) ctx.setLineDash([6, 3]);
        ctx.strokeRect(box.left + 0.75, box.top + 0.75, box.right - box.left - 1.5, box.bottom - box.top - 1.5);
        ctx.restore();
        if (!named) drawNameTag(ctx, pal, box, nudgeProp ? `Nudging ${nudgeProp}` : roleOf(target, cache.get(target)), null, w, top + 4);
      } else {
        shown = null;
        shownFor = null;
        readFor = readOther = null;
        publish(null);
      }

      if (drag) {
        const b: Box = {
          left: Math.min(drag.x0, drag.x1) - sx,
          right: Math.max(drag.x0, drag.x1) - sx,
          top: Math.min(drag.y0, drag.y1) - sy,
          bottom: Math.max(drag.y0, drag.y1) - sy,
        };
        if (b.right - b.left > 2 || b.bottom - b.top > 2) drawMeasureBox(ctx, pal, b);
      }

      if (o.rulers) drawRulers(ctx, pal, w, h, sx, sy, targetBox, cursor);
      if (again) schedule();
    };

    const schedule = () => {
      if (!frameId) frameId = requestAnimationFrame(draw);
    };
    const dirty = () => {
      baseDirty = true;
      reading = null;
      schedule();
    };

    const toast = (text: string) => setToast(text);

    const pinTo = (el: Element | null, opts: { scroll?: boolean; compareTo?: Element | null } = {}) => {
      if (!el || isUi(el) || el === document.documentElement) return;
      pinned = el;
      compare = opts.compareTo ?? null;
      hovered = null;
      reading = null;
      if (opts.scroll) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
      schedule();
    };

    // ── Context: audit, coverage, accessibility ───────────────────────────
    const publishAudit = () => {
      const indexed = new Map(issues.map((issue, index) => [issue, index]));
      const groups = groupIssues(issues, (issue) => issue.other ? `${crumbLabel(issue.el)} → ${crumbLabel(issue.other)}` : crumbLabel(issue.el));
      setAudit({
        count: issues.length,
        truncated: auditTruncated,
        tally: tally(issues),
        groups: groups.map((group) => ({
          label: group.label,
          kind: KIND_LABEL[group.kind],
          values: group.values,
          items: group.issues.map((issue) => ({
            index: indexed.get(issue) ?? 0,
            where: issue.other ? `${crumbLabel(issue.el)} → ${crumbLabel(issue.other)}` : crumbLabel(issue.el),
          })),
        })),
      });
      setActiveIssue(active);
    };

    const selectIssue = (index: number) => {
      if (!issues.length) return;
      active = ((index % issues.length) + issues.length) % issues.length;
      const issue = issues[active];
      pinTo(issue.el, { scroll: true, compareTo: issue.other ?? null });
      setActiveIssue(active);
      dirty();
    };

    const scanTokens = () => {
      if (!layers.length) layers = collectLayers(cache, isUi, maxHeight());
      cover = runCoverage(layers, tokens, frame.gutter);
      const reviewed = cover.filter((c) => c.status !== 'system');
      const indexed = new Map(reviewed.map((result, index) => [result, index]));
      setCoverage({
        total: cover.length,
        intentional: cover.filter((c) => c.status === 'intentional').length,
        literals: cover.filter((c) => c.status === 'literal').length,
        groups: groupCoverage(cover).map((group) => ({
          status: group.status,
          source: group.source,
          misses: group.misses,
          items: group.items.map((item) => ({ index: indexed.get(item) ?? 0, where: `${roleOf(item.el, cache.get(item.el))} · ${describe(item.el)}` })),
        })),
      });
      dirty();
    };

    const scanA11y = async () => {
      const load = axeRef.current;
      if (!load) {
        a11yIssues = [];
        setA11y({ running: false, rules: [], unavailable: true });
        return;
      }
      setA11y({ running: true, rules: [] });
      try {
        const { runA11y } = await import('./a11y.js');
        a11yIssues = await runA11y(load, [canvas, dock]);
        setA11y({
          running: false,
          rules: a11yIssues.map((r) => ({
            id: r.id,
            impact: r.impact,
            help: r.help,
            helpUrl: r.helpUrl,
            nodes: r.nodes.map((n) => ({ where: `${roleOf(n.el, cache.get(n.el))} · ${describe(n.el)}`, summary: n.summary })),
          })),
        });
      } catch {
        setA11y({ running: false, rules: [], error: true });
      }
      dirty();
    };

    // ── Actions ───────────────────────────────────────────────────────────
    const currentTarget = () => pinned ?? hovered;

    const copy = async () => {
      const target = currentTarget();
      if (!target) return toast('Pin an element to copy its spec');
      const other = pinned && hovered && hovered !== pinned ? hovered : pinned && compare ? compare : null;
      const spec = buildSpec(inspect(target, readSpacing(target, other, pinned === target, { layers, cache, mode: optsRef.current.mode, maxHeight: maxHeight() })), {
        path: window.location.pathname,
        viewport: [document.documentElement.clientWidth, window.innerHeight],
        breakpoint: breakpointOf(document.documentElement.clientWidth),
      });
      const changes = nudger.summary();
      try {
        await navigator.clipboard.writeText(changes ? `${spec}\n- Nudged (not saved):\n${changes.replace(/^/gm, '  ')}` : spec);
        toast('Spec copied — paste it anywhere');
      } catch {
        toast('Couldn’t reach the clipboard');
      }
    };

    const publishNudge = () => setNudge({ prop: nudgeProp, changes: nudger.list().map(({ name, property, from, to }) => ({ name, property, from, to })) });

    const doNudge = (side: Side, delta: number) => {
      const target = currentTarget();
      if (!target || !nudgeProp) return;
      nudger.nudge(target, nudgeProp, side, delta);
      publishNudge();
      dirty();
    };

    const toggleRedline = () => {
      if (!redline) {
        const target = currentTarget();
        if (!target) return toast('Hover or pin a component, then R for its redlines');
        if (pinned !== target) pinTo(target);
        redline = true;
        if (optsRef.current.tab !== 'spacing') set({ tab: 'spacing', collapsed: false });
      } else {
        redline = false;
        publishRedline(null, null);
      }
      schedule();
    };

    const reconfigure = () => {
      pal = resolvePalette(probe);
      hatch = makeHatch(ctx, pal.line);
      frame = frameOf(probe);
      reading = null;
      redlineCache = null;
      const width = document.documentElement.clientWidth;
      setViewport({ width, breakpoint: breakpointOf(width) });
      if (optsRef.current.tab === 'audit') api.current.rescan();
      if (optsRef.current.tokens) api.current.scanTokens();
      dirty();
    };

    api.current = {
      redraw: dirty,
      reconfigure,
      redline: toggleRedline,
      pinCrumb: (i: number) => pinTo(crumbEls[i] ?? null, { scroll: true }),
      selectIssue,
      selectA11y: (rule: number, node: number) => {
        const el = a11yIssues[rule]?.nodes[node]?.el;
        if (!el) return;
        a11yActive = { rule, node };
        pinTo(el, { scroll: true });
        dirty();
      },
      selectCoverage: (index: number) => {
        const miss = cover.filter((c) => c.status !== 'system')[index];
        if (miss) pinTo(miss.el, { scroll: true });
      },
      rescan: () => {
        const result = runAudit(isUi);
        issues = result.issues;
        auditTruncated = result.truncated;
        if (active >= issues.length) active = -1;
        publishAudit();
        dirty();
      },
      scanTokens,
      scanA11y: () => void scanA11y(),
      compare: () => {
        const target = currentTarget();
        if (!target) return toast('Pin an element first');
        const rows: BreakpointRow[] = [];
        const name = `${roleOf(target, cache.get(target))} · ${describe(target)}`;
        setBreakpoints({ rows: [], running: true, name });
        void compareBreakpoints(target, isUi, (row) => {
          rows.push(row);
          rows.sort((a, b) => a.width - b.width);
          setBreakpoints({ rows: [...rows], running: true, name });
        }).then(() => setBreakpoints({ rows: [...rows], running: false, name }));
      },
      copy: () => void copy(),
      snapshot: () => {
        void snapshot(window.location.pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home').then((r) => {
          if (r === 'copied') toast('Snapshot copied and saved');
          else if (r === 'saved') toast('Snapshot saved');
          else if (r === 'unsupported') toast('This browser can’t capture the tab');
        });
      },
      nudgeReset: () => {
        nudger.reset();
        publishNudge();
        dirty();
      },
      nudgeCopy: async () => {
        const s = nudger.summary();
        if (!s) return toast('Nothing nudged yet');
        try {
          await navigator.clipboard.writeText(s);
          toast('Changes copied as classes');
        } catch {
          toast('Couldn’t reach the clipboard');
        }
      },
      reset: () => {
        pinned = hovered = compare = null;
        issues = [];
        cover = [];
        a11yIssues = [];
        active = -1;
        a11yActive = null;
        nudger.reset();
        nudgeProp = null;
        publishNudge();
        setBreakpoints(null);
        setCoverage(null);
        setA11y(null);
        const o = optsRef.current;
        // Let the new page lay out before scanning it.
        window.setTimeout(() => {
          if (o.tab === 'audit') api.current.rescan();
          if (o.tab === 'a11y') api.current.scanA11y();
          if (o.tokens) api.current.scanTokens();
        }, 500);
        publishAudit();
        dirty();
      },
    } as InspectorApi;

    // ── Input ──────────────────────────────────────────────────────────────
    /**
     * What the pointer is over, as a designer would point at it: the nearest
     * layer — but for a label alone in a small painted box (a pill, button,
     * chip, badge) the box itself, so its padding to the label shows. ↓
     * walks in to the label.
     */
    const componentAt = (from: Element): Element | null => {
      const t = layerAt(from, cache, isUi, maxHeight());
      const f = t ? cache.get(t) : null;
      if (!t || !f?.text || f.paints) return t;
      const small = (n: Element) => {
        const r = n.getBoundingClientRect();
        return r.height <= 96 && r.width <= 480;
      };
      // A control (link, button, tab) or a small painted box around the label,
      // whichever sits closer to it.
      const control = t.parentElement?.closest('a, button, summary, label, [role="button"], [role="tab"], [role="link"]') ?? null;
      let holder = control && small(control) ? control : null;
      const painter = boxAround(t, cache, 96);
      if (painter && small(painter) && (!holder || holder.contains(painter))) holder = painter;
      if (!holder) return t;
      const all = layers.length ? layers : collectLayers(cache, isUi, maxHeight());
      const texts = all.filter((l) => l.flags.text && holder!.contains(l.el));
      return texts.length === 1 && texts[0].el === t ? holder : t;
    };

    const onMove = (e: PointerEvent) => {
      cursor = { x: e.clientX, y: e.clientY };
      alt = e.altKey;
      if (drag) {
        drag.x1 = e.clientX + window.scrollX;
        drag.y1 = e.clientY + window.scrollY;
        dragged = true;
        return schedule();
      }
      if (e.pointerType === 'touch') return;
      const t = e.target instanceof Element && !isUi(e.target) ? componentAt(e.target) : null;
      if (t !== hovered) hovered = t;
      schedule();
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      hovered = null;
      cursor = null;
      schedule();
    };
    // Clicks pin instead of acting: no navigation, no menus opening under
    // the measurement. The dock is the only live control.
    const block = (e: Event) => {
      if (e.target instanceof Element && isUi(e.target)) return false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return true;
    };
    // iOS Safari only sends a click for a tap on something it thinks is
    // clickable — a link, a button, an element with its own click handler.
    // A tap on plain text or a box sends none to a window listener, so on an
    // iPhone nothing would pin. Taps are read from the pointer events
    // instead, and the click that sometimes follows is swallowed.
    let tapStart: { x: number; y: number; t: number } | null = null;
    let tapHandledAt = -Infinity;

    const onDown = (e: PointerEvent) => {
      if (!block(e)) return;
      if (e.pointerType !== lastPointer) {
        lastPointer = e.pointerType;
        setTouch(lastPointer === 'touch');
      }
      tapStart = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, t: performance.now() };
      if (e.shiftKey && e.button === 0) {
        const x = e.clientX + window.scrollX;
        const y = e.clientY + window.scrollY;
        drag = { x0: x, y0: y, x1: x, y1: y };
        dragged = false;
      } else if (!e.shiftKey) drag = null;
    };
    const onUp = (e: PointerEvent) => {
      if (!block(e)) return;
      if (drag && !dragged) drag = null;
      const start = tapStart;
      tapStart = null;
      if (start && e.pointerType !== 'mouse' && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10 && performance.now() - start.t < 800) {
        tapHandledAt = performance.now();
        // The finger's target, or what's under it if the browser retargeted.
        const under = document.elementFromPoint(e.clientX, e.clientY);
        select(under && !isUi(under) ? under : e.target instanceof Element ? e.target : null);
        return;
      }
      schedule();
    };
    const onCancel = () => {
      tapStart = null;
    };
    const onClick = (e: MouseEvent) => {
      if (!block(e)) return;
      // Mousedown is blocked, so focus would stay on the last dock control
      // clicked — and Space would press it again. Let it go.
      if (document.activeElement instanceof HTMLElement && dock.contains(document.activeElement)) document.activeElement.blur();
      if (dragged) {
        dragged = false;
        return;
      }
      // Already handled as a tap.
      if (performance.now() - tapHandledAt < 700) return;
      select(e.target instanceof Element ? e.target : null);
    };
    const select = (raw: Element | null) => {
      if (document.activeElement instanceof HTMLElement && dock.contains(document.activeElement)) document.activeElement.blur();
      const t = raw ? (componentAt(raw) ?? (raw === document.documentElement ? null : raw)) : null;
      // A finger can't hover: with something pinned, a tap elsewhere measures
      // to it; tapping the pinned element again lets it go.
      if (lastPointer === 'touch' && pinned && t && t !== pinned && !redline) {
        compare = t;
        reading = null;
        return schedule();
      }
      if (t && t === pinned) {
        pinned = compare = null;
        redline = false;
        publishRedline(null, null);
        hovered = t;
      } else if (t) pinTo(t);
      if (t) hovered = t;
      schedule();
    };

    const KEYS: Record<string, () => void> = {
      t: () => set({ mode: optsRef.current.mode === 'box' ? 'text' : 'box' }),
      o: () => set({ outlines: !optsRef.current.outlines }),
      l: () => set({ guides: !optsRef.current.guides }),
      r: () => toggleRedline(),
      u: () => set({ rulers: !optsRef.current.rulers }),
      f: () => set({ frame: !optsRef.current.frame }),
      d: () => set({ dim: !optsRef.current.dim }),
      k: () => set({ tokens: !optsRef.current.tokens }),
      g: () => setRhythmGrid(!gridRef.current),
      c: () => void copy(),
      s: () => api.current.snapshot(),
      b: () => api.current.compare(),
      e: () => {
        if (!currentTarget()) return toast('Pin an element to nudge its spacing');
        nudgeProp = nudgeProp ? null : 'padding';
        publishNudge();
        schedule();
      },
      '?': () => setHelp((v) => !v),
      n: () => {
        if (optsRef.current.tab !== 'audit') set({ tab: 'audit', collapsed: false });
        selectIssue(active + 1);
      },
      N: () => {
        if (optsRef.current.tab !== 'audit') set({ tab: 'audit', collapsed: false });
        selectIssue(active - 1);
      },
    };
    TABS.forEach((tab, i) => (KEYS[String(i + 1)] = () => set({ tab, collapsed: false })));

    const SIDE: Record<string, Side> = { ArrowUp: 'top', ArrowDown: 'bottom', ArrowLeft: 'left', ArrowRight: 'right' };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        alt = true;
        return schedule();
      }
      if (e.metaKey || e.ctrlKey || isTyping(e.target)) return;

      // Nudging: P / M / G pick padding, margin or gap; arrows push that side.
      if (nudgeProp && !e.altKey) {
        const pick: Record<string, NudgeProp> = { p: 'padding', m: 'margin', g: 'gap' };
        if (e.key.toLowerCase() in pick) {
          e.preventDefault();
          nudgeProp = pick[e.key.toLowerCase()];
          publishNudge();
          return schedule();
        }
      }
      if (nudgeProp && e.key in SIDE) {
        e.preventDefault();
        const side = SIDE[e.key];
        const vertical = side === 'top' || side === 'bottom';
        const { unit, horizontal } = getXRayConfig().rhythm;
        const step = e.shiftKey ? 1 : vertical ? unit : horizontal;
        return doNudge(side, e.altKey ? -step : step);
      }
      if (e.altKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (helpRef.current) setHelp(false);
        else if (nudgeProp) {
          nudgeProp = null;
          publishNudge();
        } else if (drag) drag = null;
        else if (redline) {
          redline = false;
          publishRedline(null, null);
        } else if (pinned) pinned = compare = null;
        else return onExitRef.current();
        return schedule();
      }
      const inTabs = e.target instanceof Element && !!e.target.closest('[role="tablist"]');
      const moves: Record<string, () => Element | null> = {
        ArrowUp: () => pinned!.parentElement,
        ArrowDown: () => Array.from(pinned!.children).find(visible) ?? null,
        ArrowLeft: () => visibleSibling(pinned!, 'previousElementSibling'),
        ArrowRight: () => visibleSibling(pinned!, 'nextElementSibling'),
      };
      if (e.key in moves) {
        if (!pinned || inTabs) return;
        e.preventDefault();
        const to = moves[e.key]();
        if (!to || to === document.documentElement) return;
        pinTo(to);
        to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      const action = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
      if (!action || (e.target instanceof Element && e.target.closest('button') && (e.key === ' ' || e.key === 'Enter'))) return;
      e.preventDefault();
      action();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      alt = false;
      schedule();
    };
    const onBlur = () => {
      alt = false;
      schedule();
    };

    const onResize = () => {
      frame = frameOf(probe);
      const width = document.documentElement.clientWidth;
      setViewport({ width, breakpoint: breakpointOf(width) });
      dirty();
    };

    const capture = { capture: true } as const;
    const passive = { capture: true, passive: true } as const;
    window.addEventListener('pointermove', onMove, passive);
    document.addEventListener('mouseout', onLeave, passive);
    window.addEventListener('pointerdown', onDown, capture);
    window.addEventListener('pointerup', onUp, capture);
    window.addEventListener('pointercancel', onCancel, capture);
    window.addEventListener('click', onClick, capture);
    const blocked = ['mousedown', 'mouseup', 'dblclick', 'dragstart', 'auxclick'] as const;
    blocked.forEach((type) => window.addEventListener(type, block, capture));
    window.addEventListener('keydown', onKey, capture);
    window.addEventListener('keyup', onKeyUp, capture);
    window.addEventListener('blur', onBlur);
    document.addEventListener('scroll', dirty, passive);
    window.addEventListener('resize', onResize);
    document.addEventListener('transitionend', dirty, passive);
    document.addEventListener('animationend', dirty, passive);
    reduced.addEventListener('change', dirty);

    // Layout moves without telling anyone (fonts, lazy media, carousels):
    // redraw on any change outside the X-ray's own UI, and twice a second.
    const mo = new MutationObserver((records) => {
      let page = false;
      for (const rec of records) {
        if (rec.target instanceof Element && isUi(rec.target)) continue;
        page = true;
        if (rec.target instanceof Element) cache.forget(rec.target);
        if (rec.target === document.documentElement && rec.type === 'attributes') {
          pal = resolvePalette(probe);
          hatch = makeHatch(ctx, pal.line);
          tokens = tokenNamer(probe);
          cache.reset();
        }
      }
      if (page) dirty();
    });
    mo.observe(document.documentElement, { attributes: true });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const heartbeat = window.setInterval(dirty, 500);
    const refresh = window.setInterval(() => cache.reset(), 4000);
    onResize();
    try {
      if (window.innerWidth < 640 && localStorage.getItem('xray-dock-3') === null) set({ collapsed: true });
    } catch {
      // no storage — the sheet just opens full
    }
    const o = optsRef.current;
    if (o.tab === 'audit') api.current.rescan();
    if (o.tab === 'a11y') api.current.scanA11y();
    if (o.tokens) api.current.scanTokens();

    return () => {
      window.removeEventListener('pointermove', onMove, passive);
      document.removeEventListener('mouseout', onLeave, passive);
      window.removeEventListener('pointerdown', onDown, capture);
      window.removeEventListener('pointerup', onUp, capture);
      window.removeEventListener('pointercancel', onCancel, capture);
      window.removeEventListener('click', onClick, capture);
      blocked.forEach((type) => window.removeEventListener(type, block, capture));
      window.removeEventListener('keydown', onKey, capture);
      window.removeEventListener('keyup', onKeyUp, capture);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('scroll', dirty, passive);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('transitionend', dirty, passive);
      document.removeEventListener('animationend', dirty, passive);
      reduced.removeEventListener('change', dirty);
      mo.disconnect();
      window.clearInterval(heartbeat);
      window.clearInterval(refresh);
      window.clearTimeout(publishTimer);
      if (frameId) cancelAnimationFrame(frameId);
      // Nudges are a try-on: closing X-ray takes them off.
      nudger.reset();
      api.current = IDLE;
    };
  }, [set]);

  return (
    <>
      <canvas ref={canvasRef} popover="manual" aria-hidden="true" className={styles.overlay} />
      <Dock
        ref={dockRef}
        probeRef={probeRef}
        opts={{ ...DOCK_DEFAULTS, ...opts }}
        set={set}
        inspection={inspection}
        audit={audit}
        coverage={coverage}
        a11y={a11y}
        activeIssue={activeIssue}
        breakpoints={breakpoints}
        nudge={nudge}
        redline={redlineView}
        touch={touch}
        viewport={viewport}
        grid={grid}
        help={help}
        toast={toast}
        onExit={onExit}
        onCopy={() => api.current.copy()}
        onSnapshot={() => api.current.snapshot()}
        onPinCrumb={(i) => api.current.pinCrumb(i)}
        onSelectIssue={(i) => api.current.selectIssue(i)}
        onSelectA11y={(r, n) => api.current.selectA11y(r, n)}
        onSelectCoverage={(i) => api.current.selectCoverage(i)}
        onRescan={() => api.current.rescan()}
        onRescanA11y={() => api.current.scanA11y()}
        onRescanTokens={() => api.current.scanTokens()}
        onCompare={() => api.current.compare()}
        onNudgeReset={() => api.current.nudgeReset()}
        onNudgeCopy={() => api.current.nudgeCopy()}
        onRedline={() => api.current.redline()}
        onToggleHelp={() => setHelp((v) => !v)}
        onToggleGrid={() => setRhythmGrid(!grid)}
      />
    </>
  );
}
