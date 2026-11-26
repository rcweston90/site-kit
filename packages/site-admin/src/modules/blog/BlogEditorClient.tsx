'use client';

import { Suspense, lazy, useCallback, useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Ellipsis, Settings2, X } from 'lucide-react';
import { KeptEditsNotice, LEAVE_MESSAGE, deleteWithUndo, recordKey, statusLine, useDraftAutosave, useFormSave, whenHistorySettled } from '@rcweston/save-kit';
import { BLOG_MESSAGES, blogPaths, isBlogSlug, slugifyBlogTitle, type BlogEditorState, type BlogPostContent, type RelatedTileChoice } from '@rcweston/site-data/client';
import { EditorialPublishControl, type PublicationChecklistRow } from '@rcweston/story-editor';
import { adminMenuContentClass, adminMenuItemClass } from '../../menu/index.js';
import { SeoOverrideFields, type SeoOverrideSource } from '../../components/SeoOverrideFields.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { useAdminRouter } from '../../router.js';
import { EditorialWorkspaceBar, barIconButton } from '../../shell/EditorialWorkspaceBar.js';
import type { BlogBlockTool } from './blog-block-tools.js';
import BlogDraftPreview, { BlogReaderCover, BlogReaderHeading, blogReaderTitleClass } from './BlogDraftPreview.js';
import { RelatedTileCatalogContext, type RelatedTileCatalog } from './BlogRelatedTile.js';
import { PostUpdatesNotice, PostUpdatesReview, usePostUpdates } from './PostUpdates.js';
/* Styles: blog.css. */
const styles = {
  page: 'sa-blog-page', readerFrame: 'sa-blog-reader-frame', readerTitle: 'sa-blog-reader-title',
  dialogOverlay: 'sa-blog-dialog-overlay', panel: 'sa-blog-image-panel', moreButton: 'sa-blog-more-button',
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

/** What the form holds; Draft or Live is the post's state, set by Publish. */
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
const safeCover = (value: string) => {
  const url = value.trim();
  return /^(?:https?:\/\/|\/(?!\/))/i.test(url) ? url : '';
};

type WritingFocus = { element: HTMLElement; range?: Range; inputSelection?: [number, number, 'forward' | 'backward' | 'none'] };
type Commit = 'save' | 'publish' | 'unpublish';

/**
 * A post's editor. It reads like the post (title, cover and body in the
 * reader's layout) under one top bar: back, the save line, Edit and Preview,
 * settings, save and publish.
 *
 * Drafts save themselves a second after typing stops. Each automatic save
 * folds into the post's working version, so history keeps the versions you
 * saved by hand and the ones that went live, not one per pause. Readers only
 * ever see what you publish. A new post starts saving once it has a title,
 * and changing a post's address waits for Save, since that moves its link.
 */
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
  /** Where the post lives now: its first save, or a rename, can move it. */
  const address = record?.post.slug ?? slug;
  const newDraft = !record && !slug;
  const [composing, setComposing] = useState(false);
  const [exitAfterSave, setExitAfterSave] = useState(false);

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsTrigger = useRef<HTMLElement | null>(null);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const historyAction = useRef<((action: 'undo' | 'redo') => void) | null>(null);
  const runTool = useRef<((key: BlogBlockTool['key']) => void) | null>(null);
  const [tools, setTools] = useState<readonly BlogBlockTool[]>([]);
  const registerHistory = useCallback((fn: typeof historyAction.current) => { historyAction.current = fn; }, []);
  const registerTools = useCallback((next: readonly BlogBlockTool[], fn: typeof runTool.current) => {
    runTool.current = fn;
    setTools(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, []);
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
  useLayoutEffect(() => { latestForm.current = form; });
  const formRevision = JSON.stringify(form);
  const validAddress = isBlogSlug(postSlug.trim());
  const canSaveDraft = validAddress && !!title.trim();
  /** A saved post whose address field says somewhere else: only Save moves it. */
  const moving = !newDraft && validAddress && postSlug.trim() !== address;
  const { dirty, status, kept } = useFormSave({
    storageKey: `admin:unsaved:blog:${address ?? 'new'}`,
    ready: !loading && !loadError,
    value: form,
    saved,
    base: record?.documents[0]?.id ?? null,
    accept: isPostForm,
    leaveGuardIgnoreWithin: 'data-blog-authoring',
    onSave: () => void handleSave('save'),
  });
  const saving = status.pending.length > 0;
  const draftContent = useMemo(() => contentOf(form), [title, description, tags, imageUrl, content]); // eslint-disable-line react-hooks/exhaustive-deps
  const updates = usePostUpdates({ slug: address ?? '', documents: record?.documents, publishedDocumentId: record?.publishedDocumentId ?? null, draft: draftContent });
  const canAutosave = dirty && canSaveDraft && !moving && !composing && !saving && !kept.offer && !status.failure && !updates.reviewOpen && !loadError;
  useDraftAutosave({ eligible: canAutosave, revision: formRevision, save: () => void handleSave('save', true), flush: exitAfterSave });
  useEffect(() => {
    if (!exitAfterSave || saving) return;
    if (dirty && canAutosave) return;
    // The leave guard tidies history once everything is saved, and its Back
    // would undo a navigation made before it lands. Leave after it.
    let cancelled = false;
    void whenHistorySettled().then(() => {
      if (cancelled) return;
      setExitAfterSave(false);
      if (!dirty) router.push(adminPath(config, 'blog'));
    });
    return () => { cancelled = true; };
  }, [canAutosave, config, dirty, exitAfterSave, router, saving]);

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
  };

  // Fetch existing post in edit mode
  useEffect(() => {
    if (mode !== 'edit' || !slug) return;
    const request = new AbortController();
    fetch(api(blogPaths.post(slug)), { credentials: 'same-origin', cache: 'no-store', signal: request.signal })
      .then((res) => {
        if (!res.ok) throw new Error('load');
        return res.json() as Promise<BlogEditorState>;
      })
      .then((state) => {
        if (request.signal.aborted) return;
        const value = formOf(state.post.slug, state.content);
        apply(value);
        setSlugManuallyEdited(true);
        accept(state);
        setSaved(value);
      })
      .catch(() => { if (!request.signal.aborted) setLoadError('This post couldn’t be loaded. Reload the page to try again.'); })
      .finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, slug]);

  // Suggest an address while the first title is typed, until the author
  // picks one or the draft has been saved.
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (newDraft && !slugManuallyEdited) setPostSlug(slugifyBlogTitle(value));
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

  /** The post now lives at another address: point the page there without
   *  remounting, so focus, the caret and undo history stay. */
  const adoptAddress = (next: string) => {
    if (next === address) return;
    kept.forget();
    window.history.replaceState(window.history.state, '', adminPath(config, `blog/${encodeURIComponent(next)}/edit`));
  };

  /**
   * Save the form as a draft version, then publish or unpublish if asked.
   * An automatic save folds into the working version; Save and Publish keep
   * one of their own. Each attempt (Try again, or the rerun after signing
   * back in) reads the newest version the server answered, so a retry after
   * the save went through publishes instead of saving over itself.
   */
  const inflight = useRef(false);
  const handleSave = async (commit: Commit, automatic = false): Promise<boolean> => {
    if (loading || loadError || inflight.current) return false;
    if (automatic && (composing || !dirty || !canSaveDraft || moving)) return false;
    if (commit !== 'unpublish' && !canSaveDraft) {
      status.fail(!title.trim() ? BLOG_MESSAGES.needsTitle : 'Use lowercase words separated by hyphens for the address.');
      return false;
    }
    const submitted = formRevision;
    const submittedForm = JSON.parse(submitted) as PostForm;
    const nextSlug = postSlug.trim();
    inflight.current = true;
    try {
      const run = async (): Promise<BlogEditorState> => {
        let state = recordRef.current;
        const changed = !state || JSON.stringify(formOf(state.post.slug, state.content)) !== JSON.stringify(formOf(nextSlug, contentOf(submittedForm)));
        if (commit !== 'unpublish' && changed) {
          const body = JSON.stringify(state
            ? { slug: nextSlug, content: contentOf(submittedForm), parentDocumentId: state.documents[0]?.id ?? null, autosave: automatic }
            : { slug: nextSlug, content: contentOf(submittedForm) });
          state = await adminRequest<BlogEditorState>(state ? api(blogPaths.post(state.post.slug)) : api(blogPaths.posts()), { method: state ? 'PUT' : 'POST', body });
          adoptAddress(state.post.slug);
          accept(state);
          // What was typed, not the server's trimmed copy: never trim under
          // the caret or replace newer text.
          setSaved(submittedForm);
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
      const result = await status.run(run, {
        key: 'save',
        doing: commit === 'publish' ? 'Publishing…' : commit === 'unpublish' ? 'Unpublishing…' : 'Saving…',
        success: commit === 'save' ? 'Saved' : commit === 'publish' ? 'Published' : 'Unpublished',
        done: commit === 'publish' ? 'published' : commit === 'unpublish' ? 'unpublished' : 'saved',
        onSaved: (state) => {
          setReviewNote('');
          accept(state);
          if (commit === 'publish') {
            const next = formOf(state.post.slug, state.content);
            setSaved(next);
            if (JSON.stringify(latestForm.current) === submitted) apply(next);
          }
        },
      });
      return result.ok;
    } finally {
      inflight.current = false;
    }
  };

  const handleDelete = () => {
    if (!address) return;
    deleteWithUndo({
      key: recordKey('post', address),
      label: 'Post deleted',
      send: ({ keepalive }) => adminRequest(api(blogPaths.post(address)), { method: 'DELETE', keepalive }),
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

  const disabled = Boolean(loadError);
  const line = statusLine({ ...status, dirty, idle: newDraft ? 'Not saved yet' : 'All changes saved' });
  const draftInputHint = dirty && !saving && !status.failure
    ? !title.trim() ? (newDraft ? 'Add a title to start autosave.' : 'Add a title to resume autosave.')
      : !validAddress ? 'Fix the address in Post settings to resume autosave.'
      : moving ? 'Save to move the post to its new address.'
      : null
    : null;
  const staged = Boolean(record && record.documents[0]?.id !== record.publishedDocumentId);
  const publishedCurrent = published && !dirty && !staged;
  const cover = safeCover(imageUrl);
  const settingsRow = (id: string) => id === 'blog-slug' || id === 'blog-description';
  const checklist = (): PublicationChecklistRow[] => {
    const rows: PublicationChecklistRow[] = [];
    if (!title.trim()) rows.push({ severity: 'error', code: 'invalid-story', path: 'title', selectionId: 'blog-title', where: 'Title', what: 'Add a title so readers can identify the post.' });
    if (!validAddress) rows.push({ severity: 'error', code: 'invalid-story', path: 'slug', selectionId: 'blog-slug', where: 'Post settings', what: 'Use lowercase words separated by hyphens for the address.' });
    if (!content.replace(/<[^>]*>|&nbsp;/g, '').trim() && !/<(?:img|hr|blog-)/i.test(content)) rows.push({ severity: 'warning', code: 'empty-visible-content', path: 'content', selectionId: 'blog-content', where: 'Body', what: 'This post has no written content yet.' });
    if (!description.trim()) rows.push({ severity: 'warning', code: 'empty-visible-content', path: 'description', selectionId: 'blog-description', where: 'Post settings', what: 'A summary helps readers decide whether to open the post.' });
    return rows;
  };
  const openSettings = (trigger: HTMLElement | null) => {
    settingsTrigger.current = trigger;
    setSettingsOpen(true);
  };
  const moreMenu = (mobile: boolean) => <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild><button type="button" className={barIconButton} aria-label="More editor options" title="More"><Ellipsis aria-hidden="true" /></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className={adminMenuContentClass} align="end" collisionPadding={12} sideOffset={12}>
      {mobile && <>
        <DropdownMenu.Item className={adminMenuItemClass} onSelect={() => openSettings(document.activeElement as HTMLElement)}><Settings2 aria-hidden="true" size={16} />Post settings…</DropdownMenu.Item>
        <DropdownMenu.Item className={adminMenuItemClass} disabled={!history.undo} onSelect={() => historyAction.current?.('undo')}>Undo</DropdownMenu.Item>
        <DropdownMenu.Item className={adminMenuItemClass} disabled={!history.redo} onSelect={() => historyAction.current?.('redo')}>Redo</DropdownMenu.Item>
      </>}
      {!preview && !disabled && tools.length > 0 && <>
        {mobile && <DropdownMenu.Separator className="my-half border-t border-default" />}
        <DropdownMenu.Group aria-label="Block tools">
          <DropdownMenu.Label className="px-3 font-sans text-sm leading-baseline text-foreground-muted">Block tools</DropdownMenu.Label>
          {tools.map(tool => <DropdownMenu.Item key={tool.key} className={adminMenuItemClass} disabled={!tool.available}
            onSelect={() => { requestAnimationFrame(() => runTool.current?.(tool.key)); }}>{tool.label}</DropdownMenu.Item>)}
        </DropdownMenu.Group>
      </>}
      {published && <DropdownMenu.Item className={adminMenuItemClass} disabled={saving || disabled} onSelect={() => void handleSave('unpublish')}>Unpublish post</DropdownMenu.Item>}
      {address && <DropdownMenu.Item className={`${adminMenuItemClass} text-status-error-text`} disabled={saving || disabled} onSelect={handleDelete}>Delete post</DropdownMenu.Item>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;

  return (
    <div className={styles.page} data-blog-editor="" data-story-document-shell=""
      onCompositionStartCapture={() => setComposing(true)} onCompositionEndCapture={() => setComposing(false)}>
      <EditorialWorkspaceBar backHref={adminPath(config, 'blog')} backLabel="All posts"
        onBack={event => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (!dirty && !saving)) return;
          if (canAutosave || saving) {
            // Save what's there, then leave.
            event.preventDefault();
            setExitAfterSave(true);
          } else if (!window.confirm(LEAVE_MESSAGE)) event.preventDefault();
        }}
        title={title} untitled="Untitled post" saveStatus={draftInputHint ?? line.text}
        publicationStatus={published ? publishedCurrent ? 'Live' : 'Live version is older' : 'Not published'}
        statusStrip={Boolean(status.failure || draftInputHint)} saveState={status.failure ? 'error' : saving ? 'saving' : 'idle'}
        hasUnsavedChanges={dirty} saveDisabled={!canSaveDraft || saving || disabled || (!newDraft && !dirty && !status.failure)}
        saveButtonLabel={saving ? 'Saving…' : status.failure ? 'Retry save' : dirty || newDraft ? 'Save draft' : 'Saved'}
        canUndo={!preview && history.undo} canRedo={!preview && history.redo} runHistoryAction={action => historyAction.current?.(action)}
        view={preview ? 'preview' : 'edit'} changeView={view => { if (!disabled && (view === 'preview') !== preview) togglePreview(); }}
        onSave={() => { if (status.failure?.retry) status.failure.retry(); else void handleSave('save'); }}
        settingsLabel="Post settings" settingsOpen={settingsOpen} onSettings={openSettings} moreMenu={moreMenu}
        renderPublish={compact => <EditorialPublishControl compact={compact} iconOnly={compact} getRows={checklist}
          getIssueAction={row => settingsRow(row.selectionId) ? 'Open settings' : 'Go to text'}
          hasUnsavedChanges={dirty} publishedVersion={published ? 1 : null} latestVersion={record ? 1 : 0}
          isPublishedCurrent={publishedCurrent}
          disabledReason={disabled ? 'This post couldn’t be loaded.' : saving && !status.pending.includes('Publishing…') ? 'Saving the draft…' : null}
          publishing={status.pending.includes('Publishing…')}
          liveHref={published && address ? `${config.siteHref.replace(/\/$/, '')}/blog/${address}` : null}
          publishedUpdates={updates.outstanding > 0 ? { count: updates.outstanding, onReview: updates.openReview } : undefined}
          onPublish={async () => { if (!await handleSave('publish')) throw new Error('Publish failed'); }}
          onShowIssue={row => {
            if (settingsRow(row.selectionId)) openSettings(document.activeElement as HTMLElement);
            else if (preview) togglePreview();
            requestAnimationFrame(() => requestAnimationFrame(() => {
              const target = document.getElementById(row.selectionId);
              (target?.querySelector<HTMLElement>('[contenteditable="true"]') ?? target)?.focus();
            }));
          }} />}
      />
      <div className="mx-auto max-w-[100rem]">
        {loadError && <p role="alert" className="py-half text-sm leading-baseline text-status-error-text">{loadError}</p>}
        {status.failure?.retry && <button type="button" className={styles.moreButton} onClick={status.failure.retry}>Try again</button>}
        {!preview && updates.outstanding > 0 && !updates.dismissed && <PostUpdatesNotice updates={updates} />}
        {!preview && reviewNote && <p role="status" className="mb-minor font-sans text-sm leading-baseline text-foreground-muted">{reviewNote}</p>}
        <PostUpdatesReview updates={updates} draft={draftContent} onApply={bringIn} />
        {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mb-minor" />}

        <div className={styles.readerFrame}>
          {/* Enter in a field never saves or publishes; only the buttons do. */}
          <form onSubmit={(e) => e.preventDefault()}>
            <fieldset ref={writingRef} hidden={preview} onBlurCapture={event => rememberWritingFocus(event.target)}
              disabled={disabled} className="min-w-0" data-blog-authoring="">
              <BlogReaderHeading date={record?.post.createdAt}>
                <textarea ref={titleRef} id="blog-title" aria-label="Post title" rows={1}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault(); }}
                  value={title} onChange={event => handleTitleChange(event.target.value)} placeholder="Post title"
                  className={`${blogReaderTitleClass} ${styles.readerTitle}`} />
              </BlogReaderHeading>
              {cover && <BlogReaderCover cover={cover} title={title} />}
              {!disabled && <div id="blog-content">
                <RelatedTileCatalogContext.Provider value={tileCatalog}><Suspense fallback={editorLoading}>
                  <TiptapEditor key={contentVersion} content={content} onChange={setContent} uploadBodyImage={uploadBodyImage}
                    registerHistory={registerHistory} onHistoryChange={setHistory} registerTools={registerTools} />
                </Suspense></RelatedTileCatalogContext.Provider>
              </div>}
            </fieldset>
          </form>
          {preview && <BlogDraftPreview relatedChoices={tileCatalog.entries} title={title} content={content} imageUrl={imageUrl} headingRef={previewHeading} date={record?.post.createdAt} />}
        </div>

        <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
          <Dialog.Portal><Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.panel} onCloseAutoFocus={event => {
            if (settingsTrigger.current?.isConnected) { event.preventDefault(); settingsTrigger.current.focus(); }
          }}>
            <div className="flex items-center justify-between gap-half">
              <Dialog.Title className="font-sans text-lg font-semibold leading-baseline">Post settings</Dialog.Title>
              <Dialog.Close asChild><button type="button" className={barIconButton} aria-label="Close post settings"><X size={18} aria-hidden="true" /></button></Dialog.Close>
            </div>
            <Dialog.Description className="text-sm leading-baseline text-foreground-muted">How this post appears in the blog listing and when it’s shared.</Dialog.Description>
            <div className="grid min-w-0 gap-half" data-blog-authoring="">
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
                  aria-describedby={moving ? 'blog-slug-moving' : undefined}
                  placeholder="post-slug"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full px-4 py-half rounded-md border border-default bg-card-bg text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-accent-primary font-mono text-sm leading-baseline"
                />
                {moving && <p id="blog-slug-moving" className="mb-0 mt-1 text-sm leading-baseline text-foreground-muted">Save to move the post here{published ? '; its old link stops working' : ''}.</p>}
              </div>

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

              {/* Without an SEO source there's nothing to write the override to. */}
              {seoSource && <div>
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
                    {address ? (
                      <SeoOverrideFields
                        pagePath={`/blog/${address}`}
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
            </div>
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
