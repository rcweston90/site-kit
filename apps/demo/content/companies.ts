import type { CompanyRecord, ProjectFields, WorkFeature } from '@rcweston/site-data';

/**
 * The demo's companies, their case studies, its prototypes and its one site
 * feature. Every company here is made up; the logos are drawn for the demo
 * and live in public/logos.
 */

const company = (name: string, summary: string, logo: string): CompanyRecord => ({
  name,
  summary,
  website: null,
  logoUrl: `/logos/${logo}.svg`,
  logoLibrary: { logos: [], defaultId: null },
});

export const seedCompanies: Record<string, CompanyRecord> = {
  'fieldnote-studio': company('Fieldnote Studio', 'Research tools for teams who interview their customers every week.', 'fieldnote-studio'),
  'tidewater-transit': company('Tidewater Transit', 'Ferries and buses for a string of harbor towns.', 'tidewater-transit'),
  'northfold-library': company('Northfold Library', 'A county library system with eleven branches and one catalog.', 'northfold-library'),
  'harbor-lane-clinics': company('Harbor Lane Clinics', 'Walk-in clinics that book most visits online.', 'harbor-lane-clinics'),
};

/** Story address → company address. */
export const seedMemberships: Record<string, string> = {
  'field-notes': 'fieldnote-studio',
  'quiet-onboarding': 'fieldnote-studio',
  'pricing-page': 'fieldnote-studio',
  'button-audit': 'fieldnote-studio',
  'transit-map': 'tidewater-transit',
  'clinic-booking': 'harbor-lane-clinics',
  'archive-search': 'northfold-library',
};

const prototype = (fields: Partial<ProjectFields> & Pick<ProjectFields, 'title' | 'date'>): ProjectFields => ({
  description: '', tags: [], image: null, images: [], featured: false, role: null, org: null, duration: null, url: null,
  ...fields,
  type: 'Prototype',
});

/** Prototypes: a card on Work that opens somewhere else. */
export const seedPrototypes: Record<string, ProjectFields> = {
  'stop-finder': prototype({
    title: 'Stop finder',
    description: 'Type a street, see the next three departures from the nearest stop.',
    date: '2025-09-01',
    org: 'Tidewater Transit',
    role: 'Product designer',
    tags: ['Maps', 'Mobile'],
    url: 'https://example.com/prototypes/stop-finder',
  }),
  'branch-hours': prototype({
    title: 'Branch hours board',
    description: 'One board for every branch’s hours, holds shelf and closures.',
    date: '2024-11-01',
    org: 'Northfold Library',
    role: 'Designer',
    tags: ['Signage'],
    url: 'https://example.com/prototypes/branch-hours',
  }),
  'visit-checkin': prototype({
    title: 'Visit check-in',
    description: 'Check in from the parking lot and wait in the car.',
    date: '2025-03-01',
    org: 'Harbor Lane Clinics',
    tags: ['Health'],
  }),
};

/** Prototypes that open with the companies they belong to. */
export const seedPrototypeMemberships: Record<string, string> = {
  'stop-finder': 'tidewater-transit',
  'branch-hours': 'northfold-library',
  'visit-checkin': 'harbor-lane-clinics',
};

/** The Work order of the prototypes. */
export const seedPrototypeOrder = ['stop-finder', 'visit-checkin', 'branch-hours'];

/** A page managed in code that still gets a card on Work. */
export const siteFeatures: WorkFeature[] = [
  { slug: 'site-readme', href: '/', title: 'How this site is made', description: 'The packages behind these pages, and how a story gets from the editor to Work.' },
];
