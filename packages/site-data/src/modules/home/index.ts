/**
 * home: the home page's letter (tagline, paragraphs, "What I do") and its
 * three header images, ported from Admin → Home.
 *
 *   GET    /home/about           HomeAboutResponse: the copy, the shipped copy, whether it's edited
 *   PUT    /home/about           { tagline, bio, fastFacts, expectedVersion? } → HomeAboutResponse
 *   DELETE /home/about           back to the shipped copy → HomeAboutResponse
 *   GET    /home/header-images   HomeHeaderImagesResponse: the three slots and the library
 *   PUT    /home/header-images   { images, expectedVersion? } → HomeHeaderImagesResponse
 *
 * Uploads go through the site's media route (story-server's `/media`), so a
 * custom header image is an ordinary MediaStore file; Save stores its address.
 * A save built on an older version answers 409 with what's there now.
 */

import { parseJson, type SqlRunner } from '@rcweston/story-server/postgres';
import { defineModule } from '../../module.js';
import { InvalidInputError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  DEFAULT_HEADER_IMAGES,
  configureHome,
  homeAboutOver,
  parseHeaderImages,
  parseHomeAbout,
  resolveHeaderImages,
  type HomeAbout,
  type HomeAboutResponse,
  type HomeConfig,
  type HomeHeaderImages,
  type HomeHeaderImagesResponse,
  type HomePhoto,
} from './model.js';

export * from './model.js';

/** One table, two rows: `about` and `header-images`. */
export interface HomeStore {
  about: VersionedTable<HomeAbout>;
  headerImages: VersionedTable<HomeHeaderImages>;
}

export interface HomeReads {
  /** The letter as visitors see it: the saved copy over the shipped copy. */
  about(): Promise<HomeAbout>;
  /** The three slots as saved (null: that slot's default). */
  headerImages(): Promise<HomeHeaderImages>;
  /** The header's photos: each slot's choice, or the library photo in its place. */
  headerPhotos(library?: HomePhoto[]): Promise<HomePhoto[]>;
}

const ABOUT = 'about';
const HEADER = 'header-images';

const aboutResponse = (row: Versioned<HomeAbout> | null, defaults: HomeAbout): HomeAboutResponse => ({
  about: homeAboutOver(row?.value, defaults),
  defaults,
  customized: row !== null,
  version: row?.version ?? 0,
  updatedAt: row?.updatedAt ?? null,
});

const imagesOf = (row: Versioned<HomeHeaderImages> | null) => parseHeaderImages(row?.value) ?? DEFAULT_HEADER_IMAGES;

function postgresSection<T>(sql: SqlRunner) {
  return createPostgresTable<T>(sql, {
    table: 'site_home',
    keyColumn: 'section',
    columns: ['body'],
    toRow: (value) => [JSON.stringify(value)],
    fromRow: (row) => parseJson<T>(row.body),
  });
}

export const home = defineModule({
  id: 'home',
  title: 'Home',
  migrationRange: [2100, 2199],
  migrations: MIGRATIONS,
  configure: configureHome,
  createMemoryStore: (): HomeStore => ({ about: createMemoryTable<HomeAbout>(), headerImages: createMemoryTable<HomeHeaderImages>() }),
  createPostgresStore: (sql): HomeStore => ({ about: postgresSection<HomeAbout>(sql), headerImages: postgresSection<HomeHeaderImages>(sql) }),
  handlers: ({ store, config, revalidate }) => {
    const library = async () => {
      try {
        return await config.library();
      } catch {
        return [];
      }
    };
    return [
      {
        method: 'GET',
        path: 'about',
        handle: async () => json(aboutResponse(await store.about.get(ABOUT), config.about)),
      },
      {
        method: 'PUT',
        path: 'about',
        handle: async ({ request }) => {
          const body = await readBody(request);
          const parsed = parseHomeAbout(body);
          if ('error' in parsed) throw new InvalidInputError(parsed.error);
          const saved = await store.about.set(ABOUT, parsed.about, expectedVersionOf(body));
          await revalidate(['/']);
          return json(aboutResponse(saved, config.about));
        },
      },
      {
        method: 'DELETE',
        path: 'about',
        handle: async () => {
          await store.about.remove(ABOUT);
          await revalidate(['/']);
          return json(aboutResponse(null, config.about));
        },
      },
      {
        method: 'GET',
        path: 'header-images',
        handle: async () => {
          const [row, shots] = await Promise.all([store.headerImages.get(HEADER), library()]);
          const response: HomeHeaderImagesResponse = { images: imagesOf(row), shots, version: row?.version ?? 0, updatedAt: row?.updatedAt ?? null };
          return json(response);
        },
      },
      {
        method: 'PUT',
        path: 'header-images',
        handle: async ({ request }) => {
          const body = await readBody(request);
          const images = parseHeaderImages(body.images);
          if (!images) throw new InvalidInputError('Choose three image slots with valid image sources and descriptions.');
          const shots = await library();
          if (images.some((image) => image?.source === 'shots' && !shots.some((shot) => shot.src === image.src))) {
            throw new InvalidInputError('A selected shot is no longer in the gallery. Choose another photo.');
          }
          const saved = await store.headerImages.set(HEADER, images, expectedVersionOf(body));
          await revalidate(['/']);
          const response: HomeHeaderImagesResponse = { images: imagesOf(saved), shots, version: saved.version, updatedAt: saved.updatedAt };
          return json(response);
        },
      },
    ];
  },
  publicReads: (store, config: HomeConfig): HomeReads => {
    const headerImages = async () => imagesOf(await store.headerImages.get(HEADER));
    return {
      about: async () => homeAboutOver((await store.about.get(ABOUT))?.value, config.about),
      headerImages,
      headerPhotos: async (library) => resolveHeaderImages(await headerImages(), library ?? (await config.library().catch(() => []))),
    };
  },
});
