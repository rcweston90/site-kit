import type { CSSProperties } from 'react';

/**
 * What /admin shows when sign-in isn't set up on a production server: what to
 * set, in the sign-in screen's place and style. The public site keeps working.
 */
export function AdminOff({ problem }: { problem: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background" style={{ '--accent-primary': '#555555' } as CSSProperties}>
      <div className="w-full max-w-md px-6 text-center enter-rise [--enter-y:10px]">
        <h1 className="font-mono text-3xl font-bold text-foreground uppercase tracking-wide mb-6">Admin</h1>
        <div role="alert" className="rounded-md border border-foreground-muted/20 bg-card-bg p-4 text-left">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Sign-in isn’t set up</p>
          <p className="mt-2 font-sans text-sm leading-baseline text-foreground-muted">{problem}</p>
        </div>
        <a href="/" className="mt-6 inline-block font-mono text-xs uppercase tracking-wider text-foreground-muted hover:text-foreground transition-colors">
          View Site &rarr;
        </a>
      </div>
    </main>
  );
}
