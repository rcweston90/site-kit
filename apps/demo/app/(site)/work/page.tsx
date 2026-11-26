import { notFound } from 'next/navigation';
import { isPageVisible, prototypeCards, workCards } from '@/lib/published';
import { WorkClient } from '@/components/work/WorkClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Work' };

/** Work, unless it's switched off in the admin. */
export default async function WorkPage() {
  if (!(await isPageVisible('/work'))) notFound();
  const [cards, prototypes] = await Promise.all([workCards(), prototypeCards()]);
  return <WorkClient cards={cards} prototypes={prototypes} />;
}
