/**
 * The seam between this package and story-core's validators.
 *
 * Every check the server runs on a story (draft shape, publish readiness,
 * the rename plan, address rules) goes through the names below, so the
 * handlers and stores import them from one place.
 */

import { createStory as createCoreStory, type Story } from '@rcweston/story-core';

export {
  RENAME_STALE_MESSAGE,
  STORY_SCHEMA_VERSION,
  StoryRenameError,
  formerAddressesOf,
  planStoryRename,
  storyAddressProblem,
  takenStoryAddresses,
  validatePublication,
  validateStory,
  validateStoryDraft,
  type PublicationValidationOptions,
  type StoryRenameErrorCode,
  type StoryRenameFacts,
  type StoryRenamePlan,
} from '@rcweston/story-core';

/**
 * A blank story to open at `slug`, or null when `slug` couldn't be a new
 * story's address (too short, or reserved for another page).
 */
export function blankStory(slug: string): Story | null {
  try {
    return createCoreStory({ title: '', slug });
  } catch {
    return null;
  }
}
