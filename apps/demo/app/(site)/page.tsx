import { Home, Portrait } from '@/components/home/Home';
import { ContactStripHeader } from '@/components/home/ContactStripHeader';
import { RoleLockup } from '@/components/home/RoleLockup';
import { ShotsReel } from '@/components/shots/ShotsReel';
import { isPageVisible, workCards } from '@/lib/published';
import type { ReactNode } from 'react';
import { homeLibrary, shotsPhotos, type ShotPhoto } from '@/lib/publishing';
import { JsonLd, pageMetadata, personSchema, sitePerson } from '@/lib/seo';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

export const generateMetadata = () => pageMetadata('/');

/**
 * The Shots reel: the original plays its photo reel between the header and
 * the letter, its shots turned by three so the reel doesn't open on the
 * strip's photos. Nothing renders when there are no visible shots, or when
 * the Shots page is hidden.
 */
function shotsReel(photos: ShotPhoto[], galleryHref: string | null): ReactNode {
  if (!photos.length) return null;
  const turned = [...photos.slice(3), ...photos.slice(0, 3)];
  return <ShotsReel shots={turned} galleryHref={galleryHref ?? undefined} />;
}

export default async function HomePage() {
  const { site } = await backend();
  const [work, workVisible, shotsVisible, about, library, shots] = await Promise.all([
    workCards(),
    isPageVisible('/work'),
    isPageVisible('/shots'),
    site.reads.home.about(),
    homeLibrary(),
    shotsPhotos(),
  ]);
  // Admin → Home sets each of the header's three slots; an unset slot shows
  // the library's photo in its place.
  const photos = await site.reads.home.headerPhotos(library);
  return (
    <>
      <JsonLd data={personSchema(sitePerson())} />
      <Home
        work={work}
        workHref={workVisible ? '/work' : null}
        about={about}
        header={<ContactStripHeader shots={photos} portrait={<Portrait bare />} professionalRecord={<RoleLockup treatment="stack" mobileStatementFirst />} />}
        shots={shotsVisible ? shotsReel(shots, '/shots') : null}
      />
    </>
  );
}
