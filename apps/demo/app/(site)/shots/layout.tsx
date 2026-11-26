import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isPageVisible } from '@/lib/published';

export const dynamic = 'force-dynamic';

/**
 * The visibility check sits above loading.tsx: thrown from the page, under
 * the loading boundary, the 404 would stream out with a 200 status.
 */
export default async function ShotsLayout({ children }: { children: ReactNode }) {
  if (!(await isPageVisible('/shots'))) notFound();
  return children;
}
