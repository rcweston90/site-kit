/*
 * A PDF a story can embed: a path on this site or an https URL whose path
 * ends in `.pdf`, with no dot segments. Hosts that serve documents through
 * one protected route can narrow this with `prefixes`, so a document sits
 * behind the same access check as the story's footage.
 */

const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9._~%!$&'()*+,;=:@/-]*\.pdf$/i;

export interface PdfUrlOptions {
  /** Accept only URLs that start with one of these, e.g. `['/media/']`. */
  prefixes?: readonly string[];
}

export function normalizePdfUrl(value: string | undefined, options: PdfUrlOptions = {}): string | null {
  const raw = value?.trim();
  if (!raw || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let path: string;
  if (raw.startsWith('/')) {
    path = raw.split(/[?#]/)[0];
  } else {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    path = raw.replace(/^https:\/\/[^/]+/i, '').split(/[?#]/)[0];
  }
  if (!SAFE_PATH.test(path)) return null;
  const dotSegment = (segment: string) => /^(?:\.|%2e){1,2}$/i.test(segment);
  if (path.split('/').some(dotSegment)) return null;
  if (options.prefixes && !options.prefixes.some((prefix) => raw.startsWith(prefix))) return null;
  return raw;
}
