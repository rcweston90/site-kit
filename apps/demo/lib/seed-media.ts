import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MediaStore, Story } from '@rcweston/story-core';
import { covers } from '@/content/covers';
import { seedFiles, seedMedia } from '@/content/seed';

/**
 * Puts the seed's pictures in the media store, so stories load them from the
 * same route as uploads and the image library lists them. Run on every start:
 * the keys are fixed, so it only rewrites the same bytes.
 *
 * When `scripts/fetch-photos.mjs` has saved photographs into
 * public/samples/photos, a story with one gets it as its cover (and a smaller
 * copy for cards) in place of the drawn stand-in.
 */

const PUBLIC = join(process.cwd(), 'public');
const PHOTOS = join(PUBLIC, 'samples', 'photos');

export interface SeedPhoto {
  slug: string;
  file: string;
  card: string;
  alt: string;
}

function readPhotos(): SeedPhoto[] {
  const manifest = join(PHOTOS, 'manifest.json');
  if (!existsSync(manifest)) return [];
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { photos?: SeedPhoto[] };
    return (parsed.photos ?? []).filter((photo) => existsSync(join(PHOTOS, photo.file)) && existsSync(join(PHOTOS, photo.card)));
  } catch {
    return [];
  }
}

const photos = readPhotos();

export async function putSeedMedia(media: MediaStore): Promise<void> {
  const put = (key: string, bytes: Uint8Array, contentType: string) =>
    media.put({ key, bytes, contentType, visibility: 'public', cacheControl: 'public, max-age=3600' });
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
