import type { ReactNode } from 'react';
import { SiteChrome } from '@/components/site/SiteChrome';
import { visibleNav } from '@/lib/published';
import '../site.css';

export const dynamic = 'force-dynamic';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const nav = await visibleNav();
  return <SiteChrome nav={nav}>{children}</SiteChrome>;
}
