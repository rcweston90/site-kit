import { useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowRight } from 'lucide-react';
import { Button } from './Button.js';
import { ctaEditorStyles as styles, chromeStyles } from './classes.js';
import { CTA_LABEL_MAX, CTA_URL_MAX, completedCta, type StoryCta } from '@rcweston/story-core';

const field = chromeStyles.ctaEditorField;

/** Shared atomic authoring action; Cancel never changes the parent document. */
export function CtaEditor({ value, onSave, onRemove }: { value: StoryCta; onSave: (value: StoryCta) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const current = completedCta(value.label, value.href, value.newTab);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>
      <button type="button" data-story-cta-editor="" data-story-editor-action="" aria-label={current ? `Edit button: ${current.label}` : 'Set up button'}>
        {current?.label || 'Set up button'}<ArrowRight width={16} height={16} aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={`${styles.overlay} ${chromeStyles.ctaEditorOverlay}`} />
      <Dialog.Content data-story-editor-action="" className={`${styles.dialog} ${chromeStyles.ctaEditorContent}`}>
        <Dialog.Title className={chromeStyles.ctaEditorTitle}>Edit button</Dialog.Title>
        <Dialog.Description className={chromeStyles.ctaEditorDescription}>Give readers a clear next step.</Dialog.Description>
        {open && <CtaFields value={value} onSave={button => { onSave(button); setOpen(false); }}
          onCancel={() => setOpen(false)} onRemove={onRemove ? () => { setOpen(false); onRemove(); } : undefined} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

/** The same fields, for the block inspector. */
export function CtaFields({ value, onSave, onCancel, onRemove }: { value: StoryCta; onSave: (value: StoryCta) => void; onCancel?: () => void; onRemove?: () => void }) {
  const [label, setLabel] = useState(value.label);
  const [href, setHref] = useState(value.href);
  const [newTab, setNewTab] = useState(value.newTab === true);
  const [error, setError] = useState('');
  return <form className={chromeStyles.ctaEditorStack} onSubmit={event => {
    event.preventDefault();
    const button = completedCta(label, href);
    if (!button) { setError('Enter a label and a link, such as /about, #details, or https://example.com.'); return; }
    onSave({ ...button, newTab });
  }}>
    <label className={chromeStyles.ctaEditorStack2}>Button label
      <input className={field} value={label} maxLength={CTA_LABEL_MAX} placeholder="Learn more" onChange={event => { setLabel(event.target.value); setError(''); }} />
    </label>
    <label className={chromeStyles.ctaEditorStack2}>Destination
      <input className={field} inputMode="url" autoCapitalize="none" autoCorrect="off" value={href} maxLength={CTA_URL_MAX} placeholder="/about" onChange={event => { setHref(event.target.value); setError(''); }} />
    </label>
    <label className={chromeStyles.ctaEditorStack2}>Open link in
      <select className={field} aria-label="Open link in" value={newTab ? 'new' : 'same'} onChange={event => setNewTab(event.target.value === 'new')}>
        <option value="same">Same tab</option>
        <option value="new">New tab</option>
      </select>
    </label>
    {error && <div role="alert" className={chromeStyles.ctaEditorAlert}>{error}</div>}
    <div className={chromeStyles.ctaEditorRow}>
      {onRemove && <Button size="sm" variant="ghost" onClick={onRemove}>Remove button</Button>}
      {onCancel && <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>}
      <Button type="submit" size="sm" variant="primary">Apply button</Button>
    </div>
  </form>;
}
