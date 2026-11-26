// The type classes the admin's pieces share (core/tokens/typography.ts).

/** Shared type classes. `h1`/`h2`/`h3` are the mono register page titles use; `statement` the sans one. */
export const tw = {
  h1: 'font-mono font-bold uppercase tracking-tight text-3xl md:text-4xl lg:text-5xl leading-9 md:leading-12',
  h2: 'font-mono font-bold uppercase tracking-wide text-xl md:text-2xl leading-baseline md:leading-9',
  h3: 'font-mono font-semibold tracking-tight text-lg md:text-xl leading-baseline',
  statement: 'font-sans font-semibold tracking-tight text-3xl md:text-4xl leading-9 md:leading-12',
  body: 'font-sans text-base leading-baseline',
  bodyLarge: 'font-sans text-lg leading-7',
  bodySmall: 'font-sans text-sm leading-baseline',
  label: 'font-mono text-xs uppercase tracking-caps font-medium leading-baseline',
  caption: 'font-sans text-xs leading-baseline',
  sectionLabel: 'font-mono text-xs uppercase tracking-caps text-foreground-muted leading-baseline',
} as const;
