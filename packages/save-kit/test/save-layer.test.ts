import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import * as request from '../src/request.ts';
import * as session from '../src/session.ts';
import * as deletes from '../src/deletes.ts';
import { safeReturnPath } from '../src/return-path.ts';
import { statusLine } from '../src/status.ts';
import { isSaveShortcut } from '../src/shortcut.ts';
import { parseKept, keptOffer } from '../src/kept-edits.ts';
import { recordKey } from '../src/keys.ts';

// The save layer's rules: failures in plain words, an ended session signed
// back into over the page, edits kept on this device, ⌘S, and deletes that
// wait for Undo. Everything here runs without a browser or a server.

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('every failure reads as one of five plain reasons', () => {
  const { failureFor, explainFailure, SaveRequestError } = request;
  assert.equal(failureFor(401, { error: 'Unauthorized' }).kind, 'session');
  assert.equal(failureFor(413, null).kind, 'too-large');
  assert.equal(failureFor(500, { error: 'relation "posts" does not exist' }).kind, 'server');
  assert.equal(failureFor(500, { error: 'relation "posts" does not exist' }).detail, null, 'a server fault never shows its raw text');
  assert.equal(failureFor(409, { error: 'A post with this slug already exists' }).detail, 'A post with this slug already exists');
  assert.equal(failureFor(400, { error: 'Expected { id: number }' }).detail, null, 'a developer’s note is not shown');
  assert.equal(failureFor(400, { error: 'page_path is required' }).detail, null);

  const session = explainFailure(failureFor(401, { error: 'Unauthorized' }));
  assert.match(session, /session ended/);
  assert.doesNotMatch(session, /Unauthorized/);
  assert.match(explainFailure(new SaveRequestError('offline', null, null), 'deleted'), /wasn’t deleted/);
  assert.equal(explainFailure(failureFor(409, { error: 'A post with this slug already exists' })), 'Not saved: A post with this slug already exists.');
  assert.match(explainFailure(failureFor(400, { error: 'Expected { id: number }' })), /turned this down/);
  assert.equal(explainFailure(new Error('Give the track a title')), 'Give the track a title.');
});

test('saveRequest returns the body, and a 401 ends the session for the shell to ask', async () => {
  session.sessionPromptDismissed();
  assert.deepEqual(await request.saveRequest('/api/posts/1', {}, async () => json(200, { ok: 1 })), { ok: 1 });
  await assert.rejects(request.saveRequest('/api/posts/1', {}, async () => json(401, { error: 'Unauthorized' })), (error: unknown) =>
    error instanceof request.SaveRequestError && error.kind === 'session');
  assert.equal(session.isSessionEnded(), true);
  await assert.rejects(request.saveRequest('/api/posts/1', {}, async () => { throw new TypeError('Failed to fetch'); }), (error: unknown) =>
    error instanceof request.SaveRequestError && error.kind === 'offline');
  // An HTML error page still reads as a server fault, not a parse error.
  await assert.rejects(request.saveRequest('/api/posts/1', {}, async () => new Response('<html>', { status: 502 })), (error: unknown) =>
    error instanceof request.SaveRequestError && error.kind === 'server');
  session.sessionPromptDismissed();
});

test('signing back in reruns what waited for it, once', () => {
  let reruns = 0;
  session.markSessionEnded(() => { reruns += 1; });
  session.markSessionEnded(() => { reruns += 1; });
  assert.equal(session.isSessionEnded(), true);
  session.sessionResumed();
  assert.equal(reruns, 2);
  assert.equal(session.isSessionEnded(), false);
  session.sessionResumed();
  assert.equal(reruns, 2, 'nothing reruns twice');

  session.markSessionEnded(() => { reruns += 1; });
  session.sessionPromptDismissed();
  session.sessionResumed();
  assert.equal(reruns, 2, '“Later” drops the reruns; the page keeps its own Try again');
});

test('signing in returns only to a page on this origin, under the prefix', () => {
  assert.equal(safeReturnPath('/admin/posts', { prefix: '/admin' }), '/admin/posts');
  assert.equal(safeReturnPath('/admin/posts/my-post/edit?x=1', { prefix: '/admin/' }), '/admin/posts/my-post/edit?x=1');
  assert.equal(safeReturnPath('/settings'), '/settings', 'the default prefix is the whole origin');
  for (const unsafe of [null, '', '/admin', '/admin/', '/settings/x', '//evil.example/admin/x', 'https://evil.example/admin/x', '/admin//evil.example', '/admin/\\evil', '/admin/ x']) {
    assert.equal(safeReturnPath(unsafe, { prefix: '/admin' }), null, String(unsafe));
  }
  for (const unsafe of ['//evil.example', 'https://evil.example', 'evil', '/\\evil', '/a b']) {
    assert.equal(safeReturnPath(unsafe), null, unsafe);
  }
});

test('the status line puts a failure first, then work in flight, then unsaved', () => {
  const failure = { message: 'Couldn’t reach the server', retry: null };
  assert.deepEqual(statusLine({ pending: ['Saving…'], failure, success: 'Saved', dirty: true }), { text: 'Couldn’t reach the server', tone: 'error' });
  assert.deepEqual(statusLine({ pending: ['Saving…', 'Uploading…'], failure: null, success: 'Saved', dirty: true }), { text: 'Uploading…', tone: 'muted' });
  assert.equal(statusLine({ pending: [], failure: null, success: 'Saved', dirty: true }).text, 'Unsaved changes');
  assert.equal(statusLine({ pending: [], failure: null, success: 'Saved', dirty: false }).text, 'Saved');
  assert.equal(statusLine({ pending: [], failure: null, success: null, dirty: false, idle: 'Not saved yet' }).text, 'Not saved yet');
});

test('⌘S is plain ⌘S or Ctrl+S', () => {
  const key = (overrides: Partial<KeyboardEvent>) => ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, key: 's', ...overrides });
  assert.equal(isSaveShortcut(key({ metaKey: true })), true);
  assert.equal(isSaveShortcut(key({ ctrlKey: true, key: 'S' })), true);
  assert.equal(isSaveShortcut(key({ metaKey: true, shiftKey: true })), false);
  assert.equal(isSaveShortcut(key({ metaKey: true, altKey: true })), false);
  assert.equal(isSaveShortcut(key({})), false);
});

test('kept edits come back only when they’re this page’s and differ from what’s saved', () => {
  const isPost = (value: unknown): value is { title: string } => Boolean(value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string');
  const kept = parseKept(JSON.stringify({ value: { title: 'Draft' }, base: 'v1', at: 1 }), isPost);
  assert.deepEqual(kept, { value: { title: 'Draft' }, base: 'v1', at: 1 });
  assert.equal(parseKept(JSON.stringify({ base: null, at: 2 }), isPost), null, 'an entry without a value');
  assert.equal(parseKept(JSON.stringify({ value: { body: 'x' }, at: 1 }), isPost), null, 'another page’s shape');
  assert.equal(parseKept('{not json', isPost), null);
  assert.equal(parseKept(null, isPost), null);

  assert.equal(keptOffer(kept, { title: 'Draft' }, 'v1'), null, 'the same as saved: nothing to offer');
  assert.equal(keptOffer(kept, { title: 'Saved' }, 'v1')?.beforeLatestSave, false);
  assert.equal(keptOffer(kept, { title: 'Saved' }, 'v2')?.beforeLatestSave, true, 'saved since: offered, and marked');
});

test('a delete hides at once, Undo sends nothing, and the toast running out sends it', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    deletes.resetDeletesForTest();
    const sent: boolean[] = [];
    let undone = 0;
    let done = 0;
    const remove = (key: string) => deletes.deleteWithUndo({
      key,
      label: 'Post deleted',
      send: async ({ keepalive }) => { sent.push(keepalive); return { success: true }; },
      onUndo: () => { undone += 1; },
      onDone: () => { done += 1; },
    });

    remove('post:1');
    assert.equal(deletes.hiddenKeys().has('post:1'), true);
    assert.deepEqual(deletes.undoToastState(), { kind: 'pending', label: 'Post deleted' });
    assert.equal(deletes.undoDelete(), true);
    assert.equal(deletes.hiddenKeys().has('post:1'), false);
    assert.equal(undone, 1);
    mock.timers.tick(deletes.UNDO_WINDOW_MS + 1);
    assert.deepEqual(sent, [], 'an undone delete is never sent');

    remove('post:2');
    mock.timers.tick(deletes.UNDO_WINDOW_MS - 1);
    assert.deepEqual(sent, []);
    mock.timers.tick(1);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(sent, [false]);
    assert.equal(done, 1);
    assert.equal(deletes.hiddenKeys().has('post:2'), true, 'still hidden once it’s gone');
    assert.equal(deletes.undoToastState(), null);

    // A second delete sends the first now: one toast at a time.
    remove('post:3');
    remove('post:4');
    await Promise.resolve();
    assert.deepEqual(sent, [false, false]);
    assert.deepEqual(deletes.undoToastState(), { kind: 'pending', label: 'Post deleted' });

    // Hovering the toast holds the clock.
    deletes.pauseUndo();
    mock.timers.tick(deletes.UNDO_WINDOW_MS * 2);
    assert.deepEqual(sent, [false, false]);
    deletes.resumeUndo();

    // Leaving the page sends what's waiting, with keepalive.
    deletes.commitPendingDelete(true);
    await Promise.resolve();
    assert.deepEqual(sent, [false, false, true]);
  } finally {
    mock.timers.reset();
    deletes.resetDeletesForTest();
  }
});

test('a delete that fails comes back and says why; one already gone counts as done', async () => {
  deletes.resetDeletesForTest();
  let undone = 0;
  deletes.deleteWithUndo({
    key: 'note:9',
    label: 'Note deleted',
    send: async () => { throw request.failureFor(500, null); },
    onUndo: () => { undone += 1; },
  });
  deletes.commitPendingDelete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deletes.hiddenKeys().has('note:9'), false, 'it’s back');
  assert.equal(undone, 1);
  const toast = deletes.undoToastState();
  assert.equal(toast?.kind, 'failed');
  assert.match(toast && toast.kind === 'failed' ? toast.message : '', /wasn’t deleted.*back where it was/);

  let done = 0;
  deletes.deleteWithUndo({
    key: 'note:10',
    label: 'Note deleted',
    send: async () => { throw request.failureFor(404, { error: 'Note not found' }); },
    onDone: () => { done += 1; },
  });
  deletes.commitPendingDelete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, 1);
  assert.equal(deletes.hiddenKeys().has('note:10'), true);
  deletes.resetDeletesForTest();
});

test('failure messages can be reworded, and unset ones keep the defaults', () => {
  const { failureFor, explainFailure, setFailureMessages, SaveRequestError } = request;
  try {
    setFailureMessages({ offline: (done) => `Offline: not ${done}.` });
    assert.equal(explainFailure(new SaveRequestError('offline', null, null), 'published'), 'Offline: not published.');
    assert.match(explainFailure(failureFor(500, null)), /went wrong on the server/);
  } finally {
    setFailureMessages({});
  }
});

test('record keys are kind and id', () => {
  assert.equal(recordKey('post', 'my-post'), 'post:my-post');
  assert.equal(recordKey('note', 12), 'note:12');
});
