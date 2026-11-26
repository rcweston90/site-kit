import { preparePublicStory, storyCardMedia, type Story, type StoryCardMedia, type StoryTeaser } from '@rcweston/story-core';
import { projectYear, type ProjectRecord } from '@rcweston/site-data';
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
  /** The card label from the project details ("Growth"). */
  label?: string | null;
  /** The company's logo, from its profile. */
  logo?: string | null;
  /** Where the card opens; a story's own page unless it's a site feature. */
  href?: string;
}

/** A prototype as Work shows it: a card that opens somewhere else. */
export interface PrototypeCard {
  slug: string;
  title: string;
  description: string;
  company: string | null;
  logo: string | null;
  year: string | null;
  url: string;
}

/** The first card label; Prototype is a kind, not a label. */
const cardLabel = (type: string | null | undefined) => {
  const first = type?.split(',')[0]?.trim();
  return first && first !== 'Prototype' ? first : null;
};
const yearOf = (date: string | null | undefined) => {
  const year = projectYear(date ?? '');
  return year === '—' ? null : year;
};

/** The company a story or prototype shows: its assigned profile, else the name its details give. */
async function companyCard(slug: string, fallback: string | null, logoId?: string) {
  const { site } = await backend();
  const [company, logo] = await Promise.all([site.reads.companies.companyOf(slug), site.reads.companies.logoOf(slug, logoId)]);
  return { company: company?.name ?? fallback, logo };
}

/** Every published story, in the order set in the admin. */
async function allPublished(): Promise<WorkCard[]> {
  const { store, site } = await backend();
  const [summaries, records] = await Promise.all([store.list(), site.reads.projects.records()]);
  const details = new Map<string, ProjectRecord>(records.map((record) => [record.slug, record]));
  const cards: WorkCard[] = [];
  for (const summary of summaries) {
    if (!summary.publishedDocumentId) continue;
    const lookup = await store.published(summary.slug);
    if (lookup.status !== 'published') continue;
    const story = forReaders(lookup.document.content);
    const record = details.get(story.slug);
    const { company, logo } = await companyCard(story.slug, record?.org || story.company, story.companyLogoId);
    cards.push({
      slug: story.slug,
      title: story.title,
      company: company ?? story.company,
      summary: record?.description || story.summary || story.thesis,
      year: story.projectYear ?? yearOf(record?.date),
      cover: storyCardMedia(story) ?? null,
      label: cardLabel(record?.type),
      logo,
    });
  }
  return site.reads['work-order'].sort(cards, (card) => card.slug);
}

/** The site features' cards, placed among the stories. */
async function featureCards(): Promise<WorkCard[]> {
  const { site } = await backend();
  return (await site.reads.projects.features()).map((feature) => ({
    slug: feature.slug,
    title: feature.title,
    company: '',
    summary: feature.description ?? '',
    year: null,
    cover: null,
    label: 'Site feature',
    href: feature.href,
  }));
}

/** The published stories on Work: in the saved order, without the ones switched off Work. */
export async function workCards(): Promise<WorkCard[]> {
  const { site } = await backend();
  const [cards, features, hidden] = await Promise.all([allPublished(), featureCards(), site.reads['story-placement'].hiddenSlugs()]);
  const placed = await site.reads['work-order'].sort([...cards, ...features], (card) => card.slug);
  return placed.filter((card) => !hidden.has(card.slug));
}

/** The prototypes on Work: linked, switched on, in their own saved order. */
export async function prototypeCards(): Promise<PrototypeCard[]> {
  const { site } = await backend();
  const [prototypes, hidden] = await Promise.all([site.reads.projects.prototypes(), site.reads['story-placement'].hiddenSlugs()]);
  const linked = prototypes.filter((project): project is ProjectRecord & { url: string } => Boolean(project.url) && !hidden.has(project.slug));
  const cards = await Promise.all(linked.map(async (project) => ({
    slug: project.slug,
    title: project.title,
    description: project.description,
    ...(await companyCard(project.slug, project.org)),
    year: yearOf(project.date),
    url: project.url,
  })));
  return site.reads['work-order'].sort(cards, (card) => card.slug, 'prototypes');
}

/** A story's company as its header shows it: the assigned profile's name and logo. */
export async function storyCompany(story: Pick<Story, 'slug' | 'company' | 'companyLogoId'>) {
  const { site } = await backend();
  const [company, logo] = await Promise.all([site.reads.companies.companyOf(story.slug), site.reads.companies.logoOf(story.slug, story.companyLogoId)]);
  if (!company) return null;
  return { name: company.name, ...(logo ? { logo: { src: logo, alt: company.name } } : {}) };
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
