import type { MetadataRoute } from 'next';
import { buildRobots } from '@rcweston/site-data';
import { readConfig } from '@/lib/config';
import { ROBOTS_DISALLOW } from '@/lib/settings';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

/** Keep the admin, the APIs and every page switched off in the dashboard out of search. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { site } = await backend();
  const hidden = await site.reads['site-resources'].hiddenPaths();
  return buildRobots({ siteUrl: readConfig().siteUrl, disallow: ROBOTS_DISALLOW, hidden });
}
