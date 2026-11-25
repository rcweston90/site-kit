import type { CSSProperties } from 'react';
import { STORY_LAYOUT_OPTIONS, type StoryMatColor, type StoryMatPreset, type StoryMedia, type StoryTone } from '@rcweston/story-core';

/**
 * The colour of the plate media sits on (`--story-mat`), chosen per image.
 *
 * A preset is a theme token, so the plate follows the reader's theme the way
 * the rest of the page does. A custom hex is the author's exact colour and the
 * same in every theme; the hairline and the text that sits on the plate (a
 * band's caption and heading) are derived from it, light or dark. On a true
 * mid-tone neither ink reaches 4.5:1, and the editor says so
 * (`lowMatContrast`).
 */
export const STORY_MAT_PRESETS: readonly { value: StoryMatPreset; label: string }[] = [
  { value: 'page', label: 'Page' },
  { value: 'grey', label: 'Grey' },
  { value: 'cool', label: 'Cool' },
  { value: 'warm', label: 'Warm' },
  { value: 'amber', label: 'Amber' },
  { value: 'teal', label: 'Teal' },
  { value: 'ink', label: 'Ink' },
];

/* Teal and ink are dark in every theme, so what sits on them takes the dark
   panel's hairline and ink. The light ones restate the page's, so a light
   plate in a story whose tone is the dark panel still reads. */
const LIGHT = { '--story-mat-edge': 'var(--story-border)', '--story-mat-ink': 'var(--story-foreground-muted)' };
const DARK = { '--story-mat-edge': 'var(--story-on-panel-divider)', '--story-mat-ink': 'var(--story-on-panel-muted)' };
const PRESET_STYLE: Record<StoryMatPreset, Record<string, string>> = {
  page: { '--story-mat': 'var(--story-background)', ...LIGHT },
  grey: { '--story-mat': 'var(--story-background-secondary)', ...LIGHT },
  cool: { '--story-mat': 'var(--story-surface-cool)', ...LIGHT },
  warm: { '--story-mat': 'var(--story-surface-warm)', ...LIGHT },
  // The muted ink is 4.2:1 on the amber theme's amber; a step darker is 5.8:1
  // there and 6.6:1 or more in the others.
  amber: { '--story-mat': 'var(--story-surface-amber)', ...LIGHT, '--story-mat-ink': 'color-mix(in srgb, var(--story-foreground-muted) 60%, var(--story-foreground))' },
  teal: { '--story-mat': 'var(--story-surface-dark)', ...DARK },
  ink: { '--story-mat': 'var(--story-surface-panel)', ...DARK },
};

export const isStoryMatPreset = (value: unknown): value is StoryMatPreset =>
  (STORY_LAYOUT_OPTIONS.mediaMat as readonly unknown[]).includes(value);

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`; anything else → undefined. */
export function normalizeMatHex(value: string): `#${string}` | undefined {
  const digits = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(digits)) return `#${[...digits].map((digit) => digit + digit).join('')}`;
  return /^[0-9a-f]{6}$/.test(digits) ? `#${digits}` : undefined;
}

type Rgb = readonly [number, number, number];
const channelsOf = (hex: string): Rgb => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as unknown as Rgb;
const luminance = ([r, g, b]: Rgb) => {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Ink laid over the plate at `alpha`, as the browser composites it. */
const over = (ink: Rgb, plate: Rgb, alpha: number): Rgb =>
  ink.map((channel, at) => Math.round(channel * alpha + plate[at] * (1 - alpha))) as unknown as Rgb;

/* --story-on-panel and --story-surface-panel at their weakest across the themes (the
   amber theme's off-white, the default theme's near-black), as channels: a
   custom plate's ink is worked out against these, so it holds in every theme. */
const ON_PANEL: Rgb = [250, 245, 240];
const PANEL: Rgb = [26, 26, 26];
/* --story-on-panel-muted's alpha; the dark ink on a light plate mirrors it. */
const MUTED = 0.65;
const MIN_CONTRAST = 4.5;

/** How a custom plate's ink reads: light or dark, muted or not, and its
 *  contrast. A true mid-tone can't reach 4.5:1 with either ink. */
function customInk(hex: string) {
  const plate = channelsOf(hex);
  const dark = contrast(ON_PANEL, plate) > contrast(PANEL, plate);
  const ink = dark ? ON_PANEL : PANEL;
  // Muted like every other caption, unless that would fall under 4.5:1.
  const mutedContrast = contrast(over(ink, plate, MUTED), plate);
  const muted = mutedContrast >= MIN_CONTRAST;
  return { dark, muted, contrast: muted ? mutedContrast : contrast(ink, plate) };
}

/** The contrast of the text a custom plate carries (a band's caption, a
 *  grid's headings), when it falls short of 4.5:1; undefined otherwise. */
export function lowMatContrast(color: string | undefined): number | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  const { contrast: ratio } = customInk(color);
  return ratio < MIN_CONTRAST ? ratio : undefined;
}

function customStyle(hex: `#${string}`): Record<string, string> {
  const { dark, muted } = customInk(hex);
  return {
    '--story-mat': hex,
    '--story-mat-edge': `color-mix(in srgb, ${dark ? 'var(--story-on-panel)' : 'var(--story-surface-panel)'} 12%, ${hex})`,
    '--story-mat-ink': dark
      ? (muted ? 'var(--story-on-panel-muted)' : 'var(--story-on-panel)')
      : (muted ? `color-mix(in srgb, var(--story-surface-panel) ${MUTED * 100}%, transparent)` : 'var(--story-surface-panel)'),
  };
}

/** The custom properties that seat media on its chosen mat; undefined keeps
 *  the story's. A value the validator would refuse is ignored here too. */
export function storyMatStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  if (isStoryMatPreset(color)) return PRESET_STYLE[color] as CSSProperties;
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? normalizeMatHex(color) : undefined;
  return hex ? customStyle(hex) as CSSProperties : undefined;
}

/** The preset a story's tone amounts to: the mat of every image that doesn't
 *  choose its own (styles.css sets the same tokens on
 *  `.story[data-tone]`). Neutral is the default tint, which no preset is. */
export function storyToneMat(tone: StoryTone | undefined): StoryMatPreset | undefined {
  return tone === 'cool' ? 'cool' : tone === 'warm' ? 'warm' : tone === 'panel' ? 'ink' : undefined;
}

/** A grid of images shares one plate: its colour is the one every image has,
 *  or the story's when they differ. */
export function sharedMatColor(items: readonly StoryMedia[]): StoryMatColor | undefined {
  const first = items[0]?.matColor;
  return items.every((item) => item.matColor === first) ? first : undefined;
}
