/**
 * blog: posts, with drafts, publishing and the "Learn more" cards between
 * posts and case studies.
 *
 *   GET    /blog                   { posts: BlogPostSummary[] }
 *   POST   /blog                   { slug, content } → BlogEditorState (201)
 *   GET    /blog/related           { choices: RelatedTileChoice[] } published posts and case studies
 *   POST   /blog/upload            form { file, slug } → { src } a body image
 *   GET    /blog/:slug             BlogEditorState
 *   PUT    /blog/:slug             { content, parentDocumentId, slug? } → BlogEditorState
 *   POST   /blog/:slug/publish     { documentId, expectedPublishedDocumentId } → BlogEditorState
 *   POST   /blog/:slug/unpublish   { expectedPublishedDocumentId? } → BlogEditorState
 *   DELETE /blog/:slug             { deleted: true }
 *
 * A save built on an older version, or a publish over a published version
 * that changed, answers 409 with the post as it is now (`current`). Public
 * pages read published posts through `reads.blog`, sanitized, with their
 * cards resolved; nothing here serves visitors over HTTP.
 */

import { AddressTakenError, DraftConflictError, PublicationConflictError, type DocumentStore, type MediaStore } from '@rcweston/story-core';
import { checkUpload, createMediaPolicy, matchesSignature, MEDIA_SIGNATURE_BYTES, sha256OfBytes, type StoryMediaPolicy } from '@rcweston/story-server';
import readingTime from 'reading-time';
import { defineModule, type SiteServices } from '../../module.js';
import { InvalidInputError, SITE_DATA_MESSAGES, VersionConflictError, json, readBody } from '../../http.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  BLOG_IMAGE_MAX_BYTES,
  BLOG_IMAGE_TYPES,
  BLOG_MESSAGES,
  RESERVED_BLOG_SLUGS,
  blogPlainText,
  isBlogSlug,
  parseBlogContent,
  relatedTileKey,
  relatedTileReference,
  renderBlogRelatedTiles,
  safeBlogUrl,
  sanitizeBlogHtml,
  type BlogEditorState,
  type BlogPostContent,
  type BlogPostRecord,
  type BlogPostSummary,
  type PublicBlogPost,
  type RelatedTileChoice,
  type RelatedTileDestination,
} from './model.js';
import { BlogNotFoundError, createMemoryBlogStore, createPostgresBlogStore, type BlogPostStore } from './store.js';

export * from './model.js';
export { BLOG_HISTORY_LIMIT, blogContentSha256, createMemoryBlogStore, createPostgresBlogStore, type BlogCreateInput, type BlogPostStore, type BlogSaveInput } from './store.js';

export interface BlogConfig {
  /** Where public posts live, for revalidation and card links. Default `/blog`. */
  basePath: string;
  /** Key prefix body images upload under. Default `stories/posts/` (inside the story media route). */
  uploadPrefix: string;
  /** Where the story handlers serve media. Default `/api/story/media`. */
  mediaBasePath: string;
  /** Where a case study is read, for Learn more cards. Default `/work`. */
  caseStudyBasePath: string;
}

export interface BlogReads {
  /** Published posts, newest first. */
  posts(): Promise<PublicBlogPost[]>;
  /** One published post by address, or null. */
  post(slug: string): Promise<PublicBlogPost | null>;
  /** How many posts there are, published or not (for the dashboard). */
  count(): Promise<number>;
}

/** One post to seed, for demos and first runs. */
export interface BlogSeed {
  slug: string;
  createdAt: string;
  /** Versions in order; the last is the newest draft. */
  versions: BlogPostContent[];
  /** Which version readers see (index into `versions`), or null for a draft. */
  published: number | null;
  /** Taken down after it was published: it keeps its history, readers see nothing. */
  hidden?: boolean;
  /** The newest version brings back this earlier one (index), so the published one moved on without it. */
  restoredFrom?: number;
}

const readingTimeOf = (html: string) => readingTime(blogPlainText(html)).text;

const latestOf = (record: BlogPostRecord) => record.documents[0]!;
const publishedOf = (record: BlogPostRecord) => record.documents.find((document) => document.id === record.publishedDocumentId) ?? null;

export function blogSummary(record: BlogPostRecord): BlogPostSummary {
  const latest = latestOf(record);
  return {
    id: record.id,
    slug: record.slug,
    title: latest.content.title,
    description: latest.content.description,
    tags: latest.content.tags,
    imageUrl: latest.content.imageUrl,
    readingTime: readingTimeOf(latest.content.html),
    published: record.publishedDocumentId !== null,
    unpublishedChanges: record.publishedDocumentId !== null && record.publishedDocumentId !== latest.id,
    latestDocumentId: latest.id,
    publishedDocumentId: record.publishedDocumentId,
    createdAt: record.createdAt,
    updatedAt: latest.createdAt,
  };
}

export function blogEditorState(record: BlogPostRecord): BlogEditorState {
  return {
    post: { id: record.id, slug: record.slug, createdAt: record.createdAt },
    content: latestOf(record).content,
    documents: record.documents,
    liveContent: publishedOf(record)?.content ?? null,
    publishedDocumentId: record.publishedDocumentId,
  };
}

/** Published case studies, by address, for the cards. */
async function publishedStories(documents: DocumentStore | undefined): Promise<RelatedTileDestination[]> {
  if (!documents) return [];
  const summaries = await documents.list();
  const live = await Promise.all(summaries.map(async (summary) => {
    const published = await documents.published(summary.slug);
    return published.status === 'published' ? { slug: summary.slug, title: published.document.content.title || summary.slug } : null;
  }));
  return live.filter((entry): entry is RelatedTileDestination => entry !== null);
}

function readsFor(store: BlogPostStore, config: BlogConfig, services: SiteServices): BlogReads & { choices(): Promise<RelatedTileChoice[]> } {
  const livePosts = async () => {
    const records = await store.list();
    return records.flatMap((record) => {
      const published = publishedOf(record);
      return published ? [{ record, content: published.content }] : [];
    });
  };
  const choices = async (): Promise<RelatedTileChoice[]> => {
    const [posts, stories] = await Promise.all([livePosts(), publishedStories(services.documents)]);
    return [
      ...posts.map(({ record, content }) => ({ kind: 'post' as const, id: String(record.id), title: content.title, slug: record.slug })),
      ...stories.flatMap((story) => {
        const reference = relatedTileReference('case-study', story.slug);
        return reference ? [{ ...reference, title: story.title, slug: story.slug }] : [];
      }),
    ].sort((a, b) => a.title.localeCompare(b.title));
  };
  const render = async (entries: { record: BlogPostRecord; content: BlogPostContent }[], withBody: boolean): Promise<PublicBlogPost[]> => {
    const needsCards = withBody && entries.some(({ content }) => content.html.includes('<blog-related-tile '));
    const destinations = new Map<string, RelatedTileDestination>();
    if (needsCards) {
      const redirects = services.documents ? await services.documents.redirects() : [];
      const aliases = new Map(redirects.map(({ from, to }) => [from, to]));
      for (const choice of await choices()) destinations.set(relatedTileKey(choice), choice);
      for (const [from, to] of aliases) {
        const target = destinations.get(`case-study:${to}`);
        if (target) destinations.set(`case-study:${from}`, target);
      }
    }
    return entries.map(({ record, content }) => {
      const html = withBody
        ? renderBlogRelatedTiles(sanitizeBlogHtml(content.html, { retainRelatedTiles: true }), (reference) =>
            reference.kind === 'post' && reference.id === String(record.id) ? undefined : destinations.get(relatedTileKey(reference)),
          { caseStudy: (slug) => `${config.caseStudyBasePath}/${slug}`, post: (slug) => `${config.basePath}/${slug}` })
        : '';
      const image = content.imageUrl ? safeBlogUrl(content.imageUrl, true) : undefined;
      return {
        id: record.id,
        slug: record.slug,
        title: content.title,
        description: content.description,
        tags: content.tags,
        ...(image ? { image } : {}),
        date: record.createdAt,
        readingTime: readingTimeOf(content.html),
        html,
      };
    });
  };
  return {
    posts: async () => render(await livePosts(), false),
    post: async (slug) => {
      if (!isBlogSlug(slug)) return null;
      const record = await store.get(slug);
      const published = record ? publishedOf(record) : null;
      if (!record || !published) return null;
      return (await render([{ record, content: published.content }], true))[0] ?? null;
    },
    count: async () => (await store.list()).length,
    choices,
  };
}

/** Seed posts into an empty store; does nothing once any post exists. */
export async function seedBlog(store: BlogPostStore, seeds: readonly BlogSeed[]): Promise<number> {
  if ((await store.list()).length > 0) return 0;
  for (const seed of seeds) {
    const [first, ...rest] = seed.versions;
    if (!first) continue;
    let record = await store.create({ slug: seed.slug, content: first, sourceKind: 'seed', createdAt: seed.createdAt });
    const ids = [record.documents[0]!.id];
    for (const [offset, content] of rest.entries()) {
      const index = offset + 1;
      // A published version is published before the drafts that follow it.
      if (seed.published === index - 1) {
        record = await store.publish({ slug: seed.slug, documentId: ids[index - 1]!, expectedPublishedDocumentId: record.publishedDocumentId });
      }
      const restore = seed.restoredFrom !== undefined && index === seed.versions.length - 1;
      record = await store.saveDraft({
        slug: seed.slug,
        content,
        parentDocumentId: record.documents[0]!.id,
        sourceKind: restore ? 'restore' : 'seed',
        sourceRef: restore ? ids[seed.restoredFrom!]! : '',
      });
      ids.push(record.documents[0]!.id);
    }
    if (seed.published !== null && seed.published === seed.versions.length - 1) {
      record = await store.publish({ slug: seed.slug, documentId: ids[seed.published]!, expectedPublishedDocumentId: record.publishedDocumentId });
    }
    if (seed.hidden && record.publishedDocumentId === null) {
      record = await store.publish({ slug: seed.slug, documentId: ids.at(-1)!, expectedPublishedDocumentId: null });
    }
    if (seed.hidden) await store.unpublish({ slug: seed.slug });
  }
  return seeds.length;
}

const uploadSizeMessage = () => 'Choose an image no larger than 4 MB.';
const uploadSignatureMessage = (label: string) => `That file doesn’t look like a real ${label}. Export it again.`;

const conflict = (message: string, current: BlogEditorState | null) => new VersionConflictError(current, message);

async function uploadImage(request: Request, media: MediaStore | undefined, policy: StoryMediaPolicy, services: SiteServices) {
  if (!media) throw new InvalidInputError(SITE_DATA_MESSAGES.unavailable);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > policy.maxBytes + 64 * 1024) throw json({ error: uploadSizeMessage(), code: 'TOO_LARGE' }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new InvalidInputError('Choose an image to upload.');
  }
  const slug = form.get('slug');
  const file = form.get('file');
  if (typeof slug !== 'string' || !isBlogSlug(slug)) throw new InvalidInputError(BLOG_MESSAGES.slug);
  if (!(file instanceof Blob)) throw new InvalidInputError('Choose an image to upload.');
  const name = typeof (file as File).name === 'string' ? (file as File).name : '';
  const check = checkUpload({ name, type: file.type, size: file.size }, policy);
  if (!check.ok) throw json({ error: check.error, code: check.code }, check.status);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > policy.maxBytes) throw json({ error: uploadSizeMessage(), code: 'TOO_LARGE' }, 413);
  if (!matchesSignature(check.format.contentType, bytes.subarray(0, MEDIA_SIGNATURE_BYTES))) {
    throw json({ error: uploadSignatureMessage(check.format.label), code: 'UNSUPPORTED' }, 415);
  }
  const key = policy.keyFor({ slug, sha256: await sha256OfBytes(bytes), ext: check.format.ext });
  const visibility = services.mediaVisibility === 'protected' ? 'protected' : 'public';
  await media.put({ key, bytes, contentType: check.format.contentType, visibility, cacheControl: 'private, no-cache' });
  const src = services.mediaSrc ? services.mediaSrc(key) : policy.srcFor(key, visibility);
  return { src, key, size: bytes.byteLength, contentType: check.format.contentType };
}

export const blog = defineModule({
  id: 'blog',
  title: 'Posts',
  migrationRange: [1400, 1499],
  migrations: MIGRATIONS,
  configure: (config: Partial<BlogConfig> | undefined): BlogConfig => ({
    basePath: (config?.basePath ?? '/blog').replace(/\/+$/, ''),
    uploadPrefix: config?.uploadPrefix ?? 'stories/posts/',
    mediaBasePath: config?.mediaBasePath ?? '/api/story/media',
    caseStudyBasePath: (config?.caseStudyBasePath ?? '/work').replace(/\/+$/, ''),
  }),
  createMemoryStore: (): BlogPostStore => createMemoryBlogStore(),
  createPostgresStore: (sql): BlogPostStore => createPostgresBlogStore(sql),
  handlers: ({ store, config, services, revalidate }) => {
    const reads = readsFor(store, config, services);
    const policy = createMediaPolicy({ maxBytes: BLOG_IMAGE_MAX_BYTES, accept: [...BLOG_IMAGE_TYPES], basePath: config.mediaBasePath, prefix: config.uploadPrefix });
    const pathsFor = (...slugs: string[]) => [config.basePath, ...slugs.map((slug) => `${config.basePath}/${slug}`)];
    const slugOf = (value: unknown) => {
      if (!isBlogSlug(value)) throw new InvalidInputError(BLOG_MESSAGES.slug);
      if (RESERVED_BLOG_SLUGS.has(value)) throw new InvalidInputError(BLOG_MESSAGES.reserved);
      return value;
    };
    const contentOf = (value: unknown) => {
      const parsed = parseBlogContent(value);
      if (!parsed.ok) throw new InvalidInputError(parsed.error);
      return parsed.content;
    };
    const documentIdOf = (value: unknown, nullable: boolean) => {
      if (value === null && nullable) return null;
      if (typeof value !== 'string' || !value || value.length > 200) throw new InvalidInputError(SITE_DATA_MESSAGES.unreadable);
      return value;
    };
    const current = async (slug: string) => {
      const record = await store.get(slug);
      return record ? blogEditorState(record) : null;
    };
    /** The store's refusals, as the responses the editor knows. */
    const guarded = async <T>(slug: string, work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        if (error instanceof BlogNotFoundError) throw json({ error: BLOG_MESSAGES.notFound, code: 'NOT_FOUND' }, 404);
        if (error instanceof AddressTakenError) throw json({ error: error.message, code: 'ADDRESS' }, 409);
        if (error instanceof DraftConflictError || error instanceof PublicationConflictError) throw conflict(error.message, await current(slug));
        throw error;
      }
    };
    return [
      {
        method: 'GET',
        path: '',
        handle: async () => json({ posts: (await store.list()).map(blogSummary) }),
      },
      {
        method: 'POST',
        path: '',
        handle: async ({ request }) => {
          const body = await readBody(request);
          const slug = slugOf(body.slug);
          const content = contentOf(body.content);
          const record = await guarded(slug, () => store.create({ slug, content }));
          return json(blogEditorState(record), 201);
        },
      },
      {
        method: 'GET',
        path: 'related',
        handle: async () => json({ choices: await reads.choices() }),
      },
      {
        method: 'POST',
        path: 'upload',
        handle: async ({ request }) => json(await uploadImage(request, services.media, policy, services)),
      },
      {
        method: 'GET',
        path: ':slug',
        handle: async ({ params }) => {
          const state = isBlogSlug(params.slug) ? await current(params.slug) : null;
          return state ? json(state) : json({ error: BLOG_MESSAGES.notFound, code: 'NOT_FOUND' }, 404);
        },
      },
      {
        method: 'PUT',
        path: ':slug',
        handle: async ({ request, params }) => {
          const body = await readBody(request);
          const slug = params.slug;
          const rename = body.slug === undefined || body.slug === slug ? undefined : slugOf(body.slug);
          const content = contentOf(body.content);
          const parentDocumentId = documentIdOf(body.parentDocumentId, true);
          const autosave = body.autosave === true;
          const record = await guarded(slug, () => store.saveDraft({ slug, content, parentDocumentId, rename, autosave }));
          if (record.publishedDocumentId !== null || rename) await revalidate(pathsFor(slug, ...(rename ? [rename] : [])));
          return json(blogEditorState(record));
        },
      },
      {
        method: 'POST',
        path: ':slug/publish',
        handle: async ({ request, params }) => {
          const body = await readBody(request);
          const documentId = documentIdOf(body.documentId, false)!;
          const expectedPublishedDocumentId = documentIdOf(body.expectedPublishedDocumentId ?? null, true);
          const record = await guarded(params.slug, () => store.publish({ slug: params.slug, documentId, expectedPublishedDocumentId }));
          await revalidate(pathsFor(params.slug));
          return json(blogEditorState(record));
        },
      },
      {
        method: 'POST',
        path: ':slug/unpublish',
        handle: async ({ request, params }) => {
          const body = await readBody(request);
          const expected = body.expectedPublishedDocumentId === undefined ? undefined : documentIdOf(body.expectedPublishedDocumentId, true);
          const record = await guarded(params.slug, () => store.unpublish({ slug: params.slug, expectedPublishedDocumentId: expected }));
          await revalidate(pathsFor(params.slug));
          return json(blogEditorState(record));
        },
      },
      {
        method: 'DELETE',
        path: ':slug',
        handle: async ({ params }) => {
          if (!isBlogSlug(params.slug) || !(await store.remove(params.slug))) return json({ error: BLOG_MESSAGES.notFound, code: 'NOT_FOUND' }, 404);
          await revalidate(pathsFor(params.slug));
          return json({ deleted: true });
        },
      },
    ];
  },
  publicReads: (store, config, services): BlogReads => {
    const { posts, post, count } = readsFor(store, config, services);
    return { posts, post, count };
  },
});
