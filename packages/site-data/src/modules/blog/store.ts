/**
 * Where posts live: an in-memory store and a Postgres one with the same
 * behaviour. Each save adds a version; a save built on anything but the
 * newest version is refused (DraftConflictError), and publishing checks the
 * published version is still the one the editor loaded
 * (PublicationConflictError). The handlers turn both into a 409.
 *
 * Autosaves are the one exception to adding a version. The editor saves a
 * second after typing stops, so a version per autosave would bury the ones
 * that matter. An autosave instead rewrites the newest version in place when
 * that version was itself an autosave and readers aren't seeing it; its id
 * stays the same, so the editor's parent still matches. An explicit save, a
 * publish, or an autosave over a published or hand-saved version adds one.
 */

import { AddressTakenError, DraftConflictError, PublicationConflictError, sha256Hex, stableJson } from '@rcweston/story-core';
import { parseJson, toIso, type SqlClient, type SqlRunner } from '@rcweston/story-server/postgres';
import { BLOG_MESSAGES, type BlogPostContent, type BlogPostDocument, type BlogPostRecord, type BlogSourceKind } from './model.js';

export interface BlogSaveInput {
  slug: string;
  content: BlogPostContent;
  /** The version the editor saved over; null only for a post with none. */
  parentDocumentId: string | null;
  /** A new address, saved in the same step. */
  rename?: string;
  sourceKind?: BlogSourceKind;
  sourceRef?: string;
  /** Saved by the editor on its own, a second after typing stopped. */
  autosave?: boolean;
}

/** The sourceRef an autosaved version carries, so the next autosave can rewrite it. */
export const BLOG_AUTOSAVE_REF = 'autosave';

export interface BlogCreateInput {
  slug: string;
  content: BlogPostContent;
  sourceKind?: BlogSourceKind;
  /** For seeds and imports: when the post is dated. */
  createdAt?: string;
}

export interface BlogPostStore {
  /** Every post, newest first, each with its newest and its published version only. */
  list(): Promise<BlogPostRecord[]>;
  get(slug: string): Promise<BlogPostRecord | null>;
  /** Throws AddressTakenError when the address is used. */
  create(input: BlogCreateInput): Promise<BlogPostRecord>;
  saveDraft(input: BlogSaveInput): Promise<BlogPostRecord>;
  publish(input: { slug: string; documentId: string; expectedPublishedDocumentId: string | null }): Promise<BlogPostRecord>;
  unpublish(input: { slug: string; expectedPublishedDocumentId?: string | null }): Promise<BlogPostRecord>;
  /** False when there was nothing there. */
  remove(slug: string): Promise<boolean>;
}

/** How many versions a full read returns: enough to find where a draft and the published version split. */
export const BLOG_HISTORY_LIMIT = 100;

export const blogContentSha256 = (content: BlogPostContent) => sha256Hex(stableJson(content));
const documentIdFor = (postId: number, version: number) => `post:${postId}:v${version}`;
const versionOf = (documentId: string) => Number(/:v(\d+)$/.exec(documentId)?.[1] ?? 0);

class BlogNotFoundError extends Error {
  constructor() {
    super(BLOG_MESSAGES.notFound);
    this.name = 'BlogNotFoundError';
  }
}
export { BlogNotFoundError };

/** An autosave may rewrite the newest version only if it was an autosave too and isn't live. */
const rewritable = (latest: { id: string; sourceKind: string; sourceRef: string }, publishedDocumentId: string | null) =>
  latest.sourceKind === 'editor' && latest.sourceRef === BLOG_AUTOSAVE_REF && latest.id !== publishedDocumentId;

const sortNewest = (records: BlogPostRecord[]) =>
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

// ─── Memory ─────────────────────────────────────────────────────────────────

interface MemoryPost {
  id: number;
  slug: string;
  createdAt: string;
  documents: BlogPostDocument[];
  publishedDocumentId: string | null;
  publishedAt: string | null;
}

export function createMemoryBlogStore(): BlogPostStore {
  const posts = new Map<number, MemoryPost>();
  let nextId = 1;
  // One write at a time, like a row lock.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => T | Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  const bySlug = (slug: string) => [...posts.values()].find((post) => post.slug === slug) ?? null;
  const copy = (post: MemoryPost, full = true): BlogPostRecord => {
    const documents = full
      ? post.documents.slice(0, BLOG_HISTORY_LIMIT)
      : post.documents.filter((document, index) => index === 0 || document.id === post.publishedDocumentId);
    return structuredClone({ ...post, documents });
  };
  const add = (post: MemoryPost, content: BlogPostContent, parentDocumentId: string | null, sourceKind: BlogSourceKind, sourceRef = '', at = new Date().toISOString()) => {
    const version = (post.documents[0] ? versionOf(post.documents[0].id) : 0) + 1;
    post.documents.unshift({
      id: documentIdFor(post.id, version),
      parentDocumentId,
      sourceKind,
      sourceRef,
      contentSha256: blogContentSha256(content),
      content: structuredClone(content),
      createdAt: at,
    });
  };
  const need = (slug: string) => {
    const post = bySlug(slug);
    if (!post) throw new BlogNotFoundError();
    return post;
  };

  return {
    list: async () => sortNewest([...posts.values()].map((post) => copy(post, false))),
    get: async (slug) => {
      const post = bySlug(slug);
      return post ? copy(post) : null;
    },
    create: (input) =>
      exclusive(() => {
        if (bySlug(input.slug)) throw new AddressTakenError(BLOG_MESSAGES.taken);
        const createdAt = input.createdAt ?? new Date().toISOString();
        const post: MemoryPost = { id: nextId++, slug: input.slug, createdAt, documents: [], publishedDocumentId: null, publishedAt: null };
        add(post, input.content, null, input.sourceKind ?? 'editor', '', createdAt);
        posts.set(post.id, post);
        return copy(post);
      }),
    saveDraft: (input) =>
      exclusive(() => {
        const post = need(input.slug);
        const latest = post.documents[0] ?? null;
        if (input.parentDocumentId !== (latest?.id ?? null)) throw new DraftConflictError(BLOG_MESSAGES.draftConflict);
        if (input.rename && input.rename !== post.slug) {
          if (bySlug(input.rename)) throw new AddressTakenError(BLOG_MESSAGES.taken);
          post.slug = input.rename;
        }
        const kind = input.sourceKind ?? 'editor';
        const sha = blogContentSha256(input.content);
        const unchanged = latest && latest.contentSha256 === sha && kind === 'editor';
        if (unchanged) return copy(post);
        if (input.autosave && latest && rewritable(latest, post.publishedDocumentId)) {
          Object.assign(latest, { contentSha256: sha, content: structuredClone(input.content), createdAt: new Date().toISOString() });
        } else {
          add(post, input.content, latest?.id ?? null, kind, input.autosave ? BLOG_AUTOSAVE_REF : input.sourceRef ?? '');
        }
        return copy(post);
      }),
    publish: (input) =>
      exclusive(() => {
        const post = need(input.slug);
        if (post.publishedDocumentId !== input.expectedPublishedDocumentId) throw new PublicationConflictError(BLOG_MESSAGES.publishConflict);
        if (!post.documents.some((document) => document.id === input.documentId)) throw new PublicationConflictError(BLOG_MESSAGES.missingVersion);
        post.publishedDocumentId = input.documentId;
        post.publishedAt = new Date().toISOString();
        return copy(post);
      }),
    unpublish: (input) =>
      exclusive(() => {
        const post = need(input.slug);
        if (input.expectedPublishedDocumentId !== undefined && post.publishedDocumentId !== input.expectedPublishedDocumentId) {
          throw new PublicationConflictError(BLOG_MESSAGES.publishConflict);
        }
        post.publishedDocumentId = null;
        post.publishedAt = null;
        return copy(post);
      }),
    remove: (slug) =>
      exclusive(() => {
        const post = bySlug(slug);
        if (!post) return false;
        posts.delete(post.id);
        return true;
      }),
  };
}

// ─── Postgres ───────────────────────────────────────────────────────────────

const POST_COLUMNS = 'id, slug, latest_document_id, published_document_id, published_at, created_at';
const VERSION_COLUMNS = 'id, parent_document_id, source_kind, source_ref, content_sha256, content, created_at';

const documentOf = (row: Record<string, unknown>): BlogPostDocument => ({
  id: String(row.id),
  parentDocumentId: row.parent_document_id === null || row.parent_document_id === undefined ? null : String(row.parent_document_id),
  sourceKind: row.source_kind as BlogSourceKind,
  sourceRef: String(row.source_ref ?? ''),
  contentSha256: String(row.content_sha256),
  content: parseJson<BlogPostContent>(row.content),
  createdAt: toIso(row.created_at),
});

export function createPostgresBlogStore(sql: SqlRunner): BlogPostStore {
  const recordOf = (row: Record<string, unknown>, documents: BlogPostDocument[]): BlogPostRecord => ({
    id: Number(row.id),
    slug: String(row.slug),
    createdAt: toIso(row.created_at),
    documents,
    publishedDocumentId: row.published_document_id ? String(row.published_document_id) : null,
    publishedAt: row.published_at ? toIso(row.published_at) : null,
  });
  const history = async (client: SqlClient, postId: number) =>
    (await client.query(`SELECT ${VERSION_COLUMNS} FROM site_blog_post_versions WHERE post_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${BLOG_HISTORY_LIMIT}`, [postId])).rows.map(documentOf);
  const full = async (client: SqlClient, row: Record<string, unknown> | undefined) => {
    if (!row) return null;
    const documents = await history(client, Number(row.id));
    // The published version stays in reach even past the limit.
    const published = row.published_document_id ? String(row.published_document_id) : null;
    if (published && !documents.some((document) => document.id === published)) {
      const extra = await client.query(`SELECT ${VERSION_COLUMNS} FROM site_blog_post_versions WHERE id = $1`, [published]);
      documents.push(...extra.rows.map(documentOf));
    }
    return recordOf(row, documents);
  };
  const locked = async (tx: SqlClient, slug: string) => {
    const { rows } = await tx.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts WHERE slug = $1 FOR UPDATE`, [slug]);
    if (!rows[0]) throw new BlogNotFoundError();
    return rows[0] as Record<string, unknown>;
  };
  const insertVersion = async (tx: SqlClient, postId: number, previous: string | null, content: BlogPostContent, sourceKind: BlogSourceKind, sourceRef: string, at?: string) => {
    const id = documentIdFor(postId, (previous ? versionOf(previous) : 0) + 1);
    await tx.query(
      `INSERT INTO site_blog_post_versions (id, post_id, parent_document_id, source_kind, source_ref, content_sha256, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, clock_timestamp()))`,
      [id, postId, previous, sourceKind, sourceRef, blogContentSha256(content), JSON.stringify(content), at ?? null],
    );
    await tx.query('UPDATE site_blog_posts SET latest_document_id = $2, updated_at = NOW() WHERE id = $1', [postId, id]);
    return id;
  };
  const taken = (error: unknown) => (error as { code?: string } | null)?.code === '23505';

  return {
    list: () =>
      sql.read(async (client) => {
        const { rows } = await client.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts ORDER BY created_at DESC, id DESC`);
        const ids = rows.flatMap((row) => [row.latest_document_id, row.published_document_id]).filter(Boolean);
        const versions = ids.length
          ? (await client.query(`SELECT ${VERSION_COLUMNS} FROM site_blog_post_versions WHERE id = ANY($1::text[])`, [ids])).rows.map(documentOf)
          : [];
        const byId = new Map(versions.map((document) => [document.id, document]));
        return rows.map((row) => {
          const documents = [row.latest_document_id, row.published_document_id]
            .filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index)
            .map((id) => byId.get(String(id)))
            .filter((document): document is BlogPostDocument => Boolean(document));
          return recordOf(row, documents);
        });
      }),
    get: (slug) =>
      sql.read(async (client) => full(client, (await client.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts WHERE slug = $1`, [slug])).rows[0])),
    create: (input) =>
      sql.transaction(async (tx) => {
        let row: Record<string, unknown>;
        try {
          row = (await tx.query(
            `INSERT INTO site_blog_posts (slug, created_at) VALUES ($1, COALESCE($2::timestamptz, NOW())) RETURNING ${POST_COLUMNS}`,
            [input.slug, input.createdAt ?? null],
          )).rows[0];
        } catch (error) {
          if (taken(error)) throw new AddressTakenError(BLOG_MESSAGES.taken);
          throw error;
        }
        await insertVersion(tx, Number(row.id), null, input.content, input.sourceKind ?? 'editor', '', input.createdAt);
        return (await full(tx, (await tx.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts WHERE id = $1`, [row.id])).rows[0]))!;
      }, 'READ COMMITTED'),
    saveDraft: (input) =>
      sql.transaction(async (tx) => {
        const row = await locked(tx, input.slug);
        const latest = row.latest_document_id ? String(row.latest_document_id) : null;
        if (input.parentDocumentId !== latest) throw new DraftConflictError(BLOG_MESSAGES.draftConflict);
        const postId = Number(row.id);
        if (input.rename && input.rename !== input.slug) {
          try {
            await tx.query('UPDATE site_blog_posts SET slug = $2, updated_at = NOW() WHERE id = $1', [postId, input.rename]);
          } catch (error) {
            if (taken(error)) throw new AddressTakenError(BLOG_MESSAGES.taken);
            throw error;
          }
        }
        const kind = input.sourceKind ?? 'editor';
        const sha = blogContentSha256(input.content);
        const current = latest
          ? (await tx.query('SELECT id, source_kind, source_ref, content_sha256 FROM site_blog_post_versions WHERE id = $1', [latest])).rows[0]
          : undefined;
        const unchanged = kind === 'editor' && current?.content_sha256 === sha;
        const published = row.published_document_id ? String(row.published_document_id) : null;
        const rewrite = !unchanged && input.autosave && current
          && rewritable({ id: String(current.id), sourceKind: String(current.source_kind), sourceRef: String(current.source_ref) }, published);
        if (rewrite) {
          await tx.query(
            'UPDATE site_blog_post_versions SET content = $2::jsonb, content_sha256 = $3, created_at = clock_timestamp() WHERE id = $1',
            [latest, JSON.stringify(input.content), sha],
          );
          await tx.query('UPDATE site_blog_posts SET updated_at = NOW() WHERE id = $1', [postId]);
        } else if (!unchanged) {
          await insertVersion(tx, postId, latest, input.content, kind, input.autosave ? BLOG_AUTOSAVE_REF : input.sourceRef ?? '');
        }
        return (await full(tx, (await tx.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts WHERE id = $1`, [postId])).rows[0]))!;
      }, 'READ COMMITTED'),
    publish: (input) =>
      sql.transaction(async (tx) => {
        const row = await locked(tx, input.slug);
        const current = row.published_document_id ? String(row.published_document_id) : null;
        if (current !== input.expectedPublishedDocumentId) throw new PublicationConflictError(BLOG_MESSAGES.publishConflict);
        const exists = await tx.query('SELECT 1 FROM site_blog_post_versions WHERE id = $1 AND post_id = $2', [input.documentId, row.id]);
        if (!exists.rows[0]) throw new PublicationConflictError(BLOG_MESSAGES.missingVersion);
        await tx.query('UPDATE site_blog_posts SET published_document_id = $2, published_at = NOW(), updated_at = NOW() WHERE id = $1', [row.id, input.documentId]);
        return (await full(tx, (await tx.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts WHERE id = $1`, [row.id])).rows[0]))!;
      }, 'READ COMMITTED'),
    unpublish: (input) =>
      sql.transaction(async (tx) => {
        const row = await locked(tx, input.slug);
        const current = row.published_document_id ? String(row.published_document_id) : null;
        if (input.expectedPublishedDocumentId !== undefined && current !== input.expectedPublishedDocumentId) {
          throw new PublicationConflictError(BLOG_MESSAGES.publishConflict);
        }
        await tx.query('UPDATE site_blog_posts SET published_document_id = NULL, published_at = NULL, updated_at = NOW() WHERE id = $1', [row.id]);
        return (await full(tx, (await tx.query(`SELECT ${POST_COLUMNS} FROM site_blog_posts WHERE id = $1`, [row.id])).rows[0]))!;
      }, 'READ COMMITTED'),
    remove: (slug) =>
      sql.transaction(async (tx) => {
        const { rows } = await tx.query('DELETE FROM site_blog_posts WHERE slug = $1 RETURNING id', [slug]);
        return rows.length > 0;
      }, 'READ COMMITTED'),
  };
}
