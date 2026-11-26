'use client';

import { useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { explainFailure } from '@rcweston/save-kit';

export type RecordAction = { action: 'duplicate' | 'delete'; slug: string; title: string; versions: number; published: boolean };

const button = 'inline-flex min-h-11 items-center rounded-md border border-default px-half text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50';

/** Review a deletion (sent after the Undo window), or duplicate a story as a new private draft. */
export default function RecordActions({ record, onDismiss, onDelete, onDuplicate }: {
  record: RecordAction;
  onDismiss: () => void;
  /** Starts the delete with Undo; the dialog closes at once. */
  onDelete: () => void;
  onDuplicate: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const deleting = record.action === 'delete';
  const blockers = deleting && record.published ? ['It’s published. Unpublish it in the editor first, so readers don’t meet a missing page.'] : [];

  const submit = async () => {
    if (pending.current || (deleting && (!confirmed || blockers.length > 0))) return;
    if (deleting) {
      onDelete();
      onDismiss();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onDuplicate();
      onDismiss();
    } catch (reason) {
      setError(explainFailure(reason, 'duplicated'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-half overflow-auto rounded-lg border border-default bg-background p-minor text-foreground shadow-xl">
        <Dialog.Title className="m-0 text-lg font-semibold">{deleting ? 'Review deletion' : 'Duplicate as a draft'}</Dialog.Title>
        <Dialog.Description className="m-0 text-sm text-foreground-muted">{record.title} · <strong>{record.slug}</strong></Dialog.Description>
        {deleting ? <>
          {blockers.length > 0 ? <div className="text-sm"><p className="my-half font-semibold">This record can’t be deleted yet.</p>
            <ul className="my-half list-disc pl-minor">{blockers.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
            : <>
              <p className="m-0 text-sm">Removes this draft and all {record.versions} saved {record.versions === 1 ? 'version' : 'versions'}, and its old addresses. Its placement is also removed. Site order is cleaned up. Uploaded images stay in the image library.</p>
              <label className="flex min-h-11 items-center gap-half text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Delete this exact record after the Undo window.</label>
            </>}
        </> : <p className="m-0 text-sm">Start an independent, private draft from the latest saved story. The copy has no publish history or site placement. Existing media stays in place.</p>}
        {error && <p role="alert" className="m-0 text-sm text-status-error-text">{error}</p>}
        <div className="flex flex-wrap justify-end gap-half">
          <Dialog.Close className={button} disabled={busy}>{blockers.length && deleting ? 'Close' : 'Cancel'}</Dialog.Close>
          {(!deleting || blockers.length === 0) && <button type="button"
            className={`${button} ${deleting ? 'text-status-error-text' : 'bg-foreground text-background'}`}
            disabled={busy || (deleting && !confirmed)} onClick={() => void submit()}>{deleting ? 'Confirm delete' : busy ? 'Duplicating…' : 'Duplicate draft'}</button>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
