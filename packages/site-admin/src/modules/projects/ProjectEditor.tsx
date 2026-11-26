'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { KeptEditsNotice, SaveBar, useFormSave } from '@rcweston/save-kit';
import type { StorySummary } from '@rcweston/story-core';
import {
  MAX_PROJECT_IMAGES,
  PROTOTYPE_TYPE,
  siteDataPaths,
  type CompanyDirectory,
  type ProjectRecord,
} from '@rcweston/site-data/client';
import { AdminSelect } from '../../menu/AdminSelect.js';
import { AdminLink as Link, useAdminRouter } from '../../router.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRead, adminRequest } from '../../request.js';
import { SeoOverrideFields, type SeoOverrideSource } from '../../components/SeoOverrideFields.js';
import { ProjectRecordActions, type ProjectRecordAction } from './ProjectRecordActions.js';

/** Everything the settings form holds, as typed. */
interface ProjectForm {
  title: string;
  slug: string;
  description: string;
  date: string;
  org: string;
  /** The company profile the project belongs to, by its address; '' for none. */
  company: string;
  role: string;
  type: string;
  duration: string;
  tags: string[];
  image: string;
  images: string[];
  url: string;
  featured: boolean;
}

const EMPTY: ProjectForm = {
  title: '', slug: '', description: '', date: '', org: '', company: '', role: '', type: '', duration: '',
  tags: [], image: '', images: [], url: '', featured: false,
};
const isProjectForm = (value: unknown): value is ProjectForm =>
  Boolean(value && typeof value === 'object' && typeof (value as ProjectForm).title === 'string' && typeof (value as ProjectForm).company === 'string' && Array.isArray((value as ProjectForm).tags) && Array.isArray((value as ProjectForm).images));
const formOf = (project: ProjectRecord, company: string): ProjectForm => ({
  title: project.title,
  slug: project.slug,
  description: project.description,
  date: project.date,
  org: project.org || '',
  company,
  role: project.role || '',
  type: project.type || '',
  duration: project.duration || '',
  tags: project.tags,
  image: project.image || '',
  images: project.images || [],
  url: project.url || '',
  featured: project.featured,
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const label = 'block text-sm font-mono text-foreground uppercase tracking-wider mb-2 font-semibold';
const input = 'w-full px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-accent-primary transition-colors font-mono text-sm';

export function ProjectCardLabelField({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const prototype = value === PROTOTYPE_TYPE;
  return (
    <div>
      <label htmlFor="project-type" className={label}>
        {prototype ? 'Type' : 'Card label'}
      </label>
      <input
        id="project-type"
        aria-describedby="project-type-help"
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={onChange === undefined}
        placeholder="e.g. 0-1 Product, Growth"
        className="w-full px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground placeholder:text-foreground-muted/50 focus:border-accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary transition-colors font-mono text-sm"
      />
      <p id="project-type-help" className="mt-half text-sm leading-baseline text-foreground-muted">
        {prototype
          ? 'Prototype keeps this project in Work → Prototypes.'
          : 'Shown on the Work card unless the story has a Type fact. Only the first label is shown.'}
      </p>
    </div>
  );
}

/**
 * A Work item's details: a case study's card fields beside its story, or a
 * prototype's whole record. The company is chosen from the company profiles,
 * which assigns the project to it. ⌘S saves; unsaved edits are kept on this
 * device; a save over someone else's newer one is refused.
 */
export function ProjectEditor({ mode, slug, seo }: { mode: 'create' | 'edit'; slug?: string; seo?: SeoOverrideSource }) {
  const config = useAdminConfig();
  const router = useAdminRouter();
  const site = (path: string) => `${config.siteApi}${path}`;
  const [recordAction, setRecordAction] = useState<ProjectRecordAction>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<CompanyDirectory>({ schemaAvailable: false, companies: [], memberships: [] });
  const [hasStory, setHasStory] = useState(false);
  const [version, setVersion] = useState(0);

  const [title, setTitle] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [org, setOrg] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [type, setType] = useState(mode === 'create' ? PROTOTYPE_TYPE : '');
  const [duration, setDuration] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [projectImages, setProjectImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [saved, setSaved] = useState<ProjectForm>({ ...EMPTY, type: mode === 'create' ? PROTOTYPE_TYPE : '' });

  const form: ProjectForm = {
    title, slug: projectSlug, description, date, org, company, role, type, duration,
    tags, image: imageUrl, images: projectImages, url: externalUrl, featured,
  };
  const { dirty, status, kept } = useFormSave({
    storageKey: `admin:unsaved:project:${slug ?? 'new'}`,
    ready: !loading && !loadError,
    value: form,
    saved,
    accept: isProjectForm,
    onSave: () => void handleSave(),
  });
  const saving = status.pending.length > 0;

  const apply = (value: ProjectForm) => {
    setTitle(value.title);
    setProjectSlug(value.slug);
    setDescription(value.description);
    setDate(value.date);
    setOrg(value.org);
    setCompany(value.company);
    setRole(value.role);
    setType(value.type);
    setDuration(value.duration);
    setTags(value.tags);
    setImageUrl(value.image);
    setProjectImages(value.images);
    setExternalUrl(value.url);
    setFeatured(value.featured);
  };
  const prototype = type === PROTOTYPE_TYPE;

  useEffect(() => {
    let current = true;
    const companies = adminRead<CompanyDirectory>(site(siteDataPaths.companies()), { schemaAvailable: false, companies: [], memberships: [] });
    if (mode === 'create' || !slug) {
      void companies.then((data) => { if (current) setDirectory(data); }).finally(() => { if (current) setLoading(false); });
      return () => { current = false; };
    }
    void Promise.all([
      adminRequest<{ project: ProjectRecord }>(site(siteDataPaths.projects(slug))),
      companies,
      adminRead<{ stories: StorySummary[] }>(`${config.storyApi}/stories`, { stories: [] }),
    ])
      .then(([{ project }, companyData, storyData]) => {
        if (!current) return;
        setDirectory(companyData);
        setHasStory(storyData.stories.some((story) => story.slug === slug));
        const value = formOf(project, companyData.memberships.find((membership) => membership.storySlug === slug)?.companySlug ?? '');
        apply(value);
        setSaved(value);
        setVersion(project.version);
        setSlugManuallyEdited(true);
      })
      .catch(() => { if (current) setLoadError('This project couldn’t be loaded. Reload the page to try again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, slug, config.siteApi, config.storyApi]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate slug from title in create mode, as the title is typed.
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (mode === 'create' && !slugManuallyEdited && value) {
      setProjectSlug(slugify(value));
    }
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,$/, '');
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  /** The company's name goes on the card as its organization. */
  const chooseCompany = (value: string) => {
    setCompany(value);
    const profile = directory.companies.find((candidate) => candidate.slug === value);
    if (profile) setOrg(profile.name);
    else if (!value && directory.companies.some((candidate) => candidate.name === org)) setOrg('');
  };

  /** Save and stay on the page; a new item moves to its own address. */
  const handleSave = async () => {
    if (!title.trim() || !projectSlug.trim() || !date.trim()) {
      status.fail('A work item needs a title, an address (slug) and a date.');
      return;
    }

    const body = {
      title: title.trim(),
      // An existing project's slug is its story's address and never changes
      // here (the server refuses it); only a new project sends one.
      ...(mode === 'create' ? { slug: projectSlug.trim() } : { expectedVersion: version }),
      description: description.trim(),
      date: date.trim(),
      org: org.trim() || null,
      role: role.trim() || null,
      type: mode === 'create' ? PROTOTYPE_TYPE : type.trim() || null,
      duration: duration.trim() || null,
      tags,
      image: imageUrl.trim() || null,
      images: projectImages,
      url: externalUrl.trim() || null,
      featured,
    };
    const target = mode === 'create' ? projectSlug.trim() : slug!;
    const assignment = company !== saved.company || (mode === 'create' && company) ? company || null : undefined;

    await status.run(async () => {
      const { project } = await adminRequest<{ project: ProjectRecord }>(mode === 'create' ? site(siteDataPaths.projects()) : site(siteDataPaths.projects(slug)), {
        method: mode === 'create' ? 'POST' : 'PUT',
        body: JSON.stringify(body),
      });
      if (assignment !== undefined) {
        await adminRequest(site(siteDataPaths.companyAssign()), { method: 'PUT', body: JSON.stringify({ storySlug: target, companySlug: assignment }) });
      }
      return project;
    }, {
      success: mode === 'create' ? 'Created' : 'Saved',
      onSaved: (project) => {
        if (mode === 'create') {
          kept.forget();
          router.replace(adminPath(config, `projects/${encodeURIComponent(project.slug)}/edit`));
          return;
        }
        const value = formOf(project, company);
        setVersion(project.version);
        setSaved(value);
        apply(value);
      },
    });
  };

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (value) apply(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-foreground-muted font-mono text-sm uppercase tracking-wider">
          Loading project...
        </div>
      </div>
    );
  }

  const workHref = adminPath(config, 'stories');
  // An organization typed before company profiles, not assigned to one.
  const unmatched = !company && org ? org : '';
  return (
    <div>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 pb-6 border-b-2 border-foreground-muted/30">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href={workHref}
              className="text-foreground-muted hover:text-accent-primary transition-colors font-mono text-sm"
            >
              &larr; Back to Work
            </Link>
          </div>
          <h1 className="font-mono text-3xl md:text-4xl font-bold text-foreground uppercase tracking-wide">
            {mode === 'create' ? 'New prototype' : prototype ? 'Prototype settings' : 'Case study settings'}
          </h1>
          {mode === 'edit' && slug && hasStory && !prototype && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="mb-0 text-sm text-foreground-muted">These settings belong to the same case study Story.</p>
              <Link href={config.editorHref(slug)} className="inline-flex min-h-11 items-center rounded px-2 font-mono text-xs font-semibold uppercase tracking-wider text-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2">Edit story</Link>
            </div>
          )}
        </div>

        {/* Error */}
        <div aria-live="assertive">
          {loadError && (
            <div role="alert" className="mb-6 p-4 rounded-md bg-red-500/10 border-2 border-red-500/30">
              <p className="text-sm font-mono text-red-600 flex items-center gap-2">
                <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7.25 4.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5ZM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" /></svg>
                {loadError}
              </p>
            </div>
          )}
        </div>

        {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
        <div className="space-y-6 mb-8">
          {/* Title */}
          <div>
            <label htmlFor="project-title" className={label}>
              Title
            </label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Project title"
              className="w-full px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-accent-primary transition-colors font-mono text-2xl"
            />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="project-slug" className={label}>
              Slug
            </label>
            <input
              id="project-slug"
              type="text"
              value={projectSlug}
              readOnly={mode === 'edit'}
              aria-describedby={mode === 'edit' ? 'project-slug-help' : undefined}
              onChange={(e) => {
                setProjectSlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              placeholder="project-slug"
              spellCheck={false}
              autoComplete="off"
              className="w-full px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-accent-primary transition-colors font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary read-only:cursor-default read-only:text-foreground-muted"
            />
            {/* Renaming moves the story, its live page and old links together,
                which only the story's Settings does. */}
            {mode === 'edit' && (
              <p id="project-slug-help" className="mb-0 mt-half font-sans text-sm leading-baseline text-foreground-muted">
                Change the address from the story’s Settings.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="project-description" className={label}>
              Description
            </label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief project description"
              rows={3}
              className="w-full px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-accent-primary transition-colors resize-none"
            />
          </div>

          {/* Two-column row: Date + Org */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="project-date" className={label}>
                Date
              </label>
              <input
                id="project-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground focus:outline-none focus:border-accent-primary transition-colors font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="project-organization" className={label}>
                Organization
              </label>
              <AdminSelect
                id="project-organization"
                aria-describedby="project-organization-help"
                value={company}
                onChange={(e) => chooseCompany(e.currentTarget.value)}
                shellClassName="w-full"
                className="font-mono"
              >
                <option value="">{unmatched ? `${unmatched} (not assigned)` : 'No company'}</option>
                {directory.companies.map((profile) => <option key={profile.slug} value={profile.slug}>{profile.name}</option>)}
              </AdminSelect>
              <p id="project-organization-help" className="mb-0 mt-half text-sm leading-baseline text-foreground-muted">
                Choosing a company assigns this project to it.{' '}
                <Link href={adminPath(config, 'companies')} className="underline underline-offset-4">Companies</Link>
              </p>
            </div>
          </div>

          {/* Two-column row: Role + Card label */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="project-role" className={label}>
                Role
              </label>
              <input
                id="project-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Product Designer"
                className={input}
              />
            </div>
            {mode === 'create'
              ? <ProjectCardLabelField value={PROTOTYPE_TYPE} />
              : <ProjectCardLabelField value={type} onChange={setType} />}
          </div>

          {/* Duration */}
          <div>
            <label htmlFor="project-duration" className={label}>
              Duration
            </label>
            <input
              id="project-duration"
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. Jun 2017 – May 2018"
              className={input}
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="project-tags" className={label}>
              Tags
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-background-secondary text-sm font-mono text-foreground"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove ${tag}`}
                    onClick={() => removeTag(tag)}
                    className="text-foreground-muted hover:text-red-500 transition-colors"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input
              id="project-tags"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Add tag and press Enter"
              spellCheck={false}
              autoComplete="off"
              className={input}
            />
          </div>

          {/* Image URL */}
          <div>
            <label htmlFor="project-image-url" className={label}>
              Image URL
            </label>
            <input
              id="project-image-url"
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              spellCheck={false}
              autoComplete="off"
              className={input}
            />
          </div>

          {/* Additional Images */}
          <div>
            <label htmlFor="project-additional-images" className={label}>
              Additional Images ({projectImages.length}/{MAX_PROJECT_IMAGES})
            </label>
            {projectImages.length > 0 && (
              <div className="space-y-2 mb-2">
                {projectImages.map((url, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label={`Additional image ${i + 1} URL`}
                      value={url}
                      onChange={(e) => {
                        const updated = [...projectImages];
                        updated[i] = e.target.value;
                        setProjectImages(updated);
                      }}
                      className="flex-1 px-4 py-2 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground focus:outline-none focus:border-accent-primary transition-colors font-mono text-sm"
                    />
                    <button
                      type="button"
                      aria-label={`Remove additional image ${i + 1}`}
                      onClick={() => setProjectImages(projectImages.filter((_, idx) => idx !== i))}
                      className="px-3 py-2 rounded-md border-2 border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors font-mono text-xs"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {projectImages.length < MAX_PROJECT_IMAGES && (
              <div className="flex items-center gap-2">
                <input
                  id="project-additional-images"
                  type="text"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const url = newImageUrl.trim();
                      if (url && !projectImages.includes(url)) {
                        setProjectImages([...projectImages, url]);
                        setNewImageUrl('');
                      }
                    }
                  }}
                  placeholder="https://... (press Enter to add)"
                  className="flex-1 px-4 py-3 rounded-md border-2 border-foreground-muted/30 bg-card-bg text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-accent-primary transition-colors font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const url = newImageUrl.trim();
                    if (url && !projectImages.includes(url)) {
                      setProjectImages([...projectImages, url]);
                      setNewImageUrl('');
                    }
                  }}
                  disabled={!newImageUrl.trim()}
                  className="px-4 py-3 rounded-md border-2 border-foreground-muted/30 text-foreground hover:border-accent-primary transition-colors font-mono text-sm uppercase tracking-wider disabled:opacity-30"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* External URL */}
          <div>
            <label htmlFor="project-external-url" className={label}>
              External URL
            </label>
            <input
              id="project-external-url"
              type="text"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="Leave empty for internal case study link"
              spellCheck={false}
              autoComplete="off"
              className={input}
            />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={featured}
                aria-labelledby="project-featured-label"
                onClick={() => setFeatured(!featured)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  featured ? 'bg-accent-primary' : 'bg-foreground-muted/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    featured ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
              <span id="project-featured-label" className="text-sm font-mono text-foreground uppercase tracking-wider font-semibold">
                Featured
              </span>
            </div>

          </div>
        </div>

        {/* SEO Settings */}
        {mode === 'edit' && slug && seo && (
          <div className="mb-8">
            <button
              type="button"
              aria-expanded={seoOpen}
              onClick={() => setSeoOpen(!seoOpen)}
              className="flex items-center gap-2 text-sm font-mono text-foreground uppercase tracking-wider font-semibold hover:text-accent-primary transition-colors"
            >
              SEO Settings
              <svg
                aria-hidden="true"
                className={`w-4 h-4 transition-transform ${seoOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {seoOpen && (
              <div className="mt-4 p-5 rounded-md border border-foreground-muted/20 bg-card-bg">
                <SeoOverrideFields
                  pagePath={config.storyHref(slug)}
                  source={seo}
                  fallbacks={{ title, description, ogImage: imageUrl }}
                />
              </div>
            )}
          </div>
        )}

        {/* Actions — pinned, with the save status beside them; ⌘S saves. */}
        <SaveBar
          status={status}
          dirty={dirty}
          idle={mode === 'create' ? 'Not saved yet' : undefined}
          className="[--save-kit-bar-width:56rem]"
          trailing={mode === 'edit' && !hasStory && (
            <button
              type="button"
              onClick={() => { if (slug) setRecordAction({ slug, title, action: 'delete', version }); }}
              className="px-6 py-3 rounded-md border-2 border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors font-mono text-sm uppercase tracking-wider font-semibold"
            >
              Delete Project
            </button>
          )}
        >
          <button
            type="submit"
            disabled={saving}
            aria-keyshortcuts="Meta+S Control+S"
            className="px-6 py-3 rounded-md bg-foreground text-background hover:opacity-80 transition-opacity font-mono text-sm uppercase tracking-wider font-semibold disabled:opacity-50"
          >
            {mode === 'create' ? 'Create Project' : 'Save Changes'}
          </button>
          {mode === 'edit' && slug && hasStory && (
            <Link
              href={config.editorHref(slug)}
              className="px-6 py-3 rounded-md border-2 border-foreground-muted text-foreground hover:border-foreground transition-colors font-mono text-sm uppercase tracking-wider font-semibold"
            >
              Edit Story Draft
            </Link>
          )}
        </SaveBar>
        </form>

      </div>
    {recordAction && <ProjectRecordActions record={recordAction} onDismiss={() => setRecordAction(undefined)}
      onDeleteStarted={() => { kept.forget(); router.push(workHref); }}
      onDeleted={() => undefined}
      onDuplicated={(copy) => router.push(adminPath(config, `projects/${encodeURIComponent(copy.slug)}/edit`))} />}
    </div>
  );
}
