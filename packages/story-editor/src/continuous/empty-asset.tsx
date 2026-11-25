import { ImagePlus, ListPlus, Link2 } from 'lucide-react';
import type { EmptyState } from './empty-asset-state.js';
import { continuousStyles as styles } from '../classes.js';

export function EmptyAsset({ state, onOpen }: { state: EmptyState; onOpen: (element: HTMLButtonElement) => void }) {
  const Icon = state.kind === 'file' ? ImagePlus : state.kind === 'link' ? Link2 : ListPlus;
  return <div className={styles.emptyAsset} data-editor-empty-asset="" contentEditable={false}>
    <Icon size={18} aria-hidden="true" />
    <div className={styles.emptyAssetCopy}>
      <p className={styles.emptyAssetTitle}>{state.title}</p>
      {state.detail && <p className={styles.emptyAssetDetail}>{state.detail}</p>}
    </div>
    <button type="button" data-story-editor-action="" onClick={event => onOpen(event.currentTarget)}>{state.action}</button>
  </div>;
}
