'use client';

export function Callout({ text, variant = 'statement' }: { text: string; variant?: 'statement' | 'pull-quote' }) {
  return (
    <blockquote
      className={
        variant === 'statement'
          ? 'enter-fade border-l-4 border-accent-primary pl-6 text-lg md:text-xl font-mono text-foreground leading-9'
          : 'enter-fade border-l-4 border-foreground-muted/30 pl-6 text-lg md:text-xl italic text-foreground-muted leading-9'
      }
    >
      {text}
    </blockquote>
  );
}
