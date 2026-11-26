import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MediaStore } from '@rcweston/story-core';
import type { HomeHeaderImages, HomePhoto } from '@rcweston/site-data';
import { COMMUNITY } from '@/content/community';
import { HOME_ABOUT } from '@/content/home';
import { headerShots, headerUpload } from '@/content/home-header';

/**
 * Home, Community and Showreel: their shipped copy, the header's photo
 * library, and the files and rows the demo seeds for them.
 */

const MEDIA = '/api/story/media';
const SHOTS = 'stories/home-shots';
const UPLOADS = 'stories/home-header';

/** A photo as the Shots module's read gives it (port/shots: `Photo`). */
export interface ShotPhoto {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  blurDataURL?: string;
}

/**
 * The visible shots, in order, from the Shots module's server read
 * `site.reads.shots.photos()`; empty while that module isn't registered.
 */
export async function shotsPhotos(): Promise<ShotPhoto[]> {
  const { backend } = await import('./story');
  const reads = (await backend()).site.reads as { shots?: { photos(): Promise<ShotPhoto[]> } };
  return reads.shots ? reads.shots.photos() : [];
}

/**
 * The header's library: what "Choose from Shots" offers and each slot's
 * default. As in the original it is the Shots library, so the first three
 * shots are the strip's defaults; until a Shots module is registered, drawn
 * stand-ins take their place. The covers of the published case studies follow.
 */
export async function homeLibrary(): Promise<HomePhoto[]> {
  const { workCards } = await import('./published');
  const [shots, cards] = await Promise.all([shotsPhotos(), workCards()]);
  const covers = cards.flatMap((card): HomePhoto[] => {
    const src = card.cover?.kind === 'video' ? card.cover.poster : card.cover?.src;
    return src ? [{ src, alt: card.cover?.alt || card.title, ...(card.cover?.objectPosition ? { objectPosition: card.cover.objectPosition } : {}) }] : [];
  });
  const library = shots.length
    ? shots.map(({ src, alt }) => ({ src, alt }))
    : headerShots.map((shot) => ({ src: `${MEDIA}/${SHOTS}/${shot.file}`, alt: shot.alt }));
  return [...library, ...covers];
}

/**
 * The sample reel is drawn on your machine by scripts/make-showreel.sh (the
 * repo keeps no video files). Until it has been, nothing plays by default and
 * /showreel stays empty until a reel is set in Admin → Showreel.
 */
const SAMPLE_REEL = '/samples/showreel.webm';
const hasSampleReel = existsSync(join(process.cwd(), 'public', SAMPLE_REEL));

/** site-data's config for the three modules. */
export const publishingConfig = {
  home: { about: HOME_ABOUT, library: homeLibrary },
  community: { defaults: COMMUNITY },
  showreel: { defaultReel: hasSampleReel ? SAMPLE_REEL : '', defaultPoster: '/samples/showreel-poster.svg' },
};

/** The header's drawn photographs, written once into the media store. */
export async function putPublishingMedia(media: MediaStore): Promise<void> {
  const encoder = new TextEncoder();
  const put = async (key: string, svg: string) => {
    if (await media.head(key)) return;
    await media.put({ key, bytes: encoder.encode(svg), contentType: 'image/svg+xml', visibility: 'public', cacheControl: 'public, max-age=3600' });
  };
  await Promise.all([
    ...headerShots.map((shot) => put(`${SHOTS}/${shot.file}`, shot.draw())),
    put(`${UPLOADS}/${headerUpload.file}`, headerUpload.draw()),
  ]);
}

/** The header as the site launched it: two default slots and one uploaded picture. */
export const SEED_HEADER: HomeHeaderImages = [null, null, { source: 'upload', src: `${MEDIA}/${UPLOADS}/${headerUpload.file}`, alt: headerUpload.alt }];

/** The showreel page, as a resource the dashboard can switch off. */
export const SHOWREEL_RESOURCE = { id: 'showreel', path: '/showreel', label: 'Showreel', description: 'The showreel page and Work’s link to it.' };
