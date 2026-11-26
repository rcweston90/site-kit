/**
 * companies: the profiles and logos case studies share, and which company
 * each story belongs to.
 *
 *   GET    /companies                          CompanyDirectory
 *   POST   /companies                          { name, summary?, website?, logoUrl? } → 201 { company }
 *   GET    /companies/profile/:slug            { company }
 *   PUT    /companies/profile/:slug            { name, summary, website, logoUrl, logoLibrary?, expectedVersion } → { company }
 *   DELETE /companies/profile/:slug            { confirmation, expectedVersion } → { deleted: true } (409 with `stories` while used)
 *   POST   /companies/profile/:slug/logo       multipart `file` → { src }
 *   GET    /companies/profile/:slug/assets     { projects, usedBy }
 *   PUT    /companies/assign                   { storySlug, companySlug | null } → { membership | null }
 *
 * Logos upload into the story media store, under the story prefix, so the
 * story media route serves them like any other upload. Work records (the
 * projects module) join the asset folder and the delete check through
 * `config.workRecords`.
 */

import { isStorySlug } from '@rcweston/story-core';
import { checkUpload, createMediaPolicy, matchesSignature, MEDIA_SIGNATURE_BYTES, sha256OfBytes } from '@rcweston/story-server';
import { parseJson, type SqlClient } from '@rcweston/story-server/postgres';
import { defineModule, type SiteServices } from '../../module.js';
import { InvalidInputError, SITE_DATA_MESSAGES, VersionConflictError, expectedVersionOf, json, readBody } from '../../http.js';
import { createMemoryTable, createPostgresTable, type Versioned, type VersionedTable } from '../../versioned.js';
import { MIGRATIONS } from './migrations.generated.js';
import {
  COMPANY_LOGO_FOLDER,
  COMPANY_LOGO_MAX_BYTES,
  COMPANY_LOGO_TYPES,
  COMPANY_MESSAGES,
  EMPTY_LOGO_LIBRARY,
  companyCreateFields,
  companyFolderProjects,
  companyProfileInput,
  companyUsage,
  normalizeCompanyLogoLibrary,
  resolveCompanyLogo,
  type CompanyDirectory,
  type CompanyFolderStudy,
  type CompanyFolderWork,
  type CompanyIdentity,
  type CompanyLogoLibrary,
  type CompanyMembership,
  type CompanyProfile,
} from './model.js';

export * from './model.js';

/** What's stored for one company. */
export interface CompanyRecord {
  name: string;
  summary: string;
  website: string | null;
  logoUrl: string | null;
  logoLibrary: CompanyLogoLibrary;
}

export type DeleteCompanyResult = 'deleted' | 'missing' | 'stale' | 'used';

export interface CompaniesStore {
  companies: VersionedTable<CompanyRecord>;
  /** Story address → company address. */
  memberships: VersionedTable<string>;
  /** A new company; throws CompanyExistsError when its address or name is taken. */
  create(slug: string, record: CompanyRecord): Promise<Versioned<CompanyRecord>>;
  /** Throws VersionConflictError when stale, CompanyExistsError when another company has the name. */
  update(slug: string, record: CompanyRecord, expectedVersion: number): Promise<Versioned<CompanyRecord>>;
  /** Deletes only an unchanged company nothing belongs to. */
  remove(slug: string, expectedVersion: number): Promise<DeleteCompanyResult>;
  /** Put a story in a company (or out of every company); throws CompanyMissingError for an unknown company. */
  assign(storySlug: string, companySlug: string | null): Promise<Versioned<string> | null>;
}

export class CompanyExistsError extends Error {
  constructor(message: string = COMPANY_MESSAGES.exists) {
    super(message);
    this.name = 'CompanyExistsError';
  }
}

export class CompanyMissingError extends Error {
  constructor() {
    super(COMPANY_MESSAGES.gone);
    this.name = 'CompanyMissingError';
  }
}

export interface CompaniesConfig {
  /** The story media key prefix (logos go under `<prefix>_company-logos/`). Default `stories/`. */
  mediaPrefix: string;
  /** Where the story handlers serve media. Default `/api/story/media`. */
  mediaBasePath: string;
  /** Work records that can name a company by organization (the projects module's records). */
  workRecords: () => Promise<CompanyFolderWork[]>;
  /** The public paths that show company names and logos. Default `/`, `/work`. */
  revalidatePaths: string[];
}

export interface CompaniesReads {
  /** Every saved company and membership; empty before the first save. */
  directory(): Promise<CompanyDirectory>;
  /** A story's company (by membership), or null. */
  companyOf(storySlug: string): Promise<CompanyIdentity | null>;
  /** The logo a story shows: its own choice from the library, else the company default. */
  logoOf(storySlug: string, selectedId?: string): Promise<string | null>;
}

const profileOf = (row: Versioned<CompanyRecord>): CompanyProfile => ({ slug: row.key, ...row.value, version: row.version, updatedAt: row.updatedAt });
const membershipOf = (row: Versioned<string>): CompanyMembership => ({ storySlug: row.key, companySlug: row.value, version: row.version, updatedAt: row.updatedAt });
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const pgCode = (error: unknown) => (error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '');

function createMemoryCompanies(): CompaniesStore {
  const companies = createMemoryTable<CompanyRecord>();
  const memberships = createMemoryTable<string>();
  const nameTaken = async (name: string, except?: string) => (await companies.all()).some((row) => row.key !== except && sameName(row.value.name, name));
  return {
    companies,
    memberships,
    async create(slug, record) {
      if (await nameTaken(record.name)) throw new CompanyExistsError();
      try {
        return await companies.set(slug, record, 0);
      } catch (error) {
        if (error instanceof VersionConflictError) throw new CompanyExistsError();
        throw error;
      }
    },
    async update(slug, record, expectedVersion) {
      if (await nameTaken(record.name, slug)) throw new CompanyExistsError(COMPANY_MESSAGES.nameTaken);
      return companies.set(slug, record, expectedVersion);
    },
    async remove(slug, expectedVersion) {
      const row = await companies.get(slug);
      if (!row) return 'missing';
      if (row.version !== expectedVersion) return 'stale';
      if ((await memberships.all()).some((entry) => entry.value === slug)) return 'used';
      await companies.remove(slug);
      return 'deleted';
    },
    async assign(storySlug, companySlug) {
      if (companySlug === null) {
        await memberships.remove(storySlug);
        return null;
      }
      if (!(await companies.get(companySlug))) throw new CompanyMissingError();
      return memberships.set(storySlug, companySlug);
    },
  };
}

function createPostgresCompanies(sql: Parameters<typeof createPostgresTable>[0]): CompaniesStore {
  const companies = createPostgresTable<CompanyRecord>(sql, {
    table: 'site_companies',
    keyColumn: 'slug',
    columns: ['name', 'summary', 'website', 'logo_url', 'logo_library'],
    toRow: (record) => [record.name, record.summary, record.website, record.logoUrl, JSON.stringify(record.logoLibrary)],
    fromRow: (row) => ({
      name: String(row.name),
      summary: String(row.summary ?? ''),
      website: (row.website as string | null) ?? null,
      logoUrl: (row.logo_url as string | null) ?? null,
      logoLibrary: normalizeCompanyLogoLibrary(parseJson(row.logo_library)) ?? EMPTY_LOGO_LIBRARY,
    }),
  });
  const memberships = createPostgresTable<string>(sql, {
    table: 'site_company_memberships',
    keyColumn: 'story_slug',
    columns: ['company_slug'],
    toRow: (companySlug) => [companySlug],
    fromRow: (row) => String(row.company_slug),
  });
  return {
    companies,
    memberships,
    async create(slug, record) {
      try {
        return await companies.set(slug, record, 0);
      } catch (error) {
        if (error instanceof VersionConflictError || pgCode(error) === '23505') throw new CompanyExistsError();
        throw error;
      }
    },
    async update(slug, record, expectedVersion) {
      try {
        return await companies.set(slug, record, expectedVersion);
      } catch (error) {
        if (pgCode(error) === '23505') throw new CompanyExistsError(COMPANY_MESSAGES.nameTaken);
        throw error;
      }
    },
    remove: (slug, expectedVersion) =>
      sql.transaction(async (tx: SqlClient): Promise<DeleteCompanyResult> => {
        // Locks the row, so an assignment made meanwhile waits for this to finish.
        const { rows } = await tx.query('SELECT version FROM site_companies WHERE slug = $1 FOR UPDATE', [slug]);
        if (!rows[0]) return 'missing';
        if (Number(rows[0].version) !== expectedVersion) return 'stale';
        const used = await tx.query('SELECT 1 FROM site_company_memberships WHERE company_slug = $1 LIMIT 1', [slug]);
        if (used.rows.length) return 'used';
        await tx.query('DELETE FROM site_companies WHERE slug = $1 AND version = $2', [slug, expectedVersion]);
        return 'deleted';
      }, 'READ COMMITTED').catch((error: unknown) => {
        if (pgCode(error) === '23503') return 'used' as const;
        throw error;
      }),
    async assign(storySlug, companySlug) {
      if (companySlug === null) {
        await memberships.remove(storySlug);
        return null;
      }
      try {
        return await memberships.set(storySlug, companySlug);
      } catch (error) {
        if (pgCode(error) === '23503') throw new CompanyMissingError();
        throw error;
      }
    },
  };
}

const COMPANY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const companyParam = (value: string | undefined) => {
  if (!value || !COMPANY_SLUG.test(value) || value.length > 160) throw json({ error: COMPANY_MESSAGES.notFound }, 404);
  return value;
};

async function storySummaries(services: SiteServices) {
  return services.documents ? services.documents.list() : [];
}

export const companies = defineModule({
  id: 'companies',
  title: 'Companies',
  migrationRange: [2400, 2499],
  migrations: MIGRATIONS,
  configure: (config: Partial<CompaniesConfig> | undefined): CompaniesConfig => ({
    mediaPrefix: config?.mediaPrefix ?? 'stories/',
    mediaBasePath: (config?.mediaBasePath ?? '/api/story/media').replace(/\/+$/, ''),
    workRecords: config?.workRecords ?? (async () => []),
    revalidatePaths: config?.revalidatePaths ?? ['/', '/work'],
  }),
  createMemoryStore: (): CompaniesStore => createMemoryCompanies(),
  createPostgresStore: (sql): CompaniesStore => createPostgresCompanies(sql),
  handlers: ({ store, config, services, revalidate }) => {
    const directory = async (): Promise<CompanyDirectory> => {
      const [rows, members] = await Promise.all([store.companies.all(), store.memberships.all()]);
      return {
        schemaAvailable: true,
        companies: rows.map(profileOf).sort((a, b) => a.name.localeCompare(b.name)),
        memberships: members.map(membershipOf),
      };
    };
    const find = async (slug: string) => {
      const row = await store.companies.get(slug);
      if (!row) throw json({ error: COMPANY_MESSAGES.notFound }, 404);
      return row;
    };
    const usage = async (company: CompanyProfile) => {
      const [members, summaries, work] = await Promise.all([store.memberships.all(), storySummaries(services), config.workRecords()]);
      return companyUsage(company, {
        memberships: members.map(membershipOf),
        named: [
          ...summaries.map((summary) => ({ slug: summary.slug, company: summary.company })),
          ...work.map((record) => ({ slug: record.slug, company: record.org })),
        ],
      });
    };
    const policy = createMediaPolicy({ maxBytes: COMPANY_LOGO_MAX_BYTES, accept: [...COMPANY_LOGO_TYPES], basePath: config.mediaBasePath, prefix: config.mediaPrefix });
    const srcOf = (key: string) => services.mediaSrc?.(key) ?? policy.srcFor(key, services.mediaVisibility ?? 'protected');

    return [
      { method: 'GET', path: '', handle: async () => json(await directory()) },
      {
        method: 'POST',
        path: '',
        handle: async ({ request }) => {
          const input = companyCreateFields(await readBody(request));
          if ('error' in input) throw new InvalidInputError(input.error);
          const { slug, ...fields } = input;
          try {
            const saved = await store.create(slug, { ...fields, logoLibrary: EMPTY_LOGO_LIBRARY });
            await revalidate(config.revalidatePaths);
            return json({ company: profileOf(saved) }, 201);
          } catch (error) {
            if (error instanceof CompanyExistsError) return json({ error: error.message, code: 'CONFLICT' }, 409);
            throw error;
          }
        },
      },
      {
        method: 'GET',
        path: 'profile/:slug',
        handle: async ({ params }) => json({ company: profileOf(await find(companyParam(params.slug))) }),
      },
      {
        method: 'PUT',
        path: 'profile/:slug',
        handle: async ({ request, params }) => {
          const slug = companyParam(params.slug);
          const body = await readBody(request);
          const expectedVersion = expectedVersionOf(body);
          if (expectedVersion === undefined) throw new VersionConflictError(null, COMPANY_MESSAGES.stale);
          const current = await find(slug);
          if (current.version !== expectedVersion) throw new VersionConflictError(profileOf(current), COMPANY_MESSAGES.stale);
          const input = companyProfileInput(body, current.value);
          if ('error' in input) throw new InvalidInputError(input.error);
          const library = body.logoLibrary === undefined ? current.value.logoLibrary : normalizeCompanyLogoLibrary(body.logoLibrary);
          if (library === null) throw new InvalidInputError(COMPANY_MESSAGES.library);
          // The address stays the company's; a new name only renames it.
          const { slug: _derived, ...fields } = input;
          try {
            const saved = await store.update(slug, { ...fields, logoLibrary: library }, expectedVersion);
            await revalidate(config.revalidatePaths);
            return json({ company: profileOf(saved) });
          } catch (error) {
            if (error instanceof CompanyExistsError) return json({ error: error.message, code: 'CONFLICT' }, 409);
            if (error instanceof VersionConflictError) {
              const latest = await store.companies.get(slug);
              throw new VersionConflictError(latest ? profileOf(latest) : null, COMPANY_MESSAGES.stale);
            }
            throw error;
          }
        },
      },
      {
        method: 'DELETE',
        path: 'profile/:slug',
        handle: async ({ request, params }) => {
          const slug = companyParam(params.slug);
          const body = await readBody(request);
          const expectedVersion = expectedVersionOf(body);
          if (body.confirmation !== slug || expectedVersion === undefined) throw new InvalidInputError(COMPANY_MESSAGES.confirm);
          const current = await find(slug);
          if (current.version !== expectedVersion) throw new VersionConflictError(profileOf(current), COMPANY_MESSAGES.stale);
          const stories = await usage(profileOf(current));
          if (stories.length) return json({ error: COMPANY_MESSAGES.used, code: 'CONFLICT', stories }, 409);
          const result = await store.remove(slug, expectedVersion);
          if (result === 'missing') return json({ error: COMPANY_MESSAGES.notFound }, 404);
          if (result === 'stale') throw new VersionConflictError(null, COMPANY_MESSAGES.stale);
          if (result === 'used') return json({ error: COMPANY_MESSAGES.assignedMeanwhile, code: 'CONFLICT', stories: await usage(profileOf(current)) }, 409);
          await revalidate(config.revalidatePaths);
          return json({ deleted: true });
        },
      },
      {
        method: 'POST',
        path: 'profile/:slug/logo',
        handle: async ({ request, params }) => {
          const slug = companyParam(params.slug);
          const { media } = services;
          if (!media) throw new InvalidInputError(SITE_DATA_MESSAGES.unavailable);
          const length = Number(request.headers.get('content-length'));
          if (Number.isFinite(length) && length > COMPANY_LOGO_MAX_BYTES + 64 * 1024) return json({ error: COMPANY_MESSAGES.logoSize, code: 'TOO_LARGE' }, 413);
          await find(slug);
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            throw new InvalidInputError('Choose a file to upload.');
          }
          // The route, never a form field, chooses the company.
          const file = form.get('file');
          if (!(file instanceof Blob)) throw new InvalidInputError('Choose a file to upload.');
          const name = typeof (file as File).name === 'string' ? (file as File).name : '';
          const check = checkUpload({ name, type: file.type, size: file.size }, policy);
          if (!check.ok) return json({ error: check.status === 415 ? COMPANY_MESSAGES.logoType : check.status === 413 ? COMPANY_MESSAGES.logoSize : check.error, code: check.code }, check.status);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.byteLength > COMPANY_LOGO_MAX_BYTES) return json({ error: COMPANY_MESSAGES.logoSize, code: 'TOO_LARGE' }, 413);
          if (!matchesSignature(check.format.contentType, bytes.subarray(0, MEDIA_SIGNATURE_BYTES))) {
            return json({ error: 'The file doesn’t match its image type.', code: 'UNSUPPORTED' }, 415);
          }
          const hash = await sha256OfBytes(bytes);
          const key = `${config.mediaPrefix}${COMPANY_LOGO_FOLDER}/${slug}/${hash.slice(0, 16)}.${check.format.ext}`;
          await media.put({ key, bytes, contentType: check.format.contentType, visibility: services.mediaVisibility ?? 'protected', cacheControl: 'public, max-age=31536000, immutable' });
          return json({ src: srcOf(key), key, contentType: check.format.contentType, size: bytes.byteLength });
        },
      },
      {
        method: 'GET',
        path: 'profile/:slug/assets',
        handle: async ({ params }) => {
          const company = profileOf(await find(companyParam(params.slug)));
          const [members, summaries, redirects, work] = await Promise.all([
            store.memberships.all(),
            storySummaries(services),
            services.documents ? services.documents.redirects() : [],
            config.workRecords(),
          ]);
          const studies: CompanyFolderStudy[] = summaries.map((summary) => ({
            slug: summary.slug,
            title: summary.title,
            published: summary.publishedDocumentId !== null,
            draft: summary.latestDocumentId !== summary.publishedDocumentId,
          }));
          const memberships = members.map(membershipOf);
          return json({
            projects: companyFolderProjects(company, { memberships, redirects, studies, work }),
            usedBy: companyUsage(company, {
              memberships,
              named: [
                ...summaries.map((summary) => ({ slug: summary.slug, company: summary.company })),
                ...work.map((record) => ({ slug: record.slug, company: record.org })),
              ],
            }),
          });
        },
      },
      {
        method: 'PUT',
        path: 'assign',
        handle: async ({ request }) => {
          const body = await readBody(request);
          if (typeof body.storySlug !== 'string' || !isStorySlug(body.storySlug)) throw new InvalidInputError('Choose a story to assign.');
          if (body.companySlug !== null && (typeof body.companySlug !== 'string' || !COMPANY_SLUG.test(body.companySlug))) throw new InvalidInputError('Choose a company, or none.');
          try {
            const saved = await store.assign(body.storySlug, body.companySlug as string | null);
            await revalidate([...config.revalidatePaths, `/stories/${body.storySlug}`]);
            return json({ membership: saved ? membershipOf(saved) : null });
          } catch (error) {
            if (error instanceof CompanyMissingError) return json({ error: error.message, code: 'CONFLICT' }, 409);
            throw error;
          }
        },
      },
    ];
  },
  publicReads: (store): CompaniesReads => {
    const companyOf = async (storySlug: string): Promise<CompanyIdentity | null> => {
      const membership = await store.memberships.get(storySlug);
      if (!membership) return null;
      const row = await store.companies.get(membership.value);
      return row ? { slug: row.key, name: row.value.name, logoUrl: row.value.logoUrl, logoLibrary: row.value.logoLibrary } : null;
    };
    return {
      directory: async () => {
        const [rows, members] = await Promise.all([store.companies.all(), store.memberships.all()]);
        return { schemaAvailable: true, companies: rows.map(profileOf), memberships: members.map(membershipOf) };
      },
      companyOf,
      logoOf: async (storySlug, selectedId) => resolveCompanyLogo(await companyOf(storySlug), selectedId),
    };
  },
});
