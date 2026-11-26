import type { ResumeBase, SeoFallbacks, SiteResource } from '@rcweston/site-data';
import { SITE } from '@/content/site';
import { resumePdf } from './resume-pdf';

/**
 * The site-wide settings modules' configuration: the resume shipped with the
 * site, the resources the admin can hide, and what pages say before anything
 * is saved on the SEO screen.
 */

/** Served at /resume until one is uploaded in Admin → Resume. Drawn in lib/resume-pdf.ts. */
export const RESUME_BASE: ResumeBase = {
  filename: 'lena-ortiz-resume.pdf',
  read: async () => resumePdf(),
  modifiedAt: '2026-11-01T00:00:00.000Z',
};

/** Resources the dashboard can hide. Hiding the resume takes it off Work and out of the sitemap; the PDF itself stays reachable. */
export const SITE_RESOURCES: SiteResource[] = [
  { id: 'resume', path: '/resume', label: 'Résumé', description: 'Work resource buttons and the sitemap.' },
];

export const SEO_FALLBACKS: SeoFallbacks = {
  titleTemplate: `%s · ${SITE.name}`,
  defaultTitle: `${SITE.name} · ${SITE.role}`,
  description: `Case studies by ${SITE.name}, a made-up designer: the demo site for the story CMS and its admin.`,
  keywords: ['product design', 'case studies', 'research'],
  siteName: SITE.name,
  ogImage: '/og-default.png',
};

/** Where the site must never be crawled, whatever is switched on. */
export const ROBOTS_DISALLOW = ['/admin', '/api'];
