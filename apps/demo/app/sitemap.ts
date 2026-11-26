import type { MetadataRoute } from 'next';
import { buildSitemap, type SitemapCandidate } from '@rcweston/site-data';
import { SITE_PAGES } from '@/content/site';
import { readConfig } from '@/lib/config';
import { backend } from '@/lib/story';
import { photoCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';

/**
 * Home, the pages and resources switched on in the dashboard, the photo
 * credits once there are any, and every
 * published story, less any page whose SEO override says not to index it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { site, store } = await backend();
  const [hidden, overrides, summaries, resumeAvailable] = await Promise.all([
    site.reads['site-resources'].hiddenPaths(),
    site.reads.seo.overrides(),
    store.list(),
    site.reads.resume.available(),
  ]);
  const credits = await photoCredits();
  const candidates: SitemapCandidate[] = [
    { path: '/', changeFrequency: 'monthly', priority: 1 },
    ...SITE_PAGES.map((page): SitemapCandidate => ({ path: page.path, changeFrequency: 'weekly', priority: 0.8 })),
    ...(resumeAvailable ? [{ path: '/resume', changeFrequency: 'monthly' as const, priority: 0.5 }] : []),
    ...(credits.length ? [{ path: '/credits', changeFrequency: 'yearly' as const, priority: 0.2 }] : []),
    ...summaries
      .filter((summary) => summary.publishedDocumentId)
      .map((summary): SitemapCandidate => ({ path: `/stories/${summary.slug}`, lastModified: summary.updatedAt, changeFrequency: 'monthly', priority: 0.7 })),
  ];
  const isHidden = (path: string) => hidden.some((stored) => path === stored || path.startsWith(`${stored}/`));
  return buildSitemap(candidates, { siteUrl: readConfig().siteUrl, isVisible: (path) => !isHidden(path), overrides });
}
