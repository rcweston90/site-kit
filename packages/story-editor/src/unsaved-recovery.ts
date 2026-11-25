import { useMemo } from 'react';
import type { Story } from '@rcweston/story-core';
import { useKeptEdits } from '@rcweston/save-kit';

/*
 * The editor's unsaved edits, kept on this device by save-kit's kept edits:
 * offered back as Restore or Discard, never applied on their own. A kept
 * value counts as a story only if it has chapters.
 */

const isStory = (value: unknown): value is Story =>
  Boolean(value && typeof value === 'object' && Array.isArray((value as Story).chapters));

export function useUnsavedRecovery({ slug, ready, story, savedStory, base, dirty }: {
  slug: string;
  /** False while the draft is still loading: nothing is kept or cleared yet. */
  ready: boolean;
  story: Story;
  savedStory: Story;
  /** The latest saved draft's id. */
  base: string | null;
  /** Whether the story differs from its last save. */
  dirty: boolean;
}) {
  const kept = useKeptEdits({
    storageKey: `story-editor:unsaved:${slug}`,
    ready,
    value: story,
    saved: savedStory,
    base,
    dirty,
    accept: isStory,
  });
  const offer = useMemo(() => (kept.offer ? { ...kept.offer, story: kept.offer.value } : null), [kept.offer]);
  return { offer, restore: kept.restore, discard: kept.discard };
}
