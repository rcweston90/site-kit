/**
 * Passcode sign-in: one shared passcode for the editor (and, optionally, a
 * second one for readers of protected media), and a stateless session cookie.
 *
 * The cookie is `base64url(payload).base64url(HMAC-SHA256(secret, payload))`.
 * It's checked for its signature, its role, its expiry, and against an
 * optional revocation list, so signing out can end a session for good and
 * not only drop the cookie from one browser. Everything here is Web Crypto,
 * so it runs in Node, in browsers' workers and at the edge.
 */

import type { AuthAdapter, Session, StoryErrorBody } from '@rcweston/story-core';
import { createMemoryRateLimiter, type RateLimiter } from '../rate-limit.js';

export type SessionRole = Session['role'];

export interface SessionPayload {
  v: 1;
  role: SessionRole;
  /** Issued at, seconds since the epoch. */
  iat: number;
  /** Expires at, seconds since the epoch. */
  exp: number;
  /** A random id, so one session can be revoked. */
  jti: string;
}

/** Sessions that must stop working before they expire. */
export interface RevocationList {
  isRevoked(jti: string): boolean | Promise<boolean>;
  /** Called by `signOut`. Keep the id until `expiresAt`; after that the cookie fails on its own. */
  revoke?(jti: string, expiresAt: Date): void | Promise<void>;
}

export interface PasscodeAuthOptions {
  /** The editor's passcode. */
  passcode: string;
  /** An optional second passcode that signs readers in to protected media only. */
  viewerPasscode?: string;
  /** Signs the session cookie. Use at least 32 random characters. */
  secret: string;
  /** Default `story_session`. */
  cookieName?: string;
  /** How long a session lasts. Default one day. */
  maxAgeSeconds?: number;
  /** Cookie path. Default `/`. */
  path?: string;
  /** `auto` (the default) sets `Secure` when the request came over https. */
  secure?: boolean | 'auto';
  sameSite?: 'Lax' | 'Strict';
  revocation?: RevocationList;
  /** Counts sign-in attempts. Default: in memory, per instance. `false` turns limiting off. */
  rateLimiter?: RateLimiter | false;
  limits?: {
    /** Attempts one client may make per window. Default 5. */
    perClient?: number;
    /** Wrong passcodes from everyone per window, a backstop against rotating addresses. Default 20. */
    failures?: number;
    /** Default 15 minutes. */
    windowMs?: number;
  };
  /** Who is asking, for the per-client limit. Default: the first `x-forwarded-for` address, else `x-real-ip`. */
  clientKey?: (request: Request) => string;
  /** The clock, in milliseconds, for tests. */
  now?: () => number;
}

export interface PasscodeAuth extends AuthAdapter {
  /** POST handler. Body: JSON or form data with `passcode`. Sets the session cookie. */
  signIn(request: Request): Promise<Response>;
  /** POST or DELETE handler. Revokes the session (when a revocation list is set) and clears the cookie. */
  signOut(request: Request): Promise<Response>;
  /** A signed token for `role`, for scripts and tests. */
  createSessionToken(role?: SessionRole): Promise<string>;
  /** The payload of a valid, unexpired, unrevoked token, or null. */
  verifySessionToken(token: string): Promise<SessionPayload | null>;
  readonly cookieName: string;
}

// ─── Encoding ───────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function randomId(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/** Equal-length byte arrays, compared without an early exit. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    const name = part.slice(0, at).trim();
    if (name && !cookies.has(name)) cookies.set(name, part.slice(at + 1).trim());
  }
  return cookies;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const PASSCODE_MESSAGES = {
  unauthorized: 'Sign in to keep going.',
  missing: 'Enter the passcode.',
  wrong: 'That passcode didn’t work. Check it and try again.',
  method: 'Send the passcode with a POST request.',
  tooMany: (seconds: number) => {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `Too many tries. Wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`;
  },
} as const;

/** A 401 the handlers can throw from `requireAdmin`. */
export function unauthorizedResponse(): Response {
  const body: StoryErrorBody = { error: PASSCODE_MESSAGES.unauthorized, code: 'UNAUTHORIZED' };
  return json(body, 401);
}

// ─── The adapter ────────────────────────────────────────────────────────────

export function createPasscodeAuth(options: PasscodeAuthOptions): PasscodeAuth {
  if (!options.passcode) throw new Error('createPasscodeAuth needs a passcode.');
  if (!options.secret || options.secret.length < 32) {
    throw new Error('createPasscodeAuth needs a secret of at least 32 characters to sign session cookies.');
  }
  const cookieName = options.cookieName ?? 'story_session';
  const maxAgeSeconds = options.maxAgeSeconds ?? 24 * 60 * 60;
  const path = options.path ?? '/';
  const sameSite = options.sameSite ?? 'Lax';
  const now = options.now ?? (() => Date.now());
  const limiter = options.rateLimiter === false ? null : options.rateLimiter ?? createMemoryRateLimiter({ now });
  const perClient = options.limits?.perClient ?? 5;
  const failures = options.limits?.failures ?? 20;
  const windowMs = options.limits?.windowMs ?? 15 * 60 * 1000;
  const clientKey = options.clientKey ?? ((request: Request) =>
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown');

  const keyPromise = crypto.subtle.importKey('raw', encoder.encode(options.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.sign('HMAC', await keyPromise, encoder.encode(`passcode:${text}`)));
  const expected = Promise.all([
    digest(options.passcode),
    options.viewerPasscode ? digest(options.viewerPasscode) : Promise.resolve(null),
  ]);

  /** Which role a passcode signs in as, compared in constant time (both digests are always checked). */
  async function roleFor(input: string): Promise<SessionRole | null> {
    const [admin, viewer] = await expected;
    const given = await digest(input);
    const isAdmin = constantTimeEqual(given, admin);
    const isViewer = viewer ? constantTimeEqual(given, viewer) : false;
    return isAdmin ? 'admin' : isViewer ? 'viewer' : null;
  }

  async function createSessionToken(role: SessionRole = 'admin'): Promise<string> {
    const issued = Math.floor(now() / 1000);
    const payload: SessionPayload = { v: 1, role, iat: issued, exp: issued + maxAgeSeconds, jti: randomId() };
    const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await keyPromise, encoder.encode(body)));
    return `${body}.${toBase64Url(signature)}`;
  }

  async function verifySessionToken(token: string): Promise<SessionPayload | null> {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, signatureText] = parts;
    const signature = fromBase64Url(signatureText);
    if (!body || !signature || signature.length !== 32) return null;
    // Web Crypto's verify compares in constant time.
    const valid = await crypto.subtle.verify('HMAC', await keyPromise, signature as Uint8Array<ArrayBuffer>, encoder.encode(body));
    if (!valid) return null;
    const bytes = fromBase64Url(body);
    if (!bytes) return null;
    let payload: Partial<SessionPayload>;
    try {
      payload = JSON.parse(decoder.decode(bytes));
    } catch {
      return null;
    }
    if (!payload || payload.v !== 1) return null;
    if (payload.role !== 'admin' && payload.role !== 'viewer') return null;
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number' || typeof payload.jti !== 'string') return null;
    const seconds = now() / 1000;
    if (seconds >= payload.exp) return null;
    // A token from the future was not made by this clock; allow a minute of drift.
    if (payload.iat > seconds + 60) return null;
    if (options.revocation && (await options.revocation.isRevoked(payload.jti))) return null;
    return payload as SessionPayload;
  }

  function cookie(request: Request, value: string, maxAge: number): string {
    const secure = options.secure === 'auto' || options.secure === undefined
      ? new URL(request.url).protocol === 'https:'
      : options.secure;
    return [
      `${cookieName}=${value}`,
      `Path=${path}`,
      `Max-Age=${maxAge}`,
      'HttpOnly',
      `SameSite=${sameSite}`,
      secure ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  async function sessionPayload(request: Request): Promise<SessionPayload | null> {
    const token = parseCookies(request.headers.get('cookie')).get(cookieName);
    if (!token) return null;
    try {
      return await verifySessionToken(token);
    } catch {
      return null;
    }
  }

  async function readPasscode(request: Request): Promise<string | null> {
    const type = request.headers.get('content-type') ?? '';
    try {
      if (type.includes('application/json')) {
        const body = (await request.json()) as { passcode?: unknown } | null;
        return typeof body?.passcode === 'string' ? body.passcode : null;
      }
      const form = await request.formData();
      const value = form.get('passcode');
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  return {
    cookieName,
    createSessionToken,
    verifySessionToken,

    async getSession(request) {
      const payload = await sessionPayload(request);
      return payload ? { role: payload.role, subject: `session:${payload.jti}` } : null;
    },

    async requireAdmin(request) {
      const payload = await sessionPayload(request);
      if (payload?.role !== 'admin') throw unauthorizedResponse();
      return { role: 'admin', subject: `session:${payload.jti}` };
    },

    async canViewProtected(request) {
      return (await sessionPayload(request)) !== null;
    },

    async signIn(request) {
      if (request.method !== 'POST') return json({ error: PASSCODE_MESSAGES.method }, 405, { allow: 'POST' });
      const client = `client:${clientKey(request)}`;
      if (limiter) {
        const byClient = await limiter.hit(client, perClient, windowMs);
        if (!byClient.allowed) {
          return json({ error: PASSCODE_MESSAGES.tooMany(byClient.retryAfterSeconds) }, 429, { 'retry-after': String(byClient.retryAfterSeconds) });
        }
        const overall = await limiter.peek('failures', failures);
        if (!overall.allowed) {
          return json({ error: PASSCODE_MESSAGES.tooMany(overall.retryAfterSeconds) }, 429, { 'retry-after': String(overall.retryAfterSeconds) });
        }
      }
      const passcode = await readPasscode(request);
      if (!passcode) return json({ error: PASSCODE_MESSAGES.missing, code: 'INVALID' } satisfies StoryErrorBody, 400);
      const role = await roleFor(passcode);
      if (!role) {
        // Only wrong passcodes count toward the shared backstop, so one
        // client can't lock everyone out with junk requests.
        if (limiter) await limiter.hit('failures', failures, windowMs);
        return json({ error: PASSCODE_MESSAGES.wrong, code: 'UNAUTHORIZED' } satisfies StoryErrorBody, 401);
      }
      const token = await createSessionToken(role);
      return json({ ok: true, role }, 200, { 'set-cookie': cookie(request, token, maxAgeSeconds) });
    },

    async signOut(request) {
      const payload = await sessionPayload(request);
      if (payload && options.revocation?.revoke) {
        await options.revocation.revoke(payload.jti, new Date(payload.exp * 1000));
      }
      return json({ ok: true }, 200, { 'set-cookie': cookie(request, '', 0) });
    },
  };
}

/** A revocation list in memory, for one long-running server. Ids drop out once their sessions would have expired anyway. */
export function createMemoryRevocationList(options: { now?: () => number } = {}): Required<RevocationList> {
  const now = options.now ?? (() => Date.now());
  const revoked = new Map<string, number>();
  return {
    isRevoked(jti) {
      const until = revoked.get(jti);
      if (until === undefined) return false;
      if (now() >= until) {
        revoked.delete(jti);
        return false;
      }
      return true;
    },
    revoke(jti, expiresAt) {
      revoked.set(jti, expiresAt.getTime());
    },
  };
}
