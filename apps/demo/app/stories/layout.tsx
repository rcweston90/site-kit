import type { ReactNode } from 'react';
import { SiteAppearance, readAppearance } from '@/components/site/SiteAppearance';

export const dynamic = 'force-dynamic';

/** Stories have their own frame, but the same accent, typefaces, default theme and sunny mode. */
export default async function StoriesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteAppearance {...await readAppearance()} />
      {children}
    </>
  );
}
