import type { ReactNode } from 'react';
import { SiteChrome } from '@/components/site/SiteChrome';
import { SiteAppearance, readAppearance } from '@/components/site/SiteAppearance';
import { visibleNav } from '@/lib/published';
import { photoCredits } from '@/lib/credits';
import '../site.css';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [nav, appearance, credits] = await Promise.all([visibleNav(), readAppearance(), photoCredits()]);
  return (
    <>
      <SiteAppearance {...appearance} />
      <SiteChrome nav={nav} appearance={appearance.settings} credits={credits.length > 0}>{children}</SiteChrome>
    </>
  );
}
