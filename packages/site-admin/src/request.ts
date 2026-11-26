import { saveRequest } from '@rcweston/save-kit';

/**
 * One way for an admin screen to call its handlers: same-origin cookies, JSON
 * in and out, and save-kit's failures (a 401 marks the session ended, so the
 * sign-in dialog opens over the page and the action reruns after it).
 */
export function adminRequest<T = unknown>(input: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return saveRequest<T>(input, { credentials: 'same-origin', ...init, headers });
}

/** GET as JSON, for reads that shouldn't mark the session ended on a 401. */
export async function adminRead<T>(input: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(input, { credentials: 'same-origin' });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}
