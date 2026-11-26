'use client';

import { Pencil } from 'lucide-react';
import type { CompanyProfile } from '@rcweston/site-data/client';
import { AdminLink as Link } from '../../router.js';
import { adminPath, useAdminConfig } from '../../config.js';

export type CompanyTheme = CompanyProfile & { count: number };

/**
 * Companies over the Work table: every case study belongs to one. Choosing a
 * company narrows the table to its studies; the pencil opens its profile.
 */
export function CompaniesPanel({ companies, total, filter, onFilter, schemaAvailable }: {
  companies: readonly CompanyTheme[];
  /** Every case study, for All companies. */
  total: number;
  /** A company's name, or `all`. */
  filter: string;
  onFilter: (filter: string) => void;
  schemaAvailable: boolean;
}) {
  const config = useAdminConfig();
  return (
    <section aria-labelledby="company-themes-heading" className="mb-minor rounded-lg border border-default bg-card-bg p-4">
      <div className="flex flex-col gap-half md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-0 font-mono text-xs uppercase tracking-widest text-accent-secondary-text">Parent themes</p>
          <h2 id="company-themes-heading" className="mb-0 mt-1 font-mono text-lg font-bold uppercase tracking-wide text-foreground">Companies</h2>
          <p className="mb-0 mt-1 text-sm leading-baseline text-foreground-muted">Every case study belongs to a company. Choose one to work on its projects without changing or duplicating their stories.</p>
        </div>
        <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</span>
      </div>
      <div className="mt-half grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => onFilter('all')} className="min-h-14 rounded-md border border-default px-3 py-2 text-left hover:bg-foreground/[0.03] aria-pressed:border-foreground/40 aria-pressed:bg-foreground/[0.05]">
          <span className="block font-sans text-sm font-semibold text-foreground">All companies</span>
          <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">{total} studies</span>
        </button>
        {companies.map((company) => (
          <div key={company.name} className="flex overflow-hidden rounded-md border border-default">
            <button type="button" aria-pressed={filter === company.name} onClick={() => onFilter(company.name)} className="min-h-14 min-w-0 flex-1 px-3 py-2 text-left hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary aria-pressed:bg-foreground/[0.05]">
              <span className="block font-sans text-sm font-semibold text-foreground">{company.name}</span>
              <span className="font-mono text-xs uppercase tracking-wider text-foreground-muted">{company.count} {company.count === 1 ? 'study' : 'studies'}</span>
              {company.summary && <span className="mt-1 block text-xs leading-snug text-foreground-muted">{company.summary}</span>}
            </button>
            {schemaAvailable && company.updatedAt && <Link
              href={adminPath(config, `companies/profile/${encodeURIComponent(company.slug)}`)}
              aria-label={`Edit ${company.name}`}
              title={`Edit ${company.name}`}
              className="grid min-w-11 shrink-0 place-items-center border-l border-default text-foreground-muted hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary"
            ><Pencil size={16} aria-hidden="true" /></Link>}
          </div>
        ))}
      </div>
      <div className="mt-half flex items-center justify-between gap-3 border-t border-default pt-half">
        <p className="mb-0 text-xs leading-baseline text-foreground-muted">{schemaAvailable ? 'Company information and story assignments are stored independently from immutable story versions.' : 'Preview fallback: company names come from existing stories until the company tables are migrated.'}</p>
        {schemaAvailable && <Link href={adminPath(config, 'companies/new')} className="shrink-0 font-mono text-xs font-semibold uppercase tracking-wider text-foreground hover:text-accent-primary">New company +</Link>}
      </div>
    </section>
  );
}
