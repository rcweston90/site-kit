'use client';

import { useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { deleteWithUndo, explainFailure } from '@rcweston/save-kit';
import { siteDataPaths, type ProjectRecord } from '@rcweston/site-data/client';
import { useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { projectRecordKey } from './keys.js';

export type ProjectRecordAction = { action: 'duplicate' | 'delete'; slug: string; title: string; version: number };

const button = 'inline-flex min-h-11 items-center rounded-md border border-default px-half text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50';

/**
 * Review a project record's deletion (sent after the Undo window), or copy
 * its details into a new, unlisted record without its launch link.
 */
export function ProjectRecordActions({ record, onDismiss, onDeleteStarted, onDeleted, onDuplicated }: {
  record: ProjectRecordAction;
  onDismiss: () => void;
  /** The row is gone and Undo is offered (an editor leaves for Work here). */
  onDeleteStarted?: () => void;
  onDeleted: () => void;
  onDuplicated: (copy: ProjectRecord) => void;
}) {
  const config = useAdminConfig();
  const endpoint = `${config.siteApi}${siteDataPaths.projects(record.slug)}`;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const deleting = record.action === 'delete';
  const submit = async () => {
    if (pending.current || (deleting && !confirmed)) return;
    if (deleting) {
      const body = JSON.stringify({ expectedVersion: record.version });
      deleteWithUndo({
        key: projectRecordKey(record.slug),
        label: `Deleting “${record.title}”`,
        send: ({ keepalive }) => adminRequest(endpoint, { method: 'DELETE', body, keepalive }),
        onDone: onDeleted,
      });
      onDismiss();
      onDeleteStarted?.();
      return;
    }
    pending.current = true; setBusy(true); setError('');
    try {
      const { project } = await adminRequest<{ project: ProjectRecord }>(`${config.siteApi}${siteDataPaths.projects(record.slug, 'duplicate')}`, { method: 'POST' });
      // The copy starts off Work; the switch lists it when it's ready.
      await adminRequest(`${config.siteApi}${siteDataPaths.placement(project.slug)}`, { method: 'PUT', body: JSON.stringify({ listed: false, expectedVersion: 0 }) }).catch(() => undefined);
      onDuplicated(project); onDismiss();
    } catch (reason) { setError(explainFailure(reason, 'duplicated')); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-half overflow-auto rounded-lg border border-default bg-background p-minor text-foreground shadow-xl">
        <Dialog.Title className="m-0 text-lg font-semibold">{deleting ? 'Review deletion' : 'Duplicate as a draft'}</Dialog.Title>
        <Dialog.Description className="m-0 text-sm text-foreground-muted">{record.title} · <strong>{record.slug}</strong></Dialog.Description>
        {deleting ? <>
          <p className="m-0 text-sm">Removes this project’s database row. Shared files, external links and other records stay intact.</p>
          <label className="flex min-h-11 items-center gap-half text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Delete this exact record after the Undo window.</label>
        </> : <p className="m-0 text-sm">Copy the project details into an independent private, unlisted row. The external launch URL is left blank; no third-party artifact or link is copied.</p>}
        {error && <p role="alert" className="m-0 text-sm text-status-error-text">{error}</p>}
        <div className="flex flex-wrap justify-end gap-half">
          <Dialog.Close className={button} disabled={busy}>Cancel</Dialog.Close>
          <button type="button"
            className={`${button} ${deleting ? 'text-status-error-text' : 'bg-foreground text-background'}`}
            disabled={busy || (deleting && !confirmed)} onClick={() => void submit()}>{deleting ? 'Confirm delete' : busy ? 'Duplicating…' : 'Duplicate draft'}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
