import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPasscodeAuth, createMemoryRevocationList } from '../src/passcode/index.ts';
import { createMemoryRateLimiter } from '../src/rate-limit.ts';

const SECRET = 'a-test-secret-that-is-long-enough-to-sign';
const URL_BASE = 'https://cms.example.test/api/story/session';

function signInRequest(passcode: string, headers: Record<string, string> = {}) {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: JSON.stringify({ passcode }),
  });
}

function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  return header.split(';')[0];
}

const withCookie = (cookie: string) => new Request('https://cms.example.test/api/story/stories', { headers: { cookie } });

describe('passcode auth', () => {
  it('signs in with the right passcode and reads the session back', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET });
    const response = await auth.signIn(signInRequest('open sesame'));
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /^story_session=[\w-]+\.[\w-]+; Path=\/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure$/);
    const cookie = cookieFrom(response);
    assert.equal((await auth.getSession(withCookie(cookie)))?.role, 'admin');
    assert.equal((await auth.requireAdmin(withCookie(cookie))).role, 'admin');
    assert.equal(await auth.canViewProtected(withCookie(cookie)), true);
  });

  it('accepts a form post too, and leaves Secure off over plain http', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET });
    const form = new FormData();
    form.set('passcode', 'open sesame');
    const response = await auth.signIn(new Request('http://localhost:3000/api/story/session', { method: 'POST', body: form }));
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /Secure/);
  });

  it('refuses a wrong passcode, a missing one and a GET', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET });
    const wrong = await auth.signIn(signInRequest('open sesamE'));
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get('set-cookie'), null);
    assert.equal((await wrong.json()).code, 'UNAUTHORIZED');
    assert.equal((await auth.signIn(signInRequest(''))).status, 400);
    assert.equal((await auth.signIn(new Request(URL_BASE))).status, 405);
  });

  it('treats no cookie, a tampered cookie and a foreign cookie as signed out', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET });
    const other = createPasscodeAuth({ passcode: 'open sesame', secret: `${SECRET}-other` });
    const cookie = cookieFrom(await auth.signIn(signInRequest('open sesame')));
    const [name, token] = cookie.split('=');
    const [payload, signature] = token.split('.');

    assert.equal(await auth.getSession(new Request(URL_BASE)), null);
    // A payload rewritten to say something else, keeping the old signature.
    const forged = Buffer.from(JSON.stringify({ v: 1, role: 'admin', iat: 0, exp: 9_999_999_999, jti: 'x' })).toString('base64url');
    assert.equal(await auth.getSession(withCookie(`${name}=${forged}.${signature}`)), null);
    const flipped = signature.slice(0, -2) + (signature.at(-2) === 'A' ? 'B' : 'A') + signature.at(-1);
    assert.equal(await auth.getSession(withCookie(`${name}=${payload}.${flipped}`)), null);
    assert.equal(await auth.getSession(withCookie(`${name}=${payload}`)), null);
    assert.equal(await auth.getSession(withCookie(`${name}=not-a-token`)), null);
    assert.equal(await other.getSession(withCookie(cookie)), null);
    await assert.rejects(auth.requireAdmin(withCookie(`${name}=${payload}.${flipped}`)), (error: unknown) => error instanceof Response && error.status === 401);
  });

  it('expires sessions on its own clock', async () => {
    let now = Date.parse('2026-03-01T12:00:00Z');
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET, maxAgeSeconds: 60, now: () => now });
    const cookie = cookieFrom(await auth.signIn(signInRequest('open sesame')));
    now += 59_000;
    assert.ok(await auth.getSession(withCookie(cookie)));
    now += 1_000;
    assert.equal(await auth.getSession(withCookie(cookie)), null);
  });

  it('refuses a token issued in the future', async () => {
    let now = Date.parse('2026-03-01T12:00:00Z') + 10 * 60_000;
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET, now: () => now });
    const token = await auth.createSessionToken('admin');
    now -= 10 * 60_000;
    assert.equal(await auth.verifySessionToken(token), null);
  });

  it('revokes a session on sign-out, so the same cookie stops working', async () => {
    const revocation = createMemoryRevocationList();
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET, revocation });
    const cookie = cookieFrom(await auth.signIn(signInRequest('open sesame')));
    const second = cookieFrom(await auth.signIn(signInRequest('open sesame', { 'x-forwarded-for': '198.51.100.4' })));
    assert.ok(await auth.getSession(withCookie(cookie)));

    const signedOut = await auth.signOut(new Request(URL_BASE, { method: 'DELETE', headers: { cookie } }));
    assert.equal(signedOut.status, 200);
    assert.match(signedOut.headers.get('set-cookie') ?? '', /^story_session=; Path=\/; Max-Age=0/);
    assert.equal(await auth.getSession(withCookie(cookie)), null);
    // Other sessions keep working.
    assert.ok(await auth.getSession(withCookie(second)));
  });

  it('asks a custom revocation hook about every session', async () => {
    const seen: string[] = [];
    const auth = createPasscodeAuth({
      passcode: 'open sesame',
      secret: SECRET,
      revocation: { isRevoked: async (jti) => (seen.push(jti), true) },
    });
    const cookie = cookieFrom(await auth.signIn(signInRequest('open sesame')));
    assert.equal(await auth.getSession(withCookie(cookie)), null);
    assert.equal(seen.length, 1);
  });

  it('signs readers in with the viewer passcode for protected media only', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', viewerPasscode: 'just looking', secret: SECRET });
    const response = await auth.signIn(signInRequest('just looking'));
    assert.deepEqual(await response.json(), { ok: true, role: 'viewer' });
    const cookie = cookieFrom(response);
    assert.equal(await auth.canViewProtected(withCookie(cookie)), true);
    await assert.rejects(auth.requireAdmin(withCookie(cookie)), (error: unknown) => error instanceof Response && error.status === 401);
  });

  it('limits attempts per client, and wrong passcodes from everyone', async () => {
    const auth = createPasscodeAuth({ passcode: 'open sesame', secret: SECRET, rateLimiter: createMemoryRateLimiter(), limits: { perClient: 3, failures: 4 } });
    for (let attempt = 0; attempt < 3; attempt++) assert.equal((await auth.signIn(signInRequest('nope'))).status, 401);
    const limited = await auth.signIn(signInRequest('open sesame'));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.match((await limited.json()).error, /Too many tries/);

    // A fourth wrong passcode from elsewhere fills the shared backstop, then even the right one waits.
    assert.equal((await auth.signIn(signInRequest('nope', { 'x-forwarded-for': '198.51.100.1' }))).status, 401);
    assert.equal((await auth.signIn(signInRequest('open sesame', { 'x-forwarded-for': '198.51.100.2' }))).status, 429);
  });

  it('needs a passcode and a long secret', () => {
    assert.throws(() => createPasscodeAuth({ passcode: '', secret: SECRET }));
    assert.throws(() => createPasscodeAuth({ passcode: 'open sesame', secret: 'short' }));
  });
});
