import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MediaStore, Story } from '@rcweston/story-core';
import { covers } from '@/content/covers';
import { seedFiles, seedMedia } from '@/content/seed';

/**
 * Puts the seed's pictures in the media store, so stories load them from the
 * same route as uploads and the image library lists them. Run on every start,
 * it writes only the pictures the store doesn't have yet.
 *
 * public/samples/photos/manifest.json has one slot per sample story. None ship
 * with files, but when a slot names photographs saved beside it, a story with one gets it as its cover (and a smaller copy
 * for cards) in place of the drawn stand-in.
 */

const PUBLIC = join(process.cwd(), 'public');
const PHOTOS = join(PUBLIC, 'samples', 'photos');

export interface SeedPhotoCredit {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
  license: string;
}

export interface SeedPhoto {
  slug: string;
  /** The cover's file name in public/samples/photos; empty keeps the drawn stand-in. */
  file: string;
  /** A smaller copy for cards and admin thumbnails. */
  card: string;
  alt: string;
  credit?: SeedPhotoCredit;
}

function readPhotos(): SeedPhoto[] {
  const manifest = join(PHOTOS, 'manifest.json');
  if (!existsSync(manifest)) return [];
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { photos?: SeedPhoto[] };
    return (parsed.photos ?? []).filter((photo) => Boolean(photo.file && photo.card) && existsSync(join(PHOTOS, photo.file)) && existsSync(join(PHOTOS, photo.card)));
  } catch {
    return [];
  }
}

const photos = readPhotos();

/** Credits for the photographs in use, for a credits page or a caption. */
export const seedPhotoCredits = (): Array<SeedPhotoCredit & { slug: string }> =>
  photos.flatMap((photo) => (photo.credit?.photographer ? [{ slug: photo.slug, ...photo.credit }] : []));

export async function putSeedMedia(media: MediaStore): Promise<void> {
  const put = async (key: string, bytes: Uint8Array, contentType: string) => {
    if (await media.head(key)) return;
    await media.put({ key, bytes, contentType, visibility: 'public', cacheControl: 'public, max-age=3600' });
  };
  const encoder = new TextEncoder();
  await Promise.all([
    ...Object.entries(covers).map(([slug, draw]) => put(`stories/${slug}/cover.svg`, encoder.encode(draw()), 'image/svg+xml')),
    ...Object.entries(seedFiles).flatMap(([slug, files]) =>
      files.map((file) => put(`stories/${slug}/${file}`, readFileSync(join(PUBLIC, 'samples', file)), 'image/svg+xml')),
    ),
    ...photos.flatMap((photo) => [
      put(`stories/${photo.slug}/cover.jpg`, readFileSync(join(PHOTOS, photo.file)), 'image/jpeg'),
      put(`stories/${photo.slug}/card.jpg`, readFileSync(join(PHOTOS, photo.card)), 'image/jpeg'),
    ]),
  ]);
}

/** The story with its photograph as the cover, when one was fetched. The card picks `workPreview` first, so cards get the smaller copy. */
export function withSeedPhoto(story: Story): Story {
  const photo = photos.find((entry) => entry.slug === story.slug);
  if (!photo) return story;
  return {
    ...story,
    hero: { kind: 'image', src: seedMedia(story.slug, 'cover.jpg'), alt: photo.alt, aspect: 1.6 },
    workPreview: { kind: 'image', src: seedMedia(story.slug, 'card.jpg'), alt: photo.alt, aspect: 1.6 },
  };
}
