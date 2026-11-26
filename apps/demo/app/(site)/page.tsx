import { Home, Portrait } from '@/components/home/Home';
import { ContactStripHeader, type StripPhoto } from '@/components/home/ContactStripHeader';
import { RoleLockup } from '@/components/home/RoleLockup';
import { isPageVisible, workCards, type WorkCard } from '@/lib/published';

export const dynamic = 'force-dynamic';

/** The header's photographs: the covers of the first published studies, in the saved order. */
function stripPhotos(work: WorkCard[]): StripPhoto[] {
  return work.flatMap((card) => {
    const src = card.cover?.kind === 'video' ? card.cover.poster : card.cover?.src;
    return src ? [{ src, alt: card.cover?.alt || card.title, objectPosition: card.cover?.objectPosition }] : [];
  });
}

export default async function HomePage() {
  const [work, workVisible] = await Promise.all([workCards(), isPageVisible('/work')]);
  return (
    <Home
      work={work}
      workHref={workVisible ? '/work' : null}
      header={<ContactStripHeader shots={stripPhotos(work)} portrait={<Portrait bare />} professionalRecord={<RoleLockup treatment="stack" mobileStatementFirst />} />}
    />
  );
}
