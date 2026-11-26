import type { ReactNode } from 'react';

const WIDTHS = { narrow: 'max-w-2xl', standard: 'max-w-4xl', wide: '' } as const;

/** The original's page frame: the page inset and top, and a centred column. */
export function PageLayout({ children, width = 'wide' }: { children: ReactNode; width?: keyof typeof WIDTHS }) {
  return (
    <div className="min-h-screen px-(--page-inset) pt-(--page-top) pb-minor-2 md:pb-major">
      <div className={`${WIDTHS[width]} mx-auto`}>{children}</div>
    </div>
  );
}
