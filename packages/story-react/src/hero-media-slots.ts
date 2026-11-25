import type { Story, StoryMedia } from '@rcweston/story-core';

export type HeroPrimaryVisual = 'split-graphic' | 'hero-media' | 'fallback';

export interface HeroMediaSlots {
  primary: HeroPrimaryVisual;
  /** A second hero media region is justified only when both authored slots
   * contain content. Empty placeholders never duplicate a populated visual. */
  secondaryHero: StoryMedia | undefined;
}

/**
 * Content, not load success, decides whether a media slot is authored.
 * A broken or protected URL is still content and must never be discarded.
 * Layout-only defaults (kind, frame, aspect, loop) do not make an empty slot
 * meaningful by themselves.
 */
export function hasAuthoredHeroMedia(media: StoryMedia | undefined): boolean {
  if (!media) return false;
  return Boolean(
    media.src?.trim()
    || media.poster?.trim()
    || media.youtubeUrl?.trim()
    || media.pdfUrl?.trim()
    || media.alt.trim()
    || media.caption?.trim()
    || media.link?.href.trim()
    || media.link?.label?.trim()
    || media.shot?.brief.trim()
    || media.shot?.source?.trim()
    || media.shot?.draft?.trim(),
  );
}

/**
 * Resolve the hero to one visible slot unless two independently authored
 * visuals exist. The story object is never rewritten: suppressed empty slots
 * remain available in settings and can be restored or populated later.
 */
export function resolveHeroMediaSlots(story: Pick<Story, 'heroLayout' | 'heroGraphic' | 'hero'>): HeroMediaSlots {
  const splitGraphic = story.heroLayout === 'split-graphic' ? story.heroGraphic : undefined;
  const graphicHasContent = hasAuthoredHeroMedia(splitGraphic);
  const heroHasContent = hasAuthoredHeroMedia(story.hero);

  if (graphicHasContent) {
    return {
      primary: 'split-graphic',
      secondaryHero: heroHasContent ? story.hero : undefined,
    };
  }
  if (heroHasContent) return { primary: 'hero-media', secondaryHero: undefined };

  // In the editor, keep exactly one empty slot available for population.
  // Prefer the explicitly selected split slot, then the ordinary hero slot.
  if (splitGraphic) return { primary: 'split-graphic', secondaryHero: undefined };
  if (story.hero) return { primary: 'hero-media', secondaryHero: undefined };
  return { primary: 'fallback', secondaryHero: undefined };
}
