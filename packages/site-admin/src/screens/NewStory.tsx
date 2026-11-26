'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { explainFailure } from '@rcweston/save-kit';
import { NEW_STORY_TITLE_MAX, createStory, newStoryFields, newStorySlug, type StorySummary } from '@rcweston/story-core';
import { AdminLink as Link, useAdminRouter } from '../router.js';
import { adminPath, useAdminConfig } from '../config.js';
import { adminRequest } from '../request.js';

/**
 * New case study: a title (and, if you like, who it was for), then the
 * editor opens on a private draft. Nothing goes live.
 */
export function NewStory({ backPath = 'stories', reserved = [] }: {
  /** Admin-relative path of the list it came from. */
  backPath?: string;
  /** Addresses a story can't take (your other routes). */
  reserved?: readonly string[];
}) {
  const config = useAdminConfig();
  const { push } = useAdminRouter();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [taken, setTaken] = useState<Set<string> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    adminRequest<{ stories: StorySummary[] }>(`${config.storyApi}/stories`)
      .then((data) => setTaken(new Set(data.stories.map((story) => story.slug))))
      .catch(() => setTaken(new Set()));
  }, [config.storyApi]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    const fields = newStoryFields({ title, company });
    const blocked = new Set(reserved);
    const base = fields && newStorySlug(fields.title, blocked);
    // A title another story already has gets the next free address: -2, -3…
    let slug = base;
    for (let n = 2; slug && taken?.has(slug); n += 1) slug = `${base}-${n}`;
    if (!fields || !slug) {
      setError('Enter a title with at least one letter or number.');
      return;
    }
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const content = createStory({ ...fields, slug }, blocked);
      await adminRequest(`${config.storyApi}/stories/${encodeURIComponent(content.slug)}/drafts`, {
        method: 'POST',
        body: JSON.stringify({ content, parentDocumentId: null }),
      });
      push(config.editorHref(content.slug));
    } catch (reason) {
      pending.current = false;
      setSaving(false);
      setError(explainFailure(reason, 'created'));
    }
  };

  const field = 'w-full rounded-md border border-default bg-card-bg px-3 min-h-12 text-foreground';
  return <main className="mx-auto max-w-2xl pb-major">
    <Link href={adminPath(config, backPath)} className="text-sm leading-baseline text-foreground-muted underline">Back to Work</Link>
    <h1 className="mt-minor mb-0 font-mono text-3xl font-bold leading-9 text-foreground">New case study</h1>
    <p className="mt-half mb-minor text-foreground-muted">Start with a title. The Story editor opens next. Nothing goes live.</p>
    <form onSubmit={submit} className="grid gap-minor" aria-busy={saving}>
      <label className="grid gap-half text-sm font-semibold">Title
        <input className={field} required maxLength={NEW_STORY_TITLE_MAX} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} />
      </label>
      <label className="grid gap-half text-sm font-semibold">Company <span className="font-normal text-foreground-muted">(optional)</span>
        <input className={field} maxLength={120} value={company} onChange={(event) => setCompany(event.target.value)} disabled={saving} />
      </label>
      {error && <p role="alert" className="mb-0 text-status-error-text">{error}</p>}
      <div>
        <button type="submit" disabled={saving || taken === null} className="min-h-12 rounded-lg bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50">
          {saving ? 'Creating draft…' : 'Create case study'}
        </button>
      </div>
    </form>
  </main>;
}
