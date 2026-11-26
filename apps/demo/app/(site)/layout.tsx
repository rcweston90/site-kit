import type { ReactNode } from 'react';
import { SiteChrome } from '@/components/site/SiteChrome';
import { SiteAppearance, readAppearance } from '@/components/site/SiteAppearance';
import { visibleNav } from '@/lib/published';
import '../site.css';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [nav, appearance] = await Promise.all([visibleNav(), readAppearance()]);
  return (
    <>
      <SiteAppearance {...appearance} />
      <SiteChrome nav={nav} appearance={appearance.settings}>{children}</SiteChrome>
    </>
  );
}
