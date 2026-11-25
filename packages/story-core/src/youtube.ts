/*
 * YouTube links, as the reader embeds them. Any common link form is accepted
 * and rewritten to the privacy-enhanced player, with the author's query
 * parameters (autoplay included) dropped.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** A Shorts video is portrait. Width / height, like `StoryMedia.aspect`. */
export const YOUTUBE_SHORTS_ASPECT = 9 / 16;

function parseYouTubeUrl(value: string | undefined): { id: string; shorts: boolean } | null {
  const raw = value?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be') id = parts[0] ?? null;
  if (host === 'youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') id = parts[1] ?? null;
  }
  if (host === 'youtube-nocookie.com' && parts[0] === 'embed') id = parts[1] ?? null;
  if (!id || !VIDEO_ID.test(id)) return null;
  return { id, shorts: host === 'youtube.com' && parts[0] === 'shorts' };
}

/** A supported YouTube link as the privacy-enhanced player URL, or null. */
export function normalizeYouTubeUrl(value: string | undefined): string | null {
  const video = parseYouTubeUrl(value);
  return video ? `https://www.youtube-nocookie.com/embed/${video.id}` : null;
}

/** The video's still. `mqdefault` (320x180) is 16:9 and exists for every
 *  video. `maxresdefault` (1280x720) only exists for HD uploads: for the
 *  others YouTube answers with a 120x90 grey stand-in, so a reader falls back
 *  to `hqdefault` (480x360, letterboxed). */
export type YouTubeStill = 'mqdefault' | 'hqdefault' | 'maxresdefault';
export function youTubeThumbnail(value: string | undefined, still: YouTubeStill = 'mqdefault'): string | null {
  const video = parseYouTubeUrl(value);
  return video ? `https://i.ytimg.com/vi/${video.id}/${still}.jpg` : null;
}

/** The width of YouTube's stand-in for a missing still. */
export const YOUTUBE_MISSING_STILL_WIDTH = 120;

/** The player that starts on the reader's click. It only exists once they
 *  have clicked the still, so this never starts a video on its own. */
export function youTubePlayingUrl(embedUrl: string): string {
  return `${embedUrl}?autoplay=1`;
}

/**
 * The shape a newly pasted link gives the media. An embed can't be measured,
 * but a Shorts link says it's portrait. Leaving a Shorts link drops the
 * portrait shape it set; a shape the author chose stays.
 */
export function youTubeLinkAspect(value: string | undefined, current: number | undefined): number | undefined {
  if (parseYouTubeUrl(value)?.shorts) return YOUTUBE_SHORTS_ASPECT;
  return current === YOUTUBE_SHORTS_ASPECT ? undefined : current;
}
