/**
 * projects: the Work inventory's details beside each story, and prototypes.
 *
 *   GET    /projects                 { projects: ProjectRecord[], features: (WorkFeature & { updatedAt })[] }
 *   POST   /projects                 prototype fields → 201 { project }
 *   GET    /projects/:slug           { project } (a story's or a site feature's defaults until saved)
 *   PUT    /projects/:slug           fields, expectedVersion? → { project }
 *   DELETE /projects/:slug           { expectedVersion? } → { deleted: true } (prototypes and unlinked records)
 *   POST   /projects/:slug/duplicate → 201 { project } (a copy with no launch link)
 *   PATCH  /projects/bulk            BulkProjectRequest → BulkProjectResponse (207 when some failed)
 *
 * Every write first keeps a snapshot of all records (the newest 200 stay),
 * so a bad bulk edit can be put back by hand.
 */

import type { StorySummary } from '@rcweston/story-core';
import { parseJson, toIso, type SqlClient } from '@rcweston/story-server/postgres';
import { defineModule, type SiteServices } from '../../module.js';
import { InvalidInputError, VersionConflictError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  EMPTY_PROJECT,
  KEEP_PROJECT_SNAPSHOTS,
  PROJECT_MESSAGES,
  PROTOTYPE_TYPE,
  isPrototypeProject,
  isProjectSlug,
  parseBulkProjectRequest,
  patchForBulkProjectChange,
  projectCopySlug,
  projectInput,
  type BulkProjectFailure,
  type ProjectFields,
  type ProjectRecord,
  type WorkFeature,
} from './model.js';

export * from './model.js';

export interface ProjectSnapshot {
  id: string;
  takenAt: string;
  reason: string;
  rowCount: number;
}

export interface ProjectsStore {
  records: VersionedTable<ProjectFields>;
  /** Keep every record as it is now; answers the snapshot's id. */
  snapshot(reason: string): Promise<string>;
  /** Newest first, without their rows. */
  snapshots(): Promise<ProjectSnapshot[]>;
}

export interface ProjectsConfig {
  /** Pages kept in code that have a card on Work (their details edit only the card). */
  features: WorkFeature[];
  /** Public paths a save refreshes, beside the story's own page. Default `/`, `/work`. */
  revalidatePaths: string[];
}

export interface ProjectsReads {
  /** Every saved record. */
  records(): Promise<ProjectRecord[]>;
  /** A saved record, or null. */
  get(slug: string): Promise<ProjectRecord | null>;
  /** Saved prototypes. */
  prototypes(): Promise<ProjectRecord[]>;
  /** Each site feature's card, saved or as configured. */
  features(): Promise<Array<ProjectRecord & { href: string }>>;
}

const recordOf = (row: Versioned<ProjectFields>): ProjectRecord => ({ slug: row.key, ...row.value, version: row.version, updatedAt: row.updatedAt });

function createMemoryProjects(): ProjectsStore {
  const records = createMemoryTable<ProjectFields>();
  const kept: Array<ProjectSnapshot & { rows: ProjectRecord[] }> = [];
  let next = 1;
  return {
    records,
    async snapshot(reason) {
      const rows = (await records.all()).map(recordOf);
      const id = String(next++);
      kept.unshift({ id, takenAt: new Date().toISOString(), reason, rowCount: rows.length, rows });
      kept.splice(KEEP_PROJECT_SNAPSHOTS);
      return id;
    },
    async snapshots() {
      return kept.map(({ rows: _rows, ...snapshot }) => snapshot);
    },
  };
}

const COLUMNS = ['title', 'description', 'tags', 'image', 'images', 'featured', 'date', 'role', 'org', 'type', 'duration', 'url'];

function createPostgresProjects(sql: Parameters<typeof createPostgresTable>[0]): ProjectsStore {
  const records = createPostgresTable<ProjectFields>(sql, {
    table: 'site_projects',
    keyColumn: 'slug',
    columns: COLUMNS,
    toRow: (fields) => [fields.title, fields.description, JSON.stringify(fields.tags), fields.image, JSON.stringify(fields.images), fields.featured, fields.date, fields.role, fields.org, fields.type, fields.duration, fields.url],
    fromRow: (row) => ({
      title: String(row.title),
      description: String(row.description ?? ''),
      tags: parseJson<string[]>(row.tags) ?? [],
      image: (row.image as string | null) ?? null,
      images: parseJson<string[]>(row.images) ?? [],
      featured: Boolean(row.featured),
      date: String(row.date ?? ''),
      role: (row.role as string | null) ?? null,
      org: (row.org as string | null) ?? null,
      type: (row.type as string | null) ?? null,
      duration: (row.duration as string | null) ?? null,
      url: (row.url as string | null) ?? null,
    }),
  });
  return {
    records,
    snapshot: async (reason) => {
      // Read first: the runner holds one connection, so a read inside the transaction would wait for it.
      const rows = (await records.all()).map(recordOf);
      return sql.transaction(async (tx: SqlClient) => {
        const { rows: inserted } = await tx.query(
          'INSERT INTO site_projects_snapshots (reason, row_count, rows) VALUES ($1, $2, $3) RETURNING id',
          [reason, rows.length, JSON.stringify(rows)],
        );
        await tx.query(
          'DELETE FROM site_projects_snapshots WHERE id <= (SELECT id FROM site_projects_snapshots ORDER BY id DESC OFFSET $1 LIMIT 1)',
          [KEEP_PROJECT_SNAPSHOTS],
        );
        return String(inserted[0].id);
      }, 'READ COMMITTED');
    },
    snapshots: () =>
      sql.read(async (client) => {
        const { rows } = await client.query('SELECT id, taken_at, reason, row_count FROM site_projects_snapshots ORDER BY id DESC');
        return rows.map((row) => ({ id: String(row.id), takenAt: toIso(row.taken_at), reason: String(row.reason), rowCount: Number(row.row_count) }));
      }),
  };
}

async function stories(services: SiteServices): Promise<StorySummary[]> {
  return services.documents ? services.documents.list() : [];
}

/** A story's details before anything is saved for it: what the story itself says. */
function fromStory(summary: StorySummary): ProjectFields {
  return { ...EMPTY_PROJECT, title: summary.title || summary.slug, org: summary.company.trim() || null, date: summary.projectYear ? `${summary.projectYear}-01-01` : summary.updatedAt.slice(0, 10) };
}

function fromFeature(feature: WorkFeature): ProjectFields {
  return { ...EMPTY_PROJECT, title: feature.title, description: feature.description ?? '', url: feature.href };
}

const slugParam = (value: string | undefined) => {
  if (!isProjectSlug(value)) throw json({ error: PROJECT_MESSAGES.notFound }, 404);
  return value;
};

export const projects = defineModule({
  id: 'projects',
  title: 'Work inventory',
  migrationRange: [2500, 2599],
  migrations: MIGRATIONS,
  configure: (config: Partial<ProjectsConfig> | undefined): ProjectsConfig => ({
    features: config?.features ?? [],
    revalidatePaths: config?.revalidatePaths ?? ['/', '/work'],
  }),
  createMemoryStore: (): ProjectsStore => createMemoryProjects(),
  createPostgresStore: (sql): ProjectsStore => createPostgresProjects(sql),
  handlers: ({ store, config, services, revalidate }) => {
    const featureOf = (slug: string) => config.features.find((feature) => feature.slug === slug);
    const paths = (slug: string) => [...config.revalidatePaths, `/stories/${slug}`];
    /** The record, or what it starts from: a story's own details, or a feature's card. */
    const current = async (slug: string): Promise<{ record: ProjectRecord; story: StorySummary | undefined } | null> => {
      const [row, summaries] = await Promise.all([store.records.get(slug), stories(services)]);
      const story = summaries.find((summary) => summary.slug === slug);
      if (row) return { record: recordOf(row), story };
      const feature = featureOf(slug);
      const fields = story ? fromStory(story) : feature ? fromFeature(feature) : null;
      return fields ? { record: { slug, ...fields, version: 0, updatedAt: null }, story } : null;
    };
    const snapshot = async (reason: string) => {
      try {
        return await store.snapshot(reason);
      } catch {
        throw json({ error: PROJECT_MESSAGES.snapshot }, 503);
      }
    };

    return [
      {
        method: 'GET',
        path: '',
        handle: async () => {
          const records = (await store.records.all()).map(recordOf);
          const saved = new Map(records.map((record) => [record.slug, record]));
          // Each site feature's card, as saved or as configured.
          const features = config.features.map((feature) => ({ ...feature, title: saved.get(feature.slug)?.title || feature.title, updatedAt: saved.get(feature.slug)?.updatedAt ?? null }));
          return json({ projects: records, features });
        },
      },
      {
        method: 'POST',
        path: '',
        handle: async ({ request }) => {
          const body = await readBody(request);
          if (!isProjectSlug(body.slug) || typeof body.title !== 'string' || !body.title.trim() || typeof body.date !== 'string' || !body.date.trim()) {
            throw new InvalidInputError(PROJECT_MESSAGES.required);
          }
          // New case studies start from New case study; this makes prototypes only.
          if (body.type !== PROTOTYPE_TYPE) throw new InvalidInputError(PROJECT_MESSAGES.prototypesOnly);
          const slug = body.slug;
          const input = projectInput(body, EMPTY_PROJECT);
          if ('error' in input) throw new InvalidInputError(input.error);
          if (await store.records.get(slug)) return json({ error: PROJECT_MESSAGES.exists, code: 'CONFLICT' }, 409);
          const [summaries, redirects] = await Promise.all([stories(services), services.documents ? services.documents.redirects() : []]);
          if (summaries.some((summary) => summary.slug === slug) || redirects.some((redirect) => redirect.from === slug) || featureOf(slug)) {
            return json({ error: PROJECT_MESSAGES.storyAddress, code: 'CONFLICT' }, 409);
          }
          await snapshot('pre-create');
          try {
            const saved = await store.records.set(slug, input.fields, 0);
            await revalidate(paths(slug));
            return json({ project: recordOf(saved) }, 201);
          } catch (error) {
            if (error instanceof VersionConflictError) return json({ error: PROJECT_MESSAGES.exists, code: 'CONFLICT' }, 409);
            throw error;
          }
        },
      },
      {
        method: 'GET',
        path: ':slug',
        handle: async ({ params }) => {
          const found = await current(slugParam(params.slug));
          return found ? json({ project: found.record }) : json({ error: PROJECT_MESSAGES.notFound }, 404);
        },
      },
      {
        method: 'PUT',
        path: ':slug',
        handle: async ({ request, params }) => {
          const slug = slugParam(params.slug);
          const body = await readBody(request);
          // Refused before anything is kept: a rejected rename changes nothing.
          if (body.slug !== undefined && body.slug !== slug) return json({ error: PROJECT_MESSAGES.slugChange, code: 'CONFLICT' }, 409);
          const found = await current(slug);
          if (!found) return json({ error: PROJECT_MESSAGES.notFound }, 404);
          const expectedVersion = expectedVersionOf(body);
          if (expectedVersion !== undefined && expectedVersion !== found.record.version) throw new VersionConflictError(found.record);
          const input = projectInput(body, found.record);
          if ('error' in input) throw new InvalidInputError(input.error);
          if (!input.fields.title) throw new InvalidInputError(PROJECT_MESSAGES.required);
          await snapshot('pre-update');
          try {
            const saved = await store.records.set(slug, input.fields, expectedVersion ?? found.record.version);
            await revalidate(paths(slug));
            return json({ project: recordOf(saved) });
          } catch (error) {
            if (error instanceof VersionConflictError) {
              const latest = await current(slug);
              throw new VersionConflictError(latest?.record ?? null);
            }
            throw error;
          }
        },
      },
      {
        method: 'DELETE',
        path: ':slug',
        handle: async ({ request, params }) => {
          const slug = slugParam(params.slug);
          const body = await readBody(request);
          const row = await store.records.get(slug);
          if (!row) return json({ error: PROJECT_MESSAGES.notFound }, 404);
          // A story's details go with the story; Work deletes the story itself.
          if ((await stories(services)).some((summary) => summary.slug === slug)) return json({ error: PROJECT_MESSAGES.hasStory, code: 'CONFLICT' }, 409);
          const expectedVersion = expectedVersionOf(body);
          if (expectedVersion !== undefined && expectedVersion !== row.version) throw new VersionConflictError(recordOf(row));
          await snapshot('pre-delete');
          await store.records.remove(slug);
          await revalidate(paths(slug));
          return json({ deleted: true });
        },
      },
      {
        method: 'POST',
        path: ':slug/duplicate',
        handle: async ({ params }) => {
          const slug = slugParam(params.slug);
          const row = await store.records.get(slug);
          if (!row) return json({ error: PROJECT_MESSAGES.notFound }, 404);
          const [all, summaries] = await Promise.all([store.records.all(), stories(services)]);
          const taken = new Set([...all.map((entry) => entry.key), ...summaries.map((summary) => summary.slug), ...config.features.map((feature) => feature.slug)]);
          const copy = projectCopySlug(slug, taken);
          await snapshot('pre-duplicate');
          const saved = await store.records.set(copy, { ...row.value, title: `${row.value.title} (copy)`, featured: false, url: null }, 0);
          return json({ project: recordOf(saved) }, 201);
        },
      },
      {
        method: 'PATCH',
        path: 'bulk',
        handle: async ({ request }) => {
          const parsed = parseBulkProjectRequest(await readBody(request));
          if (!parsed.ok) throw new InvalidInputError(parsed.error);
          const batchId = await snapshot('pre-bulk-update');
          const updated: ProjectRecord[] = [];
          const failed: BulkProjectFailure[] = [];
          for (const slug of parsed.request.slugs) {
            try {
              const row = await store.records.get(slug);
              if (!row) {
                failed.push({ slug, error: 'Project no longer exists' });
                continue;
              }
              const saved = await store.records.set(slug, { ...row.value, ...patchForBulkProjectChange(row.value, parsed.request.change) }, row.version);
              updated.push(recordOf(saved));
            } catch (error) {
              failed.push({ slug, error: error instanceof VersionConflictError ? 'Changed while this ran; try it again.' : 'Update failed' });
            }
          }
          if (updated.length) await revalidate(config.revalidatePaths);
          return json({ batchId, requested: parsed.request.slugs.length, updated, failed }, failed.length ? 207 : 200);
        },
      },
    ];
  },
  publicReads: (store, config): ProjectsReads => {
    const records = async () => (await store.records.all()).map(recordOf);
    return {
      records,
      get: async (slug) => {
        const row = await store.records.get(slug);
        return row ? recordOf(row) : null;
      },
      prototypes: async () => (await records()).filter(isPrototypeProject),
      features: async () => {
        const saved = new Map((await records()).map((record) => [record.slug, record]));
        return config.features.map((feature) => ({
          ...(saved.get(feature.slug) ?? { slug: feature.slug, ...fromFeature(feature), version: 0, updatedAt: null }),
          href: feature.href,
        }));
      },
    };
  },
});
