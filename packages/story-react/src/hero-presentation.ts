import type { Story } from '@rcweston/story-core';

export type PersistedHeroPresentationLayout = 'editorial-b' | 'rail-c';

/** Every story header uses the shared presentation system. Legacy and
 * unset documents default to 1B without needing a data migration. */
export function storyHeroPresentation(story: Story): PersistedHeroPresentationLayout | undefined {
  return story.heroPresentation === 'offset-plate' ? 'rail-c' : 'editorial-b';
}
