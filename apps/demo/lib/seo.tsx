import type { Metadata } from 'next';
import { blogPostingSchema, jsonLdScript, personSchema, type JsonLdPerson, type SeoContentMeta } from '@rcweston/site-data';
import { SITE } from '@/content/site';
import { readConfig } from './config';
import { backend } from './story';

/**
 * A public page's metadata from Admin → SEO: the page's override, then its
 * own content, then the saved defaults, then lib/settings.ts. A page switched
 * off on the dashboard asks not to be indexed.
 */
export async function pageMetadata(path: string, content?: SeoContentMeta): Promise<Metadata> {
  const { site } = await backend();
  const visible = await site.reads['site-resources'].isPathVisible(path);
  return (await site.reads.seo.metadata(path, { content, hidden: !visible })) as Metadata;
}

/** The site's owner, for structured data. */
export function sitePerson(): JsonLdPerson {
  return {
    siteUrl: readConfig().siteUrl.toString(),
    name: SITE.name,
    jobTitle: SITE.role,
    description: `${SITE.role} at ${SITE.studio}, based in ${SITE.location}.`,
    sameAs: SITE.socials.map((social) => social.href),
  };
}

/** A `<script type="application/ld+json">` for structured data. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}

export { blogPostingSchema, personSchema };
