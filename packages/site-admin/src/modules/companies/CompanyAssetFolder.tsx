'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowUpRight, FileText, FolderOpen, ImageOff, Shapes } from 'lucide-react';
import {
  companyFolderLogos,
  isCompanyLogoUploadSrc,
  siteDataPaths,
  type CompanyFolderLogo,
  type CompanyFolderProject,
  type CompanyIdentity,
} from '@rcweston/site-data/client';
import { AdminLink as Link } from '../../router.js';
import { adminPath, useAdminConfig, type AdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';

const action = 'inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium underline decoration-default underline-offset-4 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

function LogoThumbnail({ item, mediaSrc }: { item: CompanyFolderLogo; mediaSrc: AdminConfig['mediaSrc'] }) {
  const [failed, setFailed] = useState(false);
  // Imported links can be anywhere. Only auto-load uploaded logos and site
  // image paths; external files load only when the admin opens them.
  const preview = !item.external && (isCompanyLogoUploadSrc(item.src) || /^\/(?:logos|images)\/[a-z0-9/_-]+\.(?:svg|png|webp|jpe?g|gif|avif)$/i.test(item.src));
  if (!preview || failed) return <div role="img" aria-label={failed ? 'Image could not be loaded' : 'Open image to view'}
    className="grid min-h-minor-2 place-items-center rounded bg-background-secondary text-foreground-muted">
    <ImageOff size={20} aria-hidden="true" />
  </div>;
  return <img src={mediaSrc(item.src)} alt="" width={320} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
    className="h-minor-2 w-full rounded bg-[var(--on-panel)] p-half object-contain" />;
}

const projectHref = (config: AdminConfig, project: CompanyFolderProject) =>
  project.opens === 'story' ? config.editorHref(project.slug) : adminPath(config, `projects/${encodeURIComponent(project.slug)}/edit`);

/** What belongs to one company: its linked projects and its saved logos. */
export function CompanyAssetFolder({ company, fixtureProjects }: { company: CompanyIdentity; fixtureProjects?: readonly CompanyFolderProject[] }) {
  const config = useAdminConfig();
  const id = useId();
  const [projects, setProjects] = useState<readonly CompanyFolderProject[] | null>(fixtureProjects ?? null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (fixtureProjects) return;
    const controller = new AbortController();
    void adminRequest<{ projects: CompanyFolderProject[] }>(`${config.siteApi}${siteDataPaths.companies(company.slug, 'assets')}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setProjects(data.projects); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [company.slug, fixtureProjects, retry, config.siteApi]);
  const logos = companyFolderLogos(company);

  return <section aria-labelledby={id} className="mt-minor rounded-lg border border-default bg-card-bg p-half sm:p-minor">
    <div className="flex items-center gap-2 text-foreground">
      <FolderOpen size={20} aria-hidden="true" />
      <h2 id={id} className="mb-0 font-semibold leading-baseline">Asset folder</h2>
    </div>
    <p className="mb-minor text-sm leading-baseline text-foreground-muted">Browse linked projects and saved logos for {company.name}.</p>
    <div className="grid gap-minor-2">
      <section aria-label="Company projects" className="min-w-0">
        <h3 className="mb-half text-sm font-semibold leading-baseline">Projects{projects ? ` (${projects.length})` : ''}</h3>
        {error ? <div>
          <p role="alert" className="mb-0 text-sm leading-baseline text-status-error-text">Linked projects couldn’t load.</p>
          <button type="button" onClick={() => { setError(false); setRetry((value) => value + 1); }} className={action}>Try again</button>
        </div> : projects === null ? <p role="status" className="mb-0 text-sm leading-baseline text-foreground-muted">Loading linked projects…</p>
          : projects.length === 0 ? <p className="mb-0 rounded border border-default px-half py-half text-sm leading-baseline text-foreground-muted">No projects are linked to this company yet.</p>
          : <ul className="divide-y divide-default rounded-md border border-default">
            {projects.map((project) => <li key={project.slug} className="min-w-0">
              {fixtureProjects ? <div className="flex gap-2 px-half py-half">
                <ProjectDescription project={project} />
              </div> : <Link href={projectHref(config, project)} className="flex rounded-md px-half py-half hover:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary">
                <ProjectDescription project={project} />
                <ArrowUpRight size={16} aria-hidden="true" className="ml-auto shrink-0 text-foreground-muted" />
              </Link>}
            </li>)}
          </ul>}
      </section>
      <section aria-label="Company logos" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-half">
          <h3 className="mb-0 text-sm font-semibold leading-baseline">Logos ({logos.length})</h3>
          <a href="#company-logos-heading" className={action}>Manage logos</a>
        </div>
        {!logos.length ? <p className="mb-0 rounded border border-default px-half py-half text-sm leading-baseline text-foreground-muted">No saved logos for this company yet. Add a logo in the Logo library below.</p>
          : <ul className="grid gap-half sm:grid-cols-2">
            {logos.map((item) => <li key={`${item.source}:${item.id}`} className="min-w-0 rounded-md border border-default p-half">
              <LogoThumbnail key={item.src} item={item} mediaSrc={config.mediaSrc} />
              <p className="mb-0 mt-half break-words text-sm font-medium leading-baseline">{item.name}{item.isDefault ? ' · Default' : ''}</p>
              <p className="mb-0 text-sm leading-baseline text-foreground-muted">{item.source}</p>
              <p className="mb-0 break-all text-sm leading-baseline text-foreground-muted">{item.external ? new URL(item.src).hostname : item.src}</p>
              {!fixtureProjects && <a href={config.mediaSrc(item.src)} rel="noopener noreferrer" target="_blank" referrerPolicy="no-referrer" className={action}>Open image <ArrowUpRight size={14} aria-hidden="true" /></a>}
            </li>)}
          </ul>}
      </section>
    </div>
  </section>;
}

function ProjectDescription({ project }: { project: CompanyFolderProject }) {
  const Glyph = project.kind === 'Prototype' ? Shapes : FileText;
  return <div className="flex min-w-0 flex-1 gap-2">
    <Glyph size={18} aria-hidden="true" className="shrink-0 text-foreground-muted" />
    <div className="min-w-0">
      <p className="mb-0 break-words text-sm font-medium leading-baseline">{project.title}</p>
      <p className="mb-0 text-sm leading-baseline text-foreground-muted">
        {[project.kind, project.status, project.source].filter(Boolean).join(' · ')}
      </p>
    </div>
  </div>;
}
