/**
 * The home page's own words and pictures. Browser-safe: the admin's Home
 * screen imports the types and the parsers from here, so nothing in this file
 * may reach a store.
 *
 * The "letter" on the home page: a lede, body paragraphs and the "What I do"
 * bullets. Admin-editable (Admin → Home); the host's `about` config is the
 * shipped copy, used until someone saves an edit.
 *
 * Body paragraphs are plain text with inline `[label](url)` links and
 * `**bold**`, which the site's InlineRichText renders. Storing markup rather
 * than JSX is what lets the copy live in the database at all.
 */
export interface HomeAbout {
  /** Lede sentence: fills the pull-quote slot above the body paragraphs. */
  tagline: string;
  /** Body paragraphs, in order. The first sits in the letter's margin. */
  bio: string[];
  /** "What I do" bullets. */
  fastFacts: string[];
}

export const EMPTY_HOME_ABOUT: HomeAbout = { tagline: '', bio: [], fastFacts: [] };

/** Strip inline markup, for contexts that render text, not elements. */
export function toPlainText(markup: string): string {
  return markup
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Trimmed, non-empty entries only: an empty textarea means "remove it". */
function cleanList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** A submitted letter, trimmed, or the sentence that says what's missing. */
export function parseHomeAbout(body: unknown): { about: HomeAbout } | { error: string } {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const tagline = typeof value.tagline === 'string' ? value.tagline.trim() : '';
  const bio = cleanList(value.bio);
  const fastFacts = cleanList(value.fastFacts);
  if (!tagline) return { error: 'Tagline is required' };
  if (!bio?.length) return { error: 'At least one bio paragraph is required' };
  if (!fastFacts) return { error: 'Expected the What I do list to be a list of lines' };
  return { about: { tagline, bio, fastFacts } };
}

/** Stored copy layered over the shipped copy, field by field, so a bad row degrades to the defaults. */
export function homeAboutOver(stored: Partial<HomeAbout> | null | undefined, defaults: HomeAbout): HomeAbout {
  if (!stored) return defaults;
  return {
    tagline: typeof stored.tagline === 'string' && stored.tagline ? stored.tagline : defaults.tagline,
    bio: Array.isArray(stored.bio) && stored.bio.length ? stored.bio : defaults.bio,
    fastFacts: Array.isArray(stored.fastFacts) && stored.fastFacts.length ? stored.fastFacts : defaults.fastFacts,
  };
}

// ── Header images ───────────────────────────────────────────

/** A picture the header can show: a library photo, or one the slot resolves to. */
export interface HomePhoto {
  src: string;
  alt: string;
  /** CSS object-position, for a photo cropped into the header's frames. */
  objectPosition?: string;
}

export type HomeHeaderImage = { source: 'shots' | 'upload'; src: string; alt: string };
export type HomeHeaderImages = [HomeHeaderImage | null, HomeHeaderImage | null, HomeHeaderImage | null];
export const DEFAULT_HEADER_IMAGES: HomeHeaderImages = [null, null, null];

/** An address the site serves itself (`/api/story/media/…`) or an https one. */
export function isHeaderImageSrc(src: string): boolean {
  if (src.length > 2048) return false;
  if (src.startsWith('/')) return !src.startsWith('//') && !src.includes('\\');
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Three slots, each null (the slot's default) or a chosen image with its description. */
export function parseHeaderImages(value: unknown): HomeHeaderImages | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const images: (HomeHeaderImage | null)[] = [];
  for (const item of value) {
    if (item === null) { images.push(null); continue; }
    if (!item || typeof item !== 'object' || !['shots', 'upload'].includes(item.source) || typeof item.src !== 'string' || typeof item.alt !== 'string' || item.alt.length > 300) return null;
    if (!isHeaderImageSrc(item.src)) return null;
    images.push({ source: item.source, src: item.src, alt: item.alt.trim() });
  }
  return images as HomeHeaderImages;
}

/** A deleted library shot falls back to that slot's current default. */
export function resolveHeaderImages(images: HomeHeaderImages, shots: HomePhoto[]): HomePhoto[] {
  return images.flatMap((image, index) => {
    if (!image) return shots[index] ? [shots[index]] : [];
    if (image.source === 'upload') return [{ src: image.src, alt: image.alt }];
    const selected = shots.find(shot => shot.src === image.src);
    if (selected) return [{ ...selected, alt: image.alt || selected.alt }];
    return shots[index] ? [shots[index]] : [];
  });
}

// ── What the routes answer ──────────────────────────────────

export interface HomeAboutResponse {
  about: HomeAbout;
  defaults: HomeAbout;
  customized: boolean;
  /** 0 while the shipped copy shows. Send it back as `expectedVersion`. */
  version: number;
  updatedAt: string | null;
}

export interface HomeHeaderImagesResponse {
  images: HomeHeaderImages;
  /** The library "Choose from Shots" offers, and each slot's default, in order. */
  shots: HomePhoto[];
  version: number;
  updatedAt: string | null;
}

export interface HomeConfig {
  /** The letter's shipped copy. */
  about: HomeAbout;
  /**
   * The photos the header picks from and falls back to, slot by slot (in the
   * original, the Shots library). Called per request; empty when the site has
   * no library.
   */
  library: () => Promise<HomePhoto[]>;
}

export function configureHome(config: Partial<HomeConfig> | undefined): HomeConfig {
  return {
    about: config?.about ?? EMPTY_HOME_ABOUT,
    library: config?.library ?? (async () => []),
  };
}

/** The home module's routes, relative to where site-data is mounted. */
export const homePaths = {
  about: () => '/home/about',
  headerImages: () => '/home/header-images',
};
