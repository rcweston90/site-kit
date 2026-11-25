# @rcweston/xray

An on-page inspector for React apps. Turn it on and hover anything: X-ray draws the element's padding and margin, the space inside it, around it and between its children, and for text, the distance from the letters to the box they sit in. Vertical values that are off your spacing rhythm show red. A dock beside the page reads it all out, with type, colour by token, a whole-page rhythm audit, token coverage and an accessibility check. It measures the live page in the browser, so what it reports is what users see.

## Install

```sh
npm install @rcweston/xray
```

Peer dependencies: `react` and `react-dom` 18.3 or 19.

## Quick start

```tsx
import { XRay } from '@rcweston/xray';
import '@rcweston/xray/styles.css';

export function App() {
  return (
    <>
      <YourApp />
      <XRay
        rhythm={{
          unit: 8,
          steps: [
            { px: 8, name: 'xs' },
            { px: 16, name: 'sm' },
            { px: 32, name: 'md' },
            { px: 64, name: 'lg' },
          ],
        }}
      />
    </>
  );
}
```

Mount it once, near the root. In Next.js App Router, put it in a client component and pass `pathname={usePathname()}`.

By default X-ray is available when `process.env.NODE_ENV` is not `'production'`. Pass `enabled` to decide yourself.

## Opening it

| Input | What it does |
| --- | --- |
| ⌥X (Alt+X) | Open or close X-ray |
| `?xray=1` | Open X-ray on load (`?xray=0` closes it) |
| The launcher button | Bottom-left; hidden with `launcher={false}` |
| `setXRay(true)` | Open it from your own control |
| ⌥G (Alt+G) | Show or hide the baseline grid |
| `?rhythm=1` | Show the baseline grid on load (`?rhythm=0` hides it) |

None of these do anything while X-ray is disabled, on a route `routes` rules out, or before `verify` has passed.

## Keyboard shortcuts inside X-ray

| Key | Action |
| --- | --- |
| hover, click | Inspect, pin |
| hover another | Measure to the pinned element |
| tap, tap | On touch: pin, then measure to another |
| R | Redlines: every spacing inside the pinned element |
| hold ⌥ | Rays from the pointer to the nearest edges |
| shift drag | Measure an area |
| T | Measure to box edges or to letters |
| E | Nudge spacing: P, M, G pick padding, margin or gap; arrows push; ⇧ steps 1px; ⌥ takes away |
| B | Compare the pinned element across breakpoints |
| ↑ ↓ ← → | Parent, child, siblings |
| 1 to 5 | Spacing, Type, Colour, Audit, A11y tabs |
| n, N | Next, previous rhythm finding |
| O L U F G K D | Outlines, guides, rulers, page frame, grid, token coverage, dim |
| C, S | Copy spec, snapshot |
| Esc | Step back (unpin, stop nudging), then close |
| ? | Show every key |

Clicks pin instead of acting, so links don't navigate while X-ray is open.

## Options

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `NODE_ENV !== 'production'` | Whether X-ray may run at all |
| `verify` | `() => Promise<boolean>` | none | A check run once per tab before X-ray becomes available, for example a call to your own auth endpoint. Resolve `true` to allow |
| `routes` | `(pathname: string) => boolean` | every page | Which pages X-ray runs on. Build one with `matchRoutes(include, exclude)` |
| `pathname` | `string` | `window.location.pathname` | The current path from your router. Without it X-ray listens for history changes |
| `rhythm` | `{ unit, steps, minor, major, horizontal }` | `unit: 12` | The rhythm to measure against. See below |
| `palette` | `Partial<Record<role, string>>` | `--xray-*` variables | Colours by role: a custom property name (`'--brand-red'`) or any CSS colour |
| `breakpoints` | `{ name, min }[]` | Tailwind's `sm` to `2xl` | Breakpoint names by min-width, for the dock header and the breakpoint compare |
| `tracking` | `{ name, em }[]` | Tailwind's tracking scale | Letter-spacing tokens the Type tab names |
| `frame` | `{ max, gutter }` | `var(--xray-page-max, 1440px)`, `var(--xray-page-gutter, 24px)` | The page frame overlay, as CSS lengths |
| `axe` | `() => Promise<axe>` | none | Loads axe-core for the A11y tab, for example `() => import('axe-core')`. axe-core is not bundled |
| `launcher` | `boolean` | `true` | Show the floating button |
| `grid` | `boolean` | `true` | Mount the baseline grid. Turn it off if you render `<RhythmGrid />` yourself |

### Rhythm

```ts
rhythm: {
  unit: 12,            // any multiple of this is on the grid
  steps: [             // named values, shown by name
    { px: 12, name: 'half' },
    { px: 24, name: 'minor' },
    { px: 48, name: 'minor-2' },
    { px: 72, name: 'major' },
    { px: 144, name: 'major-2' },
  ],
  minor: 24,           // baseline grid line, ruler middle tick
  major: 72,           // heavy grid line, ruler long tick
  horizontal: 4,       // horizontal spacing on this step counts as on-system
}
```

Every part is optional. Left out, `steps` are 1, 2, 4, 6 and 12 units, `minor` is 2 units and `major` is 6. A vertical value reads one of three ways: a named step (`24 minor`), a multiple of the unit (`36`, shown as `3×12`), or off the grid (red).

You can also configure outside React, before or after mounting:

```ts
import { configureXRay } from '@rcweston/xray';

configureXRay({ rhythm: { unit: 8 }, palette: { off: '--danger' } });
```

### Routes

```ts
import { matchRoutes } from '@rcweston/xray';

<XRay routes={matchRoutes(['/', '/docs', '/pricing'], ['/docs/internal'])} />;
```

A path matches when it is one of `include` or inside one (`/docs` covers `/docs/intro`, not `/docs-old`) and is not inside an `exclude`. `'/'` matches the home page only.

## Styling

Import `@rcweston/xray/styles.css` once. Every class is prefixed `xr-`. To theme X-ray, set these custom properties anywhere above the page (`:root` works), or pass the matching `palette` role. Each has a fallback, so X-ray works on a page that defines none of them.

| Property | Palette role | Used for | Fallback |
| --- | --- | --- | --- |
| `--xray-content` | `content` | The inspected element, outlines, guides | `#3b82f6` |
| `--xray-padding` | `padding` | Padding tint, inside measurements | `#22c55e` |
| `--xray-margin` | `margin` | Margin tint, text lines, the compared element | `#f97316` |
| `--xray-border` | `border` | Border tint, accessibility markers | `#eab308` |
| `--xray-frame` | `frame` | The page frame overlay | `#f97316` |
| `--xray-off` | `off` | Values off the rhythm, audit markers | `#dc2626` |
| `--xray-line` | `line` | Distance lines on the page | `#1f2328` |
| `--xray-wash` | `wash` | Label halos, the dim overlay | `#ffffff` |
| `--xray-panel` | `panel` | Dock and label background | `#16181d` |
| `--xray-on-panel` | `onPanel` | Text on the panel | `#f4f5f7` |
| `--xray-on-panel-muted` | `onPanelMuted` | Secondary text on the panel | `#a3a8b3` |
| `--xray-on-panel-divider` | `onPanelDivider` | Dividers and hover fills | `rgba(255, 255, 255, 0.12)` |
| `--xray-on-content` | `onContent` | Text on the content colour | `#ffffff` |
| `--xray-font` | `font` | Labels and the dock | `ui-monospace, …, monospace` |
| `--xray-shadow` | | Dock and launcher shadow | a soft dark shadow |
| `--xray-row` | | Dock row height | `24px` |
| `--xray-space` | | Dock inner spacing | `12px` |
| `--xray-control` | | Dock control height | `48px` |
| `--xray-page-max` | | Default page frame max width | `1440px` |
| `--xray-page-gutter` | | Default page frame gutter | `24px` |
| `--xray-grid-minor-line` | | Baseline grid minor line colour | `rgba(255, 255, 255, 0.22)` |
| `--xray-grid-major-line` | | Baseline grid major line colour | `rgba(255, 255, 255, 0.55)` |

The dock's own sizes are independent of the rhythm you measure, so an 8px rhythm doesn't shrink the panel.

## What the dock shows

- **Header**: the current breakpoint and viewport width.
- **Identity**: the element's role (Heading 2, Button, Text), its name, size, ancestors, and a one-line summary of the space around it.
- **Spacing**: padding, margin, inside, around and text-to-box values per side; layout and gap; gaps between children; redlines (every spacing inside a component at once); a breakpoint compare that loads the page at each width in a hidden frame; and nudge, which tries spacing changes live and copies them as classes.
- **Type**: family, weight, size and line height, cap height and x-height, tracking by token.
- **Colour**: text, surface and border colours named by the custom properties that produce them, and WCAG contrast.
- **Audit**: every vertical gap, padding, margin and line height on the page that is off the grid, plus anything that overflows the window. The Tokens view marks layers whose colours or spacing don't come from your system.
- **A11y**: axe-core violations, when you pass `axe`.
- **Toolbar**: outlines, guides, rulers, page frame, baseline grid, token coverage, dim, snapshot, copy spec.

Copy spec writes the inspected element up as Markdown, ready to paste into a review or an issue.

Components can help the audit with data attributes: `data-xray-audit-group="Name"` groups repeated findings, `data-xray-spacing-scale="micro"` accepts 2px steps inside dense controls, `data-xray-type-scale` skips the line-height check, `data-xray-token-source="reason"` marks deliberately derived values as intentional, and `data-xray-ui` marks your own X-ray trigger so it isn't inspected.

## Other exports

`setXRay`, `useXRay`, `useXRayAllowed`, `RhythmGrid`, `setRhythmGrid`, `useRhythmGrid`, `configureXRay`, `getXRayConfig`, `resetXRayConfig`, `matchRoutes`, and pure helpers that work without a DOM: `rhythmFit`, `formatPx`, `measureBetween`, `childGaps`, `neighbourGaps`, `raysFrom`, `contrastRatio`, `parseColor`, `wcag`, `toHex`, `over`, `luminance`, `rankTokens`, `breakpointOf`, `trackingToken`, `buildSpec`.

## Privacy

It's a client-side tool: it never sends anything anywhere. It reads the page you are on and keeps its settings in `localStorage` and `sessionStorage`. The only requests it causes are ones you can see coming: your own `verify` function, your own `axe` loader, and the breakpoint compare, which loads the current page again in hidden frames at each width. Snapshot asks the browser for permission to capture the tab and saves the image locally.

## Licence

MIT
