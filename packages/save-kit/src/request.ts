import { markSessionEnded } from './session.js';

/*
 * Every write goes through here, so a failure always comes back as one of
 * five plain reasons rather than a status code or a raw server string. A 401
 * also marks the session ended (session.ts), so the app can ask the author to
 * sign in over the page instead of losing their work.
 */

export type FailureKind = 'session' | 'offline' | 'too-large' | 'refused' | 'server';

export class SaveRequestError extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status: number | null,
    /** The server's own sentence, when it sent one meant for people. */
    readonly detail: string | null,
  ) {
    super(detail ?? kind);
    this.name = 'SaveRequestError';
  }
}

/* Some routes answer with a developer's note ("Expected { id: number }",
   "page_path is required"). Those only happen when the page itself is wrong,
   so the author gets the plain fallback instead. */
const looksLikeCode = (text: string) => /[{}[\]_]|^Expected\b|must be an array/.test(text);

/** The reason a finished request failed, from its status and body. The
 *  server's sentence is read from `{ error: string }`. */
export function failureFor(status: number, body: unknown): SaveRequestError {
  const raw = body && typeof body === 'object' && 'error' in body ? (body as { error?: unknown }).error : null;
  const detail = typeof raw === 'string' && raw.trim() && !looksLikeCode(raw) ? raw.trim() : null;
  if (status === 401) return new SaveRequestError('session', status, null);
  if (status === 413) return new SaveRequestError('too-large', status, detail);
  if (status >= 500) return new SaveRequestError('server', status, null);
  return new SaveRequestError('refused', status, detail);
}

/**
 * Fetch a route and return its JSON. Throws SaveRequestError on any failure,
 * including no connection; a 401 also marks the session ended. Pass your own
 * `fetch` to add headers, a base URL or a test double.
 */
export async function saveRequest<T = unknown>(
  input: string,
  init: RequestInit = {},
  request: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await request(input, init);
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason;
    throw new SaveRequestError('offline', null, null);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = failureFor(response.status, body);
    if (failure.kind === 'session') markSessionEnded();
    throw failure;
  }
  return body as T;
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The words for each failure. `done` is what didn't happen ("saved",
 *  "deleted", "published"); `detail` is the server's own sentence. */
export interface FailureMessages {
  session: (done: string) => string;
  offline: (done: string) => string;
  tooLarge: (detail: string | null) => string;
  server: (done: string) => string;
  refused: (done: string, detail: string | null) => string;
  unknown: (done: string) => string;
}

export const defaultMessages: FailureMessages = {
  session: (done) => `Your session ended, so this wasn’t ${done}. Sign in again — nothing on this page is lost.`,
  offline: (done) => `Couldn’t reach the server, so this wasn’t ${done}. Check your connection and try again.`,
  tooLarge: (detail) => (detail ? sentence(detail) : 'That file is too large to upload.'),
  server: (done) => `Something went wrong on the server, so this wasn’t ${done}. Try again in a moment.`,
  refused: (done, detail) => (detail ? `Not ${done}: ${sentence(detail)}` : `The server turned this down, so it wasn’t ${done}.`),
  unknown: (done) => `This wasn’t ${done}. Try again.`,
};

let messages: FailureMessages = defaultMessages;

/** Reword any failure, e.g. to say "the site" or to translate. Unset keys keep
 *  the defaults. */
export function setFailureMessages(overrides: Partial<FailureMessages>) {
  messages = { ...defaultMessages, ...overrides };
}

/**
 * What to tell the author when something didn't go through, as one sentence
 * about their own action.
 */
export function explainFailure(reason: unknown, done = 'saved'): string {
  if (reason instanceof SaveRequestError) {
    switch (reason.kind) {
      case 'session': return messages.session(done);
      case 'offline': return messages.offline(done);
      case 'too-large': return messages.tooLarge(reason.detail);
      case 'server': return messages.server(done);
      case 'refused': return messages.refused(done, reason.detail);
    }
  }
  if (reason instanceof Error && reason.message) return sentence(reason.message);
  return messages.unknown(done);
}
