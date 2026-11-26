/**
 * Projects: the Work inventory's details beside each story (the card's
 * label, organization, role, dates, tags, images and links), and the
 * prototypes that are Work cards with no story behind them.
 *
 * Browser-safe: types, input checks and the bulk-edit contract.
 */

/** The card label that keeps a project in Work → Prototypes. */
export const PROTOTYPE_TYPE = 'Prototype';
export const MAX_PROJECT_IMAGES = 5;
export const MAX_BULK_PROJECTS = 100;
export const KEEP_PROJECT_SNAPSHOTS = 200;

/** Everything a project's details hold. */
export interface ProjectFields {
  title: string;
  description: string;
  tags: string[];
  image: string | null;
  images: string[];
  featured: boolean;
  /** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. */
  date: string;
  role: string | null;
  org: string | null;
  type: string | null;
  duration: string | null;
  url: string | null;
}

export interface ProjectRecord extends ProjectFields {
  slug: string;
  /** 0 before the first save (details shown from the story, or a site feature's defaults). */
  version: number;
  updatedAt: string | null;
}

/** A page the site keeps in code that still has a card on Work. */
export interface WorkFeature {
  slug: string;
  href: string;
  /** The card's title and description until someone edits them. */
  title: string;
  description?: string;
}

export const PROJECT_MESSAGES = {
  notFound: 'Project not found',
  required: 'A work item needs a title, an address (slug) and a date.',
  prototypesOnly: 'This form creates prototypes only. Use New case study to create a story.',
  exists: 'A project with this slug already exists',
  storyAddress: 'That address already belongs to a case study. Choose a different title or address.',
  slugChange: 'Change the address from the story’s Settings.',
  hasStory: 'Review the record in Work admin before confirming deletion.',
  snapshot: 'Could not create a recovery snapshot. No projects were changed.',
} as const;

export const EMPTY_PROJECT: ProjectFields = {
  title: '', description: '', tags: [], image: null, images: [], featured: false, date: '', role: null, org: null, type: null, duration: null, url: null,
};

export function isPrototypeProject(project: Pick<ProjectFields, 'type'>): boolean {
  return project.type === PROTOTYPE_TYPE;
}

export function projectYear(date: string): string {
  return date.match(/^(\d{4})/)?.[1] ?? '—';
}

const DATE = /^\d{4}(?:-\d\d(?:-\d\d)?)?$/;
const PROJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isProjectSlug = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && PROJECT_SLUG.test(value);

/** An HTTPS or site-relative image address, or null. */
export function projectImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const src = value.trim();
  if (!src || src.length > 2048 || /[\u0000- \u007f\\]/.test(src)) return null;
  if (/^\/(?!\/)/.test(src)) return src;
  try {
    const url = new URL(src);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? src : null;
  } catch {
    return null;
  }
}

function projectLink(value: string): string | null {
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

export function normalizedProjectTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const tags = value.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
  if (tags.length !== value.length || tags.some((tag) => tag.length > 80)) return null;
  return [...new Map(tags.map((tag) => [tag.toLocaleLowerCase(), tag])).values()];
}

export type ProjectInput = { error: string } | { fields: ProjectFields };

/**
 * A save's fields over what's there now: a field the body leaves out keeps
 * its value, so a form that edits part of a project (a site feature's card)
 * sends only that part.
 */
export function projectInput(value: unknown, current: ProjectFields): ProjectInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'The project couldn’t be read. Reload the page and try again.' };
  const body = value as Record<string, unknown>;
  const next: ProjectFields = { ...current };
  const text = (key: 'title' | 'description' | 'date', max: number) => {
    if (body[key] === undefined) return true;
    if (typeof body[key] !== 'string') return false;
    const trimmed = (body[key] as string).trim();
    if (trimmed.length > max) return false;
    next[key] = trimmed;
    return true;
  };
  const optional = (key: 'role' | 'org' | 'type' | 'duration', max = 160) => {
    if (body[key] === undefined) return true;
    if (body[key] === null) { next[key] = null; return true; }
    if (typeof body[key] !== 'string') return false;
    const trimmed = (body[key] as string).trim();
    if (trimmed.length > max) return false;
    next[key] = trimmed || null;
    return true;
  };
  if (!text('title', 200)) return { error: 'Use a title up to 200 characters.' };
  if (!text('description', 2000)) return { error: 'Use a description up to 2,000 characters.' };
  if (!text('date', 10) || (body.date !== undefined && next.date && !DATE.test(next.date))) return { error: 'Use a date like 2024-05-01.' };
  for (const key of ['role', 'org', 'type', 'duration'] as const) {
    if (!optional(key)) return { error: `Use ${key === 'org' ? 'an organization' : `a ${key}`} up to 160 characters.` };
  }
  if (body.tags !== undefined) {
    const tags = normalizedProjectTags(body.tags);
    if (!tags) return { error: 'Use up to 20 tags of 80 characters or fewer.' };
    next.tags = tags;
  }
  if (body.image !== undefined) {
    if (body.image === null || body.image === '') next.image = null;
    else {
      const src = projectImageSrc(body.image);
      if (!src) return { error: 'Use an HTTPS or site-relative image address.' };
      next.image = src;
    }
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length > MAX_PROJECT_IMAGES) return { error: `Add up to ${MAX_PROJECT_IMAGES} more images.` };
    const images = body.images.map(projectImageSrc);
    if (images.some((src) => src === null)) return { error: 'Use an HTTPS or site-relative address for each image.' };
    next.images = [...new Set(images as string[])];
  }
  if (body.url !== undefined) {
    if (body.url === null || body.url === '') next.url = null;
    else {
      const url = typeof body.url === 'string' ? projectLink(body.url.trim()) : null;
      if (!url || url.length > 2048) return { error: 'Use an HTTP or HTTPS link, or leave it empty.' };
      next.url = url;
    }
  }
  if (body.featured !== undefined) {
    if (typeof body.featured !== 'boolean') return { error: 'Say whether the project is featured.' };
    next.featured = body.featured;
  }
  return { fields: next };
}

// ─── Bulk edits ─────────────────────────────────────────────────────────────

export type BulkProjectChange =
  | { field: 'featured'; operation: 'set'; value: boolean }
  | { field: 'type' | 'org' | 'role' | 'duration'; operation: 'set'; value: string | null }
  | { field: 'tags'; operation: 'add' | 'remove'; value: string[] };

export interface BulkProjectRequest {
  slugs: string[];
  change: BulkProjectChange;
}

export interface BulkProjectFailure {
  slug: string;
  error: string;
}

export interface BulkProjectResponse {
  batchId: string;
  requested: number;
  updated: ProjectRecord[];
  failed: BulkProjectFailure[];
}

type ParseResult = { ok: true; request: BulkProjectRequest } | { ok: false; error: string };
const textFields = new Set(['type', 'org', 'role', 'duration']);

export function removesBulkMetadata(change: BulkProjectChange): boolean {
  return change.operation === 'remove' || ('value' in change && change.value === null);
}

/**
 * Validate and normalize the only shape the batch route takes. Identity,
 * copy, media, links, order and timestamps never enter it, so a client
 * can't widen the update by adding keys.
 */
export function parseBulkProjectRequest(value: unknown): ParseResult {
  if (!value || typeof value !== 'object') return { ok: false, error: 'A batch request is required' };
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.slugs)) return { ok: false, error: 'slugs must be an array' };
  const slugs = body.slugs.filter((slug): slug is string => typeof slug === 'string').map((slug) => slug.trim());
  if (slugs.length !== body.slugs.length || slugs.length === 0 || slugs.length > MAX_BULK_PROJECTS || slugs.some((slug) => !slug || slug.length > 160)) {
    return { ok: false, error: `Choose between 1 and ${MAX_BULK_PROJECTS} valid projects` };
  }
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length !== slugs.length) return { ok: false, error: 'Each project may appear only once' };
  if (!body.change || typeof body.change !== 'object') return { ok: false, error: 'A supported change is required' };
  const change = body.change as Record<string, unknown>;
  if (change.field === 'featured' && change.operation === 'set') {
    if (typeof change.value !== 'boolean') return { ok: false, error: 'featured must be true or false' };
    return { ok: true, request: { slugs: uniqueSlugs, change: { field: 'featured', operation: 'set', value: change.value } } };
  }
  if (typeof change.field === 'string' && textFields.has(change.field) && change.operation === 'set') {
    if (change.value !== null && typeof change.value !== 'string') return { ok: false, error: `${change.field} must be text or null` };
    const normalized = typeof change.value === 'string' ? change.value.trim() : null;
    if (normalized && normalized.length > 160) return { ok: false, error: `${change.field} must be 160 characters or fewer` };
    return { ok: true, request: { slugs: uniqueSlugs, change: { field: change.field as 'type' | 'org' | 'role' | 'duration', operation: 'set', value: normalized || null } } };
  }
  if (change.field === 'tags' && (change.operation === 'add' || change.operation === 'remove')) {
    const tags = normalizedProjectTags(change.value);
    if (!tags || tags.length === 0) return { ok: false, error: 'Provide between 1 and 20 valid tags' };
    return { ok: true, request: { slugs: uniqueSlugs, change: { field: 'tags', operation: change.operation, value: tags } } };
  }
  return { ok: false, error: 'That field or operation is not supported for batch editing' };
}

/** A validated change as the fields it sets on one project. */
export function patchForBulkProjectChange(project: Pick<ProjectFields, 'tags'>, change: BulkProjectChange): Partial<ProjectFields> {
  if (change.field !== 'tags') return { [change.field]: change.value };
  const requested = new Set(change.value.map((tag) => tag.toLocaleLowerCase()));
  if (change.operation === 'remove') return { tags: project.tags.filter((tag) => !requested.has(tag.toLocaleLowerCase())) };
  const existing = new Set(project.tags.map((tag) => tag.toLocaleLowerCase()));
  return { tags: [...project.tags, ...change.value.filter((tag) => !existing.has(tag.toLocaleLowerCase()))] };
}

export function describeBulkProjectChange(change: BulkProjectChange): string {
  if (change.field === 'tags') return `${change.operation === 'add' ? 'Add' : 'Remove'} ${change.value.join(', ')}`;
  if (change.field === 'featured') return change.value ? 'Mark featured' : 'Remove featured status';
  return `${change.field.charAt(0).toUpperCase()}${change.field.slice(1)}: ${change.value || 'Clear'}`;
}

/** A free address for a copy: `slug-copy`, then `slug-copy-2`… */
export function projectCopySlug(slug: string, taken: ReadonlySet<string>): string {
  const base = `${slug.slice(0, 70)}-copy`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
