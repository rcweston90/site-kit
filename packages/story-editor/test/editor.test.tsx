import { dom } from './setup-dom.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactElement } from 'react';
import { DraftConflictError, type EditorTransport, type Story, type StoryEditorState } from '@rcweston/story-core';
import { StoryEditor } from '../src/index.ts';
import { documentFor, editorState, story } from './fixtures.ts';

/*
 * The editor, mounted in jsdom against a fake transport. These cover the
 * block-tools surface (inline fields on the real page). The continuous
 * writing surface is a ProseMirror view that needs real layout, so its
 * behaviour is covered through its model in model.test.ts instead.
 */

type Call = { method: keyof EditorTransport; input: unknown };

function fakeTransport(initial: StoryEditorState, overrides: Partial<EditorTransport> = {}) {
  const calls: Call[] = [];
  let state = initial;
  const transport: EditorTransport = {
    async load(slug) { calls.push({ method: 'load', input: slug }); return state; },
    async saveDraft(input) {
      calls.push({ method: 'saveDraft', input });
      const doc = documentFor(input.content, state.documents.length + 1, input.parentDocumentId);
      state = { ...state, story: input.content, documents: [doc, ...state.documents], readinessByDocumentId: { ...state.readinessByDocumentId, [doc.id]: { errors: [], warnings: [] } } };
      return state;
    },
    async publish(input) {
      calls.push({ method: 'publish', input });
      state = { ...state, publishedDocumentId: input.documentId, liveStory: state.story };
      return state;
    },
    async unpublish(slug) { calls.push({ method: 'unpublish', input: slug }); state = { ...state, publishedDocumentId: null, liveStory: null }; return state; },
    async rename(input) { calls.push({ method: 'rename', input }); return state; },
    async uploadMedia(file) { calls.push({ method: 'uploadMedia', input: file.name }); return { src: '/placeholder/upload.svg', key: 'upload', kind: 'image', contentType: 'image/svg+xml', size: 1 }; },
    ...overrides,
  };
  return { transport, calls };
}

async function mount(element: ReactElement) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  await settle();
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const text = (container: HTMLElement) => container.textContent ?? '';

async function editTitle(container: HTMLElement, value: string) {
  const field = [...container.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable]')].find((node) => node.textContent === story().title);
  assert.ok(field, 'the story title is editable on the page');
  await act(async () => { field.focus(); });
  field.textContent = value;
  await act(async () => { field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await act(async () => { field.blur(); });
  await settle();
}

const saveButton = (container: HTMLElement) => [...container.querySelectorAll('button')].find((button) => /^(Save|Saved|Retry|Saving…)$/.test(button.textContent?.trim() ?? ''));

async function pressSaveShortcut() {
  await act(async () => {
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 's', metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }));
  });
  await settle();
}

test('loads through the transport when no initial state is given', async () => {
  const { transport, calls } = fakeTransport(editorState());
  const { container, unmount } = await mount(<StoryEditor slug="field-notes-that-travel" transport={transport} />);
  try {
    assert.deepEqual(calls.map((call) => call.method), ['load']);
    assert.match(text(container), /Field notes that travel/);
    assert.match(text(container), /Saved/);
  } finally { unmount(); }
});

test('an edit marks the story unsaved, and ⌘S saves it through the transport', async () => {
  const { transport, calls } = fakeTransport(editorState());
  const { container, unmount } = await mount(<StoryEditor slug="field-notes-that-travel" transport={transport} initialState={editorState()} />);
  try {
    assert.equal(calls.length, 0, 'an initial state skips the first load');
    await editTitle(container, 'Field notes that stay');
    assert.match(text(container), /Unsaved changes/);
    assert.equal(saveButton(container)?.textContent?.trim(), 'Save');
    await pressSaveShortcut();
    const save = calls.find((call) => call.method === 'saveDraft');
    assert.ok(save, 'the shortcut saved');
    const input = save.input as { slug: string; content: Story; parentDocumentId: string | null };
    assert.equal(input.slug, 'field-notes-that-travel');
    assert.equal(input.content.title, 'Field notes that stay');
    assert.equal(input.parentDocumentId, 'doc-1');
    assert.doesNotMatch(text(container), /Unsaved changes/);
  } finally { unmount(); }
});

test('a save conflict shows a plain message and keeps the unsaved work', async () => {
  const { transport } = fakeTransport(editorState(), {
    async saveDraft() { throw new DraftConflictError('Someone saved a newer draft'); },
  });
  const { container, unmount } = await mount(<StoryEditor slug="field-notes-that-travel" transport={transport} initialState={editorState()} />);
  try {
    await editTitle(container, 'Field notes, edited twice');
    await pressSaveShortcut();
    assert.match(text(container), /Someone saved a newer draft\. Your unsaved work is still open\./);
    assert.ok(container.querySelector('[role="textbox"]')?.closest('body'));
    assert.ok([...container.querySelectorAll<HTMLElement>('[role="textbox"]')].some((node) => node.textContent === 'Field notes, edited twice'));
    assert.doesNotMatch(text(container), /409|CONFLICT|\/api\//);
  } finally { unmount(); }
});

test('a 409 from a fetch transport reads the same way', async () => {
  const conflict = Object.assign(new Error('This story has a newer draft'), { status: 409, body: { error: 'This story has a newer draft', code: 'CONFLICT' } });
  const { transport } = fakeTransport(editorState(), { async saveDraft() { throw conflict; } });
  const { container, unmount } = await mount(<StoryEditor slug="field-notes-that-travel" transport={transport} initialState={editorState()} />);
  try {
    await editTitle(container, 'Field notes, again');
    await pressSaveShortcut();
    assert.match(text(container), /Your unsaved work is still open/);
    assert.doesNotMatch(text(container), /409|CONFLICT/);
  } finally { unmount(); }
});

test('publish sends the saved version to the transport', async () => {
  const { transport, calls } = fakeTransport(editorState());
  const { container, unmount } = await mount(<StoryEditor slug="field-notes-that-travel" transport={transport} initialState={editorState()} />);
  try {
    const publish = [...container.querySelectorAll('button')].find((button) => /publish/i.test(button.textContent?.trim() ?? ''));
    assert.ok(publish, `a publish control is on the bar: ${[...container.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).join(' | ')}`);
    await act(async () => { publish.click(); });
    await settle();
    const confirm = [...dom.window.document.querySelectorAll('button')].find((button) => button !== publish && /^Publish/.test(button.textContent?.trim() ?? ''));
    assert.ok(confirm, `the review panel offers Publish: ${[...dom.window.document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).join(' | ')}`);
    await act(async () => { confirm.click(); });
    await settle();
    const call = calls.find((entry) => entry.method === 'publish');
    assert.ok(call, 'publish reached the transport');
    assert.deepEqual(call.input, { slug: 'field-notes-that-travel', documentId: 'doc-1', expectedPublishedDocumentId: null });
  } finally { unmount(); }
});

test('an ended session opens the sign-in dialog and retries the save after sign-in', async () => {
  let attempts = 0;
  const { transport, calls } = fakeTransport(editorState());
  const saveDraft = transport.saveDraft;
  transport.saveDraft = async (input) => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('Sign in again'), { status: 401, body: { error: 'Sign in again', code: 'UNAUTHORIZED' } });
    return saveDraft(input);
  };
  let signIn: (() => void) | null = null;
  const { container, unmount } = await mount(
    <StoryEditor slug="field-notes-that-travel" transport={transport} initialState={editorState()}
      renderSignIn={({ onSignedIn }) => { signIn = onSignedIn; return <button type="button" onClick={onSignedIn}>Sign in here</button>; }} />,
  );
  try {
    await editTitle(container, 'Field notes after sign-in');
    await pressSaveShortcut();
    assert.match(text(container), /Your session ended/);
    assert.ok(signIn, 'the host renders its own sign-in');
    await act(async () => { signIn!(); });
    await settle();
    assert.equal(attempts, 2, 'the save ran again after sign-in');
    assert.equal((calls.find((call) => call.method === 'saveDraft')?.input as { content: Story }).content.title, 'Field notes after sign-in');
  } finally { unmount(); }
});

test('a story that moved follows its new address through navigate', async () => {
  const visited: string[] = [];
  const { transport } = fakeTransport(editorState(), {
    async load() { throw Object.assign(new Error('Moved'), { status: 409, body: { error: 'Moved', code: 'STORY_MOVED', movedTo: 'field-notes-renamed' } }); },
  });
  const { unmount } = await mount(
    <StoryEditor slug="field-notes-that-travel" transport={transport} navigate={(href) => visited.push(href)} routes={{ editor: (slug) => `/edit/${slug}` }} />,
  );
  try {
    assert.deepEqual(visited, ['/edit/field-notes-renamed']);
  } finally { unmount(); }
});
