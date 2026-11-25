import type { StoryMedia } from './types.js';
import { normalizeMediaSource } from './media-source.js';
import { toSet } from './internal.js';

/*
 * Where a piece of media actually loads from. The document stores either an
 * explicit `src` (a path or a hosted URL), or only a shot with a `draft` key:
 * a file the host has uploaded to its media store under that key. The host
 * says which keys exist (`uploadedMediaKeys`) and where its media route serves
 * them (`mediaUrl`), so nothing here knows a route.
 */

export interface MediaResolveOptions {
  /** Keys present in the host's media store. */
  uploadedMediaKeys?: Iterable<string>;
  /** The URL a reader's browser loads an uploaded key from. Without it, a
   *  key-only media item can't be served and resolves to nothing. */
  mediaUrl?: (key: string) => string;
  /** Sources an image optimizer can't fetch (behind a session check, say).
   *  Remote URLs and keys served through `mediaUrl` are always unoptimized. */
  unoptimizedPrefixes?: readonly string[];
}

export interface ResolvedMedia {
  src?: string;
  poster?: string;
  /** A local draft cut (development only). Badge it so it's never mistaken for final. */
  draft: boolean;
  /** Served from a route an image optimizer shouldn't fetch. */
  unoptimized: boolean;
}

/** A video's poster key: the same name with a `.jpg` extension. */
export const posterKeyFor = (key: string): string => key.replace(/\.[a-z0-9]+$/i, '.jpg');

/** Resolve only sources safe for the published reader; never local draft cuts. */
export function resolvePublishedMedia(media: StoryMedia, options: MediaResolveOptions = {}): ResolvedMedia {
  const explicitSource = normalizeMediaSource(media.src);
  if (explicitSource) {
    const remote = /^https?:\/\//i.test(explicitSource);
    const listed = options.unoptimizedPrefixes?.some((prefix) => explicitSource.startsWith(prefix)) ?? false;
    return {
      src: explicitSource,
      poster: normalizeMediaSource(media.poster),
      draft: false,
      unoptimized: remote || listed,
    };
  }
  const draft = media.shot?.draft;
  const uploaded = toSet(options.uploadedMediaKeys);
  if (draft && options.mediaUrl && uploaded.has(draft)) {
    const poster = normalizeMediaSource(media.poster)
      ?? (media.kind === 'video' && uploaded.has(posterKeyFor(draft)) ? options.mediaUrl(posterKeyFor(draft)) : undefined);
    return { src: options.mediaUrl(draft), poster, draft: false, unoptimized: true };
  }
  return { draft: false, unoptimized: false };
}

export interface MediaPreviewOptions extends MediaResolveOptions {
  /** Development only: serve a shot's draft cut from local disk. */
  development?: boolean;
  /** The development route that serves a draft cut, by its key. */
  draftUrl?: (key: string) => string;
}

/**
 * Where media loads from, in order:
 *   1. an explicit `src`;
 *   2. the shot's draft key, once uploaded, through `mediaUrl`;
 *   3. in development, the local draft cut through `draftUrl`;
 *   4. nothing: the caller renders the slot (development) or leaves it out.
 */
export function resolveMedia(media: StoryMedia, options: MediaPreviewOptions = {}): ResolvedMedia {
  const published = resolvePublishedMedia(media, options);
  if (published.src) return published;
  const draft = media.shot?.draft;
  if (draft && options.development && options.draftUrl) {
    const poster = media.poster ?? (media.kind === 'video' ? options.draftUrl(posterKeyFor(draft)) : undefined);
    return { src: options.draftUrl(draft), poster, draft: true, unoptimized: true };
  }
  return { draft: false, unoptimized: false };
}

/** Encodes each path segment of a key, keeping the slashes, for building a
 *  `mediaUrl`: `` key => `/media/${encodeMediaKey(key)}` ``. */
export const encodeMediaKey = (key: string): string => key.split('/').map(encodeURIComponent).join('/');
