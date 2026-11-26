/**
 * Search and sharing metadata: site-wide defaults, per-page overrides, and
 * the pure pieces public pages build their metadata, sitemap and robots
 * from. Browser-safe and framework-free: the objects match the shapes
 * Next.js metadata routes take, without importing Next.
 */

export * from './jsonld.js';

// ── Records ─────────────────────────────────────────────────

/** Site-wide defaults. A null field falls back to the host's `SeoFallbacks`. */
export interface SeoDefaults {
  /** `%s` is replaced by a page's own title, e.g. `%s · Lena Ortiz`. */
  titleTemplate: string | null;
  /** The title of a page that has none of its own (the home page). */
  defaultTitle: string | null;
  description: string | null;
  /** The share card: an absolute address or a site path. */
  ogImage: string | null;
  keywords: string[] | null;
  siteName: string | null;
  /** `@handle`, for link previews. */
  twitterHandle: string | null;
}

/** One page's override. A null field inherits the page's content, then the defaults. */
export interface SeoPageOverride {
  title: string | null;
  description: string | null;
  ogImage: string | null;
  keywords: string[] | null;
  robotsIndex: boolean | null;
  robotsFollow: boolean | null;
}

export interface SeoOverrideRecord extends SeoPageOverride {
  path: string;
  version: number;
  updatedAt: string | null;
}

/** `GET /seo`. */
export interface SeoState {
  defaults: SeoDefaults;
  /** 0 before the first save. */
  version: number;
  updatedAt: string | null;
  overrides: SeoOverrideRecord[];
  /** What a blank field resolves to: the host's fallbacks. */
  fallbacks: SeoFallbacks;
}

/** What the host's own pages say when nothing is saved: the owner's name and line. */
export interface SeoFallbacks {
  titleTemplate: string;
  defaultTitle: string;
  description: string;
  keywords: string[];
  siteName: string;
  ogImage?: string;
  twitterHandle?: string;
  /** `en_US` by default. */
  locale?: string;
}

export const EMPTY_SEO_DEFAULTS: SeoDefaults = {
  titleTemplate: null,
  defaultTitle: null,
  description: null,
  ogImage: null,
  keywords: null,
  siteName: null,
  twitterHandle: null,
};

export const EMPTY_SEO_OVERRIDE: SeoPageOverride = {
  title: null,
  description: null,
  ogImage: null,
  keywords: null,
  robotsIndex: null,
  robotsFollow: null,
};

// ── Validation ──────────────────────────────────────────────

const PATH = /^\/[A-Za-z0-9._~%/-]*$/;

/** A site path an override can be for: `/`, `/work`, `/stories/a-slug`. */
export function isSeoPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && PATH.test(value) && !value.includes('//') && !value.split('/').includes('..');
}

export class SeoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeoInputError';
  }
}

function text(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new SeoInputError(`The ${label} should be text.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new SeoInputError(`Keep the ${label} under ${max} characters.`);
  return trimmed;
}

function image(value: unknown): string | null {
  const url = text(value, 'share image address', 2048);
  if (url === null) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
  } catch {
    // falls through
  }
  throw new SeoInputError('The share image should be a web address (https://…) or a path on this site (/…).');
}

function keywords(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  const list = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'string')) throw new SeoInputError('Keywords should be a list of words.');
  const cleaned = [...new Set(list.map((entry: string) => entry.trim()).filter(Boolean))];
  if (cleaned.length > 30) throw new SeoInputError('Keep it to 30 keywords or fewer.');
  if (cleaned.some((entry) => entry.length > 80)) throw new SeoInputError('Keep each keyword under 80 characters.');
  return cleaned.length ? cleaned : null;
}

function flag(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new SeoInputError(`Say whether search engines may ${label} this page.`);
  return value;
}

/** Defaults from a request body, cleaned; throws SeoInputError with a sentence for people. */
export function parseSeoDefaults(value: unknown): SeoDefaults {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SeoInputError('The SEO defaults couldn’t be read.');
  const body = value as Record<string, unknown>;
  const template = text(body.titleTemplate, 'title template', 200);
  if (template !== null && !template.includes('%s')) throw new SeoInputError('The title template needs %s where the page title goes.');
  const handle = text(body.twitterHandle, 'handle', 60);
  if (handle !== null && !/^@?[A-Za-z0-9_]{1,30}$/.test(handle)) throw new SeoInputError('The handle should look like @handle.');
  return {
    titleTemplate: template,
    defaultTitle: text(body.defaultTitle, 'default title', 200),
    description: text(body.description, 'description', 500),
    ogImage: image(body.ogImage),
    keywords: keywords(body.keywords),
    siteName: text(body.siteName, 'site name', 120),
    twitterHandle: handle === null ? null : handle.startsWith('@') ? handle : `@${handle}`,
  };
}

/** One override from a request body, cleaned; throws SeoInputError. */
export function parseSeoOverride(value: unknown): SeoPageOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SeoInputError('The override couldn’t be read.');
  const body = value as Record<string, unknown>;
  return {
    title: text(body.title, 'title', 200),
    description: text(body.description, 'description', 500),
    ogImage: image(body.ogImage),
    keywords: keywords(body.keywords),
    robotsIndex: flag(body.robotsIndex, 'index'),
    robotsFollow: flag(body.robotsFollow, 'follow links on'),
  };
}

/** A stored value, read leniently: anything unreadable counts as unset. */
export function storedDefaults(value: unknown): SeoDefaults {
  try {
    return parseSeoDefaults(value);
  } catch {
    return EMPTY_SEO_DEFAULTS;
  }
}

export function storedOverride(value: unknown): SeoPageOverride {
  try {
    return parseSeoOverride(value);
  } catch {
    return EMPTY_SEO_OVERRIDE;
  }
}

// ── Page metadata ───────────────────────────────────────────

/** What the page's own content says, e.g. a story's title, summary and cover. */
export interface SeoContentMeta {
  title?: string;
  description?: string;
  image?: string;
  keywords?: string[];
}

/** The metadata object a page returns from `generateMetadata` (Next.js's shape). */
export interface PageMetadata {
  metadataBase: URL;
  title: { absolute: string };
  description: string | null;
  keywords: string[] | null;
  alternates: { canonical: string } | null;
  openGraph: {
    type: 'website';
    locale: string;
    url: string;
    siteName: string;
    title: string;
    description: string;
    images?: { url: string }[];
  } | null;
  twitter: {
    card: 'summary_large_image';
    title: string;
    description: string;
    site?: string;
    creator?: string;
    images?: string[];
  } | null;
  robots: { index: boolean; follow: boolean; googleBot?: { index: boolean; follow: boolean } };
}

export interface ResolveMetadataInput {
  path: string;
  siteUrl: URL | string;
  fallbacks: SeoFallbacks;
  defaults?: SeoDefaults | null;
  override?: SeoPageOverride | null;
  content?: SeoContentMeta;
  /** The page is switched off in page visibility. */
  hidden?: boolean;
}

const pick = <T,>(...values: (T | null | undefined)[]): T | undefined => values.find((value) => value !== null && value !== undefined && (typeof value !== 'string' || value !== '')) ?? undefined;

/** `%s · Name` with the page's title in place of `%s`. */
export const applyTitleTemplate = (template: string, title: string) => (template.includes('%s') ? template.replace('%s', title) : `${title} ${template}`.trim());

/**
 * A page's metadata, merged field by field (the first that's set wins):
 * 1. its override, 2. its own content, 3. the saved defaults, 4. the host's fallbacks.
 * A hidden page keeps a plain title and asks not to be indexed, with no
 * description, share card or canonical.
 */
export function resolvePageMetadata(input: ResolveMetadataInput): PageMetadata {
  const { path, fallbacks, content } = input;
  const metadataBase = typeof input.siteUrl === 'string' ? new URL(input.siteUrl) : input.siteUrl;
  const defaults = input.defaults ?? EMPTY_SEO_DEFAULTS;
  const override = input.override ?? EMPTY_SEO_OVERRIDE;
  const template = pick(defaults.titleTemplate, fallbacks.titleTemplate)!;
  const defaultTitle = pick(defaults.defaultTitle, fallbacks.defaultTitle)!;

  if (input.hidden) {
    return {
      metadataBase,
      title: { absolute: content?.title ? applyTitleTemplate(template, content.title) : defaultTitle },
      description: null,
      keywords: null,
      alternates: null,
      openGraph: null,
      twitter: null,
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }

  const title = pick(override.title, content?.title);
  const description = pick(override.description, content?.description, defaults.description, fallbacks.description)!;
  const ogImage = pick(override.ogImage, content?.image, defaults.ogImage, fallbacks.ogImage);
  const keywords = pick(override.keywords?.length ? override.keywords : null, content?.keywords?.length ? content.keywords : null, defaults.keywords?.length ? defaults.keywords : null, fallbacks.keywords) ?? null;
  const siteName = pick(defaults.siteName, fallbacks.siteName)!;
  const handle = pick(defaults.twitterHandle, fallbacks.twitterHandle);
  const shareTitle = title ?? defaultTitle;

  return {
    metadataBase,
    title: { absolute: title ? applyTitleTemplate(template, title) : defaultTitle },
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: fallbacks.locale ?? 'en_US',
      url: path,
      siteName,
      title: shareTitle,
      description,
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      ...(handle && { site: handle, creator: handle }),
      ...(ogImage && { images: [ogImage] }),
    },
    robots: { index: override.robotsIndex ?? true, follow: override.robotsFollow ?? true },
  };
}

// ── Sitemap and robots ──────────────────────────────────────

export type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** One page the host wants listed. */
export interface SitemapCandidate {
  path: string;
  lastModified?: Date | string;
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

/** One sitemap row (Next.js's `MetadataRoute.Sitemap` entry). */
export interface SitemapEntry {
  url: string;
  lastModified?: Date | string;
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

const joinUrl = (siteUrl: URL | string, path: string) => `${String(siteUrl).replace(/\/+$/, '')}${path === '/' ? '' : path}`;

/**
 * The sitemap: each candidate that's visible and not set to noindex by its
 * override, once, as an absolute address.
 */
export function buildSitemap(candidates: readonly SitemapCandidate[], options: {
  siteUrl: URL | string;
  isVisible?: (path: string) => boolean;
  overrides?: readonly Pick<SeoOverrideRecord, 'path' | 'robotsIndex'>[];
}): SitemapEntry[] {
  const noindex = new Set((options.overrides ?? []).filter((override) => override.robotsIndex === false).map((override) => override.path));
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.path) || noindex.has(candidate.path)) continue;
    if (options.isVisible && !options.isVisible(candidate.path)) continue;
    seen.add(candidate.path);
    entries.push({
      url: joinUrl(options.siteUrl, candidate.path),
      ...(candidate.lastModified !== undefined && { lastModified: candidate.lastModified }),
      ...(candidate.changeFrequency && { changeFrequency: candidate.changeFrequency }),
      ...(candidate.priority !== undefined && { priority: candidate.priority }),
    });
  }
  return entries;
}

/** robots.txt (Next.js's `MetadataRoute.Robots`). */
export interface RobotsFile {
  rules: { userAgent: string; allow?: string; disallow: string[] }[];
  sitemap: string;
  host: string;
}

/**
 * Keep the admin, the APIs and every page switched off out of the index, and
 * point at the sitemap.
 */
export function buildRobots(options: { siteUrl: URL | string; disallow?: readonly string[]; hidden?: readonly string[] }): RobotsFile {
  const host = String(options.siteUrl).replace(/\/+$/, '');
  const disallow = [...new Set([...(options.disallow ?? []), ...(options.hidden ?? [])])];
  return {
    rules: [{ userAgent: '*', allow: '/', disallow }],
    sitemap: `${host}/sitemap.xml`,
    host,
  };
}
