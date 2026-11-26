import { Home, Portrait } from '@/components/home/Home';
import { ContactStripHeader } from '@/components/home/ContactStripHeader';
import { RoleLockup } from '@/components/home/RoleLockup';
import { isPageVisible, workCards } from '@/lib/published';
import type { ReactNode } from 'react';
import { homeLibrary, shotsPhotos, type ShotPhoto } from '@/lib/publishing';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

/**
 * The Shots slot: the original plays its photo reel between the header and
 * the letter, its shots turned by three so the reel doesn't open on the
 * strip's photos. Nothing renders until the Shots module is registered (no
 * photos come back); wiring it is the one marked line below.
 */
function shotsReel(photos: ShotPhoto[]): ReactNode {
  if (!photos.length) return null;
  const turned = [...photos.slice(3), ...photos.slice(0, 3)];
  void turned;
  return null; // SHOTS SLOT: return <ShotsReel shots={turned} galleryHref="/shots" />;
}

export default async function HomePage() {
  const { site } = await backend();
  const [work, workVisible, about, library, shots] = await Promise.all([workCards(), isPageVisible('/work'), site.reads.home.about(), homeLibrary(), shotsPhotos()]);
  // Admin → Home sets each of the header's three slots; an unset slot shows
  // the library's photo in its place.
  const photos = await site.reads.home.headerPhotos(library);
  return (
    <Home
      work={work}
      workHref={workVisible ? '/work' : null}
      about={about}
      header={<ContactStripHeader shots={photos} portrait={<Portrait bare />} professionalRecord={<RoleLockup treatment="stack" mobileStatementFirst />} />}
      shots={shotsReel(shots)}
    />
  );
}
