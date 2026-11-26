'use client';

import { useState } from 'react';
import { explainFailure } from '@rcweston/save-kit';

export interface SavedPlacement {
  slug: string;
  listed: boolean;
  version: number;
}

/** Controls placement in the Work list, not access or publication. */
export default function StoryPlacementSwitch({ title, initial, persistenceAvailable, save, onSaved }: {
  title: string;
  initial: { slug: string; listed: boolean };
  persistenceAvailable: boolean;
  save: (listed: boolean) => Promise<SavedPlacement>;
  onSaved?: (saved: SavedPlacement) => void;
}) {
  const [visible, setVisible] = useState(initial.listed);
  const [seen, setSeen] = useState(initial.listed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  if (initial.listed !== seen && !busy) {
    setSeen(initial.listed);
    setVisible(initial.listed);
  }
  const unsaveable = !persistenceAvailable;

  const toggle = async () => {
    if (busy || unsaveable) return;
    const next = !visible;
    setVisible(next);
    setBusy(true);
    setMessage(null);
    try {
      const saved = await save(next);
      setVisible(saved.listed);
      onSaved?.(saved);
      setMessage({ error: false, text: saved.listed ? 'Saved. Listed on Work.' : 'Saved. Not listed on Work.' });
    } catch (error) {
      setVisible(!next);
      setMessage({ error: true, text: explainFailure(error) });
    } finally {
      setBusy(false);
    }
  };

  const status = message?.error ? message.text : unsaveable ? 'Placement can’t be saved here yet' : null;
  return (
    <div aria-busy={busy || undefined} className="flex flex-col items-start @lg:items-end @4xl:items-start">
      <Switch labels={['Visible', 'Not visible']} accessibleLabel={`Visible on Work: ${title}`} checked={visible} inert={busy || unsaveable} onToggle={toggle} />
      <span role="status" className="sr-only">{message && !message.error ? message.text : ''}</span>
      {status && <span role={message?.error ? 'alert' : undefined} className={`block text-xs leading-baseline ${message?.error ? 'text-status-error' : 'text-foreground-muted'}`}>{status}</span>}
    </div>
  );
}

// Controls are 32px to look at and 44px to press: the ::before reaches 6px
// above and below.
export function Switch({ labels, accessibleLabel, checked, inert, onToggle }: {
  /** What it says when on, and when off. */
  labels: [on: string, off: string];
  /** Fixed, whatever the state: a screen reader hears on or off from the switch itself. */
  accessibleLabel: string;
  checked: boolean;
  /** Mid-save or unsaveable: presses do nothing, but focus stays put. */
  inert: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={accessibleLabel}
      aria-disabled={inert || undefined}
      onClick={onToggle}
      className="relative inline-flex h-8 items-center gap-2 rounded text-xs text-foreground before:absolute before:inset-x-0 before:-inset-y-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-progress"
    >
      <span aria-hidden className={`relative h-4.5 w-8 flex-shrink-0 rounded-full transition-colors motion-reduce:transition-none ${checked ? 'bg-accent-primary' : 'bg-foreground-muted'}`}>
        <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-background transition-transform motion-reduce:transition-none ${checked ? 'translate-x-3.5' : ''}`} />
      </span>
      {/* Both words share one cell, the longer setting its width, so the
          control is the same size in either state and nothing beside it moves. */}
      <span aria-hidden className="grid text-left">
        <span className={`[grid-area:1/1] ${checked ? '' : 'invisible'}`}>{labels[0]}</span>
        <span className={`[grid-area:1/1] text-foreground-muted ${checked ? 'invisible' : ''}`}>{labels[1]}</span>
      </span>
    </button>
  );
}
