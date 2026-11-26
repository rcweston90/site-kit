/**
 * resume: the PDF served at the site's resume address (default `/resume`).
 *
 *   GET    /resume     ResumeState: the upload (or null), the shipped base and the version
 *   POST   /resume     multipart `file` (a PDF up to 10 MB) and `expectedVersion`; replaces the resume at once
 *   DELETE /resume     { expectedVersion? }: back to the shipped base
 *
 * An upload is stored in the MediaStore under a fresh key, the pointer row is
 * swapped, and only then is the previous file deleted, so the old resume
 * stays reachable until the new one is fully in place. Public pages answer
 * with `reads.resume.respond(request)`, which serves the PDF inline with an
 * ETag and falls back to the base whenever the upload can't be read: a resume
 * link in someone's inbox must always resolve.
 */

import { defineModule, type SiteServices } from '../../module.js';
import { InvalidInputError, SITE_DATA_MESSAGES, expectedVersionOf, json } from '../../http.js';
import { createMemoryTable, createPostgresTable, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  RESUME_MAX_BYTES,
  downloadNameFor,
  isResumeUpload,
  looksLikePdf,
  type ResumeBaseInfo,
  type ResumeState,
  type ResumeUpload,
} from './model.js';

export * from './model.js';

/** The PDF the host ships, served when nothing is uploaded. */
export interface ResumeBase {
  filename: string;
  read(): Promise<Uint8Array>;
  /** When the file last changed. Default: when the server started. */
  modifiedAt?: string;
}

export interface ResumeConfig {
  /** The shipped fallback, or null for none (then `/resume` answers 404 until something is uploaded). */
  base: ResumeBase | null;
  /** The name the browser offers on Save, whichever file is served. */
  downloadName: string;
  /** The public address the resume is served at, for revalidation. Default `/resume`. */
  path: string;
  /** The MediaStore key prefix uploads go under. Default `resume/`. */
  prefix: string;
  maxBytes: number;
}

export type ResumeStore = VersionedTable<ResumeUpload | null>;

export interface ResumeReads {
  /** What the admin shows: the upload, the base and the version. */
  state(): Promise<ResumeState>;
  /** Whether there is a resume to serve at all. */
  available(): Promise<boolean>;
  /** The resume as a response: the PDF inline, 304 when the browser's copy is current, 404 when there's none. */
  respond(request: Request): Promise<Response>;
}

const KEY = 'current';
const STARTED = new Date().toISOString();

function configureResume(config: Partial<ResumeConfig> | undefined): ResumeConfig {
  const path = config?.path ?? '/resume';
  const prefix = config?.prefix ?? 'resume/';
  if (!/^\/[a-z0-9\-/]*$/.test(path)) throw new Error(`resume: ${path} isn't a site path like /resume.`);
  if (!/^[a-z0-9\-/]+\/$/.test(prefix)) throw new Error(`resume: the prefix ${prefix} should look like resume/.`);
  return {
    base: config?.base ?? null,
    downloadName: downloadNameFor(config?.downloadName ?? 'Resume.pdf'),
    path,
    prefix,
    maxBytes: config?.maxBytes ?? RESUME_MAX_BYTES,
  };
}

function resumeFor(store: ResumeStore, config: ResumeConfig, services: SiteServices) {
  let baseInfo: Promise<ResumeBaseInfo | null> | null = null;
  const base = (): Promise<ResumeBaseInfo | null> => {
    const shipped = config.base;
    if (!shipped) return Promise.resolve(null);
    baseInfo ??= shipped.read().then(
      (bytes) => ({ filename: shipped.filename, size: bytes.byteLength, modifiedAt: shipped.modifiedAt ?? STARTED }),
      (error) => {
        baseInfo = null;
        throw error;
      },
    );
    return baseInfo;
  };

  async function state(): Promise<ResumeState> {
    const [row, shipped] = await Promise.all([store.get(KEY), base().catch(() => null)]);
    return { upload: isResumeUpload(row?.value) ? row.value : null, base: shipped, version: row?.version ?? 0 };
  }

  const headers = (etag: string, extra: Record<string, string> = {}) =>
    new Headers({
      'content-type': 'application/pdf',
      // `inline` opens the browser's own viewer; the name is what Save suggests.
      'content-disposition': `inline; filename="${config.downloadName}"`,
      // Browsers may keep a copy but must ask before reusing it, so a new
      // upload shows on the next visit (the ETag makes the ask cheap).
      'cache-control': 'public, max-age=0, must-revalidate',
      etag,
      ...extra,
    });

  const notModified = (request: Request, etag: string): Response | null => {
    const match = request.headers.get('if-none-match');
    if (match && match.split(',').some((tag) => tag.trim() === etag)) return new Response(null, { status: 304, headers: { etag } });
    return null;
  };

  async function serveBase(request: Request): Promise<Response> {
    const shipped = config.base;
    const info = await base().catch(() => null);
    if (!shipped || !info) return new Response('There’s no resume here yet.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const etag = `"base-${info.size}-${Date.parse(info.modifiedAt) || 0}"`;
    const cached = notModified(request, etag);
    if (cached) return cached;
    const bytes = await shipped.read();
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { status: 200, headers: headers(etag, { 'content-length': String(bytes.byteLength) }) });
  }

  async function respond(request: Request): Promise<Response> {
    let upload: ResumeUpload | null = null;
    try {
      const row = await store.get(KEY);
      upload = isResumeUpload(row?.value) ? row.value : null;
    } catch (error) {
      console.error('[site-data] resume: the lookup failed, serving the base:', error);
    }
    if (upload && services.media) {
      // Keys are fresh per upload, so the key alone names the bytes.
      const etag = `"${upload.key.replace(/[^a-zA-Z0-9]/g, '')}"`;
      const cached = notModified(request, etag);
      if (cached) return cached;
      try {
        const object = await services.media.get(upload.key);
        if (object) {
          return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers: headers(etag, { 'content-length': String(object.size) }) });
        }
        console.error(`[site-data] resume: ${upload.key} is missing from the media store, serving the base`);
      } catch (error) {
        console.error('[site-data] resume: reading the upload failed, serving the base:', error);
      }
    }
    return serveBase(request);
  }

  return { state, respond, base };
}

/** Best-effort: a leftover file is a few hundred KB, not a failed save. */
async function deleteQuietly(services: SiteServices, key: string) {
  try {
    await services.media?.delete(key);
  } catch (error) {
    console.warn('[site-data] resume: the previous file couldn’t be deleted:', error);
  }
}

const formVersion = (value: FormDataEntryValue | null): number | undefined => {
  if (value === null || value === '') return undefined;
  return expectedVersionOf({ expectedVersion: Number(value) });
};

export const resume = defineModule({
  id: 'resume',
  title: 'Resume',
  migrationRange: [2000, 2099],
  migrations: MIGRATIONS,
  configure: configureResume,
  createMemoryStore: (): ResumeStore => createMemoryTable<ResumeUpload | null>(),
  createPostgresStore: (sql): ResumeStore =>
    createPostgresTable<ResumeUpload | null>(sql, {
      table: 'site_resume_upload',
      keyColumn: 'key',
      columns: ['body'],
      toRow: (upload) => [upload === null ? null : JSON.stringify(upload)],
      fromRow: (row) => (isResumeUpload(row.body) ? row.body : null),
    }),
  handlers: ({ store, config, services, revalidate }) => {
    const reads = resumeFor(store, config, services);
    return [
      { method: 'GET', path: '', handle: async () => json(await reads.state()) },
      {
        method: 'POST',
        path: '',
        handle: async ({ request }) => {
          const media = services.media;
          if (!media) throw new InvalidInputError(SITE_DATA_MESSAGES.unavailable);
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            throw new InvalidInputError(SITE_DATA_MESSAGES.unreadable);
          }
          const file = form.get('file');
          if (!file || typeof file === 'string') throw new InvalidInputError('Choose a PDF to upload.');
          if (file.size > config.maxBytes) throw new InvalidInputError(`“${file.name}” is larger than ${Math.round(config.maxBytes / 1024 / 1024)} MB. Choose a smaller PDF.`);
          const expectedVersion = formVersion(form.get('expectedVersion'));
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!looksLikePdf(bytes)) return json({ error: `“${file.name}” isn’t a PDF. Choose a PDF file.`, code: 'INVALID' }, 422);

          const previous = (await store.get(KEY))?.value ?? null;
          const key = `${config.prefix}${crypto.randomUUID()}.pdf`;
          await media.put({ key, bytes, contentType: 'application/pdf', visibility: 'public', cacheControl: 'public, max-age=31536000, immutable' });
          const upload: ResumeUpload = {
            key,
            filename: file.name.slice(0, 200) || 'resume.pdf',
            size: bytes.byteLength,
            uploadedAt: new Date().toISOString(),
          };
          let saved;
          try {
            saved = await store.set(KEY, upload, expectedVersion);
          } catch (error) {
            // Someone else changed it first: theirs stays, this file goes.
            await deleteQuietly(services, key);
            throw error;
          }
          if (isResumeUpload(previous) && previous.key !== key) await deleteQuietly(services, previous.key);
          await revalidate([config.path]);
          return json({ upload, version: saved.version });
        },
      },
      {
        method: 'DELETE',
        path: '',
        handle: async ({ request }) => {
          let body: Record<string, unknown> = {};
          const text = await request.text();
          if (text.trim()) {
            try {
              const parsed: unknown = JSON.parse(text);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
            } catch {
              throw new InvalidInputError(SITE_DATA_MESSAGES.unreadable);
            }
          }
          const previous = (await store.get(KEY))?.value ?? null;
          const saved = await store.set(KEY, null, expectedVersionOf(body));
          if (isResumeUpload(previous)) await deleteQuietly(services, previous.key);
          await revalidate([config.path]);
          return json({ upload: null, version: saved.version });
        },
      },
    ];
  },
  publicReads: (store, config, services): ResumeReads => {
    const reads = resumeFor(store, config, services);
    return {
      state: reads.state,
      respond: reads.respond,
      available: async () => {
        const current = await reads.state().catch(() => null);
        return Boolean(current && (current.upload || current.base));
      },
    };
  },
});
