/**
 * The editor's side of the wire: an `EditorTransport` that talks to
 * `createStoryHandlers` over HTTP. Browser-safe; it imports only types.
 *
 *   import { createFetchTransport } from '@rcweston/story-server/client';
 *   const transport = createFetchTransport({ baseUrl: '/api/story' });
 */

import type {
  EditorTransport,
  StoryEditorState,
  StoryErrorBody,
  StorySummary,
  UploadedMedia,
} from '@rcweston/story-core';
import { DEFAULT_BASE_PATH, routePaths } from './routes.js';

/** A request the server turned down, with its plain-language body. `status` is 0 when the server couldn't be reached. */
export class StoryRequestError extends Error {
  readonly status: number;
  readonly body: StoryErrorBody;
  constructor(status: number, body: StoryErrorBody) {
    super(body.error);
    this.name = 'StoryRequestError';
    this.status = status;
    this.body = body;
  }
  get code() {
    return this.body.code;
  }
  get movedTo() {
    return this.body.movedTo;
  }
}

export const TRANSPORT_MESSAGES = {
  offline: 'Couldn’t reach the server. Check your connection and try again. Your work is still here.',
  unauthorized: 'Your session ended. Sign in again to keep going. Your work is still here.',
  tooLarge: 'That file is too large for the server.',
  server: 'The server couldn’t finish that. Try again in a moment. Your work is still here.',
  unreadable: 'The server sent an answer the editor couldn’t read. Reload and try again.',
} as const;

function fallbackBody(status: number): StoryErrorBody {
  if (status === 401 || status === 403) return { error: TRANSPORT_MESSAGES.unauthorized, code: 'UNAUTHORIZED' };
  if (status === 413) return { error: TRANSPORT_MESSAGES.tooLarge, code: 'TOO_LARGE' };
  return { error: TRANSPORT_MESSAGES.server };
}

function isErrorBody(value: unknown): value is StoryErrorBody {
  return Boolean(value) && typeof value === 'object' && typeof (value as StoryErrorBody).error === 'string';
}

/** Read any response as JSON, or throw a `StoryRequestError` the editor can show. */
export async function readStoryResponse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const fallback = fallbackBody(response.status);
    // A body without a code keeps the server's words but gains the status's code.
    throw new StoryRequestError(response.status, isErrorBody(body) ? { ...body, code: body.code ?? fallback.code } : fallback);
  }
  if (body === null) throw new StoryRequestError(response.status, { error: TRANSPORT_MESSAGES.unreadable });
  return body as T;
}

function isEditorState(value: unknown): value is StoryEditorState {
  if (!value || typeof value !== 'object') return false;
  const state = value as StoryEditorState;
  return Boolean(state.story) && Array.isArray(state.documents);
}

function isUploadedMedia(value: unknown): value is UploadedMedia {
  if (!value || typeof value !== 'object') return false;
  const media = value as UploadedMedia;
  return typeof media.src === 'string' && typeof media.key === 'string'
    && (media.kind === 'image' || media.kind === 'video' || media.kind === 'pdf')
    && typeof media.contentType === 'string' && typeof media.size === 'number';
}

export interface FetchTransportOptions {
  /** Where the handlers are mounted, e.g. `/api/story` or `https://cms.example.com/api/story`. */
  baseUrl?: string;
  /** Default: the global `fetch`. */
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  /** Headers sent with every request, e.g. a CSRF token your app adds. */
  headers?: Record<string, string>;
  /** Default `same-origin`. */
  credentials?: RequestCredentials;
}

/** `EditorTransport` plus the story list, for an index screen. */
export interface StoryTransport extends EditorTransport {
  list(options?: { signal?: AbortSignal }): Promise<StorySummary[]>;
}

export function createFetchTransport(options: FetchTransportOptions = {}): StoryTransport {
  const base = (options.baseUrl ?? DEFAULT_BASE_PATH).replace(/\/+$/, '');
  const send = options.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));

  async function call<T>(path: string, init: RequestInit & { json?: unknown }, check?: (value: unknown) => boolean): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    let body = init.body;
    if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.json);
    }
    let response: Response;
    try {
      response = await send(`${base}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body,
        signal: init.signal,
        credentials: options.credentials ?? 'same-origin',
      });
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
      throw new StoryRequestError(0, { error: TRANSPORT_MESSAGES.offline });
    }
    const value = await readStoryResponse<T>(response);
    if (check && !check(value)) throw new StoryRequestError(response.status, { error: TRANSPORT_MESSAGES.unreadable });
    return value;
  }

  const state = (path: string, json: unknown) =>
    call<StoryEditorState>(path, { method: 'POST', json }, isEditorState);

  return {
    list: ({ signal } = {}) =>
      call<{ stories: StorySummary[] }>(routePaths.list(), { signal }, (value) => Array.isArray((value as { stories?: unknown }).stories))
        .then((value) => value.stories),
    load: (slug, { signal } = {}) => call<StoryEditorState>(routePaths.load(slug), { signal }, isEditorState),
    saveDraft: ({ slug, content, parentDocumentId, autosave }) =>
      state(routePaths.saveDraft(slug), autosave ? { content, parentDocumentId, autosave } : { content, parentDocumentId }),
    publish: ({ slug, documentId, expectedPublishedDocumentId }) =>
      state(routePaths.publish(slug), { documentId, expectedPublishedDocumentId }),
    unpublish: (slug) => state(routePaths.unpublish(slug), {}),
    rename: ({ from, to, expectedLatestDocumentId }) => state(routePaths.rename(from), { to, expectedLatestDocumentId }),
    uploadMedia: (file, { slug, signal }) => {
      const form = new FormData();
      form.set('slug', slug);
      form.set('file', file, file.name);
      return call<UploadedMedia>(routePaths.uploadMedia(), { method: 'POST', body: form, signal }, isUploadedMedia);
    },
  };
}
