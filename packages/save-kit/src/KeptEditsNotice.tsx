'use client';

import type { KeptOffer } from './kept-edits.js';

const defaultFormat = (at: Date) => at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Unsaved changes from … were kept on this device. Restore · Discard",
 *  never applied unasked. */
export function KeptEditsNotice({ offer, onRestore, onDiscard, formatTime = defaultFormat, className }: {
  offer: Pick<KeptOffer<unknown>, 'at' | 'beforeLatestSave'>;
  onRestore: () => void;
  onDiscard: () => void;
  /** How the time reads. Default: the browser's locale, e.g. "Mar 4, 3:12 PM". */
  formatTime?: (at: Date) => string;
  className?: string;
}) {
  return (
    <div role="status" className={['sk-kept', className].filter(Boolean).join(' ')}>
      <span>
        Unsaved changes from {formatTime(offer.at)} were kept on this device
        {offer.beforeLatestSave ? ', made before the latest save. Restoring replaces what’s on the page.' : '.'}
      </span>
      <button type="button" onClick={onRestore} className="sk-link-button">Restore</button>
      <button type="button" onClick={onDiscard} className="sk-link-button">Discard</button>
    </div>
  );
}
