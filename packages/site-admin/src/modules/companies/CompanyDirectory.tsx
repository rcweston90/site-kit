'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { explainFailure, useHiddenKeys } from '@rcweston/save-kit';
import { siteDataPaths, type CompanyDirectory as Directory } from '@rcweston/site-data/client';
import { AdminPage, AdminPageHeader } from '../../primitives/AdminPage.js';
import { AdminLink as Link } from '../../router.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { companyRecordKey } from './keys.js';

const control = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-default px-half text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-primary';

/**
 * Companies: every profile with its assigned case studies, searchable. A
 * company deleted from its editor stays out of the list while Undo is
 * offered.
 */
export function CompanyDirectory({ fixture }: { fixture?: Directory } = {}) {
  const config = useAdminConfig();
  const hidden = useHiddenKeys();
  const [catalog, setCatalog] = useState<Directory | null>(null);
  const [failure, setFailure] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (fixture) return;
    const abort = new AbortController();
    void adminRequest<Directory>(`${config.siteApi}${siteDataPaths.companies()}`, { signal: abort.signal, cache: 'no-store' }).then(setCatalog).catch((error) => {
      if (!abort.signal.aborted) setFailure(explainFailure(error, 'loaded'));
    });
    return () => abort.abort();
  }, [fixture, retry, config.siteApi]);
  const found = fixture ?? catalog;
  const query = search.trim().toLowerCase();
  const companies = found?.companies.filter((item) => !hidden.has(companyRecordKey(item.slug))) ?? [];
  const visible = companies.filter((item) => `${item.name} ${item.slug} ${item.summary}`.toLowerCase().includes(query));
  const add = <Link className={control} href={adminPath(config, 'companies/new')}>New company</Link>;

  return <AdminPage width="wide">
    <AdminPageHeader title="Companies" description="Manage the profiles and logos shared across case studies." action={found?.schemaAvailable ? add : undefined} />
    {failure && <div className="grid justify-items-start gap-half"><p role="alert" className="m-0 text-status-error-text">{failure}</p>
      <button type="button" className={control} onClick={() => { setFailure(''); setRetry((i) => i + 1); }}>Try again</button></div>}
    {!found && !failure && <p role="status" className="text-sm text-foreground-muted">Loading companies…</p>}
    {found && !found.schemaAvailable && <p role="alert" className="text-sm text-status-warning-text">The company catalog isn’t available yet.</p>}
    {found?.schemaAvailable && <>
      {companies.length > 0 && <label className="mb-minor grid max-w-sm gap-half text-sm">Search companies
        <input type="search" className="min-h-11 rounded-md border border-default bg-background px-half text-foreground focus-visible:outline-2 focus-visible:outline-accent-primary"
          value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Name, address or summary" />
      </label>}
      {visible.length ? <ul className="grid list-none gap-half p-0 sm:grid-cols-2">
        {visible.map((profile) => {
          const assigned = found.memberships.filter((item) => item.companySlug === profile.slug);
          return <li className="grid content-start gap-half rounded-lg border border-default bg-card-bg p-minor" key={profile.slug}>
            <div className="flex flex-wrap items-start justify-between gap-half">
              <h2 className="m-0 min-w-0 break-words text-base font-semibold">{profile.name}</h2>
              <Link className={control} href={adminPath(config, `companies/profile/${encodeURIComponent(profile.slug)}`)}>Open profile<ArrowUpRight size={14} aria-hidden="true" /></Link>
            </div>
            <p className="m-0 text-sm text-foreground-muted">{assigned.length} assigned {assigned.length === 1 ? 'case study' : 'case studies'}</p>
            {profile.summary && <p className="m-0 line-clamp-2 text-sm text-foreground-muted">{profile.summary}</p>}
            {assigned.length > 0 && <details className="text-sm">
              <summary className="cursor-pointer">See assigned case studies</summary>
              <ul className="mt-half grid list-none gap-half p-0">
                {assigned.map((item) => <li key={item.storySlug}>
                  <Link className="underline underline-offset-4" href={config.editorHref(item.storySlug)}>{item.storySlug.replaceAll('-', ' ')}</Link></li>)}
              </ul>
            </details>}
          </li>;
        })}
      </ul> : <p role="status" className="text-sm text-foreground-muted">{query ? 'No companies match your search.' : 'No companies yet. Add one to start assigning case studies.'}</p>}
    </>}
  </AdminPage>;
}
