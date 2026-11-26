/**
 * Companies: the profiles and logos case studies share. A story's company is
 * kept beside it (a membership), never inside its immutable versions, so
 * renaming a company or changing its logo needs no new story version.
 *
 * Browser-safe: types, input checks and the helpers the admin and the public
 * pages share.
 */

import { COMPANY_LOGO_ID_PATTERN } from '@rcweston/story-core';

export { COMPANY_LOGO_ID_PATTERN };

export interface CompanyLogo {
  id: string;
  name: string;
  url: string;
}

export interface CompanyLogoLibrary {
  defaultId: string | null;
  logos: CompanyLogo[];
}

export const MAX_COMPANY_LOGOS = 12;
export const EMPTY_LOGO_LIBRARY: CompanyLogoLibrary = { logos: [], defaultId: null };

export interface CompanyProfile {
  slug: string;
  name: string;
  summary: string;
  website: string | null;
  logoUrl: string | null;
  logoLibrary: CompanyLogoLibrary;
  /** 0 for a profile nothing saved yet (derived from a story's company). */
  version: number;
  updatedAt: string | null;
}

/** What a public page shows of a company: its name and logo. */
export type CompanyIdentity = Pick<CompanyProfile, 'slug' | 'name' | 'logoUrl' | 'logoLibrary'>;

/** Which company a story (or a prototype) belongs to. */
export interface CompanyMembership {
  storySlug: string;
  companySlug: string;
  version: number;
  updatedAt: string | null;
}

export interface CompanyDirectory {
  schemaAvailable: boolean;
  companies: CompanyProfile[];
  memberships: CompanyMembership[];
}

/** The fields a save sends. */
export interface CompanyFields {
  slug: string;
  name: string;
  summary: string;
  website: string | null;
  logoUrl: string | null;
}

export const COMPANY_MESSAGES = {
  stale: 'This company changed in another tab. Reload before making changes. Your current edits are still here.',
  notFound: 'Company not found.',
  exists: 'A company with this name or address already exists. Choose the existing company or use a distinct name.',
  nameTaken: 'A different company already uses that name.',
  confirm: 'Confirm the company address before deleting.',
  used: 'This company is still used by case studies or Work records. Review those links before trying to remove it.',
  assignedMeanwhile: 'A case study was assigned to this company. Refresh and review its usage before deleting.',
  gone: 'That company no longer exists. Reload the list and choose another.',
  library: 'Check each logo’s name, image address, and default selection.',
  logoType: 'Use a PNG, JPEG, WebP or GIF logo.',
  logoSize: 'Logo files must be smaller than 4 MB.',
  logoFull: `A company keeps up to ${MAX_COMPANY_LOGOS} logos. Remove one first.`,
} as const;

/** Called only as the author adds a new logo, not while rendering. */
export function createCompanyLogo(url: string, name: string): CompanyLogo {
  return { id: crypto.randomUUID(), name: name.slice(0, 80) || 'Logo', url };
}

/** An HTTPS or site-relative image address, or null. */
export function normalizeCompanyLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url || url.length > 2048 || /[\u0000- \u007f\\]/.test(url)) return null;
  try {
    if (/^\/(?!\/)/.test(url)) return url;
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? url : null;
  } catch {
    return null;
  }
}

export function normalizeCompanyLogoLibrary(value: unknown): CompanyLogoLibrary | null {
  if (!value || typeof value !== 'object') return null;
  const { logos, defaultId } = value as Record<string, unknown>;
  if (!Array.isArray(logos) || logos.length > MAX_COMPANY_LOGOS || (defaultId !== null && typeof defaultId !== 'string')) return null;
  const ids = new Set<string>();
  const normalized: CompanyLogo[] = [];
  for (const candidate of logos) {
    if (!candidate || typeof candidate !== 'object') return null;
    const { id, name, url } = candidate as Record<string, unknown>;
    const safe = normalizeCompanyLogoUrl(url);
    if (typeof id !== 'string' || !COMPANY_LOGO_ID_PATTERN.test(id) || ids.has(id) || typeof name !== 'string' || !name.trim() || name.trim().length > 80 || !safe) return null;
    ids.add(id);
    normalized.push({ id, name: name.trim(), url: safe });
  }
  if (defaultId !== null && !ids.has(defaultId)) return null;
  return { logos: normalized, defaultId };
}

/** An absent or removed choice falls back without editing stored story versions. */
export function resolveCompanyLogo(company?: CompanyIdentity | null, selectedId?: string): string | null {
  if (!company) return null;
  const catalog = company.logoLibrary;
  const selected = catalog?.logos.find((logo) => logo.id === selectedId)
    ?? catalog?.logos.find((logo) => logo.id === catalog.defaultId);
  return normalizeCompanyLogoUrl(selected?.url) ?? normalizeCompanyLogoUrl(company.logoUrl);
}

export function companySlug(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Before a company is saved, a story's own `company` text names it. */
export function derivedCompanyProfiles(stories: readonly { company: string }[]): CompanyProfile[] {
  const names = new Map<string, string>();
  for (const story of stories) {
    const name = story.company.trim() || 'Unassigned';
    names.set(companySlug(name) || 'unassigned', name);
  }
  return [...names.entries()]
    .map(([slug, name]) => ({ slug, name, summary: '', website: null, logoUrl: null, logoLibrary: EMPTY_LOGO_LIBRARY, version: 0, updatedAt: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type CompanyInput = { error: string } | CompanyFields;

/** Checks a profile as sent. A website or logo address saved before stays as it was. */
export function companyProfileInput(value: unknown, previous?: { website: string | null; logoUrl: string | null }): CompanyInput {
  if (!value || typeof value !== 'object') return { error: 'Enter a company name.' };
  const body = value as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = companySlug(name);
  if (!slug || name.length > 120 || /[\r\n]/.test(name)) return { error: 'Use a company name with letters or numbers, up to 120 characters.' };
  const summary = body.summary === undefined ? '' : typeof body.summary === 'string' ? body.summary.trim() : null;
  if (summary === null || summary.length > 2400) return { error: 'Use a company summary up to 2,400 characters.' };
  const website = body.website == null || body.website === '' ? null : typeof body.website === 'string' ? body.website.trim() : undefined;
  if (website === undefined) return { error: 'Use an HTTP or HTTPS website address.' };
  if (website && website !== previous?.website) {
    try {
      const parsed = new URL(website);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || website.length > 2048) throw new Error('website');
    } catch {
      return { error: 'Use an HTTP or HTTPS website address.' };
    }
  }
  const logoUrl = body.logoUrl === previous?.logoUrl ? previous?.logoUrl ?? null : normalizeCompanyLogoUrl(body.logoUrl);
  if (body.logoUrl && !logoUrl) return { error: 'Use an HTTPS or site-relative logo address.' };
  return { slug, name, summary, website: website || null, logoUrl };
}

/** A new company: as above, and not one of the addresses the company tools use. */
export function companyCreateFields(value: unknown): CompanyInput {
  const result = companyProfileInput(value);
  if (!('error' in result) && ['new', 'assign', 'profile'].includes(result.slug)) {
    return { error: 'That name is reserved for company tools. Choose a more specific company name.' };
  }
  return result;
}

// ─── Logo uploads ───────────────────────────────────────────────────────────

/** Uploaded logos sit in the story media store under `<prefix>_company-logos/<company>/`. */
export const COMPANY_LOGO_FOLDER = '_company-logos';
export const COMPANY_LOGO_MAX_BYTES = 4 * 1024 * 1024;
export const COMPANY_LOGO_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';
export const COMPANY_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const LOGO_EXTENSIONS: Record<string, (typeof COMPANY_LOGO_TYPES)[number]> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** Before an upload is sent: a PNG, JPEG, WebP or GIF under 4 MB, by its name and declared type. */
export function checkCompanyLogoFile(file: { name: string; type: string; size: number }): { ok: true; contentType: string } | { ok: false; error: string } {
  const byName = LOGO_EXTENSIONS[file.name.split('.').pop()?.toLowerCase() ?? ''];
  const declared = file.type.split(';')[0].trim().toLowerCase();
  if (!byName || (declared && declared !== byName)) return { ok: false, error: COMPANY_MESSAGES.logoType };
  if (file.size <= 0) return { ok: false, error: 'That file is empty. Export it again.' };
  if (file.size > COMPANY_LOGO_MAX_BYTES) return { ok: false, error: COMPANY_MESSAGES.logoSize };
  return { ok: true, contentType: byName };
}

/** Whether a file's opening bytes are the image type it claims. */
export function matchesCompanyLogoSignature(contentType: string, head: Uint8Array): boolean {
  const at = (offset: number, bytes: number[]) => bytes.every((byte, index) => head[offset + index] === byte);
  const text = (offset: number, value: string) => at(offset, [...value].map((char) => char.charCodeAt(0)));
  if (contentType === 'image/png') return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contentType === 'image/jpeg') return at(0, [0xff, 0xd8, 0xff]);
  if (contentType === 'image/webp') return text(0, 'RIFF') && text(8, 'WEBP');
  if (contentType === 'image/gif') return text(0, 'GIF87a') || text(0, 'GIF89a');
  return false;
}

/** Whether `src` is a logo this site's upload route made (served by the story media route). */
export function isCompanyLogoUploadSrc(src: unknown, mediaBasePath = '/api/story/media', prefix = 'stories/'): src is string {
  if (typeof src !== 'string') return false;
  const base = `${mediaBasePath.replace(/\/+$/, '')}/${prefix}${COMPANY_LOGO_FOLDER}/`;
  return src.startsWith(base) && /^[a-z0-9-]+\/[0-9a-f]{16}\.(png|jpg|webp|gif)$/.test(src.slice(base.length));
}

// ─── The asset folder ───────────────────────────────────────────────────────

export interface CompanyFolderStudy { slug: string; title: string; published: boolean; draft: boolean }
export interface CompanyFolderWork { slug: string; title: string; org: string | null; type: string | null }
export interface CompanyFolderProject {
  slug: string;
  title: string;
  kind: 'Case study' | 'Prototype' | 'Work project';
  source: 'Company assignment' | 'Work organization';
  status: string;
  /** `story` opens the story editor, `details` the project details. */
  opens: 'story' | 'details';
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The projects in a company's folder. An explicit membership always wins,
 * including when older Work details still name another company. Unassigned
 * Work shows by its own stored organization, never by title or guessed slug.
 */
export function companyFolderProjects(company: Pick<CompanyIdentity, 'slug' | 'name'>, input: {
  memberships: readonly Pick<CompanyMembership, 'storySlug' | 'companySlug'>[];
  redirects: readonly { from: string; to: string }[];
  studies: readonly CompanyFolderStudy[];
  work: readonly CompanyFolderWork[];
}): CompanyFolderProject[] {
  const aliases = new Map(input.redirects.map(({ from, to }) => [from, to]));
  const current = (slug: string) => {
    const seen = new Set<string>();
    while (aliases.has(slug) && !seen.has(slug)) {
      seen.add(slug);
      slug = aliases.get(slug)!;
    }
    return slug;
  };
  const memberships = new Map<string, string>();
  for (const entry of input.memberships) {
    const slug = current(entry.storySlug);
    if (!memberships.has(slug) || slug === entry.storySlug) memberships.set(slug, entry.companySlug);
  }
  const studies = new Map(input.studies.map((study) => [study.slug, study]));
  const work = new Map(input.work.filter((record) => current(record.slug) === record.slug).map((record) => [record.slug, record]));
  const candidates = new Set([...memberships.keys(), ...work.keys()]);
  const result: CompanyFolderProject[] = [];
  for (const slug of candidates) {
    if (!slugPattern.test(slug)) continue;
    const assigned = memberships.get(slug);
    const record = work.get(slug);
    if (assigned ? assigned !== company.slug : record?.org?.trim().toLowerCase() !== company.name.trim().toLowerCase()) continue;
    const study = studies.get(slug);
    if (!study && !record) continue;
    const kind = study ? 'Case study' : record?.type === 'Prototype' ? 'Prototype' : 'Work project';
    result.push({
      slug,
      title: (study?.title || record?.title || slug).trim() || slug,
      kind,
      source: assigned ? 'Company assignment' : 'Work organization',
      status: study ? (study.published ? (study.draft ? 'Live · newer draft' : 'Published') : study.draft ? 'Draft' : 'Authored') : 'Work record',
      opens: study ? 'story' : 'details',
    });
  }
  return result.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.slug.localeCompare(b.slug));
}

export interface CompanyFolderLogo {
  id: string;
  name: string;
  src: string;
  source: 'Logo library' | 'Company profile';
  isDefault: boolean;
  external: boolean;
}

export function companyFolderLogos(company: CompanyIdentity): CompanyFolderLogo[] {
  const items: CompanyFolderLogo[] = [];
  const add = (logo: Omit<CompanyFolderLogo, 'external'>) => {
    const src = normalizeCompanyLogoUrl(logo.src);
    if (!src) return;
    items.push({ ...logo, src, external: !src.startsWith('/') });
  };
  const defaultId = company.logoLibrary?.defaultId;
  const profile = normalizeCompanyLogoUrl(company.logoUrl);
  for (const logo of company.logoLibrary?.logos ?? []) {
    add({ id: logo.id, name: logo.name, src: logo.url, source: 'Logo library', isDefault: defaultId === logo.id });
  }
  if (!defaultId && profile) {
    const existing = items.find((item) => item.src === profile);
    if (existing) existing.isDefault = true;
  }
  if (profile && !items.some((item) => item.src === profile)) add({ id: 'profile', name: 'Profile logo', src: profile, source: 'Company profile', isDefault: !defaultId });
  return items.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/**
 * The stories a company still names, so it can't be deleted: its memberships,
 * then stories and Work records whose own company text is this company and
 * that no membership moved elsewhere.
 */
export function companyUsage(company: Pick<CompanyIdentity, 'slug' | 'name'>, input: {
  memberships: readonly Pick<CompanyMembership, 'storySlug' | 'companySlug'>[];
  named: readonly { slug: string; company: string | null }[];
}): string[] {
  const name = company.name.trim().toLowerCase();
  const assigned = new Map(input.memberships.map((entry) => [entry.storySlug, entry.companySlug]));
  const linked = input.memberships.filter((entry) => entry.companySlug === company.slug).map((entry) => entry.storySlug);
  const fallback = input.named
    .filter((entry) => entry.company && (entry.company.trim().toLowerCase() === name || companySlug(entry.company) === company.slug))
    .filter((entry) => !assigned.has(entry.slug) || assigned.get(entry.slug) === company.slug)
    .map((entry) => entry.slug);
  return [...new Set([...linked, ...fallback])].sort();
}
