import { notFound } from 'next/navigation';
import { isPageVisible, workCards } from '@/lib/published';
import { WorkClient } from '@/components/work/WorkClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Work' };

/** Work, unless it's switched off in the admin. */
export default async function WorkPage() {
  if (!(await isPageVisible('/work'))) notFound();
  return <WorkClient cards={await workCards()} />;
}
