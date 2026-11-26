/**
 * The showreel: the reel the site plays on its showreel page. Browser-safe.
 *
 * In the original it was a Figma deck framed in a tube; here it is either a
 * video file the admin uploaded to the MediaStore (MP4 or WebM, played in
 * the page) or a link to a Figma deck, prototype, slides or design file
 * (framed from embed.figma.com, as the original did). The host's
 * `defaultReel` is what plays when nothing has been set.
 */

/** What the admin saved. No row means the default plays. */
export interface ShowreelSetting {
  /** A video address (`/api/story/media/…` or https) or a figma.com link. */
  url: string;
  updatedAt: string;
}

export interface ShowreelLinks {
  /** What the reel is. */
  kind: 'video' | 'deck';
  /** The reel's own address: the video file, or the deck's permalink ("open it properly"). */
  deck: string;
  /** embed.figma.com for a deck (www.figma.com refuses framing); null for a video. */
  embed: string | null;
  /** The file a `<video>` plays; null for a deck. */
  video: string | null;
  /** A still to show before a video plays, when the host has one. */
  poster: string | null;
}

const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com', 'embed.figma.com']);
const FIGMA_KINDS = new Set(['deck', 'proto', 'slides', 'design']);
const VIDEO_FILE = /\.(mp4|m4v|webm)$/i;

const isSitePath = (value: string) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');

/**
 * Validate a pasted or uploaded reel address. A video file is kept as given;
 * a Figma deck / prototype / slides / design link is normalised to a
 * www.figma.com permalink. Returns an error sentence for anything else.
 */
export function normalizeReelUrl(input: string): { url: string } | { error: string } {
  const value = input.trim();
  if (!value) return { error: 'Upload a video or paste a Figma link first.' };
  if (value.length > 2048) return { error: 'That address is too long.' };
  if (isSitePath(value)) {
    return VIDEO_FILE.test(value.split(/[?#]/)[0]) ? { url: value } : { error: 'Upload an MP4 or WebM video.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'That is not a valid URL' };
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return { error: 'Use a https:// link' };
  if (VIDEO_FILE.test(parsed.pathname)) return { url: parsed.toString() };
  if (!FIGMA_HOSTS.has(parsed.hostname)) return { error: 'Use an MP4 or WebM video, or a https://www.figma.com link' };
  const [kind, key] = parsed.pathname.split('/').filter(Boolean);
  if (!FIGMA_KINDS.has(kind) || !key) {
    return { error: 'Use a Figma deck, prototype, slides or design link (figma.com/deck/…)' };
  }
  parsed.hostname = 'www.figma.com';
  parsed.searchParams.delete('embed-host');
  return { url: parsed.toString() };
}

/** How the site plays a saved address. */
export function linksFor(url: string, options: { poster?: string | null; embedHost?: string } = {}): ShowreelLinks {
  if (isSitePath(url) || VIDEO_FILE.test(url.split(/[?#]/)[0])) {
    return { kind: 'video', deck: url, embed: null, video: url, poster: options.poster ?? null };
  }
  const src = new URL(url);
  const embed = new URL(`https://embed.figma.com${src.pathname}`);
  const node = src.searchParams.get('node-id');
  if (node) embed.searchParams.set('node-id', node);
  embed.searchParams.set('embed-host', options.embedHost ?? 'site-kit');
  return { kind: 'deck', deck: url, embed: embed.toString(), video: null, poster: null };
}

export interface ShowreelResponse {
  setting: ShowreelSetting | null;
  defaultUrl: string;
  /** How the reel plays now; null when nothing is set and the host ships no default. */
  links: ShowreelLinks | null;
  /** 0 while the default plays. Send it back as `expectedVersion`. */
  version: number;
  /** Where the reel plays on the site. */
  path: string;
}

export interface ShowreelConfig {
  /** What plays when nothing is set: a video address or a Figma link. */
  defaultReel: string;
  /** A still for the default video, shown before it plays. */
  defaultPoster: string | null;
  /** Where the reel plays on the site. Default `/showreel`. */
  path: string;
  /** Names the site to Figma's embed. Default `site-kit`. */
  embedHost: string;
}

export function configureShowreel(config: Partial<ShowreelConfig> | undefined): ShowreelConfig {
  const defaultReel = config?.defaultReel ?? '';
  if (defaultReel) {
    const checked = normalizeReelUrl(defaultReel);
    if ('error' in checked) throw new Error(`showreel: the default reel ${defaultReel} isn't a video or a Figma link.`);
  }
  return {
    defaultReel,
    defaultPoster: config?.defaultPoster ?? null,
    path: config?.path ?? '/showreel',
    embedHost: config?.embedHost ?? 'site-kit',
  };
}

/** The showreel module's route, relative to where site-data is mounted. */
export const showreelPaths = {
  reel: () => '/showreel',
};
