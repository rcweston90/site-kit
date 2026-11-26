import { seedPhotoCredits, type SeedPhotoCredit } from './seed-media';
import { publishedTeasers } from './published';

export interface PhotoCredit extends SeedPhotoCredit {
  slug: string;
  /** The published story whose cover it is. */
  title: string;
}

/**
 * Credits for the photographs on published stories, from
 * public/samples/photos/manifest.json. Empty until a slot has a photo and a
 * photographer, so /credits and the footer link stay away until then.
 */
export async function photoCredits(): Promise<PhotoCredit[]> {
  const credits = seedPhotoCredits();
  if (!credits.length) return [];
  const titles = new Map((await publishedTeasers()).map((story) => [story.slug, story.title]));
  return credits.flatMap((credit) => (titles.has(credit.slug) ? [{ ...credit, title: titles.get(credit.slug)! }] : []));
}

/** A link only when the manifest gave a web address. */
export const creditHref = (url: string) => (/^https:\/\//.test(url) ? url : undefined);
