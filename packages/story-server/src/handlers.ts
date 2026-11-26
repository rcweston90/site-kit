/**
 * Framework-free request handlers for the editor: `(request) => Response`.
 *
 * Mount `handle` on one catch-all route and every endpoint is there, or use
 * the named handlers on routes of your own. Every refusal is a JSON
 * `StoryErrorBody` in plain words; anything unexpected is logged through
 * `onError` and answered with a 500 that says nothing internal.
 */

import {
  isStorySlug,
  type AuthAdapter,
  type DocumentStore,
  type MediaPolicy,
  type MediaStore,
  type MediaVisibility,
  type PublicationReadiness,
  type Revalidator,
  type Session,
  type Story,
  type StoryDocument,
  type StoryEditorState,
  type StoryErrorBody,
  type UploadedMedia,
} from '@rcweston/story-core';
import { InvalidStoryError, SERVER_ERROR_MESSAGE, StoryNotFoundError, errorParts } from './errors.js';
import {
  UPLOAD_MESSAGES,
  checkUpload,
  createMediaPolicy,
  isSafeSegment,
  matchesSignature,
  MEDIA_SIGNATURE_BYTES,
  notFoundResponse,
  serveMediaObject,
  sha256OfBytes,
  uploadSignatureMessage,
  uploadSizeMessage,
  DEFAULT_MEDIA_PREFIX,
  type StoryMediaPolicy,
} from './media.js';
import { DEFAULT_BASE_PATH, matchRoute, normalizeBasePath, type StoryRoute } from './routes.js';
import { blankStory, takenStoryAddresses, validatePublication, validateStory, validateStoryDraft } from './validation.js';

export interface StoryHandlerOptions {
  store: DocumentStore;
  /** Where uploads go. Without one, the media routes answer that uploads aren't set up. */
  media?: MediaStore;
  /** Default: `createMediaPolicy({ basePath: <basePath>/media })`. */
  mediaPolicy?: MediaPolicy | StoryMediaPolicy;
  auth: AuthAdapter;
  revalidator?: Revalidator;
  /** False turns publishing (and unpublishing) off. Default true. */
  publicationEnabled?: boolean;
  /** False turns address changes off. Default: same as `publicationEnabled`, since a rename moves the live page. */
  renameEnabled?: boolean;
  /** Why renaming is off, in the editor's words. */
  renameUnavailableReason?: string;
  /** Names of the custom blocks your app registers. A block naming anything else gets a note in the publish checklist. */
  customBlocks?: Iterable<string>;
  /** Where the handlers are mounted. Default `/api/story`. */
  basePath?: string;
  /** A build or commit id recorded with every saved version. */
  commit?: string;
  /** Addresses your app already uses for other pages, which a story can't move to. */
  otherAddresses?: () => Iterable<string> | Promise<Iterable<string>>;
  /** Who may see uploads. `protected` (the default) serves them only to signed-in sessions. */
  uploadVisibility?: MediaVisibility;
  /** The key prefix the media route serves, when `mediaPolicy` doesn't say. Default `stories/`. */
  mediaPrefix?: string;
  /** Refuse writes whose `Origin` names another host. Default true. */
  checkOrigin?: boolean;
  /** Unexpected failures, for your logs. Default `console.error`. */
  onError?: (error: unknown, context: { route: string }) => void;
}

export type RouteParams = { slug?: unknown; key?: unknown } | undefined;
export type StoryHandler = (request: Request, params?: RouteParams) => Promise<Response>;

export type PublishedStoryResult =
  | {
      status: 'published';
      /** The address the story lives at now. */
      slug: string;
      story: Story;
      document: StoryDocument;
      /** Set when the address asked for was renamed: send readers to `slug` with a permanent redirect. */
      redirectFrom?: string;
    }
  | { status: 'none' }
  /** The lookup failed, or the stored story no longer passes validation. Never treat this as "not published". */
  | { status: 'failed'; error: unknown };

export interface StoryHandlers {
  /** One handler for every route, for a catch-all mount. */
  handle: (request: Request) => Promise<Response>;
  list: StoryHandler;
  load: StoryHandler;
  saveDraft: StoryHandler;
  publish: StoryHandler;
  unpublish: StoryHandler;
  rename: StoryHandler;
  uploadMedia: StoryHandler;
  serveMedia: StoryHandler;
  /** `DELETE /stories/:slug`: removes every version, the publication and old addresses, when the store can. */
  remove: StoryHandler;
  /** `GET` says whether the request is signed in; `POST` signs in, `DELETE` signs out, when the auth adapter can (see `createPasscodeAuth`). */
  session: StoryHandler;
  /** What the editor loads for a story, for server-rendered editor pages. Doesn't check the session. */
  editorState(slug: string): Promise<StoryEditorState>;
  /** The published story for a reader, following renames. */
  getPublishedStory(slug: string): Promise<PublishedStoryResult>;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

const refuse = (status: number, body: StoryErrorBody, headers?: Record<string, string>) => json(body, status, headers);

export const HANDLER_MESSAGES = {
  unreadable: 'The request couldn’t be read. Reload the editor and try again.',
  notFound: 'There’s nothing here.',
  method: 'That route doesn’t take this kind of request.',
  moved: 'This story has a new address.',
  publishingOff: 'Publishing is turned off on this server.',
  renameOff: 'Addresses can’t be changed on this server.',
  uploadsOff: 'Uploads aren’t set up on this server.',
  crossSite: 'This request came from another site, so it was refused.',
  saveBody: 'A story and the version it builds on are required.',
  publishBody: 'A version and the published version the editor loaded are required.',
  renameBody: 'A new address and the version the editor loaded are required.',
  notReady: 'This version isn’t ready to publish yet.',
  versionMissing: 'That version isn’t saved under this story.',
  otherPage: 'That address belongs to another page.',
  mediaFailed: 'Couldn’t load that file. Try again in a moment.',
  deleteOff: 'Stories can’t be deleted on this server.',
} as const;

/** Read a JSON object body, or null when it isn't one. */
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

export function createStoryHandlers(options: StoryHandlerOptions): StoryHandlers {
  const { store, media, auth, revalidator } = options;
  const basePath = normalizeBasePath(options.basePath ?? DEFAULT_BASE_PATH);
  const policy: MediaPolicy & { prefix?: string } = options.mediaPolicy ?? createMediaPolicy({ basePath: `${basePath}/media` });
  const mediaPrefix = policy.prefix ?? options.mediaPrefix ?? DEFAULT_MEDIA_PREFIX;
  const publicationEnabled = options.publicationEnabled ?? true;
  const renameEnabled = options.renameEnabled ?? publicationEnabled;
  const uploadVisibility = options.uploadVisibility ?? 'protected';
  const customBlocks = options.customBlocks ? [...options.customBlocks] : undefined;
  const commit = options.commit ?? '';
  const checkOrigin = options.checkOrigin ?? true;
  const onError = options.onError ?? ((error: unknown, context: { route: string }) => console.error(`[story-server] ${context.route} failed:`, error));

  const otherAddresses = async () => [...((await options.otherAddresses?.()) ?? [])];

  /** A revalidation hook that throws never fails the request it follows. */
  async function notify(route: string, hook: () => void | Promise<void> | undefined) {
    try {
      await hook();
    } catch (error) {
      onError(error, { route: `${route} (revalidate)` });
    }
  }

  async function run(route: string, work: () => Promise<Response>): Promise<Response> {
    try {
      return await work();
    } catch (error) {
      // AuthAdapter.requireAdmin throws a ready 401.
      if (error instanceof Response) return error;
      const parts = errorParts(error);
      if (parts) return refuse(parts.status, parts.body);
      onError(error, { route });
      return refuse(500, { error: SERVER_ERROR_MESSAGE });
    }
  }

  /** Writes must come from your own pages. The SameSite cookie keeps most cross-site posts out; this refuses the rest. */
  function sameOrigin(request: Request): boolean {
    if (!checkOrigin) return true;
    const origin = request.headers.get('origin');
    // No Origin: not a browser's cross-site request (scripts, same-origin GETs).
    if (origin === null) return true;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    const hosts = [
      new URL(request.url).host,
      request.headers.get('host'),
      ...(request.headers.get('x-forwarded-host')?.split(',').map((host) => host.trim()) ?? []),
    ].filter(Boolean);
    return hosts.includes(originHost);
  }

  async function admin(request: Request, write: boolean): Promise<Session> {
    if (write && !sameOrigin(request)) {
      throw refuse(403, { error: HANDLER_MESSAGES.crossSite, code: 'UNAUTHORIZED' });
    }
    return auth.requireAdmin(request);
  }

  // ─── Editor state ─────────────────────────────────────────────────────────

  function readinessOf(document: StoryDocument, knownSlugs: string[]): PublicationReadiness {
    return validatePublication(document.content, { knownSlugs, customBlocks });
  }

  async function editorState(slug: string): Promise<StoryEditorState> {
    const [documents, live, summaries, redirects, publications, others] = await Promise.all([
      store.versions(slug),
      store.published(slug),
      store.list(),
      store.redirects(),
      store.publications(),
      otherAddresses(),
    ]);
    if (live.status === 'failed') throw live.error;
    const story = documents[0]?.content ?? blankStory(slug);
    if (!story) throw new StoryNotFoundError();
    const formerSlugs = new Set(redirects.filter((redirect) => redirect.to === slug).map((redirect) => redirect.from));
    const knownSlugs = summaries.map((summary) => summary.slug);
    return {
      story,
      documents,
      liveStory: live.status === 'published' ? live.document.content : null,
      publishedDocumentId: live.status === 'published' ? live.document.id : null,
      readinessByDocumentId: Object.fromEntries(documents.map((document) => [document.id, readinessOf(document, knownSlugs)])),
      publicationEnabled,
      restoresEnabled: true,
      renameAvailable: renameEnabled,
      renameUnavailableReason: renameEnabled ? null : options.renameUnavailableReason ?? HANDLER_MESSAGES.renameOff,
      takenAddresses: takenStoryAddresses({
        current: slug,
        documentSlugs: knownSlugs,
        hostSlugs: others,
        publicationSlugs: publications.map((publication) => publication.slug),
        authoredSlugs: [],
        redirects,
      }),
      relatedStories: summaries
        .filter((summary) => summary.slug !== slug && !formerSlugs.has(summary.slug))
        .map((summary) => ({
          slug: summary.slug,
          title: summary.title,
          company: summary.company || undefined,
          ...(summary.publishedDocumentId ? {} : { unpublished: true as const }),
        })),
    };
  }

  // ─── Routes ───────────────────────────────────────────────────────────────

  function slugFrom(request: Request, params: RouteParams, name: StoryRoute['name']): string | null {
    if (typeof params?.slug === 'string') return params.slug;
    const route = matchRoute(new URL(request.url).pathname, basePath);
    return route && route.name === name && 'slug' in route ? route.slug : null;
  }

  function keyFrom(request: Request, params: RouteParams): string[] | null {
    if (Array.isArray(params?.key) && params.key.every((segment) => typeof segment === 'string')) return params.key as string[];
    if (typeof params?.key === 'string') return params.key.split('/');
    const route = matchRoute(new URL(request.url).pathname, basePath);
    return route?.name === 'serveMedia' ? route.key : null;
  }

  const notFound = () => refuse(404, { error: HANDLER_MESSAGES.notFound, code: 'NOT_FOUND' });

  const list: StoryHandler = (request) => run('list', async () => {
    await admin(request, false);
    return json({ stories: await store.list() });
  });

  const load: StoryHandler = (request, params) => run('load', async () => {
    await admin(request, false);
    const slug = slugFrom(request, params, 'load');
    if (!slug || !isStorySlug(slug)) return notFound();
    // Checked first: an editor opened at an old address follows the story.
    const { movedTo } = await store.aliases(slug);
    if (movedTo) return refuse(404, { error: HANDLER_MESSAGES.moved, code: 'STORY_MOVED', movedTo });
    return json(await editorState(slug));
  });

  const saveDraft: StoryHandler = (request, params) => run('saveDraft', async () => {
    await admin(request, true);
    const slug = slugFrom(request, params, 'saveDraft');
    if (!slug || !isStorySlug(slug)) return notFound();
    const body = await readJson(request);
    if (!body) return refuse(400, { error: HANDLER_MESSAGES.unreadable, code: 'INVALID' });
    if (!('content' in body) || !isNullableString(body.parentDocumentId ?? null)) {
      return refuse(400, { error: HANDLER_MESSAGES.saveBody, code: 'INVALID' });
    }
    const problems = validateStoryDraft(body.content, slug);
    if (problems.length > 0) throw new InvalidStoryError(problems);
    const restoredFrom = typeof body.restoredFrom === 'string' ? body.restoredFrom : null;
    // A restore is always its own version; only the editor's own saves fold.
    const autosave = body.autosave === true && !restoredFrom;
    await store.saveDraft({
      slug,
      content: body.content as Story,
      parentDocumentId: (body.parentDocumentId as string | null | undefined) ?? null,
      source: restoredFrom ? { kind: 'restore', ref: restoredFrom, commit } : { kind: 'editor', ref: slug, commit },
      ...(autosave ? { autosave } : {}),
    });
    await notify('saveDraft', () => revalidator?.saved?.(slug));
    return json(await editorState(slug), 201);
  });

  const publish: StoryHandler = (request, params) => run('publish', async () => {
    const session = await admin(request, true);
    if (!publicationEnabled) return refuse(503, { error: HANDLER_MESSAGES.publishingOff });
    const slug = slugFrom(request, params, 'publish');
    if (!slug || !isStorySlug(slug)) return notFound();
    const body = await readJson(request);
    if (!body || typeof body.documentId !== 'string' || !isNullableString(body.expectedPublishedDocumentId)) {
      return refuse(400, { error: HANDLER_MESSAGES.publishBody, code: 'INVALID' });
    }
    const { movedTo } = await store.aliases(slug);
    if (movedTo) return refuse(409, { error: HANDLER_MESSAGES.moved, code: 'STORY_MOVED', movedTo });
    const documentId = body.documentId;
    const [documents, summaries] = await Promise.all([store.versions(slug), store.list()]);
    const candidate = documents.find((document) => document.id === documentId);
    if (!candidate) throw new StoryNotFoundError(HANDLER_MESSAGES.versionMissing);
    const structural = validateStory(candidate.content, slug);
    const readiness = readinessOf(candidate, summaries.map((summary) => summary.slug));
    const blocking = [...structural, ...readiness.errors.map((issue) => issue.message)];
    if (blocking.length > 0) {
      return refuse(422, { error: HANDLER_MESSAGES.notReady, code: 'INVALID', problems: [...new Set(blocking)] });
    }
    await store.publish({
      slug,
      documentId,
      expectedPublishedDocumentId: body.expectedPublishedDocumentId,
      publishedBy: session.subject ?? null,
    });
    await notify('publish', () => revalidator?.published?.(slug));
    return json(await editorState(slug));
  });

  const unpublish: StoryHandler = (request, params) => run('unpublish', async () => {
    await admin(request, true);
    if (!publicationEnabled) return refuse(503, { error: HANDLER_MESSAGES.publishingOff });
    const slug = slugFrom(request, params, 'unpublish');
    if (!slug || !isStorySlug(slug)) return notFound();
    const { movedTo } = await store.aliases(slug);
    if (movedTo) return refuse(409, { error: HANDLER_MESSAGES.moved, code: 'STORY_MOVED', movedTo });
    await store.unpublish(slug);
    await notify('unpublish', () => revalidator?.unpublished?.(slug));
    return json(await editorState(slug));
  });

  const remove: StoryHandler = (request, params) => run('remove', async () => {
    await admin(request, true);
    if (!store.delete) return refuse(503, { error: HANDLER_MESSAGES.deleteOff });
    const slug = slugFrom(request, params, 'load');
    if (!slug || !isStorySlug(slug)) return notFound();
    const { movedTo } = await store.aliases(slug);
    if (movedTo) return refuse(409, { error: HANDLER_MESSAGES.moved, code: 'STORY_MOVED', movedTo });
    if (!(await store.latest(slug))) return notFound();
    await store.delete(slug);
    await notify('remove', () => revalidator?.deleted?.(slug));
    return json({ deleted: slug });
  });

  const rename: StoryHandler = (request, params) => run('rename', async () => {
    const session = await admin(request, true);
    if (!renameEnabled) return refuse(503, { error: options.renameUnavailableReason ?? HANDLER_MESSAGES.renameOff });
    const from = slugFrom(request, params, 'rename');
    if (!from || !isStorySlug(from)) return notFound();
    const body = await readJson(request);
    if (!body || typeof body.to !== 'string' || !isNullableString(body.expectedLatestDocumentId)) {
      return refuse(400, { error: HANDLER_MESSAGES.renameBody, code: 'INVALID' });
    }
    const to = body.to;
    if ((await otherAddresses()).includes(to)) return refuse(409, { error: HANDLER_MESSAGES.otherPage, code: 'ADDRESS' });
    await store.rename({
      from,
      to,
      expectedLatestDocumentId: body.expectedLatestDocumentId,
      source: { kind: 'rename', ref: from, commit },
      publishedBy: session.subject ?? null,
    });
    await notify('rename', () => revalidator?.renamed?.(from, to));
    return json(await editorState(to));
  });

  const uploadMedia: StoryHandler = (request) => run('uploadMedia', async () => {
    await admin(request, true);
    if (!media) return refuse(503, { error: HANDLER_MESSAGES.uploadsOff });
    // Refuse an oversized body before buffering it, when the client says how big it is.
    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > policy.maxBytes + 64 * 1024) {
      return refuse(413, { error: uploadSizeMessage(policy), code: 'TOO_LARGE' });
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return refuse(400, { error: UPLOAD_MESSAGES.missingFile, code: 'INVALID' });
    }
    const slug = form.get('slug');
    if (typeof slug !== 'string' || !isStorySlug(slug) || !isSafeSegment(slug)) {
      return refuse(400, { error: UPLOAD_MESSAGES.slug, code: 'INVALID' });
    }
    const file = form.get('file');
    if (!(file instanceof Blob)) return refuse(400, { error: UPLOAD_MESSAGES.missingFile, code: 'INVALID' });
    const name = typeof (file as File).name === 'string' ? (file as File).name : '';
    const check = checkUpload({ name, type: file.type, size: file.size }, policy);
    if (!check.ok) return refuse(check.status, { error: check.error, code: check.code });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > policy.maxBytes) return refuse(413, { error: uploadSizeMessage(policy), code: 'TOO_LARGE' });
    if (!matchesSignature(check.format.contentType, bytes.subarray(0, MEDIA_SIGNATURE_BYTES))) {
      return refuse(415, { error: uploadSignatureMessage(check.format.label), code: 'UNSUPPORTED' });
    }
    const key = policy.keyFor({ slug, sha256: await sha256OfBytes(bytes), ext: check.format.ext });
    try {
      // A plain put: the same key always holds the same bytes, so writing it again is harmless.
      await media.put({ key, bytes, contentType: check.format.contentType, visibility: uploadVisibility, cacheControl: 'private, no-cache' });
    } catch (error) {
      onError(error, { route: 'uploadMedia' });
      return refuse(502, { error: UPLOAD_MESSAGES.storage });
    }
    const uploaded: UploadedMedia = {
      src: policy.srcFor(key, uploadVisibility),
      key,
      kind: check.format.kind,
      contentType: check.format.contentType,
      size: bytes.byteLength,
    };
    return json(uploaded);
  });

  const serveMedia: StoryHandler = (request, params) => run('serveMedia', async () => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405, { error: HANDLER_MESSAGES.method }, { allow: 'GET, HEAD' });
    // Signed out gets the same 404 as a missing file, before storage is asked
    // anything, so a locked session learns nothing about what exists.
    if (uploadVisibility !== 'public' && !(await auth.canViewProtected(request))) return notFoundResponse();
    const segments = keyFrom(request, params);
    if (!media || !segments || segments.length === 0 || !segments.every(isSafeSegment)) return notFoundResponse();
    const key = segments.join('/');
    if (!key.startsWith(mediaPrefix)) return notFoundResponse();
    try {
      return await serveMediaObject(request, media, key);
    } catch (error) {
      onError(error, { route: 'serveMedia' });
      return refuse(502, { error: HANDLER_MESSAGES.mediaFailed });
    }
  });

  const signer = auth as AuthAdapter & { signIn?: (request: Request) => Promise<Response>; signOut?: (request: Request) => Promise<Response> };
  const session: StoryHandler = (request) => run('session', async () => {
    if (request.method === 'GET') {
      const current = await auth.getSession(request);
      return json({ authenticated: current?.role === 'admin', role: current?.role ?? null });
    }
    if (request.method === 'POST' && signer.signIn) {
      if (!sameOrigin(request)) return refuse(403, { error: HANDLER_MESSAGES.crossSite, code: 'UNAUTHORIZED' });
      return signer.signIn(request);
    }
    if (request.method === 'DELETE' && signer.signOut) return signer.signOut(request);
    if (!signer.signIn && !signer.signOut) return notFound();
    return refuse(405, { error: HANDLER_MESSAGES.method }, { allow: ['GET', signer.signIn && 'POST', signer.signOut && 'DELETE'].filter(Boolean).join(', ') });
  });

  const METHODS: Record<StoryRoute['name'], { methods: string[]; handler: StoryHandler }> = {
    list: { methods: ['GET'], handler: list },
    load: { methods: ['GET', 'DELETE'], handler: (request, params) => (request.method === 'DELETE' ? remove(request, params) : load(request, params)) },
    saveDraft: { methods: ['POST'], handler: saveDraft },
    publish: { methods: ['POST'], handler: publish },
    unpublish: { methods: ['POST'], handler: unpublish },
    rename: { methods: ['POST'], handler: rename },
    uploadMedia: { methods: ['POST'], handler: uploadMedia },
    serveMedia: { methods: ['GET', 'HEAD'], handler: serveMedia },
    session: { methods: ['GET', 'POST', 'DELETE'], handler: session },
  };

  async function handle(request: Request): Promise<Response> {
    const route = matchRoute(new URL(request.url).pathname, basePath);
    if (!route) return notFound();
    const entry = METHODS[route.name];
    if (!entry.methods.includes(request.method)) {
      return refuse(405, { error: HANDLER_MESSAGES.method }, { allow: entry.methods.join(', ') });
    }
    const params = 'slug' in route ? { slug: route.slug } : 'key' in route ? { key: route.key } : undefined;
    return entry.handler(request, params);
  }

  async function getPublishedStory(slug: string): Promise<PublishedStoryResult> {
    try {
      if (!isStorySlug(slug)) return { status: 'none' };
      const { movedTo } = await store.aliases(slug);
      const target = movedTo ?? slug;
      const lookup = await store.published(target);
      if (lookup.status !== 'published') return lookup;
      // A stored story this code no longer accepts (a rollback past a new
      // block type) is a failure to report, not a page to render.
      const problems = validateStory(lookup.document.content, target);
      if (problems.length > 0) return { status: 'failed', error: new InvalidStoryError(problems, `The published version of ${target} no longer passes validation.`) };
      return {
        status: 'published',
        slug: target,
        story: lookup.document.content,
        document: lookup.document,
        ...(movedTo ? { redirectFrom: slug } : {}),
      };
    } catch (error) {
      return { status: 'failed', error };
    }
  }

  return { handle, list, load, saveDraft, publish, unpublish, rename, remove, uploadMedia, serveMedia, session, editorState, getPublishedStory };
}
