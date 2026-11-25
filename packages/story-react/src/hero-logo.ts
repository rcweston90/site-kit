import type { Story } from '@rcweston/story-core';

/** The company as the host knows it. */
export interface StoryCompany {
  name: string;
  logo?: { src: string; width?: number; height?: number; alt?: string };
}

/** One logo resolution path for the hero and any toolbar that shows it:
 *  the host's company logo first, then the story's own file. */
export function heroLogo(story: Pick<Story, 'company' | 'companyLogo'>, company?: StoryCompany | null) {
  const src = company?.logo?.src || story.companyLogo;
  if (!src) return undefined;
  const fromCompany = Boolean(company?.logo?.src);
  return {
    src,
    alt: (fromCompany ? company?.logo?.alt ?? company?.name : story.company) ?? story.company,
    width: (fromCompany ? company?.logo?.width : undefined) ?? 96,
    height: (fromCompany ? company?.logo?.height : undefined) ?? 24,
    source: fromCompany ? 'company' : 'story',
  } as const;
}
