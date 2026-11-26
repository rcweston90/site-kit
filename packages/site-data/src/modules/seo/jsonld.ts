/**
 * Structured data (schema.org JSON-LD) for the public pages: the site's
 * owner as one Person across every page, and each story and post as a work
 * by them. Browser-safe and framework-free; a page puts `jsonLdScript(…)` in
 * a `<script type="application/ld+json">`.
 */

export interface JsonLdPerson {
  /** The site's address, e.g. `https://example.com`. */
  siteUrl: string;
  name: string;
  jobTitle?: string;
  description?: string;
  /** A picture of them or the share card, absolute or a site path. */
  image?: string;
  /** Profile addresses elsewhere. */
  sameAs?: readonly string[];
}

const trim = (url: string) => url.replace(/\/+$/, '');

/** A stable `@id`, so the Person is one entity across pages (home, and as author or creator). */
export const personIdFor = (siteUrl: string) => `${trim(siteUrl)}/#person`;

/**
 * A schema serialised for a `<script type="application/ld+json">` body. Plain
 * JSON.stringify leaves `<` alone, so a title containing "</script>" (typed
 * in the editor) would close the tag early.
 */
export function jsonLdScript(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}

const absolute = (siteUrl: string, url?: string | null) => (!url ? undefined : /^https?:\/\//.test(url) ? url : `${trim(siteUrl)}${url.startsWith('/') ? '' : '/'}${url}`);

const personRef = (person: JsonLdPerson) => ({ '@type': 'Person', '@id': personIdFor(person.siteUrl), name: person.name, url: trim(person.siteUrl) });

export function personSchema(person: JsonLdPerson) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personIdFor(person.siteUrl),
    name: person.name,
    url: trim(person.siteUrl),
    ...(person.jobTitle && { jobTitle: person.jobTitle }),
    ...(person.description && { description: person.description }),
    ...(absolute(person.siteUrl, person.image) && { image: absolute(person.siteUrl, person.image) }),
    ...(person.sameAs?.length && { sameAs: [...person.sameAs] }),
  };
}

export function blogPostingSchema(person: JsonLdPerson, post: { path: string; title: string; description?: string; date?: string; image?: string }) {
  const url = absolute(person.siteUrl, post.path)!;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    ...(post.description && { description: post.description }),
    url,
    mainEntityOfPage: url,
    ...(post.date && { datePublished: post.date }),
    ...(absolute(person.siteUrl, post.image) && { image: absolute(person.siteUrl, post.image) }),
    author: personRef(person),
    publisher: personRef(person),
  };
}

export function creativeWorkSchema(person: JsonLdPerson, work: { path: string; title: string; company?: string; description?: string; image?: string; date?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: work.title,
    url: absolute(person.siteUrl, work.path),
    ...(work.company && { about: work.company }),
    ...(work.description && { abstract: work.description }),
    ...(absolute(person.siteUrl, work.image) && { image: absolute(person.siteUrl, work.image) }),
    ...(work.date && { dateModified: work.date }),
    creator: personRef(person),
  };
}
