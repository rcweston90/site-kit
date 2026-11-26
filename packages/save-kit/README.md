# @rcweston/save-kit

The save layer for React screens that edit things. About 1,100 lines, and React is the only dependency.

It handles the parts of saving that every admin screen needs and most get wrong:

- **Failures in plain words.** Every failed write becomes one of five reasons (session ended, offline, too large, refused, server) and reads as a sentence about the author's own action: "Couldn’t reach the server, so this wasn’t saved. Check your connection and try again." Raw server errors and developer notes are never shown.
- **Delete with Undo.** The item disappears at once and a toast offers Undo for 8 seconds. The delete is only sent when the toast goes, so Undo never has to rebuild anything. Hovering, focusing or hiding the tab pauses the clock. If the page closes, the delete goes out with `keepalive`. If it fails, the item comes back and the toast says why.
- **Kept edits.** Unsaved changes are kept in this browser while the page differs from its last save, and offered back next time: Restore or Discard, never applied unasked.
- **A leave guard.** Closing the tab, Back, or any link asks first while something is unsaved or still saving.
- **⌘S / Ctrl+S.** Saves when there's something to save, and says "All changes saved" when there isn't, instead of opening the browser's Save dialog.
- **Signing back in over the page.** A 401 opens a dialog with your sign-in form. The page stays mounted, so nothing typed is lost, and the writes that failed run again once the author is back.

## Install

```sh
pnpm add @rcweston/save-kit
```

```ts
import '@rcweston/save-kit/styles.css'; // optional default look
```

## A form, in one call

```tsx
import { SaveBar, saveRequest, useFormSave, KeptEditsNotice } from '@rcweston/save-kit';

function PostEditor({ post }: { post: Post }) {
  const [draft, setDraft] = useState(post);
  const [saved, setSaved] = useState(post);

  const save = () =>
    status.run(() => saveRequest<Post>(`/api/posts/${post.id}`, { method: 'PUT', body: JSON.stringify(draft) }), {
      onSaved: (value) => setSaved(value),
    });

  const { dirty, status, kept } = useFormSave({
    storageKey: `unsaved:post:${post.id}`,
    ready: true,
    value: draft,
    saved,
    accept: isPost, // what a kept value must look like to be offered back
    onSave: save,
  });

  return (
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={() => { setDraft(kept.offer!.value); kept.restore(); }} onDiscard={kept.discard} />}
      {/* fields */}
      <SaveBar status={status} dirty={dirty}>
        <button type="submit">Save</button>
      </SaveBar>
    </form>
  );
}
```

To have a draft save itself, add one line under `useFormSave`. Keep it to drafts: publishing stays a button.

```tsx
useDraftAutosave({ eligible: dirty && !status.failure && status.pending.length === 0, revision: JSON.stringify(draft), save });
```

## In your app shell, once

```tsx
import { SessionEndedDialog, UndoToast } from '@rcweston/save-kit';

<UndoToast />
<SessionEndedDialog renderSignIn={({ onSignedIn }) => <YourSignInForm onSuccess={onSignedIn} />} />
```

## Deleting

```ts
import { deleteWithUndo, recordKey, saveRequest, useHiddenKeys } from '@rcweston/save-kit';

deleteWithUndo({
  key: recordKey('post', post.id),
  label: 'Post deleted',
  send: ({ keepalive }) => saveRequest(`/api/posts/${post.id}`, { method: 'DELETE', keepalive }),
});

// In the list: leave out what's deleted or waiting for Undo.
const hidden = useHiddenKeys();
const visible = posts.filter((post) => !hidden.has(recordKey('post', post.id)));
```

A list that saves each action as it happens (publish, reorder, delete) uses `useListSave()` instead of `useFormSave`.

## The pieces

| Export | What it is |
| --- | --- |
| `saveRequest(url, init?, fetch?)` | `fetch` that returns JSON or throws a `SaveRequestError` with one of five `kind`s. A 401 marks the session ended. Pass your own `fetch` for headers or a base URL. |
| `explainFailure(reason, done?)` | The sentence for a failure. `done` is what didn't happen: `'saved'`, `'deleted'`, `'published'`. |
| `setFailureMessages(overrides)` | Reword or translate any of the messages. |
| `useSaveStatus()` | `run(action, { key, doing, success, done, onSaved })`, plus `pending`, `failure`, `success`, `fail`, `clear`, `note`. A failure stays up until that same action succeeds. |
| `SaveStatus`, `SaveBar` | The status line (a polite live region with Try again) and a pinned bottom bar. |
| `useLeaveGuard(active, options?)`, `confirmLeave` | The leave guard. Several parts of one page can register; leaving asks once. |
| `useSaveShortcut(onSave)`, `isSaveShortcut` | ⌘S / Ctrl+S. ⌘⇧S is left alone. |
| `useKeptEdits`, `KeptEditsNotice` | Edits kept on this device and offered back. |
| `deleteWithUndo`, `useHiddenKeys`, `UndoToast`, `reportLateFailure` | Delete now, Undo in a toast, sent later. ⌘Z undoes too, unless you're typing. |
| `SessionEndedDialog`, `markSessionEnded`, `sessionResumed` | Sign in over the page and carry on. |
| `useFormSave`, `useListSave` | Everything above for a form or a list. |
| `useDraftAutosave({ eligible, revision, save, flush? })` | Saves a private draft a second after typing stops (`DRAFT_AUTOSAVE_DELAY_MS`). `eligible` is yours to decide: dirty, valid, not mid-composition, nothing failing. `flush` saves now, for leaving the page. |
| `safeReturnPath(next, { prefix })` | The `?next=` path after signing in, only if it's a page on this origin under `prefix`. No imports, so edge middleware can use it. |

## Styling

The components render plain `.sk-*` classes. `styles.css` styles them with custom properties you can set in your theme: `--save-kit-fg`, `--save-kit-muted`, `--save-kit-bg`, `--save-kit-border`, `--save-kit-error`, `--save-kit-focus`, `--save-kit-font`, `--save-kit-font-size`, `--save-kit-line-height`, `--save-kit-radius`, `--save-kit-toast-bg`, `--save-kit-toast-fg`, `--save-kit-bar-width`. Buttons are at least 44px tall. Or skip the stylesheet and style the classes yourself.

## Licence

MIT
