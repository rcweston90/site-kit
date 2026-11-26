import './setup-dom.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  KeptEditsNotice,
  SaveStatus,
  SessionEndedDialog,
  UndoToast,
  deleteWithUndo,
  markSessionEnded,
  sessionPromptDismissed,
  useDraftAutosave,
  useFormSave,
  useLeaveGuard,
  useSaveStatus,
  whenHistorySettled,
  type SaveStatusState,
} from '../src/index.ts';
import { resetDeletesForTest } from '../src/deletes.ts';

async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(node); });
  return { container, unmount: () => act(async () => root.unmount()) };
}

const click = (element: Element | null | undefined) => act(async () => {
  assert.ok(element, 'element to click');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
});

const byText = (container: Element, text: string) => [...container.querySelectorAll('button')].find((button) => button.textContent === text);

test('a failed save says why in a live region, and Try again reruns it', async () => {
  let attempts = 0;
  let status!: SaveStatusState;
  function Page() {
    status = useSaveStatus();
    return <SaveStatus status={status} dirty />;
  }
  const { container, unmount } = await render(<Page />);
  const line = container.querySelector('[role="status"]')!;
  assert.equal(line.getAttribute('aria-live'), 'polite');
  assert.equal(line.textContent, 'Unsaved changes');

  await act(async () => {
    await status.run(async () => { attempts += 1; throw new TypeError('Failed to fetch'); });
  });
  assert.equal(attempts, 1);
  assert.equal(line.textContent, 'Failed to fetch.', 'a plain Error reads as its own sentence');
  assert.equal(line.getAttribute('data-tone'), 'error');
  await click(byText(container, 'Try again'));
  assert.equal(attempts, 2);
  await unmount();
});

test('the session dialog uses your sign-in form and reruns what waited', async () => {
  sessionPromptDismissed();
  let reruns = 0;
  const { container, unmount } = await render(
    <SessionEndedDialog renderSignIn={({ onSignedIn }) => <button type="button" onClick={onSignedIn}>Sign in with Example</button>} />,
  );
  const dialog = container.querySelector('dialog')!;
  assert.equal(dialog.hasAttribute('open'), false);
  await act(async () => { markSessionEnded(() => { reruns += 1; }); });
  assert.equal(dialog.hasAttribute('open'), true);
  assert.match(dialog.textContent ?? '', /Your session ended/);
  await click(byText(container, 'Sign in with Example'));
  assert.equal(reruns, 1);
  assert.equal(dialog.hasAttribute('open'), false);

  await act(async () => { markSessionEnded(() => { reruns += 1; }); });
  await click(byText(container, 'Later'));
  assert.equal(reruns, 1, 'Later drops the rerun');
  await unmount();
});

test('the Undo toast takes a delete back before anything is sent', async () => {
  resetDeletesForTest();
  let sent = 0;
  const { container, unmount } = await render(<UndoToast />);
  await act(async () => {
    deleteWithUndo({ key: 'post:1', label: 'Post deleted', send: async () => { sent += 1; } });
  });
  assert.match(container.textContent ?? '', /Post deleted/);
  await click(byText(container, 'Undo'));
  assert.equal(container.textContent, '');
  assert.equal(sent, 0);
  await unmount();
  resetDeletesForTest();
});

test('kept edits are offered, never applied, and the time format is yours', async () => {
  let restored = 0;
  const { container, unmount } = await render(
    <KeptEditsNotice offer={{ at: new Date(0), beforeLatestSave: true }} onRestore={() => { restored += 1; }} onDiscard={() => {}} formatTime={() => 'yesterday'} />,
  );
  assert.match(container.textContent ?? '', /Unsaved changes from yesterday were kept on this device, made before the latest save/);
  await click(byText(container, 'Restore'));
  assert.equal(restored, 1);
  await unmount();
});

test('useFormSave: dirty from the value, ⌘S saves only when there is something to save', async () => {
  let saves = 0;
  let setTitle!: (title: string) => void;
  let api!: ReturnType<typeof useFormSave<{ title: string }>>;
  const isPost = (value: unknown): value is { title: string } => typeof (value as { title?: unknown })?.title === 'string';
  function Editor() {
    const [title, set] = useState('Hello');
    setTitle = set;
    api = useFormSave({ storageKey: 'unsaved:post:1', ready: true, value: { title }, saved: { title: 'Hello' }, accept: isPost, onSave: () => { saves += 1; } });
    return <SaveStatus status={api.status} dirty={api.dirty} />;
  }
  const { container, unmount } = await render(<Editor />);
  const press = () => act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true })); });
  await press();
  assert.equal(saves, 0);
  assert.equal(container.textContent, 'All changes saved');
  await act(async () => { setTitle('Hello, world'); });
  assert.equal(api.dirty, true);
  assert.equal(container.textContent, 'Unsaved changes');
  await press();
  assert.equal(saves, 1);
  await unmount();
});

test('useDraftAutosave: saves once, a second after the last change, and only when eligible', async () => {
  const saves: string[] = [];
  let setText!: (text: string) => void;
  let setEligible!: (eligible: boolean) => void;
  let setFlush!: (flush: boolean) => void;
  function Editor() {
    const [text, setTextState] = useState('a');
    const [eligible, setEligibleState] = useState(true);
    const [flush, setFlushState] = useState(false);
    setText = setTextState; setEligible = setEligibleState; setFlush = setFlushState;
    useDraftAutosave({ eligible, revision: text, save: () => saves.push(text), flush });
    return null;
  }
  const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
  const page = await render(<Editor />);
  await act(async () => setText('ab'));
  await wait(500);
  await act(async () => setText('abc'));
  await wait(700);
  assert.deepEqual(saves, [], 'each change restarts the wait');
  await wait(400);
  assert.deepEqual(saves, ['abc'], 'the newest text, once');
  await act(async () => { setEligible(false); setText('abcd'); });
  await wait(1100);
  assert.deepEqual(saves, ['abc'], 'nothing while not eligible');
  await act(async () => { setEligible(true); setFlush(true); });
  await wait(20);
  assert.deepEqual(saves, ['abc', 'abcd'], 'flush saves now');
  await page.unmount();
});

test('whenHistorySettled: a page that leaves after its last save goes after the guard tidies history', async () => {
  let setDirty!: (dirty: boolean) => void;
  function Page() {
    const [dirty, setDirtyState] = useState(false);
    setDirty = setDirtyState;
    useLeaveGuard(dirty);
    return null;
  }
  const page = await render(<Page />);
  await act(async () => setDirty(true));
  assert.ok(window.history.state?.__saveKitUnsavedGuard, 'the guard keeps a copy entry while unsaved');
  const order: string[] = [];
  const popped = new Promise<void>((resolve) => window.addEventListener('popstate', () => { order.push('back landed'); resolve(); }, { once: true }));
  await act(async () => setDirty(false));
  await whenHistorySettled().then(() => order.push('navigate'));
  await popped;
  assert.deepEqual(order, ['back landed', 'navigate']);
  await page.unmount();
});
