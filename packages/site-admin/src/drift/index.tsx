'use client';

import type { StoryEditorExtension, StoryEditorExtensionContext } from '@rcweston/story-editor';
import { OriginalUpdatesNotice, OriginalUpdatesReview, useOriginalUpdates } from './OriginalUpdates.js';

const NO_DOCUMENTS: never[] = [];

/**
 * The editor's drift review, as a `StoryEditor` extension:
 *
 *   <StoryEditor useExtension={usePublishedUpdates} … />
 *
 * When the published version gained changes after the draft was made from an
 * earlier one (a draft restored from before the last publish, say), a line
 * under the top bar says how many, the publish checklist lists them as a
 * note, and Review compares each change side by side. Nothing shows while the
 * draft's history already includes the published version.
 */
export function usePublishedUpdates({ slug, state, story, apply }: StoryEditorExtensionContext): StoryEditorExtension | null {
  const updates = useOriginalUpdates({
    slug,
    documents: state?.documents ?? NO_DOCUMENTS,
    publishedDocumentId: state?.publishedDocumentId ?? null,
    draft: story,
  });
  if (updates.changes.length === 0 && !updates.reviewOpen) return null;
  return {
    notice: updates.outstanding > 0 && !updates.dismissed ? <OriginalUpdatesNotice updates={updates} /> : undefined,
    overlay: <OriginalUpdatesReview updates={updates} draft={story} onApply={apply} />,
    publishedUpdates: { count: updates.outstanding, onReview: updates.openReview },
  };
}

export { findDriftBase, diffOriginal, applyOriginalChange, applyOriginalChanges, type OriginalChange } from './model.js';
