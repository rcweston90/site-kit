import Link from 'next/link';
import { PageLayout } from '@/components/blog/PageLayout';

/** The page for an address the site doesn't have, or a page that's switched off. */
export function NotFoundBody() {
  return (
    <PageLayout width="narrow">
      <p className="font-mono text-xs leading-baseline uppercase tracking-wider text-foreground-muted mb-half">404</p>
      <h1 className="text-3xl md:text-4xl font-semibold leading-9 md:leading-12 text-foreground mb-minor tracking-tight">Nothing here</h1>
      <p className="text-base leading-baseline text-foreground-muted mb-minor-2 max-w-md">
        The page may have moved, or it’s switched off for now. The work and the posts are still where they were.
      </p>
      <div className="flex flex-wrap gap-x-minor gap-y-half text-base leading-baseline">
        <Link href="/" className="text-foreground underline underline-offset-4 hover:text-foreground-muted">Readme</Link>
        <Link href="/work" className="text-foreground underline underline-offset-4 hover:text-foreground-muted">Work</Link>
        <Link href="/blog" className="text-foreground underline underline-offset-4 hover:text-foreground-muted">Posts</Link>
      </div>
    </PageLayout>
  );
}
