'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { deleteWithUndo, explainFailure, useLeaveGuard, useSaveShortcut } from '@rcweston/save-kit';
import {
  COMPANY_LOGO_UPLOAD_ACCEPT,
  COMPANY_MESSAGES,
  MAX_COMPANY_LOGOS,
  checkCompanyLogoFile,
  createCompanyLogo,
  matchesCompanyLogoSignature,
  normalizeCompanyLogoUrl,
  siteDataPaths,
  type CompanyLogo,
  type CompanyLogoLibrary,
  type CompanyProfile,
} from '@rcweston/site-data/client';
import { AdminSelect } from '../../menu/AdminSelect.js';
import { AdminLink as Link, useAdminRouter } from '../../router.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { CompanyAssetFolder } from './CompanyAssetFolder.js';
import { companyRecordKey } from './keys.js';

const field = 'grid gap-half text-sm leading-baseline text-foreground-muted';
const input = 'min-h-11 min-w-0 rounded-md border border-default bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent-primary';
const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-default px-3 text-sm font-medium hover:bg-background focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50';
const panel = 'rounded-lg border border-default bg-card-bg p-half sm:p-minor';

type CompanyDraft = Pick<CompanyProfile, 'name' | 'summary' | 'website' | 'logoUrl' | 'logoLibrary'>;
const EMPTY_LIBRARY: CompanyLogoLibrary = { logos: [], defaultId: null };
const blank: CompanyDraft = { name: '', summary: '', website: null, logoUrl: null, logoLibrary: EMPTY_LIBRARY };
const draftFrom = ({ name, summary, website, logoUrl, logoLibrary }: CompanyProfile): CompanyDraft => ({ name, summary, website, logoUrl, logoLibrary });

/**
 * One company: its profile, its logo library (upload, add by address,
 * rename, remove with Undo, pick the default) and its asset folder. A new
 * company saves first, then moves to its own address. ⌘S saves; leaving
 * with unsaved changes asks first; a company nothing belongs to can be
 * deleted, with Undo.
 */
export function CompanyEditor({ slug }: { slug?: string }) {
  const config = useAdminConfig();
  const router = useAdminRouter();
  const profileUrl = (target: string, part?: 'logo') => `${config.siteApi}${siteDataPaths.companies(target, part)}`;
  const [saved, setSaved] = useState<CompanyDraft>(blank);
  const [draft, setDraft] = useState<CompanyDraft>(saved);
  const [version, setVersion] = useState<number>();
  const [retry, setRetry] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [usedBy, setUsedBy] = useState<string[]>([]);
  const deleteInput = useRef<HTMLInputElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const deletionInFlight = useRef(false);
  const [loading, setLoading] = useState(Boolean(slug));
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [removed, setRemoved] = useState<{ logo: CompanyLogo; index: number; defaultId: string | null } | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  // A new company gets its library once it has an address to upload to.
  const active = slug ? draft.logoLibrary : undefined;
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    const populate = (company: CompanyProfile) => { setSaved(draftFrom(company)); setDraft(draftFrom(company)); setVersion(company.version); };
    void adminRequest<{ company: CompanyProfile }>(profileUrl(slug), { signal: controller.signal })
      .then((data) => populate(data.company))
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setNotice(explainFailure(reason, 'loaded'));
        setLoadFailed(true);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  useLeaveGuard(dirty);
  const change = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (saving || deleting || uploading || !draft.name.trim() || !dirty || loadFailed || active?.logos.some((logo) => !logo.name.trim())) return;
    setSaving(true);
    setNotice('');
    let moving = false;
    try {
      const { company } = await adminRequest<{ company: CompanyProfile }>(slug ? profileUrl(slug) : `${config.siteApi}${siteDataPaths.companies()}`, {
        method: slug ? 'PUT' : 'POST', body: JSON.stringify({ ...draft, ...(slug ? { expectedVersion: version } : {}) }),
      });
      setNotice('Company saved.');
      // A new company moves to its own address. The form stays unsaved until
      // it does, so the leave guard steps aside for the route change instead
      // of stepping back to this page.
      if (!slug) { moving = true; router.replace(adminPath(config, `companies/profile/${encodeURIComponent(company.slug)}`)); return; }
      setSaved(draftFrom(company));
      setVersion(company.version);
      setDraft((current) => (current === draft ? draftFrom(company) : current));
      setRemoved(null);
    } catch (reason) { setNotice(explainFailure(reason)); }
    finally { if (!moving) setSaving(false); }
  };
  useSaveShortcut(() => void save());

  const canDelete = Boolean(slug && version);
  /** Checks what still belongs to the company, then deletes it with Undo from the directory. */
  const removeCompany = async () => {
    if (!slug || !canDelete || !deleteOpen || deleteText !== slug || saving || uploading || dirty || deletionInFlight.current) return;
    deletionInFlight.current = true; setDeleting(true); setDeleteError(''); setUsedBy([]);
    try {
      const { usedBy: linked } = await adminRequest<{ usedBy: string[] }>(`${config.siteApi}${siteDataPaths.companies(slug, 'assets')}`);
      if (linked.length) {
        setUsedBy(linked.slice(0, 25));
        setDeleteError(COMPANY_MESSAGES.used);
        return;
      }
      const confirmation = deleteText;
      deleteWithUndo({
        key: companyRecordKey(slug),
        label: `Deleting “${saved.name}”`,
        send: ({ keepalive }) => adminRequest(profileUrl(slug), { method: 'DELETE', keepalive, body: JSON.stringify({ expectedVersion: version, confirmation }) }),
      });
      router.replace(adminPath(config, 'companies'));
    } catch (error) {
      setDeleteError(explainFailure(error, 'deleted'));
    } finally { deletionInFlight.current = false; setDeleting(false); }
  };

  const append = (url: string, name: string) => {
    const logo = createCompanyLogo(url, name);
    setDraft((current) => {
      const library = current.logoLibrary;
      if (library.logos.length >= MAX_COMPANY_LOGOS) return current;
      return { ...current, logoLibrary: { logos: [...library.logos, logo], defaultId: library.defaultId ?? (!library.logos.length && !current.logoUrl ? logo.id : null) } };
    });
  };
  const upload = async (file: File | undefined) => {
    if (!file || uploading || !active || active.logos.length >= MAX_COMPANY_LOGOS || !slug) return;
    setUploadNotice('');
    const check = checkCompanyLogoFile(file);
    if (!check.ok) { setUploadNotice(check.error); return; }
    setUploading(true);
    try {
      if (!matchesCompanyLogoSignature(check.contentType, new Uint8Array(await file.slice(0, 16).arrayBuffer()))) throw new Error('The file doesn’t match its image type.');
      const form = new FormData();
      form.set('file', file);
      const source: unknown = (await adminRequest<{ src: unknown }>(profileUrl(slug, 'logo'), { method: 'POST', body: form })).src;
      if (typeof source !== 'string' || !normalizeCompanyLogoUrl(source)) throw new Error('The upload did not return a usable image.');
      append(source, file.name.replace(/\.[^.]+$/, ''));
      setUploadNotice('Logo uploaded. Save company to keep it in the library.');
    } catch (reason) { setUploadNotice(explainFailure(reason, 'uploaded')); }
    finally { setUploading(false); }
  };
  const updateLibrary = (update: (library: CompanyLogoLibrary) => CompanyLogoLibrary) => setDraft((current) => ({ ...current, logoLibrary: update(current.logoLibrary) }));

  if (loading) return <p role="status" className="py-major text-center text-sm text-foreground-muted">Loading company…</p>;
  return <div className="mx-auto max-w-3xl">
    <Link href={adminPath(config, 'companies')} className="text-sm text-foreground-muted hover:text-foreground">← Companies</Link>
    <h1 className="mt-half text-3xl font-semibold leading-minor-2 tracking-tight">{draft.name || (slug ? 'Company profile' : 'New company')}</h1>
    {!loadFailed && slug && <CompanyAssetFolder company={{ slug, name: saved.name, logoUrl: saved.logoUrl, logoLibrary: saved.logoLibrary }} />}
    {loadFailed ? <div className="mt-minor grid justify-items-start gap-half"><p role="alert" className="m-0 text-sm">{notice}</p>
      <button type="button" className={action} onClick={() => { setLoadFailed(false); setNotice(''); setLoading(true); setRetry((i) => i + 1); }}>Try again</button></div> : <form className="mt-minor grid gap-minor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <section className={panel} aria-label="Company information">
        <h2 className="mb-half text-base font-semibold">Company profile</h2>
        <div className="grid gap-half">
          <label className={field}>Name<input required maxLength={120} value={draft.name} onChange={(event) => change('name', event.currentTarget.value)} className={input} /></label>
          <label className={field}>About<textarea maxLength={2400} value={draft.summary} onChange={(event) => change('summary', event.currentTarget.value)} rows={3} className={`${input} py-half`} /></label>
          <label className={field}>Website<input type="url" value={draft.website ?? ''} onChange={(event) => change('website', event.currentTarget.value || null)} className={input} /></label>
        </div>
      </section>
      <section className={panel} aria-labelledby="company-logos-heading">
        <h2 id="company-logos-heading" className="text-base font-semibold">Logo library</h2>
        <p className="mb-half text-sm leading-baseline text-foreground-muted">Set a company default. A case study can choose a different logo from this library.</p>
        {active ? <div className="grid gap-half">
          {active.logos.length > 0 && <label className={field}>Company default
            <AdminSelect value={active.defaultId ?? ''} onChange={(event) => { const id = event.currentTarget.value; updateLibrary((lib) => ({ ...lib, defaultId: id || null })); }}>
              <option value="">{draft.logoUrl ? 'Original logo URL' : 'No logo'}</option>
              {active.logos.map((logo) => <option key={logo.id} value={logo.id}>{logo.name}</option>)}
            </AdminSelect>
          </label>}
          <ul className="m-0 grid list-none gap-half p-0">
            {active.logos.map((logo, index) => <li key={logo.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-default p-half">
              {/* The name labels the entry; the same logo name would be redundant alt text. */}
              <img alt="" src={config.mediaSrc(logo.url)} className="h-12 w-16 object-contain" />
              <label className={field}>Logo name<input className={input} required maxLength={80} value={logo.name} onChange={(event) => { const name = event.currentTarget.value; updateLibrary((lib) => ({ ...lib, logos: lib.logos.map((item) => (item.id === logo.id ? { ...item, name } : item)) })); }} /></label>
              <button type="button" className={action} aria-label={`Remove ${logo.name}`} onClick={() => { setRemoved({ logo, index, defaultId: active.defaultId }); updateLibrary((lib) => ({ logos: lib.logos.filter((item) => item.id !== logo.id), defaultId: lib.defaultId === logo.id ? null : lib.defaultId })); }}><Trash2 size={16} aria-hidden="true" /></button>
            </li>)}
          </ul>
          {removed && <div className="flex flex-wrap items-center gap-3 text-sm" role="status"><span>Removed {removed.logo.name} from this draft.</span><button type="button" className={action} onClick={() => { updateLibrary((lib) => ({ defaultId: removed.defaultId === removed.logo.id && !lib.defaultId ? removed.logo.id : lib.defaultId, logos: [...lib.logos.slice(0, removed.index), removed.logo, ...lib.logos.slice(removed.index)] })); setRemoved(null); }}>Undo</button></div>}
          <div className="flex flex-wrap gap-2">
            <input ref={filePicker} hidden type="file" accept={COMPANY_LOGO_UPLOAD_ACCEPT} aria-label="Logo file" onChange={(event) => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
            <button type="button" className={action} disabled={uploading || active.logos.length >= MAX_COMPANY_LOGOS} onClick={() => filePicker.current?.click()}><ImagePlus size={16} aria-hidden="true" />{uploading ? 'Uploading…' : 'Upload logo'}</button>
            <button type="button" className={action} disabled={active.logos.length >= MAX_COMPANY_LOGOS} aria-expanded={linkOpen} onClick={() => setLinkOpen(!linkOpen)}><Plus size={16} aria-hidden="true" />Add by URL</button>
          </div>
          {linkOpen && <div className="grid gap-half">
            <label className={field}>Logo image address<input className={input} value={linkUrl} onChange={(event) => setLinkUrl(event.currentTarget.value)} placeholder="https://… or /logos/logo.svg" /></label>
            <button type="button" className={`${action} justify-self-start`} onClick={() => { const url = normalizeCompanyLogoUrl(linkUrl); if (!url) { setUploadNotice('Enter an HTTPS or site-relative image address.'); return; } append(url, 'New logo'); setLinkUrl(''); setLinkOpen(false); setUploadNotice('Logo added to this draft.'); }}>Add logo</button>
          </div>}
          {uploadNotice && <p role="status" className="m-0 text-sm text-foreground-muted">{uploadNotice}</p>}
          <details className="text-sm text-foreground-muted">
            <summary className="cursor-pointer leading-minor-2">Original logo URL</summary>
            <label className={field}>Existing logo address<input className={input} value={draft.logoUrl ?? ''} onChange={(event) => change('logoUrl', event.currentTarget.value || null)} placeholder="/logos/logo.svg" /></label>
          </details>
        </div> : <>
          <label className={field}>Logo URL<input className={input} value={draft.logoUrl ?? ''} onChange={(event) => change('logoUrl', event.currentTarget.value || null)} placeholder="https://… or /logos/logo.svg" /></label>
          <p className="mt-half text-sm text-foreground-muted">Save the company before adding more logos.</p>
        </>}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" aria-keyshortcuts="Meta+S Control+S" disabled={saving || deleting || uploading || !dirty || !draft.name.trim() || active?.logos.some((logo) => !logo.name.trim())} className="min-h-11 rounded-md bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50">{saving ? 'Saving…' : 'Save company'}</button>
        <p role="status" className="mb-0 text-sm text-foreground-muted">{notice || (dirty ? 'Unsaved changes' : '')}</p>
      </div>
    </form>}
    {!loadFailed && canDelete && <section aria-label="Delete company" className={`${panel} mt-minor`}>
      <h2 className="mb-half text-base font-semibold">Delete company</h2>
      <p className="mb-half text-sm text-foreground-muted">Only unused company profiles can be deleted. Case studies and uploaded files are never deleted here.</p>
      {!deleteOpen ? <button ref={deleteTrigger} type="button" className={action} disabled={saving || uploading || dirty}
        onClick={() => { setDeleteOpen(true); requestAnimationFrame(() => deleteInput.current?.focus()); }}>Delete company…</button>
        : <div className="grid gap-half">
          <label className={field}>Type <strong>{slug}</strong> to confirm
            <input ref={deleteInput} className={input} autoCapitalize="none" autoComplete="off" spellCheck={false}
              value={deleteText} disabled={deleting} onChange={(event) => setDeleteText(event.currentTarget.value)} />
          </label>
          {deleteError && <p role="alert" className="m-0 text-sm text-status-error-text">{deleteError}</p>}
          {usedBy.length > 0 && <ul className="grid list-none gap-half p-0 text-sm">
            {usedBy.map((story) => <li key={story}>
              <Link className="underline underline-offset-4" href={config.editorHref(story)}>{story.replaceAll('-', ' ')}</Link></li>)}
          </ul>}
          <div className="flex flex-wrap gap-half">
            <button type="button" className={action} disabled={deleting} onClick={() => {
              setDeleteOpen(false); setDeleteText(''); setDeleteError(''); setUsedBy([]); requestAnimationFrame(() => deleteTrigger.current?.focus());
            }}>Keep company</button>
            <button type="button" className={`${action} text-status-error-text`} disabled={deleting || saving || uploading || dirty || deleteText !== slug}
              onClick={() => void removeCompany()}>{deleting ? 'Deleting…' : 'Delete this company'}</button>
          </div>
        </div>}
    </section>}
  </div>;
}
