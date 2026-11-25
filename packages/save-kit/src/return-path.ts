/*
 * Where to take the author after signing in. A page that found no session
 * sends them to the sign-in page with ?next=<the page>, and signing in returns
 * them there. Only a path on this origin under `prefix` qualifies: anything
 * else (another origin, a protocol-relative //host, a backslash browsers read
 * as a slash, whitespace) is dropped, so the parameter can't be used to send
 * someone elsewhere. No imports, so edge middleware can use it too.
 */
export function safeReturnPath(next: string | null | undefined, { prefix = '/' }: { prefix?: string } = {}): string | null {
  if (!next || next.length > 2048) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (/[\\\s]|\/\//.test(next)) return null;
  const base = prefix.endsWith('/') ? prefix : `${prefix}/`;
  // Under the prefix means a page inside it, not the prefix itself.
  if (base !== '/' && (!next.startsWith(base) || next.length === base.length)) return null;
  return next;
}
