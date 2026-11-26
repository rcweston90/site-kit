'use client';

import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowRight } from 'lucide-react';
import { Button } from '../primitives/index.js';
// site-kit: CmsCtaEditor.module.css as classes: the image dialogs' stacking layer, above formatting controls.
const styles = { overlay: 'z-[70]', dialog: 'z-[71]' };
import { CTA_LABEL_MAX, CTA_URL_MAX, completedCta, type StoryCta as CmsCta } from '@rcweston/story-core';

const field = 'w-full min-h-12 rounded-lg border border-default bg-background px-3 text-base leading-baseline text-foreground focus-visible:outline-2 focus-visible:outline-accent-primary';

/** Shared atomic authoring action; Cancel never changes the parent document. */
export function CmsCtaEditor({ value, onSave, onRemove }: { value: CmsCta; onSave: (value: CmsCta) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const current = completedCta(value.label, value.href, value.newTab);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>
      <button type="button" data-cms-cta="" data-story-editor-action="" aria-label={current ? `Edit button: ${current.label}` : 'Set up button'}>
        {current?.label || 'Set up button'}<ArrowRight width={16} height={16} aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={`${styles.overlay} fixed inset-0 bg-foreground/30`} />
      <Dialog.Content data-story-editor-action="" className={`${styles.dialog} fixed left-1/2 top-1/2 max-h-[calc(100dvh-var(--rhythm-minor))] w-[min(480px,calc(100vw-var(--rhythm-minor)))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-default bg-background p-minor text-foreground shadow-xl`}>
        <Dialog.Title className="font-sans text-lg font-semibold leading-baseline">Edit button</Dialog.Title>
        <Dialog.Description className="text-sm leading-baseline text-foreground-muted">Give readers a clear next step.</Dialog.Description>
        {open && <CmsCtaFields value={value} onSave={button => { onSave(button); setOpen(false); }}
          onCancel={() => setOpen(false)} onRemove={onRemove ? () => { setOpen(false); onRemove(); } : undefined} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

/** The same local fields also fit the case study's existing block inspector. */
export function CmsCtaFields({ value, onSave, onCancel, onRemove }: { value: CmsCta; onSave: (value: CmsCta) => void; onCancel?: () => void; onRemove?: () => void }) {
  const [label, setLabel] = useState(value.label);
  const [href, setHref] = useState(value.href);
  const [newTab, setNewTab] = useState(value.newTab === true);
  const [error, setError] = useState('');
  return <form className="mt-minor grid gap-minor" onSubmit={event => {
    event.preventDefault();
    const button = completedCta(label, href);
    if (!button) { setError('Enter a label and a link, such as /work, #details, or https://example.com.'); return; }
    onSave({ ...button, newTab });
  }}>
    <label className="grid text-sm leading-baseline">Button label
      <input className={field} value={label} maxLength={CTA_LABEL_MAX} placeholder="Learn more" onChange={event => { setLabel(event.target.value); setError(''); }} />
    </label>
    <label className="grid text-sm leading-baseline">Destination
      <input className={field} inputMode="url" autoCapitalize="none" autoCorrect="off" value={href} maxLength={CTA_URL_MAX} placeholder="/work" onChange={event => { setHref(event.target.value); setError(''); }} />
    </label>
    <label className="grid text-sm leading-baseline">Open link in
      <select className={field} aria-label="Open link in" value={newTab ? 'new' : 'same'} onChange={event => setNewTab(event.target.value === 'new')}>
        <option value="same">Same tab</option>
        <option value="new">New tab</option>
      </select>
    </label>
    {error && <div role="alert" className="text-sm leading-baseline text-status-error-text">{error}</div>}
    <div className="flex flex-wrap items-center justify-end gap-3">
      {onRemove && <Button size="sm" variant="ghost" onClick={onRemove}>Remove button</Button>}
      {onCancel && <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>}
      <Button type="submit" size="sm" variant="primary">Apply button</Button>
    </div>
  </form>;
}

// site-kit: a call to action on a page the admin edits, the same shape as a story's.
export type { CmsCta };
