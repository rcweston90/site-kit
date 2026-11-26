'use client';

import { Suspense, lazy, useState, useEffect, useMemo, useRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { MoreHorizontal } from 'lucide-react';
import { SaveStatus, KeptEditsNotice, deleteWithUndo, recordKey, useFormSave } from '@rcweston/save-kit';
import { BLOG_MESSAGES, blogPaths, isBlogSlug, slugifyBlogTitle, type BlogEditorState, type BlogPostContent, type RelatedTileChoice } from '@rcweston/site-data/client';
import { adminMenuContentClass, adminMenuItemClass } from '../../menu/index.js';
import { SeoOverrideFields, type SeoOverrideSource } from '../../components/SeoOverrideFields.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { AdminLink as Link, useAdminRouter } from '../../router.js';
import BlogDraftPreview from './BlogDraftPreview.js';
import { RelatedTileCatalogContext, type RelatedTileCatalog } from './BlogRelatedTile.js';
import { PostUpdatesNotice, PostUpdatesReview, usePostUpdates } from './PostUpdates.js';
/* Styles: blog.css. */
const styles = {
  page: 'sa-blog-page', header: 'sa-blog-header', backLink: 'sa-blog-back',
  saveDock: 'sa-blog-save-dock', saveRow: 'sa-blog-save-row', saveActions: 'sa-blog-save-actions', saveButton: 'sa-blog-save-button', moreButton: 'sa-blog-more-button',
  settings: 'sa-blog-settings',
} as const;

// Tiptap + lowlight (~260KB) only load once the editor actually mounts.
const TiptapEditor = lazy(() => import('./TiptapEditor.js'));
const editorLoading = <div className="min-h-[300px] rounded-md border border-default bg-card-bg animate-pulse" />;

export interface BlogEditorClientProps {
  mode: 'create' | 'edit';
  slug?: string;
  /** Where the post's SEO override is read and written. Without one the SEO settings stay hidden. */
  seoSource?: SeoOverrideSource;
}

/** What the form holds; Draft or Live is the post's state, set by the buttons. */
interface PostForm {
  title: string;
  slug: string;
  description: string;
  content: string;
  tags: string[];
  imageUrl: string;
}

const EMPTY: PostForm = { title: '', slug: '', description: '', content: '', tags: [], imageUrl: '' };
const isPostForm = (value: unknown): value is PostForm =>
  Boolean(value && typeof value === 'object' && typeof (value as PostForm).title === 'string' && typeof (value as PostForm).content === 'string' && Array.isArray((value as PostForm).tags));
const formOf = (slug: string, post: BlogPostContent): PostForm => ({
  title: post.title,
  slug,
  description: post.description,
  content: post.html,
  tags: post.tags,
  imageUrl: post.imageUrl || '',
});
const contentOf = (form: PostForm): BlogPostContent => ({
  title: form.title.trim(),
  description: form.description.trim(),
  tags: form.tags,
  imageUrl: form.imageUrl.trim(),
  html: form.content,
});

type WritingFocus = { element: HTMLElement; range?: Range; inputSelection?: [number, number, 'forward' | 'backward' | 'none'] };
type Commit = 'save' | 'publish' | 'unpublish';

export default function BlogEditorClient({ mode, slug, seoSource }: BlogEditorClientProps) {
  const config = useAdminConfig();
  const router = useAdminRouter();
  const api = (path: string) => `${config.siteApi}${path}`;
  const [catalog, setCatalog] = useState<RelatedTileCatalog>({ entries: [], status: 'loading' });
  const [catalogRetry, setCatalogRetry] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    adminRequest<{ choices: RelatedTileChoice[] }>(api(blogPaths.related()), { signal: request.signal, cache: 'no-store' }).then(({ choices }) => {
      if (!request.signal.aborted) setCatalog({ entries: choices, status: 'ready' });
    }, () => {
      if (!request.signal.aborted) setCatalog({ entries: [], status: 'error' });
    });
    return () => request.abort();
    // The endpoint is fixed for the life of the admin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRetry]);
  const tileCatalogState: RelatedTileCatalog = { ...catalog, retry: () => { setCatalog({ entries: [], status: 'loading' }); setCatalogRetry(n => n + 1); } };
  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The post as the server last answered: its versions and what's live. */
  const [record, setRecord] = useState<BlogEditorState | null>(null);
  const recordRef = useRef<BlogEditorState | null>(null);
  useEffect(() => { recordRef.current = record; }, [record]);

  const [title, setTitle] = useState('');
  const [postSlug, setPostSlug] = useState('');
  const tileCatalog = { ...tileCatalogState, entries: tileCatalogState.entries.filter(item => item.kind === 'case-study' || (record ? item.id !== String(record.post.id) : item.slug !== postSlug)) };
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const published = Boolean(record?.publishedDocumentId);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const writingRef = useRef<HTMLFieldSetElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const writingFocus = useRef<WritingFocus | null>(null);
  const editingScroll = useRef({ top: 0, left: 0 });
  const switchFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(switchFrame.current), []);
  const [saved, setSaved] = useState<PostForm>(EMPTY);
  // The rich-text editor reads its content once; a restore remounts it.
  const [contentVersion, setContentVersion] = useState(0);
  const [reviewNote, setReviewNote] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    const resize = () => { field.style.height = 'auto'; field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`; };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [title, loading]);

  const form: PostForm = { title, slug: postSlug, description, content, tags, imageUrl };
  const latestForm = useRef(form);
  useEffect(() => { latestForm.current = form; });
  const { dirty, status, kept } = useFormSave({
    storageKey: `admin:unsaved:blog:${slug ?? 'new'}`,
    ready: !loading && !loadError,
    value: form,
    saved,
    base: record?.documents[0]?.id ?? null,
    accept: isPostForm,
    leaveGuardIgnoreWithin: 'data-blog-authoring',
    onSave: () => void handleSave('save'),
  });
  const saving = status.pending.length > 0;
  // Live with a newer draft (saved or not) than readers see.
  const unpublishedChanges = published && (dirty || record?.documents[0]?.id !== record?.publishedDocumentId);
  const draftContent = useMemo(() => contentOf(form), [title, description, tags, imageUrl, content]); // eslint-disable-line react-hooks/exhaustive-deps
  const updates = usePostUpdates({ slug: slug ?? '', documents: record?.documents, publishedDocumentId: record?.publishedDocumentId ?? null, draft: draftContent });

  const apply = (value: PostForm) => {
    setTitle(value.title);
    setPostSlug(value.slug);
    setDescription(value.description);
    setContent(value.content);
    setTags(value.tags);
    setImageUrl(value.imageUrl);
  };

  const accept = (state: BlogEditorState) => {
    recordRef.current = state;
    setRecord(state);
    setSaved(formOf(state.post.slug, state.content));
  };

  // Fetch existing post in edit mode
  useEffect(() => {
    if (mode !== 'edit' || !slug) return;
    fetch(api(blogPaths.post(slug)), { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('load');
        return res.json() as Promise<BlogEditorState>;
      })
      .then((state) => {
        apply(formOf(state.post.slug, state.content));
        setSlugManuallyEdited(true);
        accept(state);
      })
      .catch(() => setLoadError('This post couldn’t be loaded. Reload the page to try again.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, slug]);

  // Auto-generate slug from title in create mode. Done as the title is typed
  // (the only way it changes in create mode) rather than in an effect.
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (mode === 'create' && !slugManuallyEdited && value) {
      setPostSlug(slugifyBlogTitle(value));
    }
  };

  const addTag = () => {
    const tag = tagInput.trim().replace(/,$/, '');
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const rememberWritingFocus = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement) || !writingRef.current?.contains(target)) return;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      if (target.selectionStart !== null && target.selectionEnd !== null) {
        writingFocus.current = { element: target, inputSelection: [target.selectionStart, target.selectionEnd, target.selectionDirection ?? 'none'] };
      }
      return;
    }
    if (!target.isContentEditable) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    writingFocus.current = { element: target, range: range && target.contains(range.commonAncestorContainer) ? range.cloneRange() : undefined };
  };

  const togglePreview = () => {
    cancelAnimationFrame(switchFrame.current);
    if (!preview) {
      rememberWritingFocus(document.activeElement);
      editingScroll.current = { top: window.scrollY, left: window.scrollX };
      setPreview(true);
      switchFrame.current = requestAnimationFrame(() => {
        previewHeading.current?.closest('section')?.scrollIntoView({ block: 'start', behavior: 'instant' });
        previewHeading.current?.focus({ preventScroll: true });
      });
      return;
    }
    setPreview(false);
    switchFrame.current = requestAnimationFrame(() => {
      const savedFocus = writingFocus.current;
      if (savedFocus?.element.isConnected) {
        const { element, range, inputSelection } = savedFocus;
        element.focus({ preventScroll: true });
        if (range && element.contains(range.commonAncestorContainer)) {
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        if (inputSelection && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
          element.setSelectionRange(...inputSelection);
        }
      } else {
        titleRef.current?.focus({ preventScroll: true });
      }
      window.scrollTo({ ...editingScroll.current, behavior: 'instant' });
    });
  };

  /**
   * Save the form as a new draft version, then publish or unpublish if asked.
   * Each attempt (Try again, or the rerun after signing back in) reads the
   * newest version the server answered, so a retry after the save went
   * through publishes instead of saving over itself.
   */
  const handleSave = async (commit: Commit) => {
    if (preview || loading || loadError || saving) return;
    if (commit !== 'unpublish' && (!title.trim() || !postSlug.trim())) {
      status.fail(BLOG_MESSAGES.needsTitle);
      return;
    }
    const submitted = JSON.stringify(form);
    const nextSlug = postSlug.trim();
    const movesAway = (state: BlogEditorState) => mode === 'create' || state.post.slug !== slug;
    const run = async (): Promise<BlogEditorState> => {
      let state = recordRef.current;
      const changed = !state || JSON.stringify(formOf(state.post.slug, state.content)) !== submitted;
      if (commit !== 'unpublish' && changed) {
        const body = JSON.stringify(state
          ? { slug: nextSlug, content: contentOf(JSON.parse(submitted) as PostForm), parentDocumentId: state.documents[0]?.id ?? null }
          : { slug: nextSlug, content: contentOf(JSON.parse(submitted) as PostForm) });
        state = await adminRequest<BlogEditorState>(state ? api(blogPaths.post(state.post.slug)) : api(blogPaths.posts()), { method: state ? 'PUT' : 'POST', body });
        // A save that moves the post to another URL leaves the form as it is:
        // the leave guard stays up until the new page has taken the history
        // entry, so taking it down can't step back over the navigation.
        if (movesAway(state)) recordRef.current = state;
        else accept(state);
      }
      if (!state) throw new Error(BLOG_MESSAGES.notFound);
      if (commit === 'publish') {
        state = await adminRequest<BlogEditorState>(api(blogPaths.publish(state.post.slug)), {
          method: 'POST',
          body: JSON.stringify({ documentId: state.documents[0]!.id, expectedPublishedDocumentId: state.publishedDocumentId }),
        });
      } else if (commit === 'unpublish') {
        state = await adminRequest<BlogEditorState>(api(blogPaths.unpublish(state.post.slug)), {
          method: 'POST',
          body: JSON.stringify({ expectedPublishedDocumentId: state.publishedDocumentId }),
        });
      }
      return state;
    };
    await status.run(run, {
      key: 'save',
      doing: commit === 'publish' ? 'Publishing…' : commit === 'unpublish' ? 'Unpublishing…' : 'Saving…',
      success: commit === 'save' ? 'Saved' : commit === 'publish' ? 'Published' : 'Unpublished',
      done: commit === 'publish' ? 'published' : commit === 'unpublish' ? 'unpublished' : 'saved',
      onSaved: (state) => {
        setReviewNote('');
        // A new post, or one whose address changed, now lives at another URL.
        if (movesAway(state)) {
          kept.forget();
          router.replace(adminPath(config, `blog/${state.post.slug}/edit`));
          return;
        }
        accept(state);
        if (JSON.stringify(latestForm.current) === submitted) apply(formOf(state.post.slug, state.content));
      },
    });
  };

  const handleDelete = () => {
    if (!slug) return;
    deleteWithUndo({
      key: recordKey('post', slug),
      label: 'Post deleted',
      send: ({ keepalive }) => adminRequest(api(blogPaths.post(slug)), { method: 'DELETE', keepalive }),
    });
    kept.forget();
    router.push(adminPath(config, 'blog'));
  };

  const uploadBodyImage = async (file: File) => {
    const body = new FormData();
    body.set('slug', isBlogSlug(postSlug.trim()) ? postSlug.trim() : 'untitled');
    body.set('file', file);
    const result = await adminRequest<{ src: string }>(api(blogPaths.upload()), { method: 'POST', body });
    return result.src;
  };

  const bringIn = (post: BlogPostContent, notice: string) => {
    apply({ ...form, title: post.title, description: post.description, tags: post.tags, imageUrl: post.imageUrl, content: post.html });
    if (post.html !== content) setContentVersion((version) => version + 1);
    // The save line says "Unsaved changes" now, so the count gets its own line until the next save.
    setReviewNote(notice);
  };

  const restore = () => {
    const value = kept.offer?.value;
    kept.restore();
    if (!value) return;
    apply(value);
    setContentVersion((version) => version + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-foreground-muted font-mono text-sm uppercase tracking-wider">
          Loading post...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-blog-editor="">
      <div className="max-w-4xl mx-auto">
        <div className={styles.header}>
          <Link href={adminPath(config, 'blog')} className={styles.backLink}>← Posts</Link>
          <h1 className="font-mono text-sm font-bold uppercase tracking-wide">{mode === 'create' ? 'New post' : 'Edit post'}</h1>
          <span className="text-sm text-foreground-muted">{published ? 'Live' : 'Draft'}</span>
        </div>

        <div className={styles.saveDock} data-blog-save-dock="">
          <div className={styles.saveRow}>
            {!preview && <SaveStatus status={status} dirty={dirty} idle={mode === 'create' ? 'Not saved yet' : 'All changes saved'} />}
            <div className={styles.saveActions}>
              <button type="button" onPointerDown={() => { if (!preview) rememberWritingFocus(document.activeElement); }} onClick={togglePreview}
                disabled={!!loadError} aria-expanded={preview} aria-controls="blog-draft-preview"
                className={styles.moreButton}>{preview ? 'Back to editing' : 'Preview'}</button>
              {!preview && <>
                <button type="button" data-blog-save-button="" onClick={() => void handleSave('save')} disabled={saving || !!loadError} aria-keyshortcuts="Meta+S Control+S" className={styles.saveButton}>
                  {saving ? 'Saving…' : 'Save draft'}
                </button>
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild><button type="button" className={styles.moreButton} aria-label="Post actions" disabled={saving || !!loadError}><MoreHorizontal aria-hidden="true" /></button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className={adminMenuContentClass} align="end" collisionPadding={12} sideOffset={12}>
                      {(!published || unpublishedChanges) && <DropdownMenu.Item className={adminMenuItemClass} onSelect={() => void handleSave('publish')}>{published ? 'Publish changes' : 'Publish post'}</DropdownMenu.Item>}
                      {published && <DropdownMenu.Item className={adminMenuItemClass} onSelect={() => void handleSave('unpublish')}>Unpublish post</DropdownMenu.Item>}
                      {mode === 'edit' && <DropdownMenu.Item className={`${adminMenuItemClass} text-status-error-text`} onSelect={handleDelete}>Delete post</DropdownMenu.Item>}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>}
            </div>
          </div>
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

        {!preview && updates.outstanding > 0 && !updates.dismissed && <PostUpdatesNotice updates={updates} />}
        {!preview && reviewNote && <p role="status" className="mb-minor font-sans text-sm leading-baseline text-foreground-muted">{reviewNote}</p>}
        <PostUpdatesReview updates={updates} draft={draftContent} onApply={bringIn} />

        {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

        {/* Form */}
        {/* Enter in a field never saves or publishes; only the buttons do. */}
        <form onSubmit={(e) => e.preventDefault()}>
        {/* A first save or address change navigates to a new record. Briefly pause
            editing through that handoff; ordinary saves keep typing available. */}
        <fieldset ref={writingRef} hidden={preview} onBlurCapture={(event) => rememberWritingFocus(event.target)} inert={saving && (mode === 'create' || postSlug !== slug) ? true : undefined} disabled={!!loadError} className="min-w-0">
        <div className="space-y-minor mb-minor-2">
          {/* Title */}
          <div>
            <label htmlFor="blog-title" className="block text-sm font-mono text-foreground uppercase tracking-wider mb-0 leading-baseline font-semibold">
              Post title
            </label>
            <textarea
              ref={titleRef}
              id="blog-title"
              rows={1}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault(); }}
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Post title"
              className="w-full resize-none overflow-hidden border-b border-default bg-transparent py-half text-3xl md:text-4xl font-semibold leading-9 md:leading-12 text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-accent-primary"
            />
          </div>

        </div>

        {/* Content Editor */}
        <div className="mb-minor-2">
          <label htmlFor="blog-content" className="block text-sm font-mono text-foreground uppercase tracking-wider mb-0 leading-baseline font-semibold">
            Content
          </label>
          <RelatedTileCatalogContext.Provider value={tileCatalog}><Suspense fallback={editorLoading}><TiptapEditor key={contentVersion} content={content} onChange={setContent} uploadBodyImage={uploadBodyImage} /></Suspense></RelatedTileCatalogContext.Provider>
        </div>

        <details className={styles.settings}>
          <summary>Summary for the blog listing</summary>
          <div className="pt-minor">
          {/* Description */}
          <div>
            <label htmlFor="blog-description" className="block text-sm font-mono text-foreground uppercase tracking-wider mb-0 leading-baseline font-semibold">
              Summary for the blog listing
            </label>
            <textarea
              id="blog-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void handleSave('save'); } }}
              placeholder="Brief description of the post"
              rows={3}
              className="w-full border-b border-default bg-transparent py-half text-lg leading-9 text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-accent-primary resize-y"
            />
          </div>

          </div>
        </details>

        <details className={styles.settings}>
          <summary>Post settings · address, tags and cover</summary>
          <div className="space-y-minor pt-minor">
          {/* Slug */}
          <div>
            <label htmlFor="blog-slug" className="block text-sm font-mono text-foreground uppercase tracking-wider mb-0 leading-baseline font-semibold">
              Slug
            </label>
            <input
              id="blog-slug"
              autoCapitalize="none"
              autoCorrect="off"
              type="text"
              value={postSlug}
              onChange={(e) => {
                setPostSlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              placeholder="post-slug"
              spellCheck={false}
              autoComplete="off"
              className="w-full px-4 py-half rounded-md border border-default bg-card-bg text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-accent-primary font-mono text-sm leading-baseline"
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="blog-tags" className="block text-sm font-mono text-foreground uppercase tracking-wider mb-0 leading-baseline font-semibold">
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
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag} tag`}
                    className="min-h-11 min-w-11 text-foreground-muted hover:text-status-error-text transition-colors"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
            <input
              id="blog-tags"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Add a tag"
              enterKeyHint="done"
              spellCheck={false}
              autoComplete="off"
              className="w-full px-4 py-half rounded-md border border-default bg-card-bg text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-accent-primary font-mono text-sm leading-baseline"
            />
            <button type="button" onClick={addTag} disabled={!tagInput.trim()} className={styles.moreButton}>Add</button>
            </div>
          </div>

          {/* Featured Image */}
          <div>
            <label htmlFor="blog-image-url" className="block text-sm font-mono text-foreground uppercase tracking-wider mb-0 leading-baseline font-semibold">
              Featured Image URL
            </label>
            <input
              id="blog-image-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-4 py-half rounded-md border border-default bg-card-bg text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-accent-primary font-mono text-sm leading-baseline"
            />
          </div>

          </div>
        </details>

        {/* Without an SEO source there's nothing to write the override to. */}
        {seoSource && <div className="mb-minor-2">
          <button
            type="button"
            onClick={() => setSeoOpen(!seoOpen)}
            aria-expanded={seoOpen}
            className="flex min-h-11 items-center gap-2 text-sm font-mono text-foreground uppercase tracking-wider font-semibold hover:text-accent-primary transition-colors"
          >
            SEO Settings
            <svg
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
              {postSlug ? (
                <SeoOverrideFields
                  pagePath={`/blog/${postSlug}`}
                  source={seoSource}
                  fallbacks={{ title, description, ogImage: imageUrl }}
                />
              ) : (
                <p className="text-sm font-mono text-foreground-muted">
                  Save the post first to configure SEO
                </p>
              )}
            </div>
          )}
        </div>}

        </fieldset>
        </form>
        {preview && <BlogDraftPreview relatedChoices={tileCatalog.entries} title={title} content={content} imageUrl={imageUrl} headingRef={previewHeading} />}

      </div>
    </div>
  );
}
