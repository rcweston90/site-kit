import type { StoryBlock } from './types.js';

/*
 * Callout palettes and icons. Older readers only know the four tones and the
 * four icons on the block itself; newer catalogue keys live in `appearance`,
 * so a document written by a newer editor still renders sensibly in an older
 * reader, and an unknown key is never rendered.
 */

export type StoryCallout = Extract<StoryBlock, { type: 'callout' }>;
export type CalloutPresentation = NonNullable<StoryCallout['presentation']>;
type LegacyTone = NonNullable<StoryCallout['tone']>;
type LegacyIcon = NonNullable<StoryCallout['icon']>;

export const CALLOUT_PALETTES = [
  { key: 'neutral', label: 'Neutral', tone: 'neutral', group: 'Signals' },
  { key: 'info', label: 'Info', tone: 'info', group: 'Signals' },
  { key: 'success', label: 'Success', tone: 'success', group: 'Signals' },
  { key: 'warning', label: 'Warning', tone: 'warning', group: 'Signals' },
  { key: 'error', label: 'Critical', tone: 'warning', group: 'Signals' },
  { key: 'slate', label: 'Slate', tone: 'neutral', group: 'Editorial' },
  { key: 'sky', label: 'Sky', tone: 'info', group: 'Editorial' },
  { key: 'cobalt', label: 'Cobalt', tone: 'info', group: 'Editorial' },
  { key: 'teal', label: 'Teal', tone: 'info', group: 'Editorial' },
  { key: 'deep-teal', label: 'Deep teal', tone: 'info', group: 'Editorial' },
  { key: 'amber', label: 'Amber', tone: 'warning', group: 'Editorial' },
  { key: 'copper', label: 'Copper', tone: 'warning', group: 'Editorial' },
] as const satisfies readonly { key: string; label: string; tone: LegacyTone; group: string }[];

export type CalloutPaletteKey = (typeof CALLOUT_PALETTES)[number]['key'];

export const calloutPalettes: ReadonlyMap<string, (typeof CALLOUT_PALETTES)[number]> = new Map(
  CALLOUT_PALETTES.map((entry) => [entry.key as string, entry]),
);
const legacyTones = new Set<string>(['neutral', 'info', 'success', 'warning']);
const legacyIcons = new Set<string>(['info', 'check', 'warning', 'sparkle']);

export function calloutTone(value?: string): LegacyTone {
  return value && legacyTones.has(value) ? value as LegacyTone : 'neutral';
}

/** Data attributes a renderer puts on the callout's root. */
export function calloutAppearanceAttributes(block: StoryCallout): {
  'data-tone': LegacyTone;
  'data-presentation': CalloutPresentation;
  'data-callout-palette': string | undefined;
} {
  return {
    'data-tone': calloutTone(block.tone),
    'data-presentation': block.presentation ?? 'soft',
    'data-callout-palette': block.appearance?.palette && calloutPalettes.has(block.appearance.palette) ? block.appearance.palette : undefined,
  };
}

export function setCalloutPalette(block: StoryCallout, palette: CalloutPaletteKey): StoryCallout {
  return { ...block, tone: calloutPalettes.get(palette)!.tone, appearance: { ...block.appearance, palette } };
}

/** Sets the icon. A catalogue key outside the four legacy icons is kept in
 *  `appearance.icon`, with `fallback` as the legacy icon older readers show. */
export function setCalloutIcon(block: StoryCallout, icon?: string, fallback: LegacyIcon = 'info'): StoryCallout {
  const appearance = { ...block.appearance };
  delete appearance.icon;
  if (icon && !legacyIcons.has(icon)) appearance.icon = icon;
  return {
    ...block,
    icon: icon ? (legacyIcons.has(icon) ? icon as LegacyIcon : fallback) : undefined,
    appearance: Object.keys(appearance).length > 0 ? appearance : undefined,
  };
}
