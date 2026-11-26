import type { PublicBlogPost } from '@rcweston/site-data';

export type BlogArchiveItem = Pick<PublicBlogPost, 'slug' | 'title' | 'description' | 'tags' | 'date' | 'readingTime'>;

function normalize(value: string) {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Only fields already in the list are searched, never post bodies. */
export function searchBlogFeed(items: readonly BlogArchiveItem[], query: string): BlogArchiveItem[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (!terms.length) return true;
    const searchable = normalize([item.title, item.description, ...item.tags].join(' '));
    return terms.every((term) => searchable.includes(term));
  });
}
