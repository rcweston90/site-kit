/**
 * The small HTML vocabulary the post editor writes, and what readers get
 * from it. This is not a general HTML parser: unknown tags and attributes are
 * discarded, text and every kept attribute are escaped, and URLs are
 * allowlisted on their own. Never hand post HTML to anything that runs code,
 * and never return the input markup as it came.
 *
 * Also here, because the sanitizer needs them: callout tones, the button
 * (CTA) rules, and the "Learn more" card markers with their rendering.
 */

// ─── Callouts ───────────────────────────────────────────────────────────────

export const BLOG_CALLOUT_TONES = {
  neutral: 'Note',
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
} as const;

export type BlogCalloutTone = keyof typeof BLOG_CALLOUT_TONES;

export function blogCalloutTone(value: unknown): BlogCalloutTone {
  return typeof value === 'string' && Object.hasOwn(BLOG_CALLOUT_TONES, value) ? (value as BlogCalloutTone) : 'neutral';
}

// ─── Buttons (CTA) ──────────────────────────────────────────────────────────

/** A CTA is navigational, never an HTML button action or executable content. */
export const CTA_LABEL_MAX = 80;
export const CTA_URL_MAX = 2048;
export type CmsCta = { label: string; href: string; newTab?: boolean };

export function cmsCtaHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > CTA_URL_MAX || /[\u0000-\u001f\u007f\\]/.test(value)) return;
  const href = value.trim();
  if (!href || /\s/.test(href)) return;
  if (/^(?:\/(?!\/)|#.+)/.test(href)) return href;
  if (!/^https?:\/\//i.test(href)) return;
  try {
    const url = new URL(href);
    if (url.hostname && !url.username && !url.password) return href;
  } catch {
    /* An incomplete URL is not a navigable CTA. */
  }
}

export function cmsCtaLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return;
  const label = value.trim();
  return label && label.length <= CTA_LABEL_MAX ? label : undefined;
}

export function completedCmsCta(label: unknown, href: unknown, newTab?: unknown): CmsCta | null {
  const cleanLabel = cmsCtaLabel(label);
  const cleanHref = cmsCtaHref(href);
  return cleanLabel && cleanHref ? { label: cleanLabel, href: cleanHref, ...(newTab === true ? { newTab: true } : {}) } : null;
}

// ─── "Learn more" cards ─────────────────────────────────────────────────────

/** A card stores an internal identity, never a destination URL or copy. */
export const BLOG_RELATED_TILE = 'blog-related-tile';
/** `post` names a post by its numeric id (it survives a rename); `case-study` names a story by address. */
export type RelatedTileReference = { kind: 'case-study' | 'post'; id: string; newTab?: boolean };
export type RelatedTileChoice = RelatedTileReference & { title: string; slug: string };
export type RelatedTileDestination = { title: string; slug: string };
export type ResolveRelatedTile = (reference: RelatedTileReference) => RelatedTileDestination | undefined;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function relatedTileReference(kind: unknown, id: unknown): RelatedTileReference | null {
  if (typeof id !== 'string' || id.length > 180) return null;
  if (kind === 'post') return /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id)) ? { kind, id } : null;
  return kind === 'case-study' && slugPattern.test(id) ? { kind, id } : null;
}

export function relatedTileKey({ kind, id }: RelatedTileReference) {
  return `${kind}:${id}`;
}

export function relatedTileFromKey(value: string) {
  const [kind, id, overflow] = value.split(':');
  return overflow === undefined ? relatedTileReference(kind, id) : null;
}

const marker = () => /<blog-related-tile data-kind="([^"]*)" data-id="([^"]*)"(?: data-open="(new-tab)")?><\/blog-related-tile>/g;

export function relatedTileMarkerAttrs(reference: RelatedTileReference, newTab: boolean) {
  return { 'data-kind': reference.kind, 'data-id': reference.id, ...(newTab ? { 'data-open': 'new-tab' } : {}) };
}

/** Every card reference in sanitized HTML, in page order. */
export function blogRelatedReferences(sanitized: string): RelatedTileReference[] {
  return [...sanitized.matchAll(marker())].flatMap(([, kind, id, open]) => {
    const reference = relatedTileReference(kind, id);
    return reference ? [{ ...reference, ...(open ? { newTab: true } : {}) }] : [];
  });
}

/**
 * The reader only consumes the canonical markers the sanitizer emits. A card
 * whose destination is gone (unpublished, deleted) renders as nothing.
 */
export interface RelatedTileHrefs {
  /** A case study's page. Default `/work/:slug`. */
  caseStudy?: (slug: string) => string;
  /** A post's page. Default `/blog/:slug`. */
  post?: (slug: string) => string;
}

export function renderBlogRelatedTiles(sanitized: string, resolve: ResolveRelatedTile, hrefs: RelatedTileHrefs = {}): string {
  return sanitized.replace(marker(), (_, kind: string, id: string, open?: string) => {
    const reference = relatedTileReference(kind, id);
    if (!reference) return '';
    const target = resolve(reference);
    if (!target || !slugPattern.test(target.slug)) return '';
    const isStudy = reference.kind === 'case-study';
    const title = target.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const link = isStudy ? (hrefs.caseStudy ?? ((slug: string) => `/work/${slug}`)) : (hrefs.post ?? ((slug: string) => `/blog/${slug}`));
    const href = escapeHtml(safeBlogUrl(link(target.slug)) ?? `/${target.slug}`);
    return `<a data-related-tile href="${href}"${open ? ' target="_blank" rel="noopener noreferrer"' : ''}><span><small>Learn more · ${isStudy ? 'Case study' : 'Post'}</small><strong>${title}</strong></span><span aria-hidden="true">↗</span></a>`;
  });
}

// ─── The sanitizer ──────────────────────────────────────────────────────────

const tags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'mark', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'br', 'hr', 'img', 'aside']);
const voidTags = new Set(['br', 'hr', 'img']);
const highlightColors = new Set(['yellow', 'red', 'green', 'teal', 'blue', 'purple', 'grey']);

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '�';
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Explicit web URLs and local paths; links also allow relative paths, anchors, mail and phone. */
export function safeBlogUrl(value: string, image = false): string | undefined {
  // Reject controls before trimming, including obfuscated schemes and network paths.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  const url = value.trim();
  if (!url || /\s/.test(url)) return undefined;
  if (/^https?:\/\/[^/]+/i.test(url) || /^\/(?!\/)/.test(url)) return url;
  if (!image && /^(?:#|\?|\.\.?\/|mailto:|tel:)/i.test(url)) return url;
  return undefined;
}

export function sanitizeBlogHtml(html: string, { retainRelatedTiles = false }: { retainRelatedTiles?: boolean } = {}): string {
  const output: string[] = [];
  const stack: { name: string; retained: boolean }[] = [];
  let tileDepth = 0;
  // Tokens are never copied as markup. Even malformed or foreign content is
  // rebuilt only from the vocabulary above.
  const visible = html.replace(/<p data-blog-cta=""><\/p>/g, '');
  for (const token of visible.match(/<!--[\s\S]*?(?:-->|$)|<[^>]*>|[^<]+|</g) ?? []) {
    if (token.startsWith('<!--')) continue;
    const tag = /^<(\/?)\s*([a-z][a-z0-9-]*)([\s\S]*?)>$/i.exec(token);
    if (!tag) {
      if (!tileDepth) output.push(escapeHtml(decodeEntities(token)));
      continue;
    }
    const name = tag[2].toLowerCase();
    if (name === BLOG_RELATED_TILE) {
      if (tag[1]) {
        tileDepth = Math.max(0, tileDepth - 1);
        continue;
      }
      if (tileDepth++ || !retainRelatedTiles) continue;
      const attrs: Record<string, string> = Object.create(null);
      for (const match of tag[3].matchAll(/(data-kind|data-id|data-open)\s*=\s*"([^"]*)"/g)) attrs[match[1]] = match[2];
      const ref = relatedTileReference(attrs['data-kind'], attrs['data-id']);
      if (ref) output.push(`<${BLOG_RELATED_TILE} data-kind="${ref.kind}" data-id="${ref.id}"${attrs['data-open'] === 'new-tab' ? ' data-open="new-tab"' : ''}></${BLOG_RELATED_TILE}>`);
      continue;
    }
    if (tileDepth) continue;
    if (!tags.has(name)) continue;
    if (tag[1]) {
      const index = stack.findLastIndex((entry) => entry.name === name);
      if (index >= 0) {
        while (stack.length > index) {
          const entry = stack.pop()!;
          if (entry.retained) output.push(`</${entry.name}>`);
        }
      }
      continue;
    }
    const attributes: Record<string, string> = Object.create(null);
    const pattern = /([^\s=/'"<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+))/g;
    for (const match of tag[3].matchAll(pattern)) {
      const key = match[1].toLowerCase();
      if (!(key in attributes)) attributes[key] = decodeEntities(match[2] ?? match[3] ?? match[4]);
    }
    if (name === 'aside' && !('data-blog-callout' in attributes)) {
      // An ordinary aside is unwrapped, without closing a recognised callout
      // that appears inside it.
      stack.push({ name, retained: false });
      continue;
    }
    const kept: Record<string, string> = {};
    if (name === 'aside') {
      const tone = blogCalloutTone(attributes['data-blog-callout']);
      kept['data-blog-callout'] = tone;
      kept['aria-label'] = BLOG_CALLOUT_TONES[tone];
    }
    if (name === 'a') {
      const cta = 'data-cms-cta' in attributes;
      const href = cta ? cmsCtaHref(attributes.href) : safeBlogUrl(attributes.href ?? '');
      if (cta && href) kept['data-cms-cta'] = '';
      if (href) kept.href = href;
      if (attributes.title) kept.title = attributes.title;
      if (href && attributes.target === '_blank') {
        kept.target = '_blank';
        kept.rel = 'noopener noreferrer';
      }
    }
    if (name === 'img') {
      const src = safeBlogUrl(attributes.src ?? '', true);
      if (!src) continue;
      kept.src = src;
      kept.alt = attributes.alt ?? '';
      kept.loading = 'lazy';
      if (attributes.title) kept.title = attributes.title;
    }
    if (name === 'p' && attributes['data-large'] === 'true') kept['data-large'] = 'true';
    if (name === 'mark' && highlightColors.has(attributes['data-color'])) kept['data-color'] = attributes['data-color'];
    if (name === 'ol' && /^\d{1,6}$/.test(attributes.start ?? '')) kept.start = attributes.start;
    output.push(`<${name}${Object.entries(kept).map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('')}>`);
    if (!voidTags.has(name)) stack.push({ name, retained: true });
  }
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.retained) output.push(`</${entry.name}>`);
  }
  return output.join('');
}

/** The words a reader sees, for reading time and search. */
export function blogPlainText(html: string): string {
  return decodeEntities(sanitizeBlogHtml(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
