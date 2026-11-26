/**
 * How the public site looks for every visitor: sunny mode (drifting cloud
 * shadows over the neutral theme), the theme a first visit starts on, the
 * accent colour and the typefaces. Browser-safe.
 *
 * Typefaces are set through the story tokens (`--story-font-sans`,
 * `--story-font-serif`), so a host swaps faces without touching a stylesheet.
 * A visitor's own pick in the footer's theme switch still wins over the
 * default theme; it's kept in their browser.
 */

export const APPEARANCE_THEMES = ['default', 'amber', 'dark'] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export const APPEARANCE_THEME_LABELS: Record<AppearanceTheme, string> = { default: 'Neutral', amber: 'Amber', dark: 'Dark' };

export interface AppearanceSettings {
  /** Drifting cloud shadows across the site, over the neutral theme. */
  sunny: boolean;
  /** The theme a visitor sees before they pick one in the footer. */
  defaultTheme: AppearanceTheme;
  /** An accent option's id. */
  accent: string;
  /** A sans option's id. */
  sans: string;
  /** A serif option's id. */
  serif: string;
}

export interface AccentOption {
  id: string;
  label: string;
  /** On the light themes, behind white text (keep it 4.5:1 or better). Null keeps the theme's own. */
  light: string | null;
  /** On the dark theme, behind dark text. Null keeps the theme's own. */
  dark: string | null;
}

export interface FontOption {
  id: string;
  label: string;
  /** A CSS font stack, or null to keep what the site's stylesheet sets. */
  stack: string | null;
}

export interface AppearanceOptions {
  accents: AccentOption[];
  sans: FontOption[];
  serif: FontOption[];
}

export interface AppearanceConfig extends AppearanceOptions {
  /** What a fresh database shows. */
  defaults: AppearanceSettings;
}

/** `GET /appearance`. */
export interface AppearanceState {
  settings: AppearanceSettings;
  /** 0 before the first save. */
  version: number;
  updatedAt: string | null;
  options: AppearanceOptions;
}

export const DEFAULT_ACCENTS: AccentOption[] = [
  { id: 'blue', label: 'Blue', light: null, dark: null },
  { id: 'teal', label: 'Teal', light: '#0F766E', dark: '#2DD4BF' },
  { id: 'plum', label: 'Plum', light: '#7E22CE', dark: '#C084FC' },
  { id: 'ember', label: 'Ember', light: '#C2410C', dark: '#FB923C' },
];

export const DEFAULT_SANS: FontOption[] = [
  { id: 'site', label: 'Site default', stack: null },
  { id: 'system', label: 'System sans', stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
  { id: 'humanist', label: 'Humanist', stack: "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif" },
];

export const DEFAULT_SERIF: FontOption[] = [
  { id: 'site', label: 'Site default', stack: null },
  { id: 'transitional', label: 'Transitional', stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif" },
  { id: 'old-style', label: 'Old style', stack: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif" },
];

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const UNSAFE_STACK = /[;{}<>\\]|\/\*/;

export function configureAppearance(config: Partial<AppearanceConfig> | undefined): AppearanceConfig {
  const accents = config?.accents ?? DEFAULT_ACCENTS;
  const sans = config?.sans ?? DEFAULT_SANS;
  const serif = config?.serif ?? DEFAULT_SERIF;
  for (const [kind, list] of [['accent', accents], ['sans', sans], ['serif', serif]] as const) {
    if (list.length === 0) throw new Error(`appearance: give at least one ${kind} option.`);
    const ids = list.map((option) => option.id);
    if (new Set(ids).size !== ids.length) throw new Error(`appearance: a ${kind} option is listed twice.`);
    for (const id of ids) if (!ID.test(id)) throw new Error(`appearance: ${id} isn't an id like plum or old-style.`);
  }
  for (const accent of accents) {
    for (const value of [accent.light, accent.dark]) if (value !== null && !HEX.test(value)) throw new Error(`appearance: ${accent.id}'s colour ${value} should look like #0F766E.`);
  }
  for (const font of [...sans, ...serif]) {
    if (font.stack !== null && (UNSAFE_STACK.test(font.stack) || !font.stack.trim())) throw new Error(`appearance: ${font.id}'s font stack can't be used in a stylesheet.`);
  }
  const defaults: AppearanceSettings = {
    sunny: config?.defaults?.sunny ?? false,
    defaultTheme: config?.defaults?.defaultTheme ?? 'default',
    accent: config?.defaults?.accent ?? accents[0].id,
    sans: config?.defaults?.sans ?? sans[0].id,
    serif: config?.defaults?.serif ?? serif[0].id,
  };
  const resolved = { accents: [...accents], sans: [...sans], serif: [...serif], defaults };
  parseAppearance(defaults, resolved);
  return resolved;
}

export class AppearanceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppearanceInputError';
  }
}

/** Settings from a request body; throws AppearanceInputError with a sentence for people. */
export function parseAppearance(value: unknown, options: AppearanceOptions): AppearanceSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppearanceInputError('The appearance settings couldn’t be read.');
  const body = value as Record<string, unknown>;
  if (typeof body.sunny !== 'boolean') throw new AppearanceInputError('Say whether sunny mode is on.');
  if (!APPEARANCE_THEMES.includes(body.defaultTheme as AppearanceTheme)) throw new AppearanceInputError('Choose Neutral, Amber or Dark as the default theme.');
  const choose = (key: 'accent' | 'sans' | 'serif', list: { id: string }[], label: string) => {
    if (typeof body[key] !== 'string' || !list.some((option) => option.id === body[key])) throw new AppearanceInputError(`Choose one of the ${label} on this page.`);
    return body[key] as string;
  };
  return {
    sunny: body.sunny,
    defaultTheme: body.defaultTheme as AppearanceTheme,
    accent: choose('accent', options.accents, 'accent colours'),
    sans: choose('sans', options.sans, 'sans typefaces'),
    serif: choose('serif', options.serif, 'serif typefaces'),
  };
}

/** A stored value read leniently: anything that no longer fits falls back to the default for that field. */
export function storedAppearance(value: unknown, config: AppearanceConfig): AppearanceSettings {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const has = (list: { id: string }[], id: unknown) => typeof id === 'string' && list.some((option) => option.id === id);
  return {
    sunny: typeof body.sunny === 'boolean' ? body.sunny : config.defaults.sunny,
    defaultTheme: APPEARANCE_THEMES.includes(body.defaultTheme as AppearanceTheme) ? (body.defaultTheme as AppearanceTheme) : config.defaults.defaultTheme,
    accent: has(config.accents, body.accent) ? (body.accent as string) : config.defaults.accent,
    sans: has(config.sans, body.sans) ? (body.sans as string) : config.defaults.sans,
    serif: has(config.serif, body.serif) ? (body.serif as string) : config.defaults.serif,
  };
}

const glow = (hex: string, alpha: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/**
 * The stylesheet that applies the settings: the accent on the light and dark
 * themes and the typefaces, as token overrides. `:root:root` outranks the
 * site's own `:root` rules wherever this lands in the page. Empty when
 * everything is the site's own.
 */
export function appearanceCss(settings: AppearanceSettings, options: AppearanceOptions): string {
  const accent = options.accents.find((option) => option.id === settings.accent);
  const sans = options.sans.find((option) => option.id === settings.sans);
  const serif = options.serif.find((option) => option.id === settings.serif);
  const light: string[] = [];
  const dark: string[] = [];
  if (sans?.stack) light.push(`--story-font-sans:${sans.stack}`);
  if (serif?.stack) light.push(`--story-font-serif:${serif.stack}`);
  if (accent?.light) light.push(`--accent-primary:${accent.light}`, `--story-accent:${accent.light}`, `--accent-glow:${glow(accent.light, 0.06)}`, `--story-accent-glow:${glow(accent.light, 0.06)}`, '--on-accent:#FFFFFF', '--story-on-accent:#ffffff');
  if (accent?.dark) dark.push(`--accent-primary:${accent.dark}`, `--story-accent:${accent.dark}`, `--accent-glow:${glow(accent.dark, 0.14)}`, `--story-accent-glow:${glow(accent.dark, 0.14)}`, '--on-accent:#0F1216', '--story-on-accent:#0f1216');
  const rules: string[] = [];
  if (light.length) rules.push(`:root:root{${light.join(';')}}`);
  if (dark.length) rules.push(`:root:root[data-theme="dark"]{${dark.join(';')}}`);
  return rules.join('\n');
}

/**
 * A script for the top of the page, before it paints: the visitor's own
 * theme if they picked one (kept under `storageKey`), else the site's
 * default; neutral becomes `sunny` while sunny mode is on.
 */
export function appearanceBootScript(settings: AppearanceSettings, storageKey: string): string {
  const key = JSON.stringify(storageKey).replace(/</g, '\\u003c');
  const fallback = JSON.stringify(settings.defaultTheme);
  return `(function(){try{var d=document.documentElement,t=null;try{t=JSON.parse(localStorage.getItem(${key}))}catch(e){}if(t!=='default'&&t!=='amber'&&t!=='dark')t=${fallback};var a=t==='default'?(${settings.sunny ? 'true' : 'false'}?'sunny':null):t;if(a)d.setAttribute('data-theme',a);else d.removeAttribute('data-theme');d.style.colorScheme=t==='dark'?'dark':'light'}catch(e){}})()`;
}

/** The `data-theme` a page gets for a visitor's theme. */
export const themeAttribute = (theme: AppearanceTheme, sunny: boolean): string | null => (theme === 'default' ? (sunny ? 'sunny' : null) : theme);
