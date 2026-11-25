import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { DropdownMenu } from 'radix-ui';
import { ArrowLeft, Check, Ellipsis, Eye, Keyboard, Pencil, Plus, Redo2, Replace, Settings2, SlidersHorizontal, Undo2 } from 'lucide-react';
import {
  DraftConflictError,
  PublicationConflictError,
  StoryMovedError,
  RENAME_UNAVAILABLE_MESSAGES,
  STORY_CHAPTERS,
  isOptionalProjectYear,
  mediaEditorLabel,
  preparePublicStory,
  PROJECT_YEAR_ERROR,
  readingMinutes,
  storyReadingCounts,
  updateStoryBlock,
  updateStoryField,
  withMeasuredAspects,
  type EditorTransport,
  type MediaResolveOptions,
  type Story,
  type StoryBlock,
  type StoryDocument,
  type StoryDraftPath,
  type StoryEditorState,
  type StoryFieldPath,
  type StoryMedia,
} from '@rcweston/story-core';
import {
  StoryPage,
  StoryProvider,
  defaultRenderLink,
  useMediaQuery,
  type BlockRegistry,
  type RenderLink,
  type StoryCompany,
  type StoryProseBlock,
  type StoryRenderEditor,
} from '@rcweston/story-react';
import {
  KeptEditsNotice,
  SaveRequestError,
  SessionEndedDialog,
  explainFailure,
  markSessionEnded,
  useLeaveGuard,
  useSaveShortcut,
} from '@rcweston/save-kit';
import { mediaDisplayLabel } from './StoryBlockEditor.js';
import StoryInspector from './StoryInspector.js';
import ContinuousStoryEditor from './continuous/ContinuousStoryEditor.js';
import EditorBlockHandle, {
  editorMenuContent,
  editorMenuItem,
  editorMenuLabel,
  editorMenuSeparator,
  focusRegion,
  mediaFrameAt,
  mediaItemAt,
  regionElements,
  regionMediaAnchor,
  regionSettingsKind,
  storySelectionLabel,
  type EditorHandleChange,
} from './EditorBlockHandle.js';
import { SettingsPopover, SettingsSheet, type SettingsAnchor } from './EditorDrawer.js';
import EditorPublishButton from './EditorPublishButton.js';
import EditorThemeToggle, { type EditorTheme } from './EditorThemeToggle.js';
import EditorShortcuts from './EditorShortcuts.js';
import EditorFindReplace from './EditorFindReplace.js';
import { useUnsavedRecovery } from './unsaved-recovery.js';
import { flowCaret, pageEditable } from './caret-flow.js';
import { publicationTarget, type PublicationTarget } from './publication-target.js';
import type { PublicationChecklistRow } from './publication-issue-labels.js';
import { STORY_BLOCK_LABELS, withUploadedFile } from './StoryBlockEditor.js';
import { StoryMediaUploadContext, uploadStoryMedia, type StoryMediaUploadTarget } from './media-upload-client.js';
import { EDITOR_UI } from './editing-slots.js';
import {
  blockSelectionId, copiedBlock, copyBlock, copyBlocks, deleteBlockAt, deleteRange, duplicateBlockAt, duplicateRange, locateBlock, locateRange,
  moveRange, pasteBlockAfter, rangeSelectionIds, type StoryBlockChange,
} from './block-actions.js';
import {
  createChapter,
  createStoryBlock,
  createCustomChapter,
  moveChapterRelative,
  createEditorDraftState,
  isStoryDirty,
  moveStoryBlock,
  normalizeStoryForEditor,
  normalizeStoryForSave,
  reconcileStorySelection,
  editorDraftReducer,
} from './model.js';

import { chromeStyles } from './classes.js';
type WorkspaceView = 'edit' | 'preview';

const LEAVE_STORY_MESSAGE = 'You have unsaved changes to this story. Leave this page and discard them?';

/** What a failure carries, whichever transport threw it: the core error
 *  classes, or a request error with an HTTP status and a code. */
interface TransportFailure { name?: string; status?: number; code?: string; movedTo?: string }
const failureFields = (reason: unknown): TransportFailure => {
  if (!reason || typeof reason !== 'object') return {};
  const failure = reason as TransportFailure & { body?: { code?: string; movedTo?: string } };
  return { name: failure.name, status: failure.status, code: failure.code ?? failure.body?.code, movedTo: failure.movedTo ?? failure.body?.movedTo };
};

/** Where a story moved to, when the failure says it did. */
function movedTo(reason: unknown): string | null {
  if (reason instanceof StoryMovedError) return reason.movedTo;
  const { code, movedTo: to } = failureFields(reason);
  return code === 'STORY_MOVED' && typeof to === 'string' && to ? to : null;
}

const isMissing = (reason: unknown) => {
  const { name, status, code } = failureFields(reason);
  return name === 'StoryNotFoundError' || status === 404 || code === 'NOT_FOUND';
};

/** A newer version, or a changed publication, got there first. */
const isConflict = (reason: unknown) => {
  if (movedTo(reason)) return false;
  if (reason instanceof DraftConflictError || reason instanceof PublicationConflictError) return true;
  const { status, code } = failureFields(reason);
  return status === 409 && code !== 'ADDRESS';
};

/** The kinds save-kit explains the same way everywhere: an ended session, no
 *  connection, a file too large, a server fault. */
function saveKitFailure(reason: unknown): unknown {
  if (reason instanceof SaveRequestError) return reason;
  if (reason instanceof TypeError) return new SaveRequestError('offline', null, null);
  const { status, code } = failureFields(reason);
  if (typeof status !== 'number') return reason;
  if (status === 0) return new SaveRequestError('offline', 0, null);
  if (status === 401 || status === 403 || code === 'UNAUTHORIZED') return new SaveRequestError('session', status, null);
  if (status === 413) return new SaveRequestError('too-large', status, reason instanceof Error ? reason.message : null);
  if (status >= 500) return new SaveRequestError('server', status, null);
  return reason;
}

const endedSession = (reason: unknown) => {
  const failure = saveKitFailure(reason);
  return failure instanceof SaveRequestError && failure.kind === 'session';
};

/** A failed save or publish in plain words. */
function storyFailure(reason: unknown, fallback: string, done = 'saved') {
  const failure = saveKitFailure(reason);
  if (failure instanceof SaveRequestError || failure instanceof Error) return explainFailure(failure, done);
  return fallback;
}

/** A point riding on `element` (offset from its top-left), so a popover
 *  opened from a click on large media stays where the click was as the page
 *  scrolls, instead of flipping around a frame taller than the viewport. */
function imageSettingsTriggerKey(button: HTMLElement | null): string | null {
  if (!button?.hasAttribute('data-story-image-settings-trigger')) return null;
  const blockId = button.dataset.storyImageSettingsTrigger;
  const section = button.closest<HTMLElement>('[data-section-key]')?.dataset.sectionKey;
  // New images already have IDs even before Tiptap assigns an origin anchor.
  if (blockId && section) return JSON.stringify(['block', section, blockId]);
  const anchor = button.closest<HTMLElement>('[data-document-asset]')?.dataset.storyBlockAnchor;
  return anchor ? JSON.stringify(['anchor', anchor]) : null;
}

function pointOn(element: HTMLElement, dx: number, dy: number): SettingsAnchor {
  return {
    getBoundingClientRect: () => {
      const rect = element.getBoundingClientRect();
      return new DOMRect(rect.left + Math.min(dx, rect.width), rect.top + Math.min(dy, rect.height), 0, 0);
    },
  };
}

function suspendRootScrollAnchoring() {
  const root = document.documentElement;
  const previousOverflowAnchor = root.style.overflowAnchor;
  const previousScrollBehavior = root.style.scrollBehavior;
  const previousScrollBehaviorPriority = root.style.getPropertyPriority('scroll-behavior');
  root.style.overflowAnchor = 'none';
  root.style.setProperty('scroll-behavior', 'auto', 'important');
  return {
    restore: () => {
      root.style.overflowAnchor = previousOverflowAnchor;
      root.style.setProperty('scroll-behavior', previousScrollBehavior, previousScrollBehaviorPriority);
    },
  };
}

/** A save that stopped (validation, conflict, request) has already put its
 *  reason in the status line; publishing only needs to know it didn't happen. */
class DraftNotSavedError extends Error {}

/* The bar reads as a document toolbar, not a control panel: sentence-case
   sans labels, quiet until hovered, 44px hit areas inside a 48px row. */
const barButton = chromeStyles.editorBarButton;
const barIconButton = chromeStyles.editorBarIconButton;
const barDivider = <span aria-hidden="true" className={chromeStyles.editorPart} />;
const alertButton = chromeStyles.editorAlertButton;
const checkSlot = chromeStyles.editorCheckSlot;

/** Something that stops a save, in plain words, and where it is. */
interface DraftProblem {
  message: string;
  /** The selection to jump to: 'story', 'hero-media', 'hero-graphic' or 'chapter:<key>'. */
  target: string;
}

/** Only what the server refuses for a draft. Blank copy (company, thesis, a
 *  section title) saves: unfinished content never blocks a save. */
function validateEditorDraft(story: Story, expectedSlug: string): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (story.slug !== expectedSlug) problems.push({ message: `The address has to stay “${expectedSlug}”. Change it in Story settings.`, target: 'story' });
  if (!isOptionalProjectYear(story.projectYear)) problems.push({ message: PROJECT_YEAR_ERROR, target: 'hero-meta' });
  if (!story.title.trim()) problems.push({ message: 'Give the story a title.', target: 'story' });
  if (story.chapters.length === 0) problems.push({ message: 'Add at least one section.', target: 'story' });
  const linkPattern = /^(?:\/|https?:\/\/)/;
  const checkMedia = (media: Story['hero'], where: string, target: string) => {
    if (media?.link && !linkPattern.test(media.link.href)) {
      problems.push({ message: `The link on ${where} needs an address that starts with / or https://.`, target });
    }
  };
  checkMedia(story.hero, 'the hero image', 'hero-media');
  checkMedia(story.heroGraphic, 'the hero graphic', 'hero-graphic');
  story.chapters.forEach((chapter) => chapter.blocks.forEach((block) => {
    const where = `an image in “${chapter.title.trim() || 'Untitled section'}”`;
    const target = `chapter:${chapter.key}`;
    if (block.type === 'media') checkMedia(block.media, where, target);
    if (block.type === 'gallery') block.items.forEach((media) => checkMedia(media, where, target));
    if (block.type === 'decision') checkMedia(block.media, where, target);
  }));
  return problems;
}

/** What the reader will get, from the current editor state (unsaved edits
 *  included). Its links open in a new tab, so trying one never leaves the
 *  editor or asks to discard the draft; a #anchor still jumps in place.
 *  Authored CTA buttons show their settings without navigating. */
function DraftPreview({ story, company, blocks, media }: { story: Story; company?: StoryCompany | null; blocks: BlockRegistry; media: MediaResolveOptions }) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const openInNewTab = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (link instanceof HTMLAnchorElement && link.hasAttribute('data-story-cta-editor')) { event.preventDefault(); return; }
      if (!(link instanceof HTMLAnchorElement) || link.getAttribute('href')?.startsWith('#') || link.target === '_blank' || link.hasAttribute('download')) return;
      event.preventDefault();
      window.open(link.href, '_blank', 'noopener,noreferrer');
    };
    const keepCtaInEditor = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[data-story-cta-editor]')) event.preventDefault();
    };
    section.addEventListener('click', openInNewTab);
    section.addEventListener('auxclick', keepCtaInEditor);
    return () => {
      section.removeEventListener('click', openInNewTab);
      section.removeEventListener('auxclick', keepCtaInEditor);
    };
  }, []);
  const prepared = useMemo(() => preparePublicStory(story, { ...media, customBlocks: Object.keys(blocks) }), [blocks, media, story]);
  return (
    // Same gutter as the editing canvas, so toggling Edit / Preview doesn't
    // shift the page sideways. A size container: full-width bands span this,
    // not the window.
    <section ref={sectionRef} aria-label="Draft preview" data-story-draft-preview className={chromeStyles.editorDraftPreview}>
      <StoryPage story={prepared} company={company} embedded />
    </section>
  );
}

const NO_BLOCKS: BlockRegistry = {};
const NO_MEDIA: MediaResolveOptions = {};

export interface StoryEditorProps {
  /** The story's address, as your transport knows it. */
  slug: string;
  /** Every load, save, publish, rename and upload goes through this. */
  transport: EditorTransport;
  /** Open with this state instead of loading it first (e.g. rendered on the server). */
  initialState?: StoryEditorState;
  /** Go to another page of your app: a renamed story's new editor address,
   *  or the address a moved story now lives at. Without it the editor follows
   *  a rename in place. */
  navigate?: (href: string) => void;
  /** Where things live in your app. `editor` is this editor's address for a
   *  slug (used with `navigate`); `reader` is the published page (the
   *  publish menu's "View live"). */
  routes?: { editor?: (slug: string) => string; reader?: (slug: string) => string };
  /** The bar's back link, e.g. `{ href: '/stories', label: 'All stories' }`. */
  backLink?: { href: string; label: string };
  /** Your router's link. Defaults to a plain anchor. */
  renderLink?: RenderLink;
  /** Components for `custom` blocks, by name. */
  blocks?: BlockRegistry;
  /** Where uploaded media loads from. */
  media?: MediaResolveOptions;
  /** The company as your app knows it (display name and logo). */
  company?: StoryCompany | null;
  /** Your sign-in form, shown over the page when a save finds the session ended. */
  renderSignIn?: (props: { onSignedIn: () => void }) => ReactNode;
  /** Light or dark for the writing surface; the toggle shows when both are given. */
  theme?: EditorTheme;
  onThemeChange?: (theme: EditorTheme) => void;
  /** A small tag beside the title and a line in the More menu, e.g. a demo
   *  that saves in the tab: `{ badge: 'Demo', note: 'Saves stay in this tab' }`. */
  label?: { badge: string; note: string };
  initialView?: WorkspaceView;
  /** Start in continuous writing instead of block tools. */
  continuousMode?: boolean;
  /** Open Story settings on load. */
  initialSettingsOpen?: boolean;
  /** A one-off status line for the first load (e.g. "Address changed"). */
  initialNotice?: string;
  /** Called with every state the transport answers (load, save, publish, rename). */
  onStateChange?: (state: StoryEditorState) => void;
}

const NEW_STORY_FALLBACK = (slug: string): Story => ({
  slug,
  company: '',
  title: '',
  thesis: '',
  facts: [],
  glance: { situation: '', task: '', action: '', result: '' },
  chapters: STORY_CHAPTERS.map(({ key }) => createChapter(key)),
});

export default function StoryEditor({
  slug: initialSlug,
  transport,
  initialState,
  navigate,
  routes,
  backLink,
  renderLink = defaultRenderLink,
  blocks = NO_BLOCKS,
  media = NO_MEDIA,
  company,
  renderSignIn,
  theme,
  onThemeChange,
  label,
  initialView = 'edit',
  continuousMode: initialContinuousMode = false,
  initialSettingsOpen = false,
  initialNotice,
  onStateChange,
}: StoryEditorProps) {
  // Without `navigate`, a rename moves the editor in place.
  const [slug, setSlug] = useState(initialSlug);
  useEffect(() => setSlug(initialSlug), [initialSlug]);
  const [response, setResponseState] = useState<StoryEditorState | null>(initialState ?? null);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => { onStateChangeRef.current = onStateChange; });
  const setResponse = useCallback((next: StoryEditorState) => {
    setResponseState(next);
    onStateChangeRef.current?.(next);
  }, []);
  const [editor, dispatch] = useReducer(
    editorDraftReducer,
    initialState?.story ? normalizeStoryForEditor(initialState.story) : null,
    (story) => createEditorDraftState(story ?? NEW_STORY_FALLBACK(initialSlug)),
  );
  const [loading, setLoading] = useState(!initialState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState<WorkspaceView>(initialView);
  const [continuousMode, setContinuousMode] = useState(initialContinuousMode);
  const [selectedId, setSelectedId] = useState('story');
  const [conflict, setConflict] = useState<StoryEditorState | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [continuousError, setContinuousError] = useState<string | null>(null);
  const continuousErrorRef = useRef<string | null>(null);
  const [inlineDirty, setInlineDirty] = useState(false);
  // A structure change's status line ("Deleted — ⌘Z to undo") lasts exactly as
  // long as the story it produced: the next edit, undo or save replaces it.
  const [notice, setNotice] = useState<{ text: string; story: Story } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const shortcutsReturnRef = useRef<HTMLElement | null>(null);
  const [regionSettings, setRegionSettings] = useState<{ id: string; open: boolean; side?: 'bottom' | 'right'; item?: number; initialFocus?: string }>({ id: 'story', open: false });
  const [storySettings, setStorySettings] = useState<{ id: string; open: boolean; initialFocus?: string }>({ id: 'story', open: initialSettingsOpen });
  const [addRequest, setAddRequest] = useState(0);
  const [actionsRequest, setActionsRequest] = useState(0);
  const [mobileMenu, setMobileMenu] = useState<'add' | 'actions' | null>(null);
  const pendingInlineRef = useRef<{ path: StoryFieldPath; value: string; changed: boolean; resolvePath?: StoryDraftPath } | null>(null);
  const saveInlineSnapshotRef = useRef<typeof pendingInlineRef.current>(null);
  const saveInFlightRef = useRef<Promise<StoryDocument | null> | null>(null);
  const publishInFlightRef = useRef(false);
  const responseRef = useRef(response);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const continuousFocusTextRef = useRef<((node: HTMLElement) => boolean) | null>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const settingsAnchorRef = useRef<SettingsAnchor | null>(null);
  const settingsReturnRef = useRef<HTMLElement | null>(null);
  const continuousCanvasRef = useRef<HTMLDivElement>(null);
  const imageSettingsReturnKey = useRef<string | null>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const desktopMoreRef = useRef<HTMLButtonElement>(null);
  const viewTransitionCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => viewTransitionCleanupRef.current?.(), []);
  // Region settings float beside the page from tablet up; a phone gets a sheet.
  const popoverSettings = useMediaQuery('(min-width: 768px)');
  const dirty = isStoryDirty(editor);
  const hasUnsavedChanges = dirty || inlineDirty;
  const recovery = useUnsavedRecovery({
    slug,
    ready: Boolean(response),
    story: editor.story,
    savedStory: editor.savedStory,
    base: response?.documents[0]?.id ?? null,
    dirty,
  });
  const hasUnsavedChangesRef = useRef(false);

  useEffect(() => {
    responseRef.current = response;
  }, [response]);

  /** A story renamed away from this address follows it (with `navigate`);
   *  an address with nothing at it says so. Returns whether the failure was
   *  about the address rather than the request. */
  const followAddress = useCallback((reason: unknown): boolean => {
    const to = movedTo(reason);
    if (to) {
      if (navigate && routes?.editor) navigate(routes.editor(to));
      else setSlug(to);
      return true;
    }
    if (isMissing(reason)) {
      setMissing(true);
      return true;
    }
    return false;
  }, [navigate, routes]);

  const loadState = useCallback(async (signal?: AbortSignal, message?: string) => {
    try {
      const data = await transport.load(slug, { signal });
      if (signal?.aborted) return;
      setResponse(data);
      dispatch({ type: 'reset', story: normalizeStoryForEditor(data.story), message });
      setMissing(false);
      setLoadError(null);
      setLoading(false);
    } catch (reason) {
      if (signal?.aborted) return;
      // Moving on to the new address keeps the loading line up meanwhile.
      const followed = followAddress(reason);
      if (followed && movedTo(reason)) return;
      if (!followed) {
        if (endedSession(reason)) markSessionEnded(() => void loadState(undefined, message));
        setLoadError(storyFailure(reason, 'The story couldn’t be loaded.', 'loaded'));
      }
      setLoading(false);
    }
  }, [followAddress, setResponse, slug, transport]);

  const load = () => loadState();

  const loadedSlugRef = useRef(initialState ? slug : null);
  useEffect(() => {
    if (loadedSlugRef.current === slug) return;
    loadedSlugRef.current = slug;
    const controller = new AbortController();
    void loadState(controller.signal, initialNotice);
    return () => controller.abort();
  }, [initialNotice, loadState, slug]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // save-kit's leave guard (close tab, Back, links). The draft preview opens
  // its links in a new tab (DraftPreview); the editor's own Back link checks
  // committed state and the focused inline draft itself
  // (data-unsaved-guarded), so neither prompts here.
  useLeaveGuard(hasUnsavedChanges, {
    message: LEAVE_STORY_MESSAGE,
    ignoreWithin: 'data-story-draft-preview',
  });

  const [canvasHistoryRevision, setCanvasHistoryRevision] = useState(0);
  const runHistoryAction = useCallback((type: 'undo' | 'redo') => {
    const targetStory = type === 'undo'
      ? editor.inlineBase ?? editor.past.at(-1)
      : editor.future[0];
    if (targetStory) {
      setSelectedId((current) => reconcileStorySelection(targetStory, current));
    }
    if (continuousMode) {
      if (targetStory) setCanvasHistoryRevision(revision => revision + 1);
      dispatch({ type: 'canvas-history', direction: type });
    } else dispatch({ type });
  }, [continuousMode, editor.future, editor.inlineBase, editor.past]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.matches('input, textarea, select')) return;
      event.preventDefault();
      runHistoryAction(event.shiftKey ? 'redo' : 'undo');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runHistoryAction]);

  const openStorySettings = (returnFocus: Element | null, initialFocus?: string) => {
    settingsReturnRef.current = returnFocus instanceof HTMLElement ? returnFocus : null;
    setRegionSettings((current) => ({ ...current, open: false }));
    setStorySettings({ id: 'story', open: true, initialFocus });
  };

  /** Open a region's settings: a popover from tablet up, a bottom sheet on
   *  phones; 'story' opens the dialog. The popover points at the handle when
   *  `anchor` is null; media anchors point at `point` (a click) or just inside
   *  the frame's visible top-left. `item` is the image clicked in a group. */
  const openSettings = (id: string, anchor: HTMLElement | null, returnFocus: HTMLElement | null, point?: { x: number; y: number }, item?: number, initialFocus?: string) => {
    if (id === 'story') {
      openStorySettings(returnFocus, initialFocus);
      return;
    }
    const assetControl = continuousMode && anchor && anchor === returnFocus && locateBlock(editor.story, id)?.block.type === 'media';
    if (assetControl) {
      settingsAnchorRef.current = anchor;
    } else if (anchor) {
      const rect = anchor.getBoundingClientRect();
      settingsAnchorRef.current = point
        ? pointOn(anchor, point.x - rect.left, point.y - rect.top)
        // Below the 48px bar even when the frame starts above the viewport.
        : pointOn(anchor, 24, Math.max(24, 72 - rect.top));
    } else {
      settingsAnchorRef.current = gripRef.current;
    }
    settingsReturnRef.current = returnFocus;
    imageSettingsReturnKey.current = continuousMode ? imageSettingsTriggerKey(returnFocus) : null;
    setSelectedId(id);
    setRegionSettings({ id, open: true, side: anchor && !assetControl ? 'right' : 'bottom', item, initialFocus });
  };

  const findReplacementImageSettingsTrigger = () => {
    const key = imageSettingsReturnKey.current;
    const canvas = continuousCanvasRef.current;
    if (!key || !canvas || canvas.hidden) return null;
    // Tiptap can replace the node view while the sheet is open. A media
    // title or sibling index does not identify the block that opened it.
    const matches = [...canvas.querySelectorAll<HTMLButtonElement>('button[data-story-image-settings-trigger]')]
      .filter(button => !button.disabled && !button.closest('[hidden], [inert]')
        && imageSettingsTriggerKey(button) === key);
    return matches.length === 1 ? matches[0] : null;
  };

  // ⌥E opens the selected region's block menu, where its settings now live.
  // On a Mac, Option+E is the accent dead key (é): inside text it must keep
  // typing accents, so there only a literal "e" (other platforms) counts;
  // elsewhere the physical key does.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const inText = Boolean(target?.isContentEditable || target?.matches('input, textarea, select'));
      if (event.key.toLowerCase() !== 'e' && (inText || event.code !== 'KeyE')) return;
      event.preventDefault();
      if (view === 'edit' && regionElements(pageRef.current, selectedId).length > 0) setActionsRequest((count) => count + 1);
      else openStorySettings(document.activeElement);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const applyStory = (story: Story, history: 'record' | 'merge' = 'merge') => {
    setValidationErrors([]);
    dispatch({ type: 'edit', story, history });
  };

  const setContinuousValidity = useCallback((error: string | null) => {
    continuousErrorRef.current = error;
    setContinuousError(error);
  }, []);

  const applyHandleChange = ({ story, select, notice: text }: EditorHandleChange) => {
    applyStory(story, 'record');
    setSelectedId(reconcileStorySelection(story, select));
    setNotice({ text, story });
  };

  // ⌘/ lists every shortcut and ⌘⇧F finds and replaces, from anywhere in the
  // editor, text included.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.isComposing) return;
      // The key, or the physical key on layouts where ⌘/ types something else.
      const sheet = !event.shiftKey && (event.key === '/' || event.code === 'Slash') ? 'shortcuts'
        : event.shiftKey && event.code === 'KeyF' ? 'find'
          : null;
      if (!sheet) return;
      event.preventDefault();
      shortcutsReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (sheet === 'shortcuts') setShortcutsOpen(true);
      else setFindOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* Several blocks: shift-click, or ⇧↑ / ⇧↓ from a selected block, selects a
     run in one section. It lasts while the selection stays inside it, so a
     plain click anywhere else ends it without any bookkeeping. */
  const [rangeIds, setRangeIds] = useState<string[]>([]);
  const rangeAnchorRef = useRef<string | null>(null);
  const activeRange = rangeIds.length > 1 && rangeIds.includes(selectedId) ? rangeIds : [];
  const extendSelection = (target: string) => {
    const anchor = activeRange.length && rangeAnchorRef.current ? rangeAnchorRef.current : selectedId;
    const range = locateRange(editor.story, anchor, target);
    setSelectedId(target);
    if (!range || range.blocks.length < 2) {
      setRangeIds([]);
      return;
    }
    rangeAnchorRef.current = anchor;
    setRangeIds(rangeSelectionIds(range));
    setNotice({ text: `${range.blocks.length} blocks selected — ⌫ delete · ⌘C copy · ⌘D duplicate · Esc to clear`, story: editor.story });
  };

  // The run is drawn on the page itself (the reader styles), block by block.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const marked = activeRange.flatMap((id) => regionElements(page, id));
    marked.forEach((element) => { element.dataset.storyMultiSelected = ''; });
    return () => marked.forEach((element) => { delete element.dataset.storyMultiSelected; });
  });

  // Shift-click on a block (outside its text, where shift-click extends the
  // text selection) extends the run to it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view !== 'edit') return;
    const onClick = (event: MouseEvent) => {
      if (!event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.isContentEditable || target.closest('[contenteditable="true"], input, textarea, select, button, a')) return;
      const region = target.closest<HTMLElement>('[data-story-editor-id^="block:"]');
      const id = region?.dataset.storyEditorId;
      if (!id || !locateBlock(editor.story, selectedId)) return;
      event.preventDefault();
      event.stopPropagation();
      extendSelection(id);
    };
    canvas.addEventListener('click', onClick, true);
    return () => canvas.removeEventListener('click', onClick, true);
  });

  // ↑ / ↓ on a text box's first or last line carry on into the next box, so
  // the page reads through like one document. On bubble, after the box's own
  // keys: an open slash menu has already claimed the arrows by then.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view !== 'edit') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.defaultPrevented || event.isComposing) return;
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
      const page = pageRef.current;
      const editable = page && pageEditable(page, event.target);
      if (page && editable && flowCaret(page, editable, event.key === 'ArrowDown' ? 1 : -1)) event.preventDefault();
    };
    canvas.addEventListener('keydown', onKeyDown);
    return () => canvas.removeEventListener('keydown', onKeyDown);
  }, [view]);

  // A selected block's shortcuts, as in a doc editor: ⌘D duplicates, ⌘⇧↑ / ⌘⇧↓
  // move, ⌫ deletes, ⌘C / ⌘X / ⌘V copy, cut and paste below. Only from the
  // canvas and its handle, and never while typing or in a menu, so ⌫ in a
  // field or on a toolbar button is just ⌫. The block menu shows each one.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (view !== 'edit' || event.isComposing || event.defaultPrevented || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target || target.isContentEditable || target.matches('input, textarea, select') || target.closest('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      if (target !== document.body && !canvasRef.current?.contains(target)) return;
      const at = locateBlock(editor.story, selectedId);
      if (!at) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      // ⇧↑ / ⇧↓ grow or shrink the run by one block, as text selection does.
      if (!mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const blocks = editor.story.chapters[at.chapterIndex].blocks;
        const next = blocks[at.blockIndex + (event.key === 'ArrowUp' ? -1 : 1)];
        if (!next) return;
        event.preventDefault();
        extendSelection(blockSelectionId(at.chapterKey, next, blocks.indexOf(next)));
        return;
      }
      const range = activeRange.length > 1 ? locateRange(editor.story, activeRange[0], activeRange[activeRange.length - 1]) : null;
      if (range) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setRangeIds([]);
          return;
        }
        let change: (StoryBlockChange & { notice: string }) | null = null;
        let keep: string[] = [];
        const count = `${range.blocks.length} blocks`;
        if (mod && !event.shiftKey && key === 'd') {
          const duplicated = duplicateRange(editor.story, range);
          change = { ...duplicated, notice: `${count} duplicated — ⌘Z to undo` };
          keep = duplicated.ids;
        } else if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          const moved = moveRange(editor.story, range, event.key === 'ArrowUp' ? -1 : 1);
          if (!moved) { event.preventDefault(); return; }
          change = { ...moved, select: selectedId, notice: `${count} moved ${event.key === 'ArrowUp' ? 'up' : 'down'}` };
          keep = activeRange;
        } else if (!mod && !event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
          change = { ...deleteRange(editor.story, range), notice: `${count} deleted — ⌘Z to undo` };
        } else if (mod && !event.shiftKey && key === 'c') {
          event.preventDefault();
          copyBlocks(range.blocks);
          setNotice({ text: `${count} copied — ⌘V pastes them below a block`, story: editor.story });
          return;
        } else if (mod && !event.shiftKey && key === 'x') {
          copyBlocks(range.blocks);
          change = { ...deleteRange(editor.story, range), notice: `${count} cut — ⌘V pastes them below a block` };
        }
        if (!change) return;
        event.preventDefault();
        applyHandleChange(change);
        if (keep.length) {
          rangeAnchorRef.current = keep[0];
          setRangeIds(keep);
          setSelectedId(keep[keep.length - 1]);
        } else {
          setRangeIds([]);
        }
        window.requestAnimationFrame(() => gripRef.current?.focus({ preventScroll: true }));
        return;
      }
      const label = STORY_BLOCK_LABELS[at.block.type];
      let change: (StoryBlockChange & { notice: string }) | null = null;
      if (mod && !event.shiftKey && key === 'd') change = { ...duplicateBlockAt(editor.story, at), notice: 'Duplicated — ⌘Z to undo' };
      else if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const moved = moveStoryBlock(editor.story, at.chapterIndex, at.blockIndex, event.key === 'ArrowUp' ? -1 : 1);
        if (!moved) { event.preventDefault(); return; }
        const chapterKey = moved.story.chapters[moved.chapterIndex].key;
        change = { story: moved.story, select: blockSelectionId(chapterKey, at.block, moved.blockIndex), notice: moved.chapterIndex === at.chapterIndex ? `Moved ${event.key === 'ArrowUp' ? 'up' : 'down'}` : 'Moved to the next section' };
      } else if (!mod && !event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
        change = { ...deleteBlockAt(editor.story, at), notice: 'Deleted — ⌘Z to undo' };
      } else if (mod && !event.shiftKey && key === 'c') {
        // Text selected on the page copies as text, as anywhere else.
        if (window.getSelection()?.toString()) return;
        event.preventDefault();
        copyBlock(at.block);
        setNotice({ text: `${label} copied — ⌘V pastes it below a block`, story: editor.story });
        return;
      } else if (mod && !event.shiftKey && key === 'x') {
        copyBlock(at.block);
        change = { ...deleteBlockAt(editor.story, at), notice: 'Cut — ⌘V pastes it below a block' };
      } else if (mod && !event.shiftKey && key === 'v' && copiedBlock()) {
        const pasted = pasteBlockAfter(editor.story, at);
        if (pasted) change = { ...pasted, notice: 'Pasted below — ⌘Z to undo' };
      }
      if (!change) return;
      event.preventDefault();
      applyHandleChange(change);
      // Keep the keyboard on the block controls, so shortcuts chain.
      window.requestAnimationFrame(() => gripRef.current?.focus({ preventScroll: true }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const addSection = () => {
    const chapter = createCustomChapter();
    const story = { ...editor.story, chapters: [...editor.story.chapters, chapter] };
    applyStory(story, 'record');
    setSelectedId(`chapter:${chapter.key}`);
    setNotice({ text: 'Section added — name it on the page', story });
    window.requestAnimationFrame(() => {
      const section = pageRef.current?.querySelector<HTMLElement>(`[data-story-editor-id="chapter:${chapter.key}"]`);
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      section?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
    });
  };

  // Uploads finish after later edits; they land on the story as it is then.
  const latestStoryRef = useRef(editor.story);
  useEffect(() => { latestStoryRef.current = editor.story; });

  /** A block placed where the caret split a prose block: the text before it
   *  keeps the prose block's identity, the text after becomes a new one.
   *  The typing that led here is kept as its own step, then this is one.
   *  Returns the new block's selection id. */
  const insertAroundProse = (chapterIndex: number, blockIndex: number, { before, after }: { before: StoryProseBlock | null; after: StoryProseBlock | null }, inserted: StoryBlock, notice: string): string | null => {
    const chapter = editor.story.chapters[chapterIndex];
    const current = chapter?.blocks[blockIndex];
    if (!chapter || current?.type !== 'prose') return null;
    pendingInlineRef.current = null;
    setInlineDirty(false);
    dispatch({ type: 'inline-commit' });
    const replacement: StoryBlock[] = [
      ...(before ? [{ ...before, id: current.id }] : []),
      inserted,
      ...(after ? [{ ...after, id: createStoryBlock('prose').id, hidden: undefined }] : []),
    ];
    const story = { ...editor.story, chapters: editor.story.chapters.map((item, at) => (at === chapterIndex
      ? { ...item, blocks: [...item.blocks.slice(0, blockIndex), ...replacement, ...item.blocks.slice(blockIndex + 1)] }
      : item)) };
    const id = `block:${chapter.key}:${inserted.id}`;
    dispatch({ type: 'edit', story, history: 'record' });
    setSelectedId(id);
    setNotice({ text: notice, story });
    window.requestAnimationFrame(() => focusRegion(pageRef.current, id, gripRef.current));
    return id;
  };

  const renderEditor: StoryRenderEditor = {
    selectedId,
    onSelect: setSelectedId,
    onTextInput: (path, value) => dispatch({ type: 'edit', story: updateStoryField(editor.story, path, value), history: 'merge' }),
    onTextDraftChange: (path, value, changed, resolvePath) => {
      pendingInlineRef.current = { path: [...path], value, changed, resolvePath };
      setInlineDirty(changed);
    },
    onTextEditStart: () => {
      pendingInlineRef.current = null;
      setInlineDirty(false);
      dispatch({ type: 'inline-start' });
    },
    onTextEditEnd: () => {
      pendingInlineRef.current = null;
      setInlineDirty(false);
      dispatch({ type: 'inline-commit' });
    },
    onTextEditLeave: () => {
      // Escape keeps what was typed (the text commits as on blur) and returns
      // the author to the selected block's controls instead of dropping focus
      // on <body>, so keyboard and switch users can continue.
      window.requestAnimationFrame(() => gripRef.current?.focus({ preventScroll: true }));
    },
    onBlockInput: (chapterIndex, blockIndex, block) => dispatch({ type: 'edit', story: updateStoryBlock(editor.story, chapterIndex, blockIndex, block), history: 'merge' }),
    onInsertBlock: (chapterIndex, blockIndex, type, split) => {
      insertAroundProse(chapterIndex, blockIndex, split, createStoryBlock(type), `Added ${STORY_BLOCK_LABELS[type]} — ⌘Z to undo`);
    },
    onInsertFiles: (chapterIndex, blockIndex, files, split) => {
      const slots = files.map((file): StoryMedia => ({ kind: file.type.startsWith('video/') ? 'video' : 'image', alt: '' }));
      const blockId = createStoryBlock('prose').id;
      const block: StoryBlock = slots.length === 1
        ? { id: blockId, type: 'media', media: slots[0], width: 'wide' }
        : { id: blockId, type: 'gallery', layout: slots.length > 3 ? 'grid' : 'horizontal', items: slots };
      const noun = files.length === 1 ? (slots[0].kind === 'video' ? 'video' : 'image') : `${files.length} files`;
      const id = insertAroundProse(chapterIndex, blockIndex, split, block, `Uploading ${noun}…`);
      if (!id) return;
      // Each file fills its own slot when it's done, on the story as it is
      // then; an insert undone meanwhile has nowhere to land, so it's dropped.
      files.forEach((file, index) => {
        // Same target the media slots use (StoryMediaUploadContext below).
        uploadStoryMedia(file, mediaUploadTarget).then((uploaded) => {
          const latest = latestStoryRef.current;
          const at = locateBlock(latest, id);
          if (!at) return;
          const filled = at.block.type === 'media' ? { ...at.block, media: withUploadedFile(at.block.media, uploaded) }
            : at.block.type === 'gallery' ? { ...at.block, items: at.block.items.map((media, item) => (item === index ? withUploadedFile(media, uploaded) : media)) }
              : null;
          if (!filled) return;
          dispatch({ type: 'edit', story: updateStoryBlock(latest, at.chapterIndex, at.blockIndex, filled), history: 'merge' });
          setNotice({ text: `${file.name} added — describe it in Replace media…`, story: latest });
        }).catch((reason: unknown) => {
          setNotice({ text: `Couldn’t upload ${file.name}: ${reason instanceof Error ? reason.message : 'unknown error'}. Its slot is waiting for a file.`, story: latestStoryRef.current });
        });
      });
    },
    onChapterDrop: (sourceKey, targetKey, placement) => {
      const chapters = moveChapterRelative(editor.story.chapters, sourceKey, targetKey, placement);
      if (chapters.every((chapter, index) => chapter === editor.story.chapters[index])) return;
      const story = { ...editor.story, chapters };
      dispatch({ type: 'edit', story, history: 'record' });
      setSelectedId(`chapter:${sourceKey}`);
      setNotice({ text: 'Section moved — ⌘Z to undo', story });
    },
    ui: EDITOR_UI,
  };

  /** Appends a new version (every save is kept for safekeeping) and returns it,
   *  or null when validation, a conflict or the request stopped it. */
  const saveContent = async (edited: Story, submittedStory: Story): Promise<StoryDocument | null> => {
    if (!response) return null;
    // Media the canvas measured keeps its real shape from now on, so readers
    // get the right frame on first paint.
    const content = withMeasuredAspects(edited);
    const problems = validateEditorDraft(content, slug);
    if (problems.length > 0) {
      setSelectedId(problems[0].target);
      const messages = [...new Set(problems.map((problem) => problem.message))];
      setValidationErrors(messages);
      dispatch({ type: 'save-error', message: `Fix ${messages.length === 1 ? 'one thing' : `${messages.length} things`} before saving` });
      return null;
    }
    setValidationErrors([]);
    dispatch({ type: 'save-start' });
    try {
      const next = await transport.saveDraft({ slug, content, parentDocumentId: response.documents[0]?.id ?? null });
      const document = next.documents[0];
      if (!document) throw new Error('The draft wasn’t saved. Try again.');
      // Publishing straight after a save reads this before React re-renders.
      responseRef.current = next;
      setResponse(next);
      setConflict(null);
      dispatch({ type: 'save-success', story: document.content, submittedStory, version: document.version });
      return document;
    } catch (reason) {
      if (isConflict(reason)) {
        const message = reason instanceof Error ? reason.message : 'This story has a newer draft.';
        try {
          setConflict(await transport.load(slug));
        } catch {
          // The banner needs the newer version; the status line still explains.
        }
        dispatch({ type: 'save-error', message: `${message.replace(/\.$/, '')}. Your unsaved work is still open.` });
        return null;
      }
      // An ended session asks the host's sign-in over the page and saves
      // again once the author is back.
      if (endedSession(reason)) markSessionEnded(() => void saveContent(edited, submittedStory));
      dispatch({ type: 'save-error', message: storyFailure(reason, 'The draft wasn’t saved. Try again.') });
      return null;
    }
  };

  /** Points the reader at an already-saved version. No confirm here: the
   *  publish button's popover is the confirmation. */
  const publishDocument = async (document: StoryDocument) => {
    const base = responseRef.current;
    if (!base) return;
    const readiness = base.readinessByDocumentId[document.id];
    if (readiness && readiness.errors.length > 0) throw new Error(`Fix ${readiness.errors.length} ${readiness.errors.length === 1 ? 'issue' : 'issues'} before publishing.`);
    try {
      const next = await transport.publish({ slug, documentId: document.id, expectedPublishedDocumentId: base.publishedDocumentId });
      responseRef.current = next;
      setResponse(next);
    } catch (reason) {
      if (isConflict(reason)) {
        try {
          setConflict(await transport.load(slug));
        } catch {
          // The status line still explains.
        }
        const message = reason instanceof Error ? reason.message : 'The published version changed.';
        throw new Error(`${message.replace(/\.$/, '')}. Your editor content remains intact.`);
      }
      throw reason;
    }
  };

  const downloadLocalSnapshot = () => {
    const blob = new Blob([JSON.stringify(editor.story, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug}-local-draft.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveCurrentDraft = () => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    if (continuousErrorRef.current) {
      dispatch({ type: 'save-error', message: `Fix the document edit before saving: ${continuousErrorRef.current}` });
      return Promise.resolve(null);
    }
    const pending = pendingInlineRef.current ?? saveInlineSnapshotRef.current;
    saveInlineSnapshotRef.current = null;
    const pendingPath = pending?.resolvePath ? pending.resolvePath(editor.story) : pending?.path;
    const submittedStory = pending?.changed && pendingPath
      ? updateStoryField(editor.story, pendingPath, pending.value)
      : editor.story;
    const content = normalizeStoryForSave(submittedStory);
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.isContentEditable) active.blur();
    const request = saveContent(content, submittedStory);
    saveInFlightRef.current = request;
    void request.finally(() => {
      if (saveInFlightRef.current === request) saveInFlightRef.current = null;
    });
    return request;
  };

  /** One-step publish: save first when there are unsaved changes, then point
   *  the reader at that exact saved version. Rejects on failure so the
   *  publish popover can offer a retry; the status line says why. */
  const publishCurrent = async () => {
    if (!responseRef.current?.publicationEnabled || conflict || publishInFlightRef.current) return;
    if (continuousErrorRef.current) throw new DraftNotSavedError();
    publishInFlightRef.current = true;
    setPublishing(true);
    try {
      const needsSave = hasUnsavedChanges || !responseRef.current.documents[0];
      const document = needsSave ? await saveCurrentDraft() : responseRef.current.documents[0];
      if (!document) throw new DraftNotSavedError();
      await publishDocument(document);
    } catch (reason) {
      if (!(reason instanceof DraftNotSavedError)) {
        if (endedSession(reason)) markSessionEnded();
        dispatch({ type: 'save-error', message: storyFailure(reason, 'Failed to publish this version.', 'published') });
      }
      throw reason;
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
    }
  };

  /** Move the story to a new address. Like Publish, unsaved edits are saved
   *  first: asking would be one more decision with only one sensible answer,
   *  and the story then moves exactly as it reads. Rejects with a plain
   *  message for the address field to show. On success the host navigates to
   *  the new address (with `navigate`), or the editor follows it in place. */
  const changeAddress = async (next: string) => {
    if (hasUnsavedChanges) {
      const saved = await saveCurrentDraft();
      if (!saved) throw new Error('Your changes couldn’t be saved, so the address didn’t change.');
    }
    const base = responseRef.current;
    if (!base) throw new Error('The address couldn’t be changed.');
    let moved: StoryEditorState;
    try {
      moved = await transport.rename({ from: slug, to: next, expectedLatestDocumentId: base.documents[0]?.id ?? null });
    } catch (reason) {
      if (endedSession(reason)) markSessionEnded();
      const failure = saveKitFailure(reason);
      if (failure instanceof SaveRequestError) throw new Error(explainFailure(failure, 'moved'));
      throw new Error(reason instanceof Error && reason.message ? reason.message : 'The address couldn’t be changed. Nothing was moved.');
    }
    if (navigate && routes?.editor) {
      navigate(routes.editor(next));
      return;
    }
    responseRef.current = moved;
    setResponse(moved);
    loadedSlugRef.current = next;
    setSlug(next);
    dispatch({ type: 'reset', story: normalizeStoryForEditor(moved.story), message: 'Address changed' });
    setStorySettings((current) => ({ ...current, open: false }));
  };

  /** Take the author to a publish issue: select the region, bring it into
   *  view, and put the caret in it — or, for media and list fields that
   *  aren't text on the page, open its settings. */
  const revealStoryTarget = (selectionId: string, intent: 'find' | 'issue', target?: PublicationTarget, returnFocus: HTMLElement | null = null, guidance?: string) => {
    viewTransitionCleanupRef.current?.();
    setView('edit');
    setStorySettings((current) => ({ ...current, open: false }));
    setRegionSettings((current) => ({ ...current, open: false }));
    if (!selectionId || selectionId === 'story') {
      if (intent === 'issue') openStorySettings(returnFocus, target?.kind === 'settings' ? target.selector : undefined);
      else setNotice({ text: 'This match is in Story settings.', story: editor.story });
      return;
    }
    setSelectedId(selectionId);
    const story = editor.story;
    const reveal = (attempt: number) => {
      const continuousSelector = selectionId.startsWith('block:')
        ? `[data-story-block-anchor="${CSS.escape(selectionId.slice(6))}"]`
        : selectionId.startsWith('chapter:')
          ? `[data-document-section][data-section-key="${CSS.escape(selectionId.slice(8))}"]`
          : `[data-story-editor-id="${CSS.escape(selectionId)}"]`;
      const element = continuousMode
        ? [...document.querySelectorAll<HTMLElement>(continuousSelector)].find(candidate => candidate.getClientRects().length
          || [...candidate.children].some(child => child.getClientRects().length))
        : regionElements(pageRef.current, selectionId)[0];
      if (!element) {
        if (attempt < 10) window.requestAnimationFrame(() => reveal(attempt + 1));
        else if (intent === 'issue' && target?.kind === 'settings') openSettings(selectionId, null, returnFocus, undefined, target.item, target.selector);
        else if (continuousMode) setNotice({ text: 'This field is available in More → Block tools. Your draft is unchanged.', story });
        else if (intent === 'issue') setNotice({ text: 'That part of the story is no longer on the page. Reopen the checklist for current notes.', story });
        else setNotice({ text: 'This match is not shown on the page. Check Story settings.', story });
        return;
      }
      // Block wrappers are display: contents and can't be scrolled to themselves.
      const sectionTitle = intent === 'find' && selectionId.startsWith('chapter:') ? element.querySelector('h2') : null;
      const box = sectionTitle ?? (getComputedStyle(element).display === 'contents' ? element.firstElementChild ?? element : element);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      box.scrollIntoView({ behavior: intent === 'issue' || reduce ? 'instant' : 'smooth', block: 'center' });
      if (intent === 'find') return;
      if (target?.kind === 'canvas') {
        const field = target.selector ? element.querySelector<HTMLElement>(target.selector) : element;
        const editable = field?.matches('[contenteditable="true"]') ? field : field?.querySelector<HTMLElement>('[contenteditable="true"]');
        if (editable && editable.getClientRects().length) {
          editable.focus({ preventScroll: true });
          return;
        }
        if (field && continuousMode && continuousFocusTextRef.current?.(field)) return;
      }
      if (target?.kind === 'settings' || (target?.kind !== 'section' && regionSettingsKind(story, selectionId))) {
        const anchor = continuousMode ? element : regionMediaAnchor(pageRef.current, selectionId) ?? element;
        openSettings(selectionId, anchor, returnFocus, undefined, target?.kind === 'settings' ? target.item : undefined,
          target?.kind === 'settings' ? target.selector : undefined);
      } else if (box instanceof HTMLElement) {
        if (guidance) setNotice({ text: guidance, story });
        // A section-level note has no missing input. Put the caret on its
        // own heading, not on the unrelated first editable block below it.
        const heading = box.matches('h2,h3,h4,h5,h6') ? box : box.querySelector<HTMLElement>('h2,h3,h4,h5,h6');
        if (heading && continuousMode && continuousFocusTextRef.current?.(heading)) return;
        box.setAttribute('data-publication-highlight', '');
        box.addEventListener('blur', () => box.removeAttribute('data-publication-highlight'), { once: true });
        if (!box.hasAttribute('tabindex')) {
          box.tabIndex = -1;
          box.addEventListener('blur', () => box.removeAttribute('tabindex'), { once: true });
        }
        box.focus({ preventScroll: true });
      }
    };
    window.requestAnimationFrame(() => reveal(0));
  };

  const showIssue = (row: PublicationChecklistRow, returnFocus: HTMLElement | null) =>
    revealStoryTarget(row.selectionId, 'issue', publicationTarget(editor.story, row), returnFocus, row.what);

  // Plain ⌘S only (the shared shortcut): ⌘⇧S is strikethrough in the text.
  useSaveShortcut(() => {
    if (!hasUnsavedChanges || editor.saveState === 'saving' || !response || conflict || continuousErrorRef.current) return;
    void saveCurrentDraft();
  });

  // A file dropped anywhere but an upload target would make the browser open
  // it in place of the editor, taking unsaved work with it. Media slots and
  // the settings drop zone claim their drops first (defaultPrevented); every
  // other drop is refused, with the no-drop cursor.
  useEffect(() => {
    const refuseStrayFile = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', refuseStrayFile);
    window.addEventListener('drop', refuseStrayFile);
    return () => {
      window.removeEventListener('dragover', refuseStrayFile);
      window.removeEventListener('drop', refuseStrayFile);
    };
  }, []);

  // Uploads go through the transport, filed under the story's address.
  // Portalled popovers and sheets inherit this, so one provider covers both.
  const mediaUploadTarget = useMemo<StoryMediaUploadTarget>(
    () => ({ slug: editor.story.slug, upload: (file, context) => transport.uploadMedia(file, context) }),
    [editor.story.slug, transport],
  );

  const environment = (children: ReactNode) => (
    <StoryProvider blocks={blocks} renderLink={renderLink} media={media}>
      <StoryMediaUploadContext.Provider value={mediaUploadTarget}>
        {children}
        {renderSignIn && <SessionEndedDialog renderSignIn={renderSignIn} />}
      </StoryMediaUploadContext.Provider>
    </StoryProvider>
  );

  if (loading) {
    return environment(<p role="status" className={chromeStyles.editorStatus}>Loading the editor…</p>);
  }

  if (missing) {
    // Calm, not an error: most often an address typed from a story's new
    // title, which doesn't change the address by itself.
    return environment(
      <section aria-labelledby="story-missing-title" className={chromeStyles.editorSection}>
        <h1 id="story-missing-title" className={chromeStyles.editorStoryMissingTitle}>
          There’s no story at this address
        </h1>
        <p className={chromeStyles.editorHint}>
          A story keeps its address when its title changes. Open it from your list of stories to change the address in Story settings.
        </p>
        {backLink && renderLink({
          href: backLink.href,
          className: chromeStyles.editorRow,
          children: <><ArrowLeft aria-hidden="true" className={chromeStyles.editorIcon} strokeWidth={1.75} />{backLink.label}</>,
        })}
      </section>,
    );
  }

  if (loadError || !response) {
    return environment(
      <div role="alert" className={chromeStyles.editorAlert}>
        <p className={chromeStyles.editorError}>{loadError ?? 'The story couldn’t be loaded.'}</p>
        <button
          type="button"
          className={`${alertButton} ${chromeStyles.editorButton}`}
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            void load();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const latestDocument = response.documents[0] ?? null;
  const latestVersion = latestDocument?.version ?? 0;
  const publishedDocument = response.documents.find((document) => document.id === response.publishedDocumentId);
  const publishedVersion = publishedDocument?.version ?? null;
  const isPublishedCurrent = response.publishedDocumentId !== null && response.publishedDocumentId === latestDocument?.id && !hasUnsavedChanges;
  const activeNotice = notice?.story === editor.story ? notice.text : null;
  const historyNotice = editor.saveState === 'idle' && editor.message ? editor.message.replace(/\.$/, '') : null;
  const saveStatus = publishing
    ? 'Publishing…'
    : editor.saveState === 'saving'
      ? 'Saving…'
      : editor.saveState === 'error'
        ? editor.message ?? 'Couldn’t save'
        : activeNotice ?? historyNotice ?? (hasUnsavedChanges ? 'Unsaved changes' : latestVersion ? 'Saved' : 'Not saved yet');
  const publicationStatus = publishedVersion === null ? 'Not published' : isPublishedCurrent ? 'Live' : 'Live version is older';
  // Phones have no room beside the title, so there the status drops to a strip
  // under the bar, and only when it says something the buttons don't: an
  // error, or a notice such as "Deleted — ⌘Z to undo".
  const statusStrip = editor.saveState === 'error' || Boolean(activeNotice ?? historyNotice);
  const saveDisabled = !hasUnsavedChanges || editor.saveState === 'saving' || Boolean(conflict) || Boolean(continuousError);
  const saveButtonLabel = editor.saveState === 'saving'
    ? 'Saving…'
    : editor.saveState === 'error' && hasUnsavedChanges
      ? 'Retry save'
      : hasUnsavedChanges
        ? 'Save changes'
        : 'Saved';
  const publishDisabledReason = !response.publicationEnabled
      ? 'Publishing is turned off here'
      : conflict
        ? 'A newer version was saved elsewhere — resolve that first'
        : continuousError
          ? `Fix the document edit before publishing: ${continuousError}`
        : null;
  const liveHref = publishedVersion !== null && routes?.reader ? routes.reader(slug) : null;
  const renameUnavailableReason = conflict
    ? 'A newer version was saved elsewhere — resolve that first.'
    : response.renameAvailable === false
      ? response.renameUnavailableReason ?? RENAME_UNAVAILABLE_MESSAGES.schema
      : null;
  const continuousSettingsBlock = continuousMode && regionSettings.id.startsWith('block:')
    ? locateBlock(editor.story, regionSettings.id)?.block
    : undefined;
  const settingsMedia = continuousSettingsBlock?.type === 'media' ? continuousSettingsBlock.media : undefined;
  const mediaLabel = settingsMedia ? mediaEditorLabel(settingsMedia) : undefined;
  const regionSettingsTitle = continuousSettingsBlock
    ? mediaLabel ? `${mediaLabel} settings` : `${continuousSettingsBlock.type.charAt(0).toUpperCase()}${continuousSettingsBlock.type.slice(1)}`
    : storySelectionLabel(editor.story, regionSettings.id);
  const regionSettingsSubtitle = settingsMedia ? mediaDisplayLabel(settingsMedia, '') : undefined;
  const changeView = (next: WorkspaceView) => {
    if (next === 'preview' && continuousErrorRef.current) {
      dispatch({ type: 'save-error', message: `Fix the document edit before previewing: ${continuousErrorRef.current}` });
      return;
    }
    const pending = pendingInlineRef.current;
    if (next !== 'edit' && pending?.changed) {
      // The focused contenteditable unmounts before its blur handler when the
      // author opens Preview. Apply the staged text first so the preview is
      // the exact draft they were just typing, including soft/hard returns.
      const pendingPath = pending.resolvePath ? pending.resolvePath(editor.story) : pending.path;
      if (pendingPath) dispatch({
        type: 'edit',
        story: updateStoryField(editor.story, pendingPath, pending.value.replace(/\n+$/, '')),
        history: 'merge',
      });
      pendingInlineRef.current = null;
      setInlineDirty(false);
    }
    // Preserve the point the author is actually reading, not merely whichever
    // chapter heading happens to be visible. Slightly below center reflects
    // where a person is reading while the sticky workspace bar stays above.
    const viewportLine = Math.max(96, Math.min(window.innerHeight - 96, window.innerHeight * .55));
    const chapterKeys = new Set(editor.story.chapters.map(chapter => chapter.key));
    const sections = [...document.querySelectorAll<HTMLElement>(view === 'edit' ? '[data-document-section][data-section-key]' : 'section[id]')]
      .filter(element => chapterKeys.has(element.dataset.sectionKey || element.id));
    const section = sections.find(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top <= viewportLine && bounds.bottom > viewportLine;
    }) ?? sections
      .filter(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < window.innerHeight;
      })
      .sort((a, b) => Math.abs(a.getBoundingClientRect().top - viewportLine) - Math.abs(b.getBoundingClientRect().top - viewportLine))[0];
    const sectionKey = section?.dataset.sectionKey || section?.id;
    const sectionBounds = section?.getBoundingClientRect();
    const sectionProgress = sectionBounds
      ? Math.max(0, Math.min(1, (viewportLine - sectionBounds.top) / Math.max(1, sectionBounds.height)))
      : 0;
    const normalizedText = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    const textSelector = 'h1, h2, h3, h4, p, li, figcaption';
    const nearbyText = section
      ? [...section.querySelectorAll<HTMLElement>(textSelector)]
        .filter(element => normalizedText(element) && element.closest('[data-story-block-anchor]'))
        .sort((a, b) => {
          const aBounds = a.getBoundingClientRect();
          const bBounds = b.getBoundingClientRect();
          return Math.abs((aBounds.top + aBounds.bottom) / 2 - viewportLine) - Math.abs((bBounds.top + bBounds.bottom) / 2 - viewportLine);
        })[0]
      : null;
    const nearbyTextBounds = nearbyText?.getBoundingClientRect();
    const nearbyTextBlock = nearbyText && nearbyTextBounds
      && Math.abs((nearbyTextBounds.top + nearbyTextBounds.bottom) / 2 - viewportLine) <= window.innerHeight * .4
      ? nearbyText.closest<HTMLElement>('[data-story-block-anchor]')
      : null;
    const sourceBlocks = section ? [...section.querySelectorAll<HTMLElement>('[data-story-block-anchor]')] : [];
    const sourceBlock = nearbyTextBlock ?? sourceBlocks.find(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top <= viewportLine && bounds.bottom > viewportLine;
    }) ?? sourceBlocks
      .filter(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < window.innerHeight;
      })
      .sort((a, b) => Math.abs(a.getBoundingClientRect().top - viewportLine) - Math.abs(b.getBoundingClientRect().top - viewportLine))[0];
    const blockAnchor = sourceBlock?.dataset.storyBlockAnchor;
    const boundsForAnchor = (root: HTMLElement, anchor: string) => {
      const escaped = CSS.escape(anchor);
      const matches = [...root.querySelectorAll<HTMLElement>(`[data-story-block-anchor="${escaped}"]`)];
      if (!matches.length) return null;
      const rects = matches.map(element => element.getBoundingClientRect());
      const top = Math.min(...rects.map(bounds => bounds.top));
      const bottom = Math.max(...rects.map(bounds => bounds.bottom));
      return { top, height: Math.max(1, bottom - top) };
    };
    const sourceBlockBounds = section && blockAnchor ? boundsForAnchor(section, blockAnchor) : null;
    const blockProgress = sourceBlockBounds
      ? Math.max(0, Math.min(1, (viewportLine - sourceBlockBounds.top) / sourceBlockBounds.height))
      : null;
    const textCandidatesForAnchor = (root: HTMLElement, anchor: string) => {
      const anchored = [...root.querySelectorAll<HTMLElement>(`[data-story-block-anchor="${CSS.escape(anchor)}"]`)];
      return anchored.flatMap(element => [
        ...(element.matches(textSelector) ? [element] : []),
        ...element.querySelectorAll<HTMLElement>(textSelector),
      ]).filter((element, index, all) => all.indexOf(element) === index && normalizedText(element));
    };
    const sourceTextCandidates = blockAnchor && section
      ? textCandidatesForAnchor(section, blockAnchor)
      : [];
    const sourceText = sourceTextCandidates
      .sort((a, b) => {
        const aBounds = a.getBoundingClientRect();
        const bBounds = b.getBoundingClientRect();
        return Math.abs((aBounds.top + aBounds.bottom) / 2 - viewportLine) - Math.abs((bBounds.top + bBounds.bottom) / 2 - viewportLine);
      })[0];
    const sourceTextBounds = sourceText?.getBoundingClientRect();
    const textAnchor = sourceTextBounds
      && Math.abs((sourceTextBounds.top + sourceTextBounds.bottom) / 2 - viewportLine) <= window.innerHeight * .4
      ? { text: normalizedText(sourceText), top: sourceTextBounds.top }
      : null;
    if (next === view) return;
    viewTransitionCleanupRef.current?.();
    const { restore: restoreStyles } = suspendRootScrollAnchoring();
    // flushSync gives the entering surface real layout during the click. Map
    // it before the browser paints, avoiding the visible wrong-place frame
    // that made Edit / Preview feel like a large jump.
    flushSync(() => setView(next));
    const counterpart = () => {
      if (!sectionKey) return null;
      const escaped = CSS.escape(sectionKey);
      return document.querySelector<HTMLElement>(next === 'edit'
        ? `[data-document-section][data-section-key="${escaped}"]`
        : `[data-story-draft-preview] section#${escaped}`);
    };
    const correctAnchor = () => {
      const scroller = document.scrollingElement;
      if (!scroller) return false;
      if (!sectionKey) {
        scroller.scrollTop = 0;
        return false;
      }
      const target = counterpart();
      if (!target) return false;
      const blockBounds = blockAnchor ? boundsForAnchor(target, blockAnchor) : null;
      const currentTextAnchor = textAnchor;
      const targetText = blockAnchor && currentTextAnchor
        ? textCandidatesForAnchor(target, blockAnchor)
          .find(element => normalizedText(element) === currentTextAnchor.text)
        : null;
      if (targetText && currentTextAnchor) {
        const delta = targetText.getBoundingClientRect().top - currentTextAnchor.top;
        if (Math.abs(delta) > .5) scroller.scrollTop += delta;
        return true;
      }
      const bounds = blockBounds ?? target.getBoundingClientRect();
      const progress = blockBounds && blockProgress !== null ? blockProgress : sectionProgress;
      const delta = bounds.top + bounds.height * progress - viewportLine;
      if (Math.abs(delta) > .5) scroller.scrollTop += delta;
      return true;
    };
    correctAnchor();

    // Media and editor controls can reserve their final height after the first
    // layout. Watch the entering surface as well as the current section: a
    // resize in an earlier chapter moves this section without resizing it.
    // Stop immediately when the author interacts so stabilization never
    // fights a scroll or a quick second mode switch.
    let stopped = false;
    let observer: ResizeObserver | null = null;
    let timeout = 0;
    const interruptEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      observer?.disconnect();
      window.clearTimeout(timeout);
      interruptEvents.forEach(event => window.removeEventListener(event, stop, true));
      restoreStyles();
      if (viewTransitionCleanupRef.current === stop) viewTransitionCleanupRef.current = null;
    };
    const target = counterpart();
    if (target && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => requestAnimationFrame(() => {
        if (!stopped) correctAnchor();
      }));
      observer.observe(target);
      const surface = next === 'edit'
        ? target.closest<HTMLElement>('[data-story]')
        : target.closest<HTMLElement>('[data-story-draft-preview]');
      if (surface && surface !== target) observer.observe(surface);
      interruptEvents.forEach(event => window.addEventListener(event, stop, { capture: true, passive: true }));
      timeout = window.setTimeout(stop, 2500);
      viewTransitionCleanupRef.current = stop;
    } else {
      stop();
    }
    if (next !== 'edit') {
      // Commit the active prose edit before hiding the canvas so undo and
      // mobile block controls never inherit a stale inline session.
      if (editor.inlineBase) dispatch({ type: 'inline-commit' });
      setRegionSettings((current) => ({ ...current, open: false }));
    }
  };

  // Both surfaces edit the same reducer and save contract. Never leave an
  // invalid document or an unfinished settings dialog behind during a switch.
  const changeAuthoringMode = (next: boolean) => {
    if (next === continuousMode) return;
    if (continuousErrorRef.current) {
      dispatch({ type: 'save-error', message: `Fix the document edit before switching tools: ${continuousErrorRef.current}` });
      return;
    }
    if (regionSettings.open || storySettings.open) {
      dispatch({ type: 'save-error', message: 'Close settings before switching editing tools. Your changes are kept.' });
      return;
    }
    const pending = pendingInlineRef.current;
    const path = pending?.resolvePath ? pending.resolvePath(editor.story) : pending?.path;
    if (pending?.changed && !path) {
      dispatch({ type: 'save-error', message: 'Finish the active text edit before switching tools. Your text is still here.' });
      return;
    }
    const candidates = [...document.querySelectorAll<HTMLElement>('[data-story-block-anchor]')]
      .filter(element => element.getClientRects().length && element.getBoundingClientRect().bottom > 80);
    const anchor = candidates.sort((a, b) => Math.abs(a.getBoundingClientRect().top - 160) - Math.abs(b.getBoundingClientRect().top - 160))[0];
    const anchorId = anchor?.dataset.storyBlockAnchor;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const scrollTop = window.scrollY;
    viewTransitionCleanupRef.current?.();
    flushSync(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      if (pending?.changed && path) dispatch({ type: 'edit', story: updateStoryField(editor.story, path, pending.value), history: 'merge' });
      pendingInlineRef.current = null;
      setInlineDirty(false);
      dispatch({ type: 'inline-commit' });
      setMobileMenu(null);
      setContinuousMode(next);
    });
    requestAnimationFrame(() => {
      const target = anchorId && [...document.querySelectorAll<HTMLElement>('[data-story-block-anchor]')]
        .find(element => element.dataset.storyBlockAnchor === anchorId && element.getClientRects().length);
      window.scrollTo({ top: target && anchorTop !== undefined ? window.scrollY + target.getBoundingClientRect().top - anchorTop : scrollTop, behavior: 'instant' });
    });
  };

  // The inspector's own links can move to another region, or to story
  // settings, which always live in the dialog.
  const selectFromRegionSettings = (id: string) => {
    if (id === 'story') {
      openStorySettings(settingsReturnRef.current);
      return;
    }
    setSelectedId(id);
    setRegionSettings((current) => ({ ...current, id, item: undefined, open: true }));
  };

  const inspectorEditing = {
    onEditStart: () => dispatch({ type: 'inline-start' }),
    onEditEnd: () => dispatch({ type: 'inline-commit' }),
    onEditCancel: () => dispatch({ type: 'inline-cancel' }),
  };

  // What a word processor shows in its status bar, in the overflow menu.
  const counts = storyReadingCounts(editor.story);
  const minutes = readingMinutes(editor.story);
  const wordCount = `${counts.words.toLocaleString('en-US')} words · ${counts.pictures} ${counts.pictures === 1 ? 'image' : 'images'}${minutes ? ` · ${minutes} min read` : ''}`;

  /* One overflow menu, two placements: on phones it holds everything that
     doesn't fit the bar; from lg up it keeps Find and replace, the shortcut
     sheet, the word count and the host's label. */
  const moreMenu = (compact: boolean) => (
    // Non-modal for the same reason as the block menus: a scroll lock would
    // unstick this bar.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button ref={compact ? mobileMoreRef : desktopMoreRef} type="button" className={barIconButton} aria-label="More editor options" title="More">
          <Ellipsis aria-hidden="true" className={chromeStyles.editorIcon2} strokeWidth={1.75} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={`${editorMenuContent} ${chromeStyles.editorIcon3}`}
          align="end"
          sideOffset={4}
          collisionPadding={12}
          data-story-editor-action
        >
          {compact && <>
            <DropdownMenu.Item className={editorMenuItem} disabled={editor.past.length === 0 && !editor.inlineBase} onSelect={() => runHistoryAction('undo')}>
              <Undo2 aria-hidden="true" className={chromeStyles.editorIcon4} />Undo
            </DropdownMenu.Item>
            <DropdownMenu.Item className={editorMenuItem} disabled={editor.future.length === 0} onSelect={() => runHistoryAction('redo')}>
              <Redo2 aria-hidden="true" className={chromeStyles.editorIcon4} />Redo
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={editorMenuSeparator} />
            <DropdownMenu.Item className={editorMenuItem} onSelect={() => openStorySettings(mobileMoreRef.current)}>
              <Settings2 aria-hidden="true" className={chromeStyles.editorIcon4} />Story settings…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={editorMenuSeparator} />
          </>}
          <DropdownMenu.Label className={editorMenuLabel}>Editing tools</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={continuousMode ? 'writing' : 'blocks'} onValueChange={(next) => changeAuthoringMode(next === 'writing')}>
            <DropdownMenu.RadioItem className={editorMenuItem} value="writing">
              <span className={checkSlot}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.editorIcon} /></DropdownMenu.ItemIndicator></span>Continuous writing
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem className={editorMenuItem} value="blocks">
              <span className={checkSlot}><DropdownMenu.ItemIndicator><Check aria-hidden="true" className={chromeStyles.editorIcon} /></DropdownMenu.ItemIndicator></span>Block tools
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={editorMenuSeparator} />
          <DropdownMenu.Item className={editorMenuItem} onSelect={() => { shortcutsReturnRef.current = (compact ? mobileMoreRef : desktopMoreRef).current; setFindOpen(true); }}>
            <Replace aria-hidden="true" className={chromeStyles.editorIcon4} />Find and replace…
            <kbd aria-hidden="true" className={chromeStyles.editorKeys}>⌘⇧F</kbd>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={editorMenuItem} onSelect={() => { shortcutsReturnRef.current = (compact ? mobileMoreRef : desktopMoreRef).current; setShortcutsOpen(true); }}>
            <Keyboard aria-hidden="true" className={chromeStyles.editorIcon4} />Keyboard shortcuts
            <kbd aria-hidden="true" className={chromeStyles.editorKeys}>⌘/</kbd>
          </DropdownMenu.Item>
          {/* The span wraps rather than cutting off at the label's truncate:
              "2,345 words · 12 images · 7 min read" is wider than the menu. */}
          <DropdownMenu.Label className={`${editorMenuLabel} ${chromeStyles.editorLabel}`}><span className={chromeStyles.editorPart2}>{wordCount}</span></DropdownMenu.Label>
          {label && <>
            <DropdownMenu.Separator className={editorMenuSeparator} />
            <DropdownMenu.Label className={`${editorMenuLabel} ${chromeStyles.editorLabel2}`}>{label.note}</DropdownMenu.Label>
          </>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  const themeToggle = (compact: boolean) => theme && onThemeChange
    ? <EditorThemeToggle compact={compact} theme={theme} onChange={onThemeChange} />
    : null;

  return environment(
    <div data-story-document-shell="" className={chromeStyles.editorPart3}>
      <header data-story-workspace-bar=""
        // The document bar owns the top edge of the page at every width.
        className={chromeStyles.editorPinned}
      >
        <div className={chromeStyles.editorRow2}>
          {backLink && renderLink({
            href: backLink.href,
            className: barIconButton,
            'aria-label': backLink.label,
            children: (
              <span
                data-unsaved-guarded=""
                title={backLink.label}
                onClickCapture={(event) => {
                  if (!(hasUnsavedChangesRef.current || pendingInlineRef.current?.changed)) return;
                  if (!window.confirm(LEAVE_STORY_MESSAGE)) { event.preventDefault(); event.stopPropagation(); }
                }}
                className={chromeStyles.editorPart4}
              >
                <ArrowLeft aria-hidden="true" className={chromeStyles.editorIcon2} strokeWidth={1.75} />
              </span>
            ),
          })}
          <div className={chromeStyles.editorStack}>
            <p className={chromeStyles.editorTruncated} title={editor.story.title}>
              {editor.story.title || 'Untitled story'}
            </p>
            {/* Beside the title from lg; below it, a strip under the bar when
                there's an error or a notice, otherwise read out but not shown. */}
            <p id="editor-save-status" aria-live="polite" className={`${chromeStyles.editorEditorSaveStatus} ${editor.saveState === 'error' ? chromeStyles.editorEditorSaveStatusOn : chromeStyles.editorEditorSaveStatusOff} ${statusStrip
              ? chromeStyles.editorEditorSaveStatusOn2
              : chromeStyles.editorVisuallyHiddenOff}`}>
              {saveStatus}
              {/* On phones the Publish button's own label (Publish / Publish
                  changes / Published) already says this. */}
              <span className={chromeStyles.editorPart5}> · {publicationStatus}</span>
            </p>
            {label && (
              <span className={chromeStyles.editorKeys2} title={label.note}>
                {label.badge}
              </span>
            )}
          </div>
          <div className={chromeStyles.editorRow3}>
            <button
              type="button"
              className={barIconButton}
              aria-label="Undo"
              aria-keyshortcuts="Meta+Z Control+Z"
              title="Undo (⌘Z)"
              disabled={editor.past.length === 0 && !editor.inlineBase}
              onClick={() => runHistoryAction('undo')}
            >
              <Undo2 aria-hidden="true" className={chromeStyles.editorIcon} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={barIconButton}
              aria-label="Redo"
              aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z"
              title="Redo (⇧⌘Z)"
              disabled={editor.future.length === 0}
              onClick={() => runHistoryAction('redo')}
            >
              <Redo2 aria-hidden="true" className={chromeStyles.editorIcon} strokeWidth={1.75} />
            </button>
            {barDivider}
            <nav aria-label="Editorial workspace views" className={chromeStyles.editorEditorialWorkspaceViews}>
              {([['edit', 'Edit', 'Edit draft'], ['preview', 'Preview', 'Preview draft']] as const).map(([key, label, fullLabel]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  aria-label={fullLabel}
                  onClick={() => changeView(key)}
                  className={`${chromeStyles.editorRow4} ${view === key ? chromeStyles.editorButtonOn : chromeStyles.editorButtonOff}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {barDivider}
            {themeToggle(false) && <>{themeToggle(false)}{barDivider}</>}
            <button
              type="button"
              className={`${barButton} ${chromeStyles.editorStorySettings}`}
              aria-label="Story settings"
              aria-haspopup="dialog"
              aria-expanded={storySettings.open}
              title="Story settings"
              onClick={(event) => openStorySettings(event.currentTarget)}
            >
              <Settings2 aria-hidden="true" className={chromeStyles.editorIcon5} strokeWidth={1.75} />
              <span className={chromeStyles.editorPart6}>Settings</span>
            </button>
            {moreMenu(false)}
            {barDivider}
          </div>
          <div className={chromeStyles.editorPart7}>
            <button
              type="button"
              aria-keyshortcuts="Control+S Meta+S"
              title="Save (⌘S)"
              disabled={saveDisabled}
              onPointerDown={() => {
                saveInlineSnapshotRef.current = pendingInlineRef.current;
              }}
              onClick={() => void saveCurrentDraft()}
              style={hasUnsavedChanges && !saveDisabled && editor.saveState !== 'error' ? { color: 'var(--story-background)' } : undefined}
              className={`${barButton} ${chromeStyles.editorButton2} ${editor.saveState === 'error' && hasUnsavedChanges
                ? chromeStyles.editorErrorOn
                : hasUnsavedChanges && !saveDisabled
                  ? chromeStyles.editorButtonOn2
                  : chromeStyles.editorButtonOff2}`}
            >
              {!hasUnsavedChanges && editor.saveState !== 'saving' && <Check aria-hidden="true" className={chromeStyles.editorIcon} />}
              {saveButtonLabel}
            </button>
          </div>
          <div className={chromeStyles.editorPart8}>
            <EditorPublishButton
              story={editor.story}
              hasUnsavedChanges={hasUnsavedChanges}
              publishedVersion={publishedVersion}
              latestVersion={latestVersion}
              isPublishedCurrent={isPublishedCurrent}
              disabledReason={publishDisabledReason}
              publishing={publishing}
              onPublish={publishCurrent}
              onShowIssue={showIssue}
              savedReadiness={!hasUnsavedChanges && latestDocument ? response.readinessByDocumentId[latestDocument.id] : undefined}
              liveHref={liveHref}
            />
          </div>
          {themeToggle(true) && <div className={chromeStyles.editorPart9}>{themeToggle(true)}</div>}
          <div className={chromeStyles.editorPart10}>
            <button
              type="button"
              className={barIconButton}
              aria-label={view === 'edit' ? 'Preview draft' : 'Edit draft'}
              title={view === 'edit' ? 'Preview draft' : 'Edit draft'}
              onClick={() => changeView(view === 'edit' ? 'preview' : 'edit')}
            >
              {view === 'edit'
                ? <Eye aria-hidden="true" className={chromeStyles.editorIcon2} strokeWidth={1.75} />
                : <Pencil aria-hidden="true" className={chromeStyles.editorIcon2} strokeWidth={1.75} />}
            </button>
          </div>
          <div className={chromeStyles.editorPart10}>
            <button
              type="button"
              aria-keyshortcuts="Control+S Meta+S"
              aria-describedby="editor-save-status"
              aria-label={saveButtonLabel}
              disabled={saveDisabled}
              onPointerDown={() => { saveInlineSnapshotRef.current = pendingInlineRef.current; }}
              onClick={() => void saveCurrentDraft()}
              style={hasUnsavedChanges && !saveDisabled && editor.saveState !== 'error' ? { color: 'var(--story-background)' } : undefined}
              className={`${barButton} ${chromeStyles.editorButton2} ${!hasUnsavedChanges && editor.saveState !== 'saving' ? chromeStyles.editorButtonOn3 : chromeStyles.editorButtonOff3} ${editor.saveState === 'error' && hasUnsavedChanges
                ? chromeStyles.editorErrorOn
                : hasUnsavedChanges && !saveDisabled
                  ? chromeStyles.editorButtonOn2
                  : chromeStyles.editorButtonOff2}`}
            >
              {!hasUnsavedChanges && editor.saveState !== 'saving' && <Check aria-hidden="true" className={chromeStyles.editorIcon} />}
              <span className={!hasUnsavedChanges && editor.saveState !== 'saving' ? chromeStyles.editorVisuallyHiddenOn : undefined}>
                {editor.saveState === 'saving' ? 'Saving…' : editor.saveState === 'error' && hasUnsavedChanges ? 'Retry' : hasUnsavedChanges ? 'Save' : 'Saved'}
              </span>
            </button>
          </div>
          <div className={chromeStyles.editorPart10}>
            <EditorPublishButton
              story={editor.story}
              hasUnsavedChanges={hasUnsavedChanges}
              publishedVersion={publishedVersion}
              latestVersion={latestVersion}
              isPublishedCurrent={isPublishedCurrent}
              disabledReason={publishDisabledReason}
              publishing={publishing}
              onPublish={publishCurrent}
              onShowIssue={showIssue}
              savedReadiness={!hasUnsavedChanges && latestDocument ? response.readinessByDocumentId[latestDocument.id] : undefined}
              liveHref={liveHref}
              compact
              iconOnly
            />
          </div>
          <div className={chromeStyles.editorPart10}>{moreMenu(true)}</div>
        </div>
      </header>

      <div className={chromeStyles.editorStack2}>
        {conflict && (
          <aside role="alert" className={chromeStyles.editorAlert2}>
            <p className={chromeStyles.editorP}>Version {conflict.documents[0]?.version ?? '—'} was saved somewhere else while you were editing.</p>
            <p className={chromeStyles.editorP2}>Your unsaved content is still intact and nothing has been overwritten. This is not an automatic merge, so choose which version to keep.</p>
            <div className={chromeStyles.editorPart11}>
              <button type="button" className={alertButton} onClick={downloadLocalSnapshot}>Download my changes</button>
              <button type="button" className={alertButton} onClick={() => {
                if (!window.confirm(`Keep your version? It replaces version ${conflict.documents[0]?.version ?? '—'} when you save, and that version is kept for safekeeping.`)) return;
                setResponse(conflict);
                setConflict(null);
                dispatch({ type: 'edit', story: editor.story, history: 'merge' });
              }}>Keep my version</button>
              <button
                type="button"
                className={alertButton}
                onClick={() => {
                  if (!window.confirm(`Discard your unsaved changes and load version ${conflict.documents[0]?.version ?? '—'}?`)) return;
                  setResponse(conflict);
                  dispatch({ type: 'reset', story: normalizeStoryForEditor(conflict.story) });
                  setConflict(null);
                  setSelectedId('story');
                }}
              >
                Use version {conflict.documents[0]?.version ?? '—'} instead
              </button>
            </div>
          </aside>
        )}

        {recovery.offer && (
          // Edits kept on this device from an earlier visit; never applied unasked.
          <div className={chromeStyles.editorPart12}>
            <KeptEditsNotice
              offer={recovery.offer}
              className={chromeStyles.editorKeptEditsNotice}
              onRestore={() => {
                const kept = recovery.offer?.story;
                recovery.restore();
                if (kept) {
                  applyStory(kept, 'record');
                  setNotice({ text: 'Unsaved changes restored — ⌘Z to undo', story: kept });
                }
              }}
              onDiscard={recovery.discard}
            />
          </div>
        )}

        {validationErrors.length > 0 && (
          <aside role="alert" className={chromeStyles.editorAlert3}>
            <p className={chromeStyles.editorError2}>Fix before saving</p>
            <ul className={chromeStyles.editorUl}>{validationErrors.slice(0, 4).map((error) => <li key={error}>{error}</li>)}</ul>
            {validationErrors.length > 4 && <p className={chromeStyles.editorP3}>And {validationErrors.length - 4} more.</p>}
          </aside>
        )}
      </div>

      <div className={chromeStyles.editorPart13}>
        {view === 'edit' && !continuousMode && (
          // The page is the editor. Its left gutter (lg+) holds the block
          // handle and the selection rail, so neither is drawn over text.
          <div ref={canvasRef} className={chromeStyles.editorPart14}>
            <div data-story-editor-action className={chromeStyles.editorPart15}>
              <button type="button" className={chromeStyles.editorRow5} onClick={addSection}>
                <Plus aria-hidden="true" className={chromeStyles.editorIcon} />Add section
              </button>
            </div>
            <EditorBlockHandle
              canvasRef={canvasRef}
              pageRef={pageRef}
              gripRef={gripRef}
              story={editor.story}
              selectedId={selectedId}
              pinnedId={regionSettings.open ? regionSettings.id : null}
              addRequest={addRequest}
              actionsRequest={actionsRequest}
              onApply={applyHandleChange}
              onExtendSelection={extendSelection}
              onSettings={openSettings}
              onMenuOpenChange={setMobileMenu}
            />
            <section
              ref={pageRef}
              aria-label="Editable story"
              // @container: full-width bands span the canvas, not the window.
              className={chromeStyles.editorEditableStory}
              onClickCapture={(event: ReactMouseEvent<HTMLElement>) => {
                const target = event.target as HTMLElement;
                // Editor controls and the chapter rail work as they do on the page.
                if (target.closest('[data-story-editor-action], [data-story-nav]')) return;
                const editable = target.closest('[contenteditable="true"]');
                const id = target.closest<HTMLElement>('[data-story-editor-id]')?.dataset.storyEditorId;
                // A click selects; it never opens a form or moves focus.
                if (id) setSelectedId(id);
                // Media has no text to type into: clicking it opens its
                // settings (source, alt text, link) right beside it.
                const frame = editable ? null : mediaFrameAt(target);
                if (id && frame) openSettings(id, frame, null, { x: event.clientX, y: event.clientY }, mediaItemAt(target));
                if (!editable && target.closest('a, button')) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
            >
              <StoryPage story={editor.story} company={company} embedded editor={renderEditor} />
            </section>
          </div>
        )}
        {continuousMode && <div ref={continuousCanvasRef} hidden={view !== 'edit'} aria-hidden={view !== 'edit'}>
          <ContinuousStoryEditor
            story={editor.story}
            company={company}
            onChange={(story) => applyStory(story)}
            onCanvasChange={(story, boundary) => {
              setValidationErrors([]);
              dispatch({ type: 'canvas-edit', story, boundary });
            }}
            historyRevision={canvasHistoryRevision}
            onCanvasHistory={(direction) => {
              // Invalid canvas changes have not reached the canonical draft.
              // Let ProseMirror undo those locally until it is valid again.
              if (continuousErrorRef.current) return false;
              runHistoryAction(direction);
              return true;
            }}
            onTextDraftChange={renderEditor.onTextDraftChange}
            onEditStart={renderEditor.onTextEditStart}
            onEditEnd={renderEditor.onTextEditEnd}
            focusTextRef={continuousFocusTextRef}
            onRemoveSection={(story, nextKey) => applyHandleChange({
              story, select: `chapter:${nextKey}`, notice: 'Section and its content removed from this draft. Use Undo to restore it.',
            })}
            onValidityChange={setContinuousValidity}
            onHeroSettings={(id, element) => openSettings(id, element, element)}
            onRegionSettings={(id, element) => openSettings(id, element, element)}
            onSettings={(id, element, item) => openSettings(id, element, element, undefined, item)}
          />
        </div>}
        {continuousMode && <div hidden={view !== 'preview'} aria-hidden={view !== 'preview'}>
          <DraftPreview story={editor.story} company={company} blocks={blocks} media={media} />
        </div>}
        {!continuousMode && view === 'preview' && <DraftPreview story={editor.story} company={company} blocks={blocks} media={media} />}
      </div>
      {view === 'edit' && !continuousMode && !editor.inlineBase && (selectedId.startsWith('block:') || selectedId.startsWith('chapter:')) && (
        <div
          role="group"
          aria-label={`${storySelectionLabel(editor.story, selectedId)} controls`}
          data-story-editor-action
          className={chromeStyles.editorGroup}
        >
          <p className={chromeStyles.editorTruncated2}>
            {storySelectionLabel(editor.story, selectedId)}
          </p>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={mobileMenu === 'add'}
            className={`${barButton} ${chromeStyles.editorButton3}`}
            onClick={() => setAddRequest((count) => count + 1)}
          >
            <Plus aria-hidden="true" className={chromeStyles.editorIcon} />Add block
          </button>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={mobileMenu === 'actions'}
            className={`${barButton} ${chromeStyles.editorButton3}`}
            onClick={() => setActionsRequest((count) => count + 1)}
          >
            <SlidersHorizontal aria-hidden="true" className={chromeStyles.editorIcon} />Actions
          </button>
        </div>
      )}

      {popoverSettings ? (
        <SettingsPopover
          open={regionSettings.open}
          onOpenChange={(open) => setRegionSettings((current) => ({ ...current, open }))}
          anchorRef={settingsAnchorRef}
          side={regionSettings.side}
          title={regionSettingsTitle}
          initialFocus={regionSettings.initialFocus}
          subtitle={regionSettingsSubtitle}
          compact={Boolean(settingsMedia)}
          returnFocusRef={settingsReturnRef}
          findReplacementTrigger={findReplacementImageSettingsTrigger}
        >
          <StoryInspector story={editor.story} company={company} selectedId={regionSettings.id} mediaItem={regionSettings.item} onChange={applyStory} onSelect={selectFromRegionSettings} original={response.liveStory} compactBlockHelp={continuousMode} {...inspectorEditing} />
        </SettingsPopover>
      ) : (
        <SettingsSheet
          open={regionSettings.open}
          onOpenChange={(open) => setRegionSettings((current) => ({ ...current, open }))}
          title={regionSettingsTitle}
          initialFocus={regionSettings.initialFocus}
          subtitle={regionSettingsSubtitle}
          compact={Boolean(settingsMedia)}
          placement="bottom"
          returnFocusRef={settingsReturnRef}
          findReplacementTrigger={findReplacementImageSettingsTrigger}
        >
          <StoryInspector story={editor.story} company={company} selectedId={regionSettings.id} mediaItem={regionSettings.item} onChange={applyStory} onSelect={selectFromRegionSettings} original={response.liveStory} compactBlockHelp={continuousMode} {...inspectorEditing} />
        </SettingsSheet>
      )}

      <SettingsSheet
        open={findOpen}
        onOpenChange={setFindOpen}
        title="Find and replace"
        placement="center"
        returnFocusRef={shortcutsReturnRef}
      >
        <EditorFindReplace
          story={editor.story}
          onReplace={(story, replaced) => {
            applyStory(story, 'record');
            setNotice({ text: `Replaced ${replaced} — ⌘Z to undo`, story });
          }}
          onGoTo={(id) => {
            setFindOpen(false);
            revealStoryTarget(id, 'find');
          }}
        />
      </SettingsSheet>

      <SettingsSheet
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        title="Keyboard shortcuts"
        placement="center"
        returnFocusRef={shortcutsReturnRef}
      >
        <EditorShortcuts continuousMode={continuousMode} />
      </SettingsSheet>

      <SettingsSheet
        open={storySettings.open}
        onOpenChange={(open) => setStorySettings((current) => ({ ...current, open }))}
        title={storySelectionLabel(editor.story, storySettings.id)}
        initialFocus={storySettings.initialFocus}
        placement="center"
        returnFocusRef={settingsReturnRef}
        footer={<span className={chromeStyles.editorHint2}>Story content and placement are managed in this editor.</span>}
      >
        <StoryInspector
          story={editor.story}
         
          company={company}
          selectedId={storySettings.id}
          onChange={applyStory}
          onSelect={(id) => setStorySettings({ id, open: true })}
          original={response.liveStory}
          {...inspectorEditing}
          address={{
            slug,
            unavailableReason: renameUnavailableReason,
            takenAddresses: response.takenAddresses ?? [],
            savesFirst: hasUnsavedChanges,
            onChange: changeAddress,
            display: routes?.reader,
          }}
          relatedStories={response.relatedStories}
        />
      </SettingsSheet>
    </div>,
  );
}
