import type { CSSProperties } from 'react';
import type { StoryMedia } from '@rcweston/story-core';
import { normalizeMediaAppearance } from '@rcweston/story-core';

const tone = { edge: 'var(--story-mat-edge)', ink: 'var(--story-foreground)', accent: 'var(--story-accent)' };
const shadows = { none: 'none', soft: 'var(--story-shadow-sm)', lifted: 'var(--story-shadow-lg)', crisp: '6px 6px 0 var(--story-mat-edge)' };
type Appearance = NonNullable<StoryMedia['appearance']>;

/** Applied to the unclipped media shell; its child owns the rounded clip. */
export function mediaAppearanceStyle(media: StoryMedia): CSSProperties {
  const a = normalizeMediaAppearance(media.appearance);
  if (!a) return {};
  return {
    ...(a.radius !== undefined ? { '--media-radius': `${a.radius}px`, borderRadius: a.radius } : {}),
    ...(a.borderWidth !== undefined ? { borderWidth: a.borderWidth, borderStyle: a.borderStyle ?? 'solid', borderColor: tone[a.borderTone ?? 'edge'] } : {}),
    ...(a.outlineWidth !== undefined ? { outlineWidth: a.outlineWidth, outlineStyle: 'solid', outlineColor: tone[a.outlineTone ?? 'edge'] } : {}),
    ...(a.outlineOffset !== undefined ? { outlineOffset: a.outlineOffset } : {}),
    ...(a.shadow !== undefined ? { boxShadow: shadows[a.shadow] } : a.borderWidth !== undefined ? { boxShadow: 'var(--story-shadow-lg)' } : {}),
  } as CSSProperties;
}

/** The backing mat is a separate layer from the image stroke and shadow. */
export function mediaMatAppearanceStyle(media: StoryMedia): CSSProperties {
  const a = normalizeMediaAppearance(media.appearance);
  return {
    ...(a?.matInsetX !== undefined ? { paddingInline: `min(${a.matInsetX}px, 15%)` } : {}),
    ...(a?.matInsetY !== undefined ? { paddingBlock: `min(${a.matInsetY}px, 15%)` } : {}),
  };
}
