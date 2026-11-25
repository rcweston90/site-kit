# @rcweston/story-editor

The in-place editor for `@rcweston/story-core` stories. The author edits on the real page: the editor renders the story with the same `@rcweston/story-react` components readers see, and every heading, line and block is editable where it sits. Two surfaces share one draft:

- **Block tools**: inline fields on the page, a handle on every block (move, duplicate, copy, hide, delete), a block menu and an inspector for the settings a block has.
- **Continuous writing**: the whole story as one document, written straight through, with a selection toolbar, a slash menu and media dropped where the caret is.

Saves explain themselves. The bar says whether the story is saved, what failed and what to do next, in plain language. Unsaved work survives a reload, a closed tab and an ended session.

## Install

```sh
pnpm add @rcweston/story-editor @rcweston/story-react @rcweston/story-core @rcweston/save-kit react react-dom
```

Load the stylesheets once, tokens first:

```ts
import '@rcweston/story-react/tokens.css';
import '@rcweston/story-react/styles.css';
import '@rcweston/save-kit/styles.css';
import '@rcweston/story-editor/styles.css';
```

## Mounting the editor

```tsx
import { StoryEditor } from '@rcweston/story-editor';
import { createFetchTransport } from '@rcweston/story-server/client';

const transport = createFetchTransport({ baseUrl: '/api/stories' });

export function EditRoute({ slug, navigate }) {
  return (
    <StoryEditor
      slug={slug}
      transport={transport}
      navigate={navigate}
      routes={{ editor: (s) => `/edit/${s}`, reader: (s) => `/stories/${s}` }}
      backLink={{ href: '/edit', label: 'All stories' }}
      renderSignIn={({ onSignedIn }) => <SignInForm onDone={onSignedIn} />}
    />
  );
}
```

The editor is a client component. It never calls `fetch`, never reads the address bar and imports no router.

### Props

| Prop | Type | What it does |
| --- | --- | --- |
| `slug` | `string` | The story's address, as your transport knows it. Required. |
| `transport` | `EditorTransport` | Every load, save, publish, rename and upload goes through it. Required. |
| `initialState` | `StoryEditorState` | Open with this state instead of loading first, for example when the page is rendered on the server. |
| `navigate` | `(href) => void` | Go to another page of your app. Used after a rename and when a story turns out to have moved. Without it, the editor follows a rename in place. |
| `routes` | `{ editor?, reader? }` | `editor(slug)` is this editor's address for a story (used with `navigate`). `reader(slug)` is the published page; the publish menu offers "View live" only when it is given. |
| `backLink` | `{ href, label }` | The link at the start of the bar. It asks before leaving with unsaved changes. |
| `renderLink` | `RenderLink` | Your router's link. Defaults to a plain anchor. |
| `blocks` | `BlockRegistry` | Components for `custom` blocks, the same registry the reader takes. |
| `media` | `MediaResolveOptions` | Where uploaded media loads from. |
| `company` | `StoryCompany \| null` | The company as your app knows it. The story's own `company` stays plain text. |
| `renderSignIn` | `({ onSignedIn }) => ReactNode` | Your sign-in form, shown over the page when a request finds the session ended. Call `onSignedIn` and the request that failed runs again. |
| `theme`, `onThemeChange` | `'light' \| 'dark'` | Light or dark for the writing surface. The toggle shows only when both are given. Put the chosen value on `<html data-theme>` so the page background follows it (the demo's `Editor.tsx` shows how). |
| `label` | `{ badge, note }` | A small tag beside the title and a line in the More menu, for example `{ badge: 'Demo', note: 'Saves stay in this tab' }`. |
| `initialView` | `'edit' \| 'preview'` | Which view opens first. Default `'edit'`. |
| `continuousMode` | `boolean` | Open in continuous writing instead of block tools. |
| `initialSettingsOpen` | `boolean` | Open Story settings on load. |
| `initialNotice` | `string` | A one-off line for the status area on first load. |
| `onStateChange` | `(state) => void` | Called with every state the transport answers. |

## The transport

`EditorTransport` is declared in story-core. Every method answers with the whole `StoryEditorState` (the story, its versions, the live version, readiness for each version, and whether publishing and renames are available), so the editor never assembles state from pieces.

```ts
interface EditorTransport {
  load(slug, { signal }): Promise<StoryEditorState>;
  saveDraft({ slug, content, parentDocumentId }): Promise<StoryEditorState>;
  publish({ slug, documentId, expectedPublishedDocumentId }): Promise<StoryEditorState>;
  unpublish(slug): Promise<StoryEditorState>;
  rename({ from, to, expectedLatestDocumentId }): Promise<StoryEditorState>;
  uploadMedia(file, { slug, signal }): Promise<UploadedMedia>;
}
```

Two implementations ship in `@rcweston/story-server`: `createFetchTransport` talks to its HTTP handlers, and `createMemoryTransport` keeps everything in the tab for demos, previews and tests. To save somewhere else, write your own; any object with these six methods works.

### Failures

The editor reads failures from either kind of transport: the error classes story-core declares, or a request error with a `status` and a `code` (as the fetch transport throws). It shows the server's own sentence where there is one and adds what happens next. It never shows a status number, an error code or a route.

| Failure | What the author sees |
| --- | --- |
| `DraftConflictError`, or status 409 | The message, then "Your unsaved work is still open." A banner names the newer version and offers to keep yours (it saves on top, and the other version is kept) or use theirs. |
| `StoryMovedError`, or code `STORY_MOVED` | The editor goes to the new address through `navigate` and `routes.editor`, or follows it in place. |
| `PublicationConflictError` | The message, then "Your editor content remains intact." |
| Status 401 or 403, code `UNAUTHORIZED` | The save-kit sign-in dialog with your `renderSignIn`. The request runs again after sign-in. |
| Status 0 or a network error | The server could not be reached; check the connection and try again. The work stays on the page. |
| Status 413 | The file or story is too large. |

## Saving

Saving uses `@rcweston/save-kit`:

- The bar shows Saved, Unsaved changes, Saving and Retry. ⌘S (Ctrl+S) saves.
- Leaving with unsaved changes asks first, both for the back link and for closing the tab.
- Unsaved edits are kept in the browser. After a reload the editor offers them back, and ⌘Z takes the restore back.
- A save always names the version it builds on (`parentDocumentId`), so two tabs can never overwrite each other silently.

## Custom blocks

The registry is the reader's (see the story-react README). In the editor, "Custom block" in the block menu adds one; its settings pick the component by `label`, start it with `defaultProps` and show the definition's `Inspector`. The component renders with `editing: true`. A `custom` block whose component is not registered stays in the story and shows a labelled placeholder, so nothing is lost when a registry changes.

## Editing slots

The reader takes the editor's controls through `StoryRenderEditor.ui`. `EDITOR_UI` is the editor's set: inline text fields, the "add" lines, the prose editor, the call-to-action editor, the spacer control and the empty media slot that takes a dropped file. A host that renders story-react parts inside its own editing surface can pass `EDITOR_UI`, or its own components with the same props.

## Styling

The editor's stylesheet uses the same token contract as the reader (`tokens.css` in story-react), so one set of `--story-*` overrides themes both. Every class is prefixed `story-editor-`; the typed class maps (`chromeStyles`, `drawerStyles`, `buttonStyles` and the rest) are exported. No font files ship with the package.

## Testing

`pnpm test` mounts the editor in jsdom against a fake transport: it loads, an edit marks the story unsaved, ⌘S saves through the transport, a conflict and an ended session read as plain messages, a moved story follows its new address and publishing reaches the transport. Continuous writing is a ProseMirror view, which needs real layout that jsdom lacks; its conversions, history and image grouping are tested through the model in `test/model.test.ts`.

## Licence

MIT. The authoring toolbar adapts patterns from Tiptap UI Components (MIT); see `THIRD_PARTY_NOTICES.md`.
