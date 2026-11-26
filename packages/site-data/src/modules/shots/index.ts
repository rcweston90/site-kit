/**
 * shots: the photography gallery.
 *
 *   GET    /shots                 { shots, order }                    every shot, hidden ones too
 *   POST   /shots                 multipart `file` → { shot }          ingest one upload
 *   PATCH  /shots                 { id, alt?, hidden?, expectedVersion? } → { success, shot }
 *                                 { order: number[], expectedVersion? }  → { success, order }
 *   DELETE /shots                 { id } → { success }                 the row, and the file Shots uploaded
 *   GET    /shots/photos          Photo[]                             public: the gallery, in order
 *   GET    /shots/media/<key>     the file                            public
 *
 * The client uploads a batch by calling POST once per file (progress, and no
 * request runs long). Each upload is resized, re-encoded and measured once
 * (see ingest.ts), so the public page only reads the table.
 */

import { serveMediaObject, notFoundResponse, isSafeKey } from '@rcweston/story-server';
import { defineModule, type SiteServices } from '../../module.js';
import { InvalidInputError, SITE_DATA_MESSAGES, json, readBody } from '../../http.js';
import { DEFAULT_SITE_DATA_BASE_PATH } from '../../client.js';
import { MIGRATIONS } from './migrations.generated.js';
import { ingestImage, type IngestImage } from './ingest.js';
import { altFromFilename, parseShotsPatch, publicPhotos, SHOTS_MAX_UPLOAD, type Photo, type ShotRecord, type ShotsList } from './model.js';
import { createMemoryShotsStore, createPostgresShotsStore, type ShotsStore, type StoredShot } from './store.js';

export * from './model.js';
export { createMemoryShotsStore, createPostgresShotsStore, type NewShot, type ShotChanges, type ShotsStore, type StoredShot } from './store.js';
export { ingestImage, ingestWithoutSharp, readImageSize, type IngestImage, type IngestedImage } from './ingest.js';

export interface ShotsConfig {
  /** The MediaStore key prefix uploads go under, and the only one deletes remove. Default `shots/`. */
  prefix: string;
  /** Where this module serves its files. Default `/api/site/shots/media`. */
  mediaBasePath: string;
  /** The address a browser loads a key from. Default `<mediaBasePath>/<key>`. */
  src?: (key: string) => string;
  /** Largest upload, in bytes. Default 25MB. */
  maxUpload: number;
  /** Turns an upload into the stored file. Default: sharp when installed (see ingest.ts). */
  ingest: IngestImage;
  /** Public paths that show shots, revalidated after each change. Default `/shots` and `/`. */
  paths: string[];
}

export interface ShotsReads {
  /** The public gallery: visible shots in order, as the collage wants them. */
  photos(): Promise<Photo[]>;
  /** Every shot with its address, hidden ones included. */
  all(): Promise<ShotRecord[]>;
}

export function configureShots(config: Partial<ShotsConfig> | undefined): ShotsConfig {
  const prefix = config?.prefix ?? 'shots/';
  if (!/^[a-z0-9-]+\/$/.test(prefix)) throw new Error(`shots: the prefix ${prefix} should be one folder name and a slash, like shots/.`);
  return {
    prefix,
    mediaBasePath: (config?.mediaBasePath ?? `${DEFAULT_SITE_DATA_BASE_PATH}/shots/media`).replace(/\/+$/, ''),
    ...(config?.src ? { src: config.src } : {}),
    maxUpload: config?.maxUpload ?? SHOTS_MAX_UPLOAD,
    ingest: config?.ingest ?? ingestImage,
    paths: config?.paths ?? ['/shots', '/'],
  };
}

function addressOf(config: ShotsConfig) {
  const src = config.src ?? ((key: string) => `${config.mediaBasePath}/${key.split('/').map(encodeURIComponent).join('/')}`);
  return (shot: StoredShot): ShotRecord => ({ ...shot, url: src(shot.pathname) });
}

async function listWithAddresses(store: ShotsStore, config: ShotsConfig): Promise<ShotsList> {
  const { shots, order } = await store.list();
  return { shots: shots.map(addressOf(config)), order };
}

const unavailable = () => json({ error: SITE_DATA_MESSAGES.unavailable }, 503);

async function readUpload(request: Request): Promise<File> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new InvalidInputError('No file provided');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new InvalidInputError('No file provided');
  return file;
}

function readsFor(store: ShotsStore, config: ShotsConfig, _services: SiteServices): ShotsReads {
  return {
    photos: async () => {
      // An empty or unreachable table shows an empty gallery.
      try {
        return publicPhotos((await listWithAddresses(store, config)).shots);
      } catch {
        return [];
      }
    },
    all: async () => (await listWithAddresses(store, config)).shots,
  };
}

export const shots = defineModule({
  id: 'shots',
  title: 'Shots',
  migrationRange: [1700, 1799],
  migrations: MIGRATIONS,
  configure: configureShots,
  createMemoryStore: (): ShotsStore => createMemoryShotsStore(),
  createPostgresStore: (sql): ShotsStore => createPostgresShotsStore(sql),
  handlers: ({ store, config, services, revalidate }) => {
    const address = addressOf(config);
    return [
      // List all shots (admin view).
      { method: 'GET', path: '', handle: async () => json(await listWithAddresses(store, config)) },

      // Ingest one uploaded file: process → store the file → save the record.
      {
        method: 'POST',
        path: '',
        handle: async ({ request }) => {
          const { media } = services;
          if (!media) return unavailable();
          const file = await readUpload(request);
          if (file.size > config.maxUpload) {
            return json({ error: `File is larger than ${Math.round(config.maxUpload / 1024 / 1024)}MB` }, 413);
          }
          const input = new Uint8Array(await file.arrayBuffer());
          let processed;
          try {
            processed = await config.ingest(input);
          } catch {
            return json({ error: `Could not process “${file.name}” — unsupported or corrupt image` }, 422);
          }
          const pathname = `${config.prefix}${crypto.randomUUID()}.${processed.ext}`;
          await media.put({
            key: pathname,
            bytes: processed.bytes,
            contentType: processed.contentType,
            visibility: 'public',
            cacheControl: 'public, max-age=31536000, immutable',
          });
          const shot = await store.insert({
            pathname,
            width: processed.width,
            height: processed.height,
            blurDataURL: processed.blurDataURL,
            alt: altFromFilename(file.name),
          });
          await revalidate(config.paths);
          return json({ shot: address(shot) });
        },
      },

      // Update a caption or visibility ({ id, alt?, hidden? }) or reorder the gallery ({ order }).
      {
        method: 'PATCH',
        path: '',
        handle: async ({ request }) => {
          const patch = parseShotsPatch(await readBody(request));
          if (!patch) throw new InvalidInputError('Expected { order: number[] } or { id, alt }');
          if (patch.kind === 'order') {
            const order = await store.reorder(patch.ids, patch.expectedVersion);
            await revalidate(config.paths);
            return json({ success: true, order });
          }
          const saved = await store.update(patch.id, { alt: patch.alt, hidden: patch.hidden }, patch.expectedVersion);
          if (!saved) return json({ error: 'That shot is no longer in the gallery. Reload to see the latest.' }, 404);
          await revalidate(config.paths);
          return json({ success: true, shot: address(saved) });
        },
      },

      // Delete a shot ({ id }): the record, and the file when Shots uploaded it.
      // A record whose file lives elsewhere keeps that file.
      {
        method: 'DELETE',
        path: '',
        handle: async ({ request }) => {
          const { id } = await readBody(request);
          if (typeof id !== 'number' || !Number.isInteger(id)) throw new InvalidInputError('Expected { id: number }');
          const removed = await store.remove(id);
          if (!removed) return json({ error: SITE_DATA_MESSAGES.notFound }, 404);
          if (removed.pathname.startsWith(config.prefix) && services.media) {
            try {
              await services.media.delete(removed.pathname);
            } catch {
              // The record is gone; a leftover file is harmless.
            }
          }
          await revalidate(config.paths);
          return json({ success: true });
        },
      },

      // The public gallery, for a page that reads it in the browser (a home carousel).
      { method: 'GET', path: 'photos', access: 'public', handle: async () => json(await readsFor(store, config, services).photos()) },

      // The files themselves.
      {
        method: 'GET',
        path: 'media/*key',
        access: 'public',
        handle: async ({ request, params }) => {
          const key = params.key ?? '';
          if (!services.media || !isSafeKey(key) || !key.startsWith(config.prefix)) return notFoundResponse();
          return serveMediaObject(request, services.media, key);
        },
      },
    ];
  },
  publicReads: (store, config: ShotsConfig, services): ShotsReads => readsFor(store, config, services),
});
