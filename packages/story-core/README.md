# @rcweston/story-core

The content model for long-form stories: a typed document of blocks, its validation, content hashes, publish readiness, address renames and the pure helpers an editor and a reader share. Plain TypeScript with no dependencies. It runs in Node, edge runtimes and browsers: nothing here imports a runtime built-in, reads the environment or knows a route.

The other packages build on it. `@rcweston/story-server` stores and serves stories, `@rcweston/story-react` renders them, and `@rcweston/story-editor` edits them.

## Install

```sh
pnpm add @rcweston/story-core
```

## The content model

A `Story` is one JSON document. It has a slug (its address), a title, a one-line thesis, optional facts, hero media and credits, and an ordered list of chapters. The default chapters follow STAR (situation, task, action, result), but a story can rename, hide or add chapters. Each chapter holds blocks: prose with inline markup and nested lists, media, image groups, decisions, quotes, callouts, metrics, outcomes, contribution lists, steps, tables, code, calls to action and a few layout pieces. A `custom` block names a component from the host's own registry and carries plain JSON props, so a site can add its own interactive pieces without changing the model. Every saved version is an immutable `StoryDocument` with a content hash and a parent, and publishing points at one version.

```ts
import { createStory, validateStoryDraft, validatePublication, preparePublicStory } from '@rcweston/story-core';

const story = createStory({ title: 'Field notes that travel', company: 'Fieldnote Studio' });
validateStoryDraft(story); // [] : a blank outline saves
validatePublication(story); // { errors: [], warnings: [...] } : and could publish
```

## Unfinished never blocks publishing

There are two kinds of check, and they answer different questions.

- **`validateStory` / `validateStoryDraft`**: is this a well-formed story? Wrong types, unknown block types, a bad slug or a malformed list are errors, and nothing that fails them is saved. Drafts may leave the company and thesis blank.
- **`validatePublication`**: what would a reader see? It returns `errors` and `warnings`. Only two things are errors: an invalid story (`invalid-story`) and a media source that is not a path or a web address (`invalid-media-source`). Everything else is a warning: empty text, footage not uploaded yet, missing alt text, a broken related story, a custom block the host has not registered.

The author can publish past warnings. The editor keeps them in view as a checklist, and `preparePublicStory` leaves out whatever is empty, so a reader never meets a gap, an empty frame or a dangling heading. Hidden chapters and blocks are a choice, not a problem, and are never checked.

```ts
const readiness = validatePublication(story, {
  knownSlugs: allSlugs, // check related stories exist
  uploadedMediaKeys: keysInStore, // a key-only media item counts once uploaded
  customBlocks: Object.keys(registry), // warn `unknown-custom-block` for anything else
});
const canPublish = readiness.errors.length === 0;
```

`preparePublicStory` is the same preparation for the live page and for an editor's preview. It resolves every media item once, removes what can't load, strips production notes (a shot's brief, source and draft key never reach the page payload), keeps only safe call-to-action links and drops custom blocks that are blank, unregistered or not plain JSON.

## Contract interfaces

`contract.ts` defines the seams a host fills in. story-core only declares them; story-server ships implementations.

| Interface | What it does |
| --- | --- |
| `DocumentStore` | Numbered versions per slug, a publication pointer, renames and redirects. A save whose parent isn't the latest fails with `DraftConflictError`; a stale publish fails with `PublicationConflictError`. An autosave (`autosave: true`) on top of an unpublished autosave rewrites it in place (`isRewritableAutosave`); every other save adds a version, and a published version never changes. |
| `MediaStore` | Put, get (with byte ranges), head, delete and list objects by key. |
| `MediaPolicy` | Upload size and type limits, how a key is built and the URL a browser loads it from. |
| `AuthAdapter` | Reads the session from a `Request` and decides who may edit or view protected media. |
| `Revalidator` | Optional hooks after a save, publish, unpublish or rename. A failure here never fails the write. |
| `EditorTransport` | How an editor talks to its backend: load, save, publish, unpublish, rename and upload. |

It also holds the shared result types (`PublicationIssue`, `PublicationReadiness`, `SlugRedirect`, `SlugAliases`, `StoryEditorState`) and the errors every store throws (`StoryMovedError`, `AddressTakenError`).

## Media without routes

Nothing here knows where media lives. A media item has either an explicit `src` (a path or an http(s) URL) or a shot with a `draft` key. Pass `uploadedMediaKeys` and a `mediaUrl(key)` callback, and a key-only item resolves through your media route:

```ts
import { preparePublicStory, encodeMediaKey } from '@rcweston/story-core';

const page = preparePublicStory(story, {
  uploadedMediaKeys: keys,
  mediaUrl: (key) => `/media/${encodeMediaKey(key)}`,
});
```

YouTube links of every common shape become one privacy-enhanced embed. PDFs are a same-origin path or an https URL ending in `.pdf`.

## Renames

A story's address can change without breaking a link. `planStoryRename` returns the rename as data: copies of the latest draft (and of the live version, when it differs) under the new slug, the redirect to add and whether the live page moves with it. Old versions are never rewritten, unpublished edits stay unpublished, and the redirect table stays flat, so an old address resolves in one lookup. Address rules come with plain messages for the editor. The default reserved words (`new`, `edit`, `admin`, `api` and a few more) can be extended with your own routes via `reservedStoryAddresses(...)`.

## API

**Model and documents**: `Story`, `StoryBlock`, `StoryMedia`, `StoryChapter` and the other block types, `STORY_BLOCK_TYPES`, `STORY_LAYOUT_OPTIONS`, `STORY_CHAPTERS`, `EVIDENCE_LABEL`, `StoryDocument`, `StoryDocumentSeed`, `StoryPublication`, `STORY_SCHEMA_VERSION`.

**Identity**: `stableJson`, `sha256Hex`, `contentSha256`, `storyDocumentId`, `isStorySlug`, `isLatestDocumentParent`.

**Validation**: `validateStory`, `validateStoryDraft`, `customPropsProblem`, `plainJsonProblem`, `isPlainJson`, `isPlainJsonObject`, `planDocumentImports`, `planDraftDocumentImports`, `verifyStorySourceProvenance` (git is injected), `isSourceCommit`.

**Publishing**: `validatePublication`, `hasPublishableMediaSource`, `isBlockingIssue`, `preparePublicStory`, `prepareStory` (passes through in development).

**Addresses and renames**: `createStory`, `newStoryFields`, `newStorySlug`, `suggestStoryAddress`, `formatStoryAddressInput`, `storyAddressProblem`, `STORY_ADDRESS_MESSAGES`, `RESERVED_STORY_ADDRESSES`, `reservedStoryAddresses`, `takenStoryAddresses`, `formerAddressesOf`, `collapseRedirects`, `createAddressAliases`, `authoredStoryFromFormerAddress`, `planStoryRename`, `StoryRenameError`, `RENAME_ERROR_STATUS`, `RENAME_STALE_MESSAGE`, `RENAME_UNAVAILABLE_MESSAGES`, `resolveRenameRequest`.

**Editing**: `updateStoryField`, `updateStoryFieldValue`, `updateStoryBlock`, `storyFieldKey`, `StoryFieldPath`, `StoryDraftPath`, `isStoryVisible`, `chapterName`, `chapterShortName`, `chapterNavItems`, `storyReadingCounts`, `readingMinutes`.

**Rich text**: `parseInlineMarkup`, `serializeInlineRuns`, `escapeInlineText`, `safeInlineHref`, `HIGHLIGHT_COLORS`, `storyProseRuns`, `storyListRunRows`, `visibleStoryListRows`, `withProseFormat`, `withLargeParagraphs`, `proseBlockToHtml`, `inlineStoryMarkupToHtml`, `tiptapDocToProseBlock`, `richTextFromPlain`, `isEmptyRichText`.

**Media**: `resolvePublishedMedia`, `resolveMedia`, `encodeMediaKey`, `isSupportedMediaSource`, `normalizeMediaSource`, `MEDIA_SOURCE_FEATURES`, `mediaSupports`, `mediaEditorLabel`, `normalizeYouTubeUrl`, `youTubeThumbnail`, `normalizePdfUrl`, `upgradeLegacyMediaBlock`, `upgradeStoryMediaGroups`, `normalizeMediaAppearance`, `mediaExpansionSettings`, `withMeasuredAspects`, `IMAGE_ZOOM_LEVELS`, `lightboxImageSize`.

**Smaller pieces**: `ctaHref`, `completedCta`, `calloutAppearanceAttributes`, `setCalloutPalette`, `setCalloutIcon`, `isOptionalProjectYear`.

## License

MIT
