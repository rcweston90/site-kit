import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readConfig } from '../lib/config.ts';
import { createBackend } from '../lib/story.ts';
import { seedCompanies, seedMemberships, seedPrototypes } from '../content/companies.ts';

describe('demo companies and Work inventory', () => {
  it('seeds the companies, every seed story’s company, the prototypes and the site feature', async () => {
    const backend = await createBackend(readConfig({ SITE_KIT_STORAGE: 'memory' }));
    try {
      const { site, store } = backend;
      const directory = await site.reads.companies.directory();
      assert.deepEqual(directory.companies.map((company) => company.name).sort(), ['Fieldnote Studio', 'Harbor Lane Clinics', 'Northfold Library', 'Tidewater Transit']);
      for (const company of directory.companies) assert.match(company.logoUrl ?? '', /^\/logos\/[a-z-]+\.svg$/);
      // Every seed story is assigned, to the company its own story names.
      const stories = await store.list();
      for (const summary of stories) {
        const company = await site.reads.companies.companyOf(summary.slug);
        assert.equal(company?.name, summary.company, summary.slug);
        assert.equal(seedMemberships[summary.slug], company?.slug);
      }
      assert.equal(await site.reads.companies.logoOf('transit-map'), '/logos/tidewater-transit.svg');
      assert.deepEqual((await site.reads.projects.prototypes()).map((project) => project.slug).sort(), Object.keys(seedPrototypes).sort());
      assert.equal(await site.reads['work-order'].sort(['branch-hours', 'stop-finder'], (slug) => slug, 'prototypes').then((sorted) => sorted[0]), 'stop-finder');
      assert.deepEqual((await site.reads.projects.features()).map((feature) => [feature.slug, feature.href]), [['site-readme', '/']]);
      assert.equal(Object.keys(seedCompanies).length, 4);
    } finally {
      await backend.close();
    }
  });
});
