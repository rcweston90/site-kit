'use client';

import { useEffect, useState } from 'react';
import { KeptEditsNotice, SaveBar, useFormSave } from '@rcweston/save-kit';
import { siteDataPaths, type ProjectRecord, type WorkFeature } from '@rcweston/site-data/client';
import { AdminLink as Link } from '../../router.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';

type Card = Pick<ProjectRecord, 'title' | 'description'>;
const empty: Card = { title: '', description: '' };
const isCard = (value: unknown): value is Card =>
  !!value && typeof value === 'object' && 'title' in value && 'description' in value
  && typeof value.title === 'string' && typeof value.description === 'string';
const cardOf = ({ title, description }: Card) => ({ title, description });
const field = 'w-full rounded-md border border-default bg-card-bg p-half text-foreground focus-visible:outline-2 focus-visible:outline-offset-2';

/** A site feature's card on Work: its page is managed in code, its title and description here. */
export function FeatureWorkCardEditor({ feature }: { feature: Pick<WorkFeature, 'slug' | 'href'> }) {
  const config = useAdminConfig();
  const [value, setValue] = useState<Card>(empty);
  const [saved, setSaved] = useState<Card>(empty);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const endpoint = `${config.siteApi}${siteDataPaths.projects(feature.slug)}`;
  const apply = (card: ProjectRecord) => { const next = cardOf(card); setSaved(next); setValue(next); setVersion(card.version); setReady(true); };
  useEffect(() => {
    let current = true;
    void adminRequest<{ project: ProjectRecord }>(endpoint).then(({ project }) => { if (current) apply(project); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [endpoint]);

  const { status, dirty, kept } = useFormSave({
    storageKey: `admin:unsaved:work-card:${feature.slug}`,
    ready, value, saved, accept: isCard, onSave: () => void save(),
  });
  const restore = () => {
    const card = kept.offer?.value;
    kept.restore();
    if (card) setValue(card);
  };
  const save = async () => {
    if (!ready || !dirty || status.pending.length) return;
    const next = { title: value.title.trim(), description: value.description.trim() };
    if (!next.title) { status.fail('Enter a title for the Work card.'); return; }
    await status.run(() => adminRequest<{ project: ProjectRecord }>(endpoint, { method: 'PUT', body: JSON.stringify({ ...next, expectedVersion: version }) }),
      { success: 'Work card saved', onSaved: ({ project }) => apply(project) });
  };

  return <div className="mx-auto max-w-4xl space-y-minor p-minor">
    <Link className="inline-flex min-h-11 items-center font-semibold text-foreground" href={adminPath(config, 'stories')}>Back to Work</Link>
    <header className="space-y-half">
      <h1 className="font-mono text-3xl font-bold">Edit Work card</h1>
      <p className="m-0 leading-baseline text-foreground-muted">The page at <a href={feature.href} className="underline">{feature.href}</a> is managed in code. These settings only change its card on Work. Use the Work list to change visibility and order.</p>
    </header>
    {error ? <p role="alert">This Work card couldn’t be loaded. Reload the page to try again.</p> : !ready ? <p role="status">Loading Work card…</p> : <>
      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} />}
      <form className="space-y-minor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="block space-y-half">
          <span className="block font-semibold">Card title</span>
          <input className={field} value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} required />
        </label>
        <label className="block space-y-half">
          <span className="block font-semibold">Card description</span>
          <textarea className={field} rows={4} value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} />
        </label>
        <SaveBar status={status} dirty={dirty} className="[--save-kit-bar-width:56rem]">
          <button type="submit" disabled={status.pending.length > 0} aria-keyshortcuts="Meta+S Control+S" className="min-h-11 rounded-md bg-foreground px-4 font-semibold text-background disabled:opacity-50">Save Work card</button>
        </SaveBar>
      </form>
    </>}
  </div>;
}
