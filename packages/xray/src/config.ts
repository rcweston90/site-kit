/**
 * X-ray's configuration: the rhythm it measures against, the palette it
 * draws with, the breakpoints and tracking scale it names things by, and the
 * page frame it overlays. One module holds it; every other file reads it at
 * call time (getXRayConfig), so a change applies on the next frame.
 */
import { useSyncExternalStore } from 'react';

/** A named spacing step: a value your design system has a token for. */
export interface RhythmStep {
  px: number;
  name: string;
}

export interface RhythmConfig {
  /** The finest vertical step. Any multiple of it counts as on the grid. */
  unit: number;
  /** The named steps, smallest first. A value equal to one reads as its name. */
  steps: RhythmStep[];
  /** The baseline grid's minor line spacing and the rulers' middle tick. */
  minor: number;
  /** The baseline grid's heavy line spacing and the rulers' long tick. */
  major: number;
  /** The horizontal scale: horizontal spacing on multiples of this counts as on-system. */
  horizontal: number;
}

/** What `rhythm` accepts: any part of it. Missing parts derive from `unit`. */
export type RhythmInput = Partial<RhythmConfig>;

/**
 * The canvas and panel colours, by role. Each value is a CSS custom property
 * name (`--brand-blue`), resolved on the page, or any CSS colour.
 */
export interface PaletteConfig {
  /** The inspected element, outlines, guides and rulers' highlight. */
  content: string;
  /** Padding tint and inside measurements. */
  padding: string;
  /** Margin tint, text lines and the compared element. */
  margin: string;
  /** Border tint and accessibility markers. */
  border: string;
  /** The page frame overlay. */
  frame: string;
  /** Values off the rhythm, audit markers and pointer rays. */
  off: string;
  /** Distance lines drawn on the page. */
  line: string;
  /** The page colour: label halos and the dim overlay. */
  wash: string;
  /** The panel and label background. */
  panel: string;
  /** Text on the panel. */
  onPanel: string;
  /** Secondary text on the panel. */
  onPanelMuted: string;
  /** Dividers and hover fills on the panel. */
  onPanelDivider: string;
  /** Text on the content colour (the role chip, the selected segment). */
  onContent: string;
  /** The font for labels and the panel (a font-family value or a custom property). */
  font: string;
}

export type PaletteRole = keyof PaletteConfig;

export interface Breakpoint {
  name: string;
  /** min-width, px. */
  min: number;
}

export interface TrackingToken {
  name: string;
  /** letter-spacing in em. */
  em: number;
}

export interface FrameConfig {
  /** The content's maximum width, as a CSS length (custom properties welcome). */
  max: string;
  /** The page's side gutter, as a CSS length. */
  gutter: string;
}

export interface XRayConfig {
  rhythm: RhythmConfig;
  palette: PaletteConfig;
  /** Breakpoints by min-width. Below the smallest is `baseName`. */
  breakpoints: Breakpoint[];
  /** The name for widths under the first breakpoint. */
  baseName: string;
  /** The width the breakpoint compare loads for `baseName`. */
  baseWidth: number;
  /** Letter-spacing tokens, so the Type tab can name what it reads. */
  tracking: TrackingToken[];
  frame: FrameConfig;
}

export interface XRayConfigInput {
  rhythm?: RhythmInput;
  palette?: Partial<PaletteConfig>;
  breakpoints?: Breakpoint[];
  baseName?: string;
  baseWidth?: number;
  tracking?: TrackingToken[];
  frame?: Partial<FrameConfig>;
}

/** The default step names, as multiples of the unit. */
const STEP_MULTIPLES: [number, string][] = [
  [1, 'half'],
  [2, 'minor'],
  [4, 'minor-2'],
  [6, 'major'],
  [12, 'major-2'],
];

/** A full rhythm from any part of one: steps, minor and major follow the unit. */
export function rhythmFrom(input: RhythmInput = {}): RhythmConfig {
  const unit = input.unit && input.unit > 0 ? input.unit : 12;
  const steps = (input.steps ?? STEP_MULTIPLES.map(([k, name]) => ({ px: k * unit, name }))).slice().sort((a, b) => a.px - b.px);
  return {
    unit,
    steps,
    minor: input.minor ?? unit * 2,
    major: input.major ?? unit * 6,
    horizontal: input.horizontal ?? 4,
  };
}

/** The `--xray-*` property each role reads by default, and its fallback. */
export const PALETTE_DEFAULTS: Record<PaletteRole, [variable: string, fallback: string]> = {
  content: ['--xray-content', '#3b82f6'],
  padding: ['--xray-padding', '#22c55e'],
  margin: ['--xray-margin', '#f97316'],
  border: ['--xray-border', '#eab308'],
  frame: ['--xray-frame', '#f97316'],
  off: ['--xray-off', '#dc2626'],
  line: ['--xray-line', '#1f2328'],
  wash: ['--xray-wash', '#ffffff'],
  panel: ['--xray-panel', '#16181d'],
  onPanel: ['--xray-on-panel', '#f4f5f7'],
  onPanelMuted: ['--xray-on-panel-muted', '#a3a8b3'],
  onPanelDivider: ['--xray-on-panel-divider', 'rgba(255, 255, 255, 0.12)'],
  onContent: ['--xray-on-content', '#ffffff'],
  font: ['--xray-font', "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"],
};

/** The internal `--xr-*` property each role feeds in styles.css. */
export const PALETTE_CSS_VARS: Record<PaletteRole, string> = {
  content: '--xr-content',
  padding: '--xr-padding',
  margin: '--xr-margin',
  border: '--xr-border',
  frame: '--xr-frame',
  off: '--xr-off',
  line: '--xr-line',
  wash: '--xr-wash',
  panel: '--xr-panel',
  onPanel: '--xr-on-panel',
  onPanelMuted: '--xr-on-panel-muted',
  onPanelDivider: '--xr-on-panel-divider',
  onContent: '--xr-on-content',
  font: '--xr-font',
};

const ROLES = Object.keys(PALETTE_DEFAULTS) as PaletteRole[];

/** Tailwind's default breakpoints. */
export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { name: 'sm', min: 640 },
  { name: 'md', min: 768 },
  { name: 'lg', min: 1024 },
  { name: 'xl', min: 1280 },
  { name: '2xl', min: 1536 },
];

/** Tailwind's default tracking scale. */
export const DEFAULT_TRACKING: TrackingToken[] = [
  { name: 'tighter', em: -0.05 },
  { name: 'tight', em: -0.025 },
  { name: 'normal', em: 0 },
  { name: 'wide', em: 0.025 },
  { name: 'wider', em: 0.05 },
  { name: 'widest', em: 0.1 },
];

function defaults(): XRayConfig {
  return {
    rhythm: rhythmFrom(),
    palette: Object.fromEntries(ROLES.map((r) => [r, PALETTE_DEFAULTS[r][0]])) as unknown as PaletteConfig,
    breakpoints: DEFAULT_BREAKPOINTS,
    baseName: 'base',
    baseWidth: 390,
    tracking: DEFAULT_TRACKING,
    frame: { max: 'var(--xray-page-max, 1440px)', gutter: 'var(--xray-page-gutter, 24px)' },
  };
}

let current: XRayConfig = defaults();
const listeners = new Set<() => void>();

export const getXRayConfig = (): XRayConfig => current;

/**
 * Change any part of the configuration. Parts you leave out keep their
 * current value; a `rhythm` given in part is completed from its `unit`.
 * Returns the configuration now in force.
 */
export function configureXRay(input: XRayConfigInput): XRayConfig {
  const next: XRayConfig = {
    rhythm: input.rhythm ? rhythmFrom(input.rhythm) : current.rhythm,
    palette: input.palette ? { ...current.palette, ...stripUndefined(input.palette) } : current.palette,
    breakpoints: input.breakpoints ? input.breakpoints.slice().sort((a, b) => a.min - b.min) : current.breakpoints,
    baseName: input.baseName ?? current.baseName,
    baseWidth: input.baseWidth ?? current.baseWidth,
    tracking: input.tracking ?? current.tracking,
    frame: input.frame ? { ...current.frame, ...stripUndefined(input.frame) } : current.frame,
  };
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    current = next;
    listeners.forEach((cb) => cb());
  }
  return current;
}

/** Back to the defaults. */
export function resetXRayConfig(): XRayConfig {
  current = defaults();
  listeners.forEach((cb) => cb());
  return current;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

/** The configuration, re-rendering when it changes. */
export const useXRayConfig = () => useSyncExternalStore(subscribe, getXRayConfig, getXRayConfig);

// ── Helpers every file shares ───────────────────────────────────────────────

/** A palette value as CSS: `--name` becomes `var(--name, fallback)`, anything else passes through. */
export function paletteCss(role: PaletteRole, palette: PaletteConfig = current.palette): string {
  const value = palette[role];
  const [variable, fallback] = PALETTE_DEFAULTS[role];
  if (!value) return `var(${variable}, ${fallback})`;
  if (value.startsWith('--')) {
    // A host variable falls back to the package variable, then to the colour.
    return value === variable ? `var(${variable}, ${fallback})` : `var(${value}, var(${variable}, ${fallback}))`;
  }
  return value;
}

/**
 * Inline custom properties for the package's surfaces: only the roles that
 * differ from the defaults, so `--xray-*` set in a stylesheet still applies.
 */
export function paletteStyle(palette: PaletteConfig = current.palette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of ROLES) {
    if (palette[role] && palette[role] !== PALETTE_DEFAULTS[role][0]) out[PALETTE_CSS_VARS[role]] = paletteCss(role, palette);
  }
  return out;
}

/** `24 px baseline · 72 px major`: the grid's label. */
export const gridLabel = (r: RhythmConfig = current.rhythm) => `${r.minor} px baseline · ${r.major} px major`;
