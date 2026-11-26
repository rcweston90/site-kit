import { notFound } from 'next/navigation';
import { isPageVisible, prototypeCards, workCards } from '@/lib/published';
import { pageMetadata } from '@/lib/seo';
import { backend } from '@/lib/story';
import { WorkClient } from '@/components/work/WorkClient';

export const dynamic = 'force-dynamic';

export const generateMetadata = () => pageMetadata('/work', { title: 'Work' });

/** Work, unless it's switched off in the admin. */
export default async function WorkPage() {
  if (!(await isPageVisible('/work'))) notFound();
  const { site } = await backend();
  // The resume's link shows while it's switched on and there's a file to serve.
  const [cards, prototypes, resumeVisible, resumeAvailable] = await Promise.all([workCards(), prototypeCards(), isPageVisible('/resume'), site.reads.resume.available()]);
  return <WorkClient cards={cards} prototypes={prototypes} resumeHref={resumeVisible && resumeAvailable ? '/resume' : null} />;
}
