'use client';

import { useEffect, useId, useState } from 'react';
import { SaveStatus, explainFailure, useListSave } from '@rcweston/save-kit';
import { siteDataPaths, type ResourceVisibility } from '@rcweston/site-data/client';
import { useAdminConfig } from '../config.js';
import { adminRequest } from '../request.js';

/** Site resources: what visitors can find, beside the pages themselves. */
export function SiteResourceVisibilitySettings() {
  const config = useAdminConfig();
  const id = useId();
  const [loaded, setLoaded] = useState<ResourceVisibility[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const { status } = useListSave();
  const url = `${config.siteApi}${siteDataPaths.resources()}`;

  useEffect(() => {
    let current = true;
    adminRequest<{ resources: ResourceVisibility[] }>(url)
      .then((value) => { if (current) setLoaded(value.resources); })
      .catch((reason) => { if (current) setError(explainFailure(reason, 'loaded')); });
    return () => { current = false; };
  }, [url, reload]);

  if (loaded && loaded.length === 0) return null;

  return <section aria-labelledby={id} className="mt-major">
    <h2 id={id} className="mb-0 font-mono text-lg font-bold leading-baseline uppercase tracking-wide text-foreground">Site resources</h2>
    <p className="mb-minor max-w-md text-sm leading-baseline text-foreground-muted">
      Choose what visitors can find on the site. Turning off a resource does not remove its file or change direct access.
    </p>
    {error ? <div>
      <p role="alert" className="mb-0 text-sm leading-baseline text-status-error-text">{error}</p>
      <button type="button" className="min-h-11 text-sm underline focus-visible:outline-2 focus-visible:outline-accent-primary"
        onClick={() => { setError(''); setReload((value) => value + 1); }}>Retry loading</button>
    </div> : !loaded ? <p role="status" className="text-sm leading-baseline text-foreground-muted">Loading resource settings…</p> : <>
      <div className="grid max-w-md gap-half">
        {loaded.map((resource) => {
          const { id: key, label, description, visible } = resource;
          return <div key={key} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-default bg-card-bg px-4 py-half">
            <div className="min-w-0">
              <p className="mb-0 font-medium leading-baseline text-foreground">{label}</p>
              <p id={`${id}-${key}`} className="mb-0 text-sm leading-baseline text-foreground-muted">{description}</p>
            </div>
            <button type="button" role="switch" aria-checked={visible} aria-label={`Show ${label} on the site`} aria-describedby={`${id}-${key}`} disabled={busy === key}
              onClick={() => {
                setBusy(key);
                void status.run(() => adminRequest<{ resource: ResourceVisibility }>(url, {
                  method: 'POST',
                  body: JSON.stringify({ resource: key, visible: !visible, expectedVersion: resource.version }),
                }), {
                  key, doing: 'Saving visibility…', success: `${label} is ${visible ? 'hidden' : 'shown'} on the site.`, done: 'updated',
                  onSaved: (value) => setLoaded((current) => current?.map((item) => (item.id === key ? value.resource : item)) ?? current),
                }).then((result) => {
                  setBusy(null);
                  if (!result.ok) setReload((value) => value + 1);
                });
              }}
              className="grid h-11 w-12 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50">
              <span aria-hidden="true" className={`relative block h-7 w-12 rounded-full ${visible ? 'bg-accent-primary' : 'bg-foreground-muted/35'}`}>
                <span className={`absolute left-1 top-1 block h-5 w-5 rounded-full bg-card-bg ${visible ? 'translate-x-5' : ''}`} />
              </span>
            </button>
          </div>;
        })}
      </div>
      <SaveStatus status={status} className="pt-half" />
    </>}
  </section>;
}
