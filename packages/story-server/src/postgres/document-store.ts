/**
 * The document store on Postgres. Writes run in serializable transactions
 * behind a per-story advisory lock and re-read everything they decide on, so
 * a delayed request fails as a conflict instead of overwriting newer work.
 *
 * Reads never create tables. Run the migrations first (`story-migrate`, or
 * `migrate({ client })`).
 */

import {
  DraftConflictError,
  PublicationConflictError,
  STORY_SCHEMA_VERSION,
  StoryMovedError,
  contentSha256,
  isLatestDocumentParent,
  storyDocumentId,
  type DocumentStore,
  type PublishedLookup,
  type RenameResult,
  type SlugRedirect,
  type Story,
  type StoryDocument,
  type StoryDocumentStatus,
  type StoryPublication,
  type StorySummary,
} from '@rcweston/story-core';
import { withCover } from '../cover.js';
import { InvalidStoryError, StoryNotFoundError, contractRenameError, isConcurrencyFailure } from '../errors.js';
import { RENAME_STALE_MESSAGE, StoryRenameError, planStoryRename, validateStory, validateStoryDraft } from '../validation.js';
import { createSqlRunner, parseJson, toIso, type SqlClient, type SqlPool } from './client.js';

interface DocumentRow {
  id: string;
  slug: string;
  version: number | string;
  schema_version: number | string;
  workflow_status: StoryDocumentStatus;
  content: Story | string;
  content_sha256: string;
  source_kind: string;
  source_ref: string;
  source_commit: string;
  parent_document_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  published: boolean;
}

interface PublicationRow {
  slug: string;
  document_id: string;
  published_at: Date | string;
  published_by: string | null;
}

function mapDocument(row: DocumentRow): StoryDocument {
  return {
    id: row.id,
    slug: row.slug,
    version: Number(row.version),
    schemaVersion: Number(row.schema_version),
    workflowStatus: row.workflow_status,
    content: parseJson<Story>(row.content),
    contentSha256: row.content_sha256,
    sourceKind: row.source_kind,
    sourceRef: row.source_ref,
    sourceCommit: row.source_commit,
    parentDocumentId: row.parent_document_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    published: Boolean(row.published),
  };
}

function mapPublication(row: PublicationRow): StoryPublication {
  return { slug: row.slug, documentId: row.document_id, publishedAt: toIso(row.published_at), publishedBy: row.published_by };
}

const WITH_PUBLISHED = `
  SELECT d.*, (p.document_id IS NOT NULL) AS published
  FROM story_documents d
  LEFT JOIN story_publications p ON p.slug = d.slug AND p.document_id = d.id
`;

/** Every write on a story takes this lock first, so writes to one story take turns. */
const lock = (tx: SqlClient, slug: string) =>
  tx.query(`SELECT pg_advisory_xact_lock(hashtext('story-server'), hashtext($1))`, [slug]);

async function movedTo(tx: SqlClient, slug: string): Promise<string | null> {
  const { rows } = await tx.query('SELECT to_slug FROM story_slug_redirects WHERE from_slug = $1 LIMIT 1', [slug]);
  return rows[0]?.to_slug ?? null;
}

async function insertDocument(tx: SqlClient, document: {
  id: string;
  slug: string;
  version: number;
  content: Story;
  contentSha256: string;
  sourceKind: string;
  sourceRef: string;
  sourceCommit: string;
  parentDocumentId: string | null;
}): Promise<StoryDocument> {
  const { rows } = await tx.query(
    `INSERT INTO story_documents (
       id, slug, version, schema_version, workflow_status, content, content_sha256,
       source_kind, source_ref, source_commit, parent_document_id
     ) VALUES ($1, $2, $3, $4, 'draft', $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING *, false AS published`,
    [
      document.id, document.slug, document.version, STORY_SCHEMA_VERSION, JSON.stringify(document.content),
      document.contentSha256, document.sourceKind, document.sourceRef, document.sourceCommit, document.parentDocumentId,
    ],
  );
  if (!rows[0]) throw new Error('The document insert returned no row.');
  return mapDocument(rows[0]);
}

export interface PostgresDocumentStoreOptions {
  /** `pg.Pool`, `pg.Client`, PGlite, or anything with `query(text, params)`. */
  pool: SqlPool;
}

export function createPostgresDocumentStore({ pool }: PostgresDocumentStoreOptions): DocumentStore {
  const sql = createSqlRunner(pool);

  return {
    list() {
      return sql.read(async (client) => {
        const { rows } = await client.query(`
          WITH latest AS (
            SELECT DISTINCT ON (slug) id, slug, version, content->>'title' AS title, content->>'company' AS company, content->>'projectYear' AS project_year,
              jsonb_build_object('hero', content->'hero', 'workPreview', content->'workPreview', 'heroGraphic', content->'heroGraphic', 'heroLayout', content->'heroLayout', 'chapters', content->'chapters') AS card, updated_at
            FROM story_documents
            ORDER BY slug, version DESC
          )
          SELECT l.*, p.document_id AS published_document_id
          FROM latest l
          LEFT JOIN story_publications p ON p.slug = l.slug
          WHERE NOT EXISTS (SELECT 1 FROM story_slug_redirects r WHERE r.from_slug = l.slug)
          ORDER BY LOWER(COALESCE(l.title, '')), l.slug
        `);
        return rows.map((row): StorySummary => ({
          slug: row.slug,
          title: row.title ?? '',
          company: row.company ?? '',
          ...(row.project_year ? { projectYear: row.project_year } : {}),
          ...withCover(typeof row.card === 'string' ? JSON.parse(row.card) : row.card),
          latestVersion: Number(row.version),
          latestDocumentId: row.id,
          publishedDocumentId: row.published_document_id ?? null,
          updatedAt: toIso(row.updated_at),
        }));
      });
    },

    versions(slug) {
      return sql.read(async (client) => {
        const { rows } = await client.query(`${WITH_PUBLISHED} WHERE d.slug = $1 ORDER BY d.version DESC`, [slug]);
        return rows.map(mapDocument);
      });
    },

    latest(slug) {
      return sql.read(async (client) => {
        const { rows } = await client.query(`${WITH_PUBLISHED} WHERE d.slug = $1 ORDER BY d.version DESC LIMIT 1`, [slug]);
        return rows[0] ? mapDocument(rows[0]) : null;
      });
    },

    version(slug, version) {
      if (!Number.isInteger(version) || version < 1) return Promise.resolve(null);
      return sql.read(async (client) => {
        const { rows } = await client.query(`${WITH_PUBLISHED} WHERE d.slug = $1 AND d.version = $2 LIMIT 1`, [slug, version]);
        return rows[0] ? mapDocument(rows[0]) : null;
      });
    },

    async saveDraft({ slug, content, parentDocumentId, source }) {
      const problems = validateStoryDraft(content, slug);
      if (problems.length > 0) throw new InvalidStoryError(problems);
      try {
        return await sql.transaction(async (tx) => {
          await lock(tx, slug);
          // An editor still open at a retired address would otherwise keep
          // saving versions nobody can reach.
          const moved = await movedTo(tx, slug);
          if (moved) throw new StoryMovedError(moved);
          const latest = await tx.query('SELECT id, version FROM story_documents WHERE slug = $1 ORDER BY version DESC LIMIT 1', [slug]);
          const latestRow = latest.rows[0] as { id: string; version: number | string } | undefined;
          if (!isLatestDocumentParent(parentDocumentId, latestRow?.id ?? null)) throw new DraftConflictError();
          const version = Number(latestRow?.version ?? 0) + 1;
          return insertDocument(tx, {
            id: storyDocumentId(slug, version),
            slug,
            version,
            content,
            contentSha256: contentSha256(content),
            sourceKind: source.kind,
            sourceRef: source.ref,
            sourceCommit: source.commit ?? '',
            parentDocumentId,
          });
        });
      } catch (error) {
        if (isConcurrencyFailure(error)) throw new DraftConflictError();
        throw error;
      }
    },

    async publish({ slug, documentId, expectedPublishedDocumentId, publishedBy = null }) {
      try {
        return await sql.transaction(async (tx) => {
          await lock(tx, slug);
          const moved = await movedTo(tx, slug);
          if (moved) throw new StoryMovedError(moved);
          const currentResult = await tx.query(
            'SELECT slug, document_id, published_at, published_by FROM story_publications WHERE slug = $1 FOR UPDATE',
            [slug],
          );
          const current = (currentResult.rows[0] as PublicationRow | undefined) ?? null;
          if (expectedPublishedDocumentId !== undefined && (current?.document_id ?? null) !== expectedPublishedDocumentId) {
            throw new PublicationConflictError();
          }
          const candidateResult = await tx.query(`${WITH_PUBLISHED} WHERE d.slug = $1 AND d.id = $2 LIMIT 1`, [slug, documentId]);
          const candidateRow = candidateResult.rows[0] as DocumentRow | undefined;
          if (!candidateRow) throw new StoryNotFoundError('That version isn’t saved under this story.');
          const candidate = mapDocument(candidateRow);
          const problems = validateStory(candidate.content, slug);
          if (problems.length > 0) throw new InvalidStoryError(problems, 'This version can’t be published until its problems are fixed.');
          if (contentSha256(candidate.content) !== candidate.contentSha256) {
            throw new Error('The stored document checksum does not match its content.');
          }
          let publication = current;
          if (current?.document_id !== documentId) {
            const published = await tx.query(
              `INSERT INTO story_publications (slug, document_id, published_at, published_by)
               VALUES ($1, $2, NOW(), $3)
               ON CONFLICT (slug) DO UPDATE SET
                 document_id = EXCLUDED.document_id,
                 published_at = EXCLUDED.published_at,
                 published_by = EXCLUDED.published_by
               RETURNING slug, document_id, published_at, published_by`,
              [slug, documentId, publishedBy],
            );
            publication = published.rows[0] ?? null;
          }
          if (!publication) throw new Error('The publication update returned no row.');
          return { document: { ...candidate, published: true }, publication: mapPublication(publication) };
        });
      } catch (error) {
        if (isConcurrencyFailure(error)) {
          throw new PublicationConflictError('What’s published changed at the same moment. Reload before publishing again.');
        }
        throw error;
      }
    },

    async unpublish(slug) {
      await sql.transaction(async (tx) => {
        await lock(tx, slug);
        await tx.query('DELETE FROM story_publications WHERE slug = $1', [slug]);
      }, 'READ COMMITTED');
    },

    async delete(slug) {
      await sql.transaction(async (tx) => {
        await lock(tx, slug);
        await tx.query('DELETE FROM story_publications WHERE slug = $1', [slug]);
        await tx.query('DELETE FROM story_slug_redirects WHERE to_slug = $1', [slug]);
        // One statement, so the versions' parent links are checked once, after every row is gone.
        await tx.query('DELETE FROM story_documents WHERE slug = $1', [slug]);
      }, 'READ COMMITTED');
    },

    async published(slug): Promise<PublishedLookup> {
      try {
        return await sql.read(async (client) => {
          const { rows } = await client.query(
            `SELECT d.*, true AS published
             FROM story_publications p
             JOIN story_documents d ON d.slug = p.slug AND d.id = p.document_id
             WHERE p.slug = $1
             LIMIT 1`,
            [slug],
          );
          return rows[0] ? { status: 'published', document: mapDocument(rows[0]) } : { status: 'none' };
        });
      } catch (error) {
        return { status: 'failed', error };
      }
    },

    publications() {
      return sql.read(async (client) => {
        const { rows } = await client.query('SELECT slug, document_id, published_at, published_by FROM story_publications ORDER BY slug');
        return rows.map(mapPublication);
      });
    },

    async rename(input): Promise<RenameResult> {
      const { from, to } = input;
      try {
        return await sql.transaction(async (tx) => {
          // Both addresses, in a fixed order: two renames that cross can't
          // deadlock, and a save to either address waits for this one.
          for (const slug of [from, to].sort()) await lock(tx, slug);

          const latestResult = await tx.query(`${WITH_PUBLISHED} WHERE d.slug = $1 ORDER BY d.version DESC LIMIT 1`, [from]);
          const publishedResult = await tx.query(
            `SELECT d.*, true AS published
             FROM story_publications p
             JOIN story_documents d ON d.slug = p.slug AND d.id = p.document_id
             WHERE p.slug = $1
             FOR UPDATE OF p`,
            [from],
          );
          const factsResult = await tx.query(
            `SELECT
               (SELECT COALESCE(MAX(version), 0) FROM story_documents WHERE slug = $2) AS target_max_version,
               EXISTS (SELECT 1 FROM story_publications WHERE slug = $2) AS target_publication,
               (SELECT to_slug FROM story_slug_redirects WHERE from_slug = $2) AS target_redirects_to,
               (SELECT to_slug FROM story_slug_redirects WHERE from_slug = $1) AS source_redirects_to`,
            [from, to],
          );
          const facts = factsResult.rows[0];
          const latest = latestResult.rows[0] ? mapDocument(latestResult.rows[0]) : null;
          const published = publishedResult.rows[0] ? mapDocument(publishedResult.rows[0]) : null;

          const plan = planStoryRename({
            from,
            to,
            expectedLatestDocumentId: input.expectedLatestDocumentId,
            latestDocument: latest ? { id: latest.id, content: latest.content } : null,
            publishedDocument: published ? { id: published.id, content: published.content } : null,
            authoredStory: null,
            fromRedirectsTo: facts?.source_redirects_to ?? null,
            fromHasHostRecord: false,
            target: {
              maxVersion: Number(facts?.target_max_version ?? 0),
              hasHostRecord: false,
              hasPublication: Boolean(facts?.target_publication),
              hasAuthoredStory: false,
              redirectsTo: facts?.target_redirects_to ?? null,
            },
          }, { checksum: contentSha256, sourceCommit: input.source.commit ?? '' });

          for (const planned of plan.documents) {
            const problems = validateStoryDraft(planned.content, to);
            if (problems.length > 0) throw new InvalidStoryError(problems, 'The story can’t move until its problems are fixed.');
          }
          const inserted: StoryDocument[] = [];
          for (const planned of plan.documents) {
            inserted.push(await insertDocument(tx, {
              ...planned,
              slug: to,
              sourceKind: input.source.kind,
              sourceRef: input.source.ref || from,
              sourceCommit: input.source.commit ?? '',
            }));
          }

          if (plan.publishDocumentId) {
            await tx.query(
              `INSERT INTO story_publications (slug, document_id, published_at, published_by)
               VALUES ($1, $2, NOW(), $3)
               ON CONFLICT (slug) DO UPDATE SET
                 document_id = EXCLUDED.document_id,
                 published_at = EXCLUDED.published_at,
                 published_by = EXCLUDED.published_by`,
              [to, plan.publishDocumentId, input.publishedBy ?? null],
            );
          }
          // Only the pointer goes; the versions it pointed at stay for safekeeping.
          if (plan.removeOldPublication) await tx.query('DELETE FROM story_publications WHERE slug = $1', [from]);
          if (plan.redirects.retire) await tx.query('DELETE FROM story_slug_redirects WHERE from_slug = $1', [plan.redirects.retire]);
          await tx.query('UPDATE story_slug_redirects SET to_slug = $1 WHERE to_slug = $2', [to, plan.redirects.repointFrom]);
          await tx.query(
            `INSERT INTO story_slug_redirects (from_slug, to_slug) VALUES ($1, $2)
             ON CONFLICT (from_slug) DO UPDATE SET to_slug = EXCLUDED.to_slug, created_at = NOW()`,
            [plan.redirects.add.from, plan.redirects.add.to],
          );

          return {
            from,
            to,
            documents: inserted.map((document) => ({ ...document, published: document.id === plan.publishDocumentId })).reverse(),
            publishedDocumentId: plan.publishDocumentId,
          };
        });
      } catch (error) {
        // A serialization failure or a racing insert of the same version both
        // mean someone else changed this story first.
        if (isConcurrencyFailure(error)) throw contractRenameError(new StoryRenameError('stale', RENAME_STALE_MESSAGE));
        throw contractRenameError(error);
      }
    },

    redirects() {
      return sql.read(async (client) => {
        const { rows } = await client.query('SELECT from_slug, to_slug FROM story_slug_redirects ORDER BY created_at DESC, from_slug');
        return rows.map((row): SlugRedirect => ({ from: row.from_slug, to: row.to_slug }));
      });
    },

    aliases(slug) {
      return sql.read(async (client) => {
        const { rows } = await client.query(
          'SELECT from_slug, to_slug FROM story_slug_redirects WHERE from_slug = $1 OR to_slug = $1 ORDER BY created_at DESC, from_slug',
          [slug],
        );
        return {
          movedTo: rows.find((row) => row.from_slug === slug)?.to_slug ?? null,
          formerSlugs: rows.filter((row) => row.to_slug === slug).map((row) => row.from_slug as string),
        };
      });
    },
  };
}
