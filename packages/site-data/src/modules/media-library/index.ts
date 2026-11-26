/**
 * media-library: browse, search and reuse uploaded images.
 *
 *   GET /media-library?scope=story&slug=…&after=…&search=…   ImageLibraryPage
 *   GET /media-library/item?key=…                            { item } with its size and type
 *
 * No table: it lists the MediaStore (`list`, then `head` for each image on
 * the page) and reads which stories use each image from the DocumentStore.
 * A host can add group scopes (e.g. every story of the same company) with
 * `config.groups`.
 */

import { isStorySlug, type DocumentStore, type MediaStore } from '@rcweston/story-core';
import { isSafeKey } from '@rcweston/story-server';
import { defineModule, type SiteServices } from '../../module.js';
import { InvalidInputError, SITE_DATA_MESSAGES, json } from '../../http.js';
import {
  EMPTY_IMAGE_LIBRARY,
  IMAGE_LIBRARY_PAGE,
  isImageKey,
  storyMediaKeys,
  type ImageLibraryItem,
  type ImageLibraryPage,
  type ImageLibraryQuery,
} from './model.js';

export * from './model.js';

export interface MediaLibraryConfig {
  /** The key prefix stories upload under. Default `stories/`. */
  prefix: string;
  /** Where the story handlers serve media. Default `/api/story/media`. */
  mediaBasePath: string;
  /** Extra scopes: each returns the stories in the same group as `slug`, or null when it has none. */
  groups: Record<string, (slug: string, services: SiteServices) => Promise<string[] | null>>;
  pageSize: number;
}

export interface MediaLibraryReads {
  page(query: ImageLibraryQuery): Promise<ImageLibraryPage>;
}

interface Usage {
  byKey: Map<string, { slug: string; title: string }[]>;
  byStory: Map<string, Set<string>>;
}

function libraryFor(config: MediaLibraryConfig, services: SiteServices) {
  const base = config.mediaBasePath.replace(/\/+$/, '');
  const srcOf = services.mediaSrc ?? ((key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`);
  const keyOf = (src: string) => {
    const path = src.split(/[?#]/)[0];
    if (!path.startsWith(`${base}/`)) return null;
    try {
      const key = path.slice(base.length + 1).split('/').map(decodeURIComponent).join('/');
      return key.startsWith(config.prefix) ? key : null;
    } catch {
      return null;
    }
  };

  async function usage(documents: DocumentStore | undefined): Promise<Usage> {
    const byKey = new Map<string, { slug: string; title: string }[]>();
    const byStory = new Map<string, Set<string>>();
    if (!documents) return { byKey, byStory };
    const summaries = await documents.list();
    await Promise.all(
      summaries.map(async (summary) => {
        const [latest, live] = await Promise.all([documents.latest(summary.slug), documents.published(summary.slug)]);
        const versions = [latest?.content, live.status === 'published' ? live.document.content : null].filter(Boolean);
        const title = latest?.content.title || summary.title || summary.slug;
        const keys = new Set<string>();
        for (const content of versions) for (const key of storyMediaKeys(content, keyOf)) keys.add(key);
        byStory.set(summary.slug, keys);
        for (const key of keys) {
          const uses = byKey.get(key) ?? [];
          if (!uses.some((use) => use.slug === summary.slug)) uses.push({ slug: summary.slug, title });
          byKey.set(key, uses);
        }
      }),
    );
    return { byKey, byStory };
  }

  async function allKeys(media: MediaStore, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await media.list(prefix, cursor);
      keys.push(...page.keys);
      cursor = page.cursor;
    } while (cursor);
    return [...new Set(keys)].filter((key) => key.startsWith(prefix) && isImageKey(key)).sort();
  }

  async function item(media: MediaStore, key: string, uses: Usage, slug: string | undefined, withHead: boolean): Promise<ImageLibraryItem | null> {
    const source = key.slice(config.prefix.length).split('/')[0] ?? '';
    const head = withHead ? await media.head(key) : undefined;
    if (head === null) return null;
    return {
      key,
      src: srcOf(key),
      label: key.split('/').at(-1) ?? key,
      source,
      access: services.mediaVisibility === 'protected' ? 'protected' : 'public',
      available: Boolean(slug),
      usedIn: (uses.byKey.get(key) ?? []).slice(0, 4),
      ...(head ? { size: head.size, contentType: head.contentType } : {}),
    };
  }

  async function page(query: ImageLibraryQuery): Promise<ImageLibraryPage> {
    const { media } = services;
    if (!media) throw new InvalidInputError(SITE_DATA_MESSAGES.unavailable);
    const { scope, slug, after } = query;
    const search = query.search?.trim().toLowerCase() ?? '';
    const uses = await usage(services.documents);

    let keys: string[];
    let first = new Set<string>();
    if (scope === 'all') {
      keys = await allKeys(media, config.prefix);
    } else if (scope === 'story') {
      if (!slug) throw new InvalidInputError('Choose a story to browse.');
      first = new Set([...(uses.byStory.get(slug) ?? [])].filter(isImageKey));
      const own = await allKeys(media, `${config.prefix}${slug}/`);
      keys = [...new Set([...own, ...first])];
    } else {
      const group = config.groups[scope];
      if (!group || !slug) throw new InvalidInputError('That image scope isn’t available.');
      const stories = await group(slug, services);
      if (!stories) return { ...EMPTY_IMAGE_LIBRARY, assigned: false };
      keys = [...new Set(stories.flatMap((story) => [...(uses.byStory.get(story) ?? [])]))].filter(isImageKey);
    }

    const matches = (key: string) => {
      if (!search) return true;
      const haystack = [key, ...(uses.byKey.get(key) ?? []).map((use) => use.title)].join(' ').toLowerCase();
      return haystack.includes(search);
    };
    // The images this story already uses lead its own scope; the rest follow by key.
    const ordered = [...[...first].sort(), ...keys.filter((key) => !first.has(key)).sort()].filter(matches);
    const start = after ? ordered.indexOf(after) + 1 : 0;
    if (after && start === 0) return EMPTY_IMAGE_LIBRARY;
    const slice = ordered.slice(start, start + config.pageSize);
    const items = (await Promise.all(slice.map((key) => item(media, key, uses, slug, true)))).filter((entry): entry is ImageLibraryItem => entry !== null);
    const next = start + config.pageSize < ordered.length ? (slice.at(-1) ?? null) : null;
    return { items, next, assigned: true };
  }

  return { page, item, usage };
}

const parseQuery = (url: URL, groups: string[]): ImageLibraryQuery => {
  const scope = url.searchParams.get('scope') ?? 'all';
  const slug = url.searchParams.get('slug') ?? undefined;
  const after = url.searchParams.get('after');
  const search = url.searchParams.get('search') ?? undefined;
  if (!['story', 'all', ...groups].includes(scope)) throw new InvalidInputError('That image scope isn’t available.');
  if (slug !== undefined && !isStorySlug(slug)) throw new InvalidInputError('That story address isn’t valid.');
  if (after && (after.length > 2048 || !isSafeKey(after))) throw new InvalidInputError(SITE_DATA_MESSAGES.unreadable);
  if (search && search.length > 200) throw new InvalidInputError('Search for something shorter.');
  return { scope, slug, after, search };
};

export const mediaLibrary = defineModule({
  id: 'media-library',
  title: 'Image library',
  migrationRange: [1300, 1399],
  migrations: [],
  configure: (config: Partial<MediaLibraryConfig> | undefined): MediaLibraryConfig => ({
    prefix: config?.prefix ?? 'stories/',
    mediaBasePath: config?.mediaBasePath ?? '/api/story/media',
    groups: config?.groups ?? {},
    pageSize: config?.pageSize ?? IMAGE_LIBRARY_PAGE,
  }),
  createMemoryStore: () => null,
  createPostgresStore: () => null,
  handlers: ({ config, services }) => {
    const library = libraryFor(config, services);
    return [
      {
        method: 'GET',
        path: '',
        handle: async ({ url }) => json(await library.page(parseQuery(url, Object.keys(config.groups)))),
      },
      {
        method: 'GET',
        path: 'item',
        handle: async ({ url }) => {
          const key = url.searchParams.get('key') ?? '';
          if (!services.media) throw new InvalidInputError(SITE_DATA_MESSAGES.unavailable);
          if (!isSafeKey(key) || !key.startsWith(config.prefix) || !isImageKey(key)) throw new InvalidInputError('That isn’t an image in the library.');
          const found = await library.item(services.media, key, await library.usage(services.documents), url.searchParams.get('slug') ?? undefined, true);
          return found ? json({ item: found }) : json({ error: SITE_DATA_MESSAGES.notFound }, 404);
        },
      },
    ];
  },
  publicReads: (_store, config, services): MediaLibraryReads => ({ page: libraryFor(config, services).page }),
});
