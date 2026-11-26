import type { SeoDefaults, SeoPageOverride } from '@rcweston/site-data';

/**
 * What Admin → SEO holds on a fresh site: the saved defaults and a few page
 * overrides, the way the site launched them. Written once, with the sample
 * stories. Everything here is made up for the demo.
 */
export const SEO_SEED: { defaults: SeoDefaults; overrides: Record<string, Partial<SeoPageOverride>> } = {
  defaults: {
    titleTemplate: '%s · Lena Ortiz',
    defaultTitle: 'Lena Ortiz · Product designer',
    description: 'Lena Ortiz designs research tools at Fieldnote Studio in Lisbon. Case studies, posts and photographs. A made-up designer for the site-kit demo.',
    ogImage: '/og-default.png',
    keywords: ['product design', 'research', 'case studies', 'design systems', 'Lisbon'],
    siteName: 'Lena Ortiz',
    twitterHandle: null,
  },
  overrides: {
    '/work': {
      title: 'Work',
      description: 'Case studies from research tools, transit and health care, each starting with what people were trying to do.',
    },
    '/shots': {
      description: 'Photographs from walks around Lisbon and the coast: harbours, trams, tiles and light.',
    },
    '/stories/transit-map': {
      description: 'Redrawing a bus map around the question riders ask at the door. Wrong-bus complaints fell from 41 a month to 17.',
      keywords: ['wayfinding', 'transit', 'information design'],
    },
    // Hidden from Work, so kept out of search as well.
    '/stories/clinic-booking': { robotsIndex: false, robotsFollow: true },
    '/blog/measure-the-wait': {
      title: 'Measure the wait, not the click',
      description: 'Why the number that mattered for online booking was how long patients waited to hear back.',
    },
  },
};
