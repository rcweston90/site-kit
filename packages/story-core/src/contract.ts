/**
 * The contract between the parts of the CMS.
 *
 * - The server side (`@rcweston/story-server`) implements `DocumentStore`,
 *   `MediaStore`, `AuthAdapter` and `Revalidator`, and answers the editor
 *   with `StoryEditorState`.
 * - The editor (`@rcweston/story-editor`) talks to the server only through an
 *   `EditorTransport`, so the same editor runs against a real backend, an
 *   in-memory demo, or a test fake.
 *
 * Nothing here depends on a framework: requests and responses are the web
 * platform's `Request` and `Response`.
 */

import type { StoryDocument, StoryPublication } from './document.js';
import type { Story } from './types.js';

// ─── Publication readiness ──────────────────────────────────────────────────

export type PublicationIssueSeverity = 'error' | 'warning';

export type PublicationIssueCode =
  | 'invalid-story'
  | 'empty-visible-content'
  | 'unresolved-required-media'
  | 'unresolved-optional-media'
  | 'invalid-media-source'
  | 'missing-media-alt'
  | 'broken-related-story'
  | 'duplicate-related-story'
  | 'self-related-story'
  | 'unknown-custom-block';

export interface PublicationIssue {
  severity: PublicationIssueSeverity;
  code: PublicationIssueCode;
  path: string;
  message: string;
}

/** Only errors block a publish. Warnings are notes the author can publish past. */
export interface PublicationReadiness {
  errors: PublicationIssue[];
  warnings: PublicationIssue[];
}

// ─── Addresses ──────────────────────────────────────────────────────────────

export interface SlugRedirect {
  from: string;
  to: string;
}

export interface SlugAliases {
  /** Where this address now sends readers, when the story was renamed away from it. */
  movedTo: string | null;
  /** Older addresses that now send readers here, newest rename first. */
  formerSlugs: string[];
}

// ─── Errors every store throws ──────────────────────────────────────────────

/** The draft's parent is no longer the latest version. Answer 409. */
export class DraftConflictError extends Error {
  constructor(message = 'This story has a newer draft. Reload it before saving another version.') {
    super(message);
    this.name = 'DraftConflictError';
  }
}

/** A save aimed at an address the story has moved away from. Answer 409. */
export class StoryMovedError extends DraftConflictError {
  readonly movedTo: string;
  constructor(movedTo: string) {
    super('This story moved to a new address. Reload to keep editing. Your unsaved work is still open.');
    this.name = 'StoryMovedError';
    this.movedTo = movedTo;
  }
}

/** The published version changed after the editor loaded. Answer 409. */
export class PublicationConflictError extends Error {
  constructor(message = 'The published version changed after this editor loaded. Reload before publishing again.') {
    super(message);
    this.name = 'PublicationConflictError';
  }
}

/** The address a rename wants is already used. Answer 409. */
export class AddressTakenError extends Error {
  constructor(message = 'That address is already used by another story.') {
    super(message);
    this.name = 'AddressTakenError';
  }
}

// ─── Document store ─────────────────────────────────────────────────────────

/** Where a saved version came from. `kind` is e.g. 'editor', 'import', 'seed'. */
export interface SourceMeta {
  kind: string;
  ref: string;
  /** A build or commit id, when the host has one. Empty string otherwise. */
  commit?: string;
}

export type PublishedLookup =
  | { status: 'published'; document: StoryDocument }
  | { status: 'none' }
  /** The lookup failed. Never treated as "not published". */
  | { status: 'failed'; error: unknown };

export interface StorySummary {
  slug: string;
  title: string;
  company: string;
  latestVersion: number;
  latestDocumentId: string;
  publishedDocumentId: string | null;
  updatedAt: string;
}

export interface RenameInput {
  from: string;
  to: string;
  /** The newest version the editor had loaded; null when it had none. */
  expectedLatestDocumentId: string | null;
  source: SourceMeta;
  publishedBy?: string | null;
}

export interface RenameResult {
  from: string;
  to: string;
  /** The versions the story continues from at its new address, newest first. */
  documents: StoryDocument[];
  publishedDocumentId: string | null;
}

/**
 * Append-only and hash-addressed. Saving never rewrites a version: it adds
 * the next one, and fails with `DraftConflictError` when `parentDocumentId`
 * isn't the latest. The publication is a separate pointer to one version.
 */
export interface DocumentStore {
  list(): Promise<StorySummary[]>;
  /** Every version of a story, newest first. */
  versions(slug: string): Promise<StoryDocument[]>;
  latest(slug: string): Promise<StoryDocument | null>;
  version(slug: string, version: number): Promise<StoryDocument | null>;
  saveDraft(input: {
    slug: string;
    content: Story;
    parentDocumentId: string | null;
    source: SourceMeta;
  }): Promise<StoryDocument>;
  /** Fails with `PublicationConflictError` when `expectedPublishedDocumentId` is stale. */
  publish(input: {
    slug: string;
    documentId: string;
    expectedPublishedDocumentId?: string | null;
    publishedBy?: string | null;
  }): Promise<{ document: StoryDocument; publication: StoryPublication }>;
  unpublish(slug: string): Promise<void>;
  published(slug: string): Promise<PublishedLookup>;
  publications(): Promise<StoryPublication[]>;
  rename(input: RenameInput): Promise<RenameResult>;
  redirects(): Promise<SlugRedirect[]>;
  aliases(slug: string): Promise<SlugAliases>;
}

// ─── Media ──────────────────────────────────────────────────────────────────

export type MediaVisibility = 'public' | 'protected';
export type MediaKind = 'image' | 'video' | 'pdf';

export interface MediaHead {
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: Date;
}

export interface MediaObject extends MediaHead {
  body: ReadableStream<Uint8Array>;
  /** Present when a byte range was served. */
  range?: { start: number; end: number };
}

export interface MediaStore {
  put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    visibility: MediaVisibility;
    cacheControl?: string;
  }): Promise<{ key: string }>;
  get(key: string, range?: { start: number; end?: number }): Promise<MediaObject | null>;
  head(key: string): Promise<MediaHead | null>;
  delete(key: string): Promise<void>;
  list(prefix: string, cursor?: string): Promise<{ keys: string[]; cursor?: string }>;
}

export interface MediaPolicy {
  /** Largest accepted upload, in bytes. */
  maxBytes: number;
  /** Accepted content types and the kind each becomes. */
  accept: Record<string, MediaKind>;
  keyFor(input: { slug: string; sha256: string; ext: string }): string;
  /** The URL a reader's browser fetches the object from. */
  srcFor(key: string, visibility: MediaVisibility): string;
}

export interface UploadedMedia {
  src: string;
  key: string;
  kind: MediaKind;
  contentType: string;
  size: number;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export interface Session {
  role: 'admin' | 'viewer';
  subject?: string;
}

export interface AuthAdapter {
  getSession(request: Request): Promise<Session | null>;
  /** Resolves with the session, or throws a `Response` with status 401. */
  requireAdmin(request: Request): Promise<Session>;
  /** Whether this request may read protected media and protected stories. */
  canViewProtected(request: Request): Promise<boolean>;
}

// ─── Revalidation ───────────────────────────────────────────────────────────

/** Hooks the host fills in to refresh its caches. A failure here never fails a save. */
export interface Revalidator {
  saved?(slug: string): void | Promise<void>;
  published?(slug: string): void | Promise<void>;
  unpublished?(slug: string): void | Promise<void>;
  renamed?(from: string, to: string): void | Promise<void>;
}

// ─── What the editor loads ──────────────────────────────────────────────────

/** A story the Related picker can offer. */
export interface RelatedStoryOption {
  slug: string;
  title: string;
  company?: string;
  /** Never published, so the next-story card passes over it. */
  unpublished?: true;
}

/** Everything the editor needs to open one story. */
export interface StoryEditorState {
  /** The latest saved version's content, or a new story when nothing is saved. */
  story: Story;
  /** Every saved version, newest first. Empty for a story that was never saved. */
  documents: StoryDocument[];
  /** What readers see now, if anything. */
  liveStory: Story | null;
  publishedDocumentId: string | null;
  readinessByDocumentId: Record<string, PublicationReadiness>;
  /** False when the host turned publishing off. */
  publicationEnabled: boolean;
  /** Whether an older version can be reopened as a new draft. */
  restoresEnabled: boolean;
  renameAvailable: boolean;
  /** Why not, in plain words, when renameAvailable is false. */
  renameUnavailableReason?: string | null;
  /** Addresses a rename can't take: other stories and old addresses. */
  takenAddresses: string[];
  relatedStories: RelatedStoryOption[];
}

/** The JSON body of an error response from the server handlers. */
export interface StoryErrorBody {
  error: string;
  code?: 'STORY_MOVED' | 'CONFLICT' | 'INVALID' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'TOO_LARGE' | 'UNSUPPORTED' | 'ADDRESS';
  movedTo?: string;
  /** Validation messages for `INVALID`. */
  problems?: string[];
}

/**
 * How the editor talks to its backend. `createFetchTransport` in
 * story-server's client entry speaks to the bundled handlers over HTTP;
 * `createMemoryTransport` keeps everything in the tab for demos and tests.
 */
export interface EditorTransport {
  load(slug: string, options?: { signal?: AbortSignal }): Promise<StoryEditorState>;
  saveDraft(input: { slug: string; content: Story; parentDocumentId: string | null }): Promise<StoryEditorState>;
  publish(input: { slug: string; documentId: string; expectedPublishedDocumentId: string | null }): Promise<StoryEditorState>;
  unpublish(slug: string): Promise<StoryEditorState>;
  rename(input: { from: string; to: string; expectedLatestDocumentId: string | null }): Promise<StoryEditorState>;
  uploadMedia(file: File, context: { slug: string; signal?: AbortSignal }): Promise<UploadedMedia>;
}
