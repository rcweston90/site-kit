import type { StoryMedia } from './types.js';
import { DEFAULT_IMAGE_ZOOM, isImageZoom, type ImageZoom } from './image-lightbox.js';

/*
 * The saved schema for media presentation overrides. Renderers turn these into
 * styles; the validator and the normalizers below keep anything else out, so a
 * document can never carry arbitrary CSS.
 */

export const MEDIA_APPEARANCE_OPTIONS = {
  borderStyle: ['solid', 'dashed', 'dotted'],
  borderTone: ['edge', 'ink', 'accent'],
  outlineTone: ['edge', 'ink', 'accent'],
  shadow: ['none', 'soft', 'lifted', 'crisp'],
} as const;

/** Largest value for each numeric setting, in px. Smallest is 0. */
export const MEDIA_APPEARANCE_LIMITS = { matInsetX: 144, matInsetY: 144, radius: 48, borderWidth: 12, outlineWidth: 8, outlineOffset: 24 } as const;

/** Settings an `expansion` object may hold. */
export const MEDIA_EXPANSION_KEYS = ['enabled', 'zoom', 'x', 'y'] as const;

type Appearance = NonNullable<StoryMedia['appearance']>;
type Expansion = NonNullable<StoryMedia['expansion']>;

/** Unrecognized styles are dropped; numbers are rounded and clamped. */
export function normalizeMediaAppearance(value: StoryMedia['appearance']): StoryMedia['appearance'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(MEDIA_APPEARANCE_LIMITS)) {
    const v = value[key as keyof Appearance];
    if (typeof v === 'number' && Number.isFinite(v)) next[key] = Math.min(max, Math.max(0, Math.round(v)));
  }
  for (const [key, options] of Object.entries(MEDIA_APPEARANCE_OPTIONS)) {
    const v = value[key as keyof Appearance];
    if ((options as readonly unknown[]).includes(v)) next[key] = v;
  }
  return Object.keys(next).length ? next as Appearance : undefined;
}

export function normalizeMediaExpansion(value: StoryMedia['expansion']): StoryMedia['expansion'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const next: Expansion = {};
  if (typeof value.enabled === 'boolean') next.enabled = value.enabled;
  if (isImageZoom(value.zoom)) next.zoom = value.zoom;
  for (const key of ['x', 'y'] as const) {
    const v = value[key];
    if (typeof v === 'number' && Number.isFinite(v)) next[key] = Math.min(100, Math.max(0, Math.round(v)));
  }
  return Object.keys(next).length ? next : undefined;
}

/** The expanded view with every default filled in. */
export function mediaExpansionSettings(value: StoryMedia['expansion']): { enabled: boolean; zoom: ImageZoom; x: number; y: number } {
  const v = normalizeMediaExpansion(value);
  return { enabled: v?.enabled ?? true, zoom: (v?.zoom ?? DEFAULT_IMAGE_ZOOM) as ImageZoom, x: v?.x ?? 50, y: v?.y ?? 50 };
}
