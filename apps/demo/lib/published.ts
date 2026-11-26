import { preparePublicStory, storyCardMedia, type Story, type StoryCardMedia, type StoryTeaser } from '@rcweston/story-core';
import { backend } from './story';
import { CUSTOM_BLOCK_NAMES } from '@/content/blocks-registry';
import { SITE_PAGES } from '@/content/site';

const mediaUrl = (key: string) => `/api/story/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export function forReaders(story: Story): Story {
  return preparePublicStory(story, { mediaUrl, customBlocks: CUSTOM_BLOCK_NAMES });
}

/** A published story as a Work card: its hero picture is the card's. */
export interface WorkCard extends StoryTeaser {
  year: string | null;
  cover: StoryCardMedia | null;
}

/** Every published story, in the order set in the admin. */
async function allPublished(): Promise<WorkCard[]> {
  const { store, site } = await backend();
  const summaries = await store.list();
  const cards: WorkCard[] = [];
  for (const summary of summaries) {
    if (!summary.publishedDocumentId) continue;
    const lookup = await store.published(summary.slug);
    if (lookup.status !== 'published') continue;
    const story = forReaders(lookup.document.content);
    cards.push({
      slug: story.slug,
      title: story.title,
      company: story.company,
      summary: story.summary ?? story.thesis,
      year: story.projectYear ?? null,
      cover: storyCardMedia(story) ?? null,
    });
  }
  return site.reads['work-order'].sort(cards, (card) => card.slug);
}

/** The published stories on Work: in the saved order, without the ones switched off Work. */
export async function workCards(): Promise<WorkCard[]> {
  const { site } = await backend();
  const [cards, hidden] = await Promise.all([allPublished(), site.reads['story-placement'].hiddenSlugs()]);
  return cards.filter((card) => !hidden.has(card.slug));
}

/** Every published story, listed or not, for the next-story card under a story. */
export const publishedTeasers = allPublished;

/** The navigation after Readme: the site's pages that aren't switched off. */
export async function visibleNav(): Promise<{ href: string; label: string }[]> {
  const { site } = await backend();
  const hidden = await site.reads['site-resources'].hiddenPaths();
  return SITE_PAGES.filter((page) => !hidden.some((path) => page.path === path || page.path.startsWith(`${path}/`)))
    .map((page) => ({ href: page.path, label: page.label }));
}

/** Whether a page is switched on, for its route to answer 404 when it isn't. */
export async function isPageVisible(path: string): Promise<boolean> {
  const { site } = await backend();
  return site.reads['site-resources'].isPathVisible(path);
}
