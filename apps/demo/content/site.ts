import type { SitePage } from '@rcweston/site-data';

/**
 * The site's owner and the pages in its navigation. Everything here is made
 * up for the demo; change it to make the site yours.
 */
export const SITE = {
  name: 'Lena Ortiz',
  /** The short name beside the mark in the navigation. */
  handle: 'lena ortiz',
  role: 'Product designer',
  studio: 'Fieldnote Studio',
  /** The team or practice under the role, in the header's record. */
  affiliation: 'Research tools',
  location: 'Lisbon',
  /** The header's statement, one line each. */
  descriptors: ['Research-led designer.', 'Systems thinker.', 'Plain writer.'],
  /** Profiles in the header and footer. Reserved example addresses, so nothing here points at a real account. */
  socials: [
    { name: 'Portfolio feed', platform: 'feed', href: 'https://example.com/feed' },
    { name: 'Code', platform: 'code', href: 'https://example.com/code' },
  ],
} as const;

/**
 * Pages the admin can hide (Dashboard → Page visibility) and that the nav and
 * footer list after Readme, in this order. A hidden page drops out of both
 * and answers 404. A later module adds its page here and its route under
 * app/(site); see PUBLIC.md.
 */
export const SITE_PAGES: SitePage[] = [
  { path: '/work', label: 'Work' },
  { path: '/shots', label: 'Shots' },
  { path: '/community', label: 'Community' },
  { path: '/blog', label: 'Posts' },
];
