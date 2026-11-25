/**
 * Everything in memory: a document store, a media store, and an
 * `EditorTransport` that runs the real handlers in-process. For demos,
 * tests and trying the editor without a database.
 */

import type { AuthAdapter, DocumentStore, MediaStore, Session } from '@rcweston/story-core';
import { createFetchTransport, type StoryTransport } from '../client.js';
import { createStoryHandlers, type StoryHandlerOptions, type StoryHandlers } from '../handlers.js';
import { createMemoryDocumentStore } from './document-store.js';
import { createMemoryMediaStore } from './media-store.js';

export { createMemoryDocumentStore, type MemoryDocumentStoreOptions } from './document-store.js';
export { createMemoryMediaStore, type MemoryMediaStore, type MemoryMediaStoreOptions } from './media-store.js';

/** An auth adapter that lets every request in as the admin. Only for in-process demos and tests. */
export function createOpenAuth(session: Session = { role: 'admin', subject: 'demo' }): AuthAdapter {
  return {
    getSession: async () => session,
    requireAdmin: async () => session,
    canViewProtected: async () => true,
  };
}

export interface MemoryTransportOptions extends Partial<Omit<StoryHandlerOptions, 'store' | 'media' | 'auth'>> {
  store?: DocumentStore;
  media?: MediaStore;
  /** Default: everyone is the admin. */
  auth?: AuthAdapter;
  /** The origin the in-process requests pretend to come from. Default `http://story.local`. */
  origin?: string;
}

export interface MemoryTransport extends StoryTransport {
  store: DocumentStore;
  media: MediaStore;
  handlers: StoryHandlers;
  /** Make any request to the handlers, e.g. to fetch an uploaded file. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * An `EditorTransport` with no network: each call becomes a `Request`,
 * goes through the same handlers a server would mount, and the `Response`
 * is read by the same client code `createFetchTransport` uses.
 */
export function createMemoryTransport(options: MemoryTransportOptions = {}): MemoryTransport {
  const store = options.store ?? createMemoryDocumentStore();
  const media = options.media ?? createMemoryMediaStore();
  const auth = options.auth ?? createOpenAuth();
  const origin = (options.origin ?? 'http://story.local').replace(/\/+$/, '');
  const handlers = createStoryHandlers({ ...options, store, media, auth });
  const basePath = (options.basePath ?? '/api/story').replace(/\/+$/, '');

  const send = (url: string, init: RequestInit = {}) => handlers.handle(new Request(new URL(url, origin), init));
  const transport = createFetchTransport({ baseUrl: `${origin}${basePath}`, fetch: send });
  return { ...transport, store, media, handlers, fetch: send };
}
