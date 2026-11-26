/**
 * The small pieces every module's handlers share: JSON in and out, the
 * errors that map to a status, and the plain-words messages.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export const SITE_DATA_MESSAGES = {
  unreadable: 'The request couldn’t be read. Reload the page and try again.',
  notFound: 'There’s nothing here.',
  method: 'That route doesn’t take this kind of request.',
  crossSite: 'This request came from another site, so it was refused.',
  conflict: 'This changed somewhere else since you opened it. Reload to see the latest, then try again.',
  server: 'Something went wrong on the server. Try again in a moment.',
  unavailable: 'This part of the site isn’t set up on this server.',
} as const;

/** A write built on a version that is no longer the newest. Answers 409 with what's there now. */
export class VersionConflictError<T = unknown> extends Error {
  readonly status = 409;
  constructor(readonly current: T, message: string = SITE_DATA_MESSAGES.conflict) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

/** A request whose body or parameters don't make sense. Answers 400 with a sentence for people. */
export class InvalidInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/** Read a JSON object body, or throw InvalidInputError. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new InvalidInputError(SITE_DATA_MESSAGES.unreadable);
}

/** `expectedVersion` from a body: a number when the client sent one, undefined when it didn't ask for a check. */
export function expectedVersionOf(body: Record<string, unknown>): number | undefined {
  const value = body.expectedVersion;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new InvalidInputError(SITE_DATA_MESSAGES.unreadable);
  return value;
}

/** Writes must come from your own pages; the SameSite cookie keeps most cross-site posts out, this refuses the rest. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [
    new URL(request.url).host,
    request.headers.get('host'),
    ...(request.headers.get('x-forwarded-host')?.split(',').map((host) => host.trim()) ?? []),
  ].filter(Boolean);
  return hosts.includes(originHost);
}
