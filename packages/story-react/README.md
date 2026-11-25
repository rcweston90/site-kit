# @rcweston/story-react

The reader for `@rcweston/story-core` stories. `StoryPage` renders a whole story: the hero, its chapters and blocks, decisions, hindsight, credits and a card for the next story, with a contents rail along the right edge. Every part is exported too, so a host can lay a story out itself, and the editor renders these same components in place.

Nothing here depends on a router or a framework. Links go through a `renderLink` you pass, custom blocks come from a registry you pass, and styling is one plain stylesheet over a set of `--story-*` custom properties.

## Install

```sh
pnpm add @rcweston/story-react @rcweston/story-core react react-dom
```

Load the two stylesheets once, tokens first:

```ts
import '@rcweston/story-react/tokens.css';
import '@rcweston/story-react/styles.css';
```

## Rendering a story

```tsx
import { StoryPage } from '@rcweston/story-react';
import { preparePublicStory } from '@rcweston/story-core';

export function StoryRoute({ story, next }) {
  return (
    <StoryPage
      story={preparePublicStory(story)}
      next={next}
      backLink={{ href: '/stories', label: 'Stories' }}
      hrefFor={(slug) => `/stories/${slug}`}
    />
  );
}
```

Run a story through `preparePublicStory` (from story-core) before it reaches a reader. It resolves media once, leaves out what is empty or cannot load, and strips production notes, so the page never shows a gap or an empty frame.

### `StoryPage` props

| Prop | Type | What it does |
| --- | --- | --- |
| `story` | `Story` | The story to render. Required. |
| `company` | `StoryCompany \| null` | The company as the host knows it (display name and logo). Falls back to the story's own `company` and `companyLogo`. |
| `next` | `StoryTeaser` | The next story, shown as a card at the end. |
| `backLink` | `{ href, label }` | The link above the hero back to your index. |
| `hrefFor` | `(slug) => string` | Where the next card links. Defaults to `/${slug}`. |
| `blocks` | `BlockRegistry` | Components for `custom` blocks, by name. See below. |
| `renderLink` | `RenderLink` | Your router's link component. Defaults to a plain anchor. |
| `media` | `MediaResolveOptions` | Where uploaded media loads from (`mediaUrl`, `uploadedMediaKeys`, `unoptimizedPrefixes`). |
| `embedded` | `boolean` | Inside another surface, such as a sheet or a preview: no back link, and the next card replaces the current history entry. |
| `chapterBar` | `boolean` | The contents rail. Default `true`. |
| `showShots` | `boolean` | Show unfilled shot slots, the frames still waiting for footage. Default `false`; turn it on in development. |
| `editor` | `StoryRenderEditor` | Set by the editor only. Readers never pass it. |
| `children` | `ReactNode` | Rendered inside the story root, after the page and the contents rail (for overlays such as a lightbox host). |

`StoryPage` is server-renderable. Only the contents rail, looping media and the image lightbox hydrate.

### Links

`renderLink` receives `{ href, className, children, 'aria-label' }` and returns an element. A host on a client-side router passes its own link:

```tsx
const renderLink: RenderLink = ({ href, ...props }) => <RouterLink to={href} {...props} />;
```

### Other parts

Hosts that build their own layout can use the parts directly: `StoryHero`, `StoryChapter`, `StoryBlocks`, `StoryMedia`, `StoryRichText`, `StoryDecisions`, `ChapterBar`, `ContributionSection`, `CompareSwitch`, `NextStudy` and `StoryImageLightbox`. Wrap them in `StoryProvider` to give them the same `blocks`, `renderLink`, `media` and `showShots` that `StoryPage` passes down. `useStoryEnvironment()` reads them back.

## Custom blocks

A `custom` block stores a component name and plain JSON props. The host supplies the components:

```tsx
import type { BlockRegistry } from '@rcweston/story-react';

const blocks: BlockRegistry = {
  FieldMap: {
    label: 'Field map',
    Render: ({ props, title, caption, editing }) => <FieldMap pins={props.pins} title={title} caption={caption} />,
    defaultProps: { pins: 0 },
    Inspector: ({ props, onChange }) => (
      <input type="number" value={Number(props.pins)} onChange={(event) => onChange({ ...props, pins: Number(event.target.value) })} />
    ),
  },
};

<StoryPage story={story} blocks={blocks} />;
```

| Field | What it is |
| --- | --- |
| `label` | What the editor calls the block in menus and placeholders. |
| `Render` | The component. It receives `props`, the block's optional `title` and `caption`, and `editing`, which is true inside the editor. |
| `defaultProps` | Props a new block starts with. |
| `Inspector` | Optional settings the editor shows for this block. It receives `props` and `onChange`. |

A block whose component is not in the registry renders nothing for readers. In the editor it shows a labelled placeholder, so the author can see it and fix or remove it. Pass the same names to `validatePublication` as `customBlocks` and the checklist warns about any others.

## The token contract

Every colour, font, space, radius, surface and shadow the reader draws with is a custom property defined in `tokens.css`. Import it for the defaults, then override any of them on `:root`, on a theme selector, or on the story's own root (`.story-story`):

```css
:root {
  --story-font-sans: 'Your Sans', system-ui, sans-serif;
  --story-accent: #0b6e4f;
}
```

Light is the default. Dark applies under `[data-theme="dark"]`, or with the system preference when the page sets no `data-theme` of its own. The defaults use system font stacks; no font files ship with the package.

`--story-font-mono` is the label voice (kickers, meta, fact labels), and by default it follows `--story-font-sans`, as in the original. Code uses `--story-font-code`.

The reader and the editor take their body type from the page, as they did in the original. For the same look, set this on `body` (the demo does):

```css
body {
  font-family: var(--story-font-sans);
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: var(--story-tracking-body);
  -webkit-font-smoothing: antialiased;
}
```

`styles.css` also carries the reset the original ran under (border-box sizing, zeroed margins, unstyled lists and headings), scoped to `story-` elements and with no specificity, so it never touches the rest of your page and any class wins over it.

| Group | Tokens |
| --- | --- |
| Type | `--story-font-sans`, `--story-font-serif`, `--story-font-mono`, `--story-font-code`, `--story-tracking-body`, `--story-text-xs`, `--story-text-sm`, `--story-text-base`, `--story-text-lg` |
| Rhythm | `--story-rhythm-half` (12px), `--story-rhythm-minor` (24px, the baseline), `--story-rhythm-minor-2` (48px), `--story-rhythm-major` (72px), `--story-space` (4px, the fine step inside controls) |
| Radii | `--story-radius-sm`, `--story-radius-control`, `--story-radius-md`, `--story-radius-lg` |
| Ink | `--story-foreground`, `--story-foreground-muted`, `--story-foreground-subtle`, `--story-accent`, `--story-accent-secondary`, `--story-accent-secondary-text`, `--story-accent-glow`, `--story-on-accent`, `--story-link-current`, `--story-link-weight`, `--story-link-active` |
| Surfaces | `--story-background`, `--story-background-secondary`, `--story-card`, `--story-well`, `--story-border`, `--story-border-hover`, `--story-surface-warm`, `--story-surface-cool`, `--story-surface-amber`, `--story-surface-dark`, `--story-surface-panel`, `--story-surface-panel-elevated`, `--story-on-panel`, `--story-on-panel-muted`, `--story-on-panel-divider`, `--story-on-panel-accent` |
| Status | `--story-success`, `--story-warning`, `--story-error`, `--story-info`, `--story-error-text`, `--story-warning-text`, `--story-success-text` |
| Palette steps | `--story-neutral-50`, `--story-neutral-500`, `--story-neutral-700`, `--story-neutral-900`, `--story-teal-500`, `--story-teal-800`, `--story-orange-400`, `--story-orange-500`, `--story-orange-800`, `--story-blue-400`, `--story-blue-700` |
| Highlights | `--story-highlight-orange`, `-yellow`, `-red`, `-green`, `-teal`, `-blue`, `-purple`, `-grey` (the inline `==marked==` colours) |
| Elevation | `--story-shadow-xs`, `-sm`, `-md`, `-lg`, `-xl`, `--story-shadow-key`, `--story-shadow-key-hover`, `--story-shadow-well` |

## Class names

Every class in `styles.css` is prefixed `story-`, so none collides with the host page. The package exports typed maps of them (`storyStyles`, `blockStyles`, `heroStyles` and the rest) for hosts that want to target a part from their own CSS or tests: `blockStyles.grid` is `'story-block-grid'`.

## Motion

Hero animation, looping media and the chapter rail respect `prefers-reduced-motion`. `MotionToggle` gives readers a switch of their own.
