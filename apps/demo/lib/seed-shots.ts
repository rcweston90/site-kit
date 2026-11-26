import type { MediaStore } from '@rcweston/story-core';
import type { ShotsStore } from '@rcweston/site-data';
import { SEED_SHOTS, shotBlur, shotSvg } from '@/content/shots';

/**
 * Puts the seed's shots in the media store and the shots table, once, into an
 * empty library whose order has never been saved. Saving the order marks the
 * library as seeded, so deleting every shot doesn't bring the samples back on
 * the next start.
 */
export async function seedShots(store: ShotsStore, media: MediaStore): Promise<void> {
  const { shots, order } = await store.list();
  if (shots.length > 0 || order.version > 0) return;
  const encoder = new TextEncoder();
  const ids: number[] = [];
  for (const shot of SEED_SHOTS) {
    const pathname = `shots/seed/${shot.file}`;
    if (!(await media.head(pathname))) {
      await media.put({ key: pathname, bytes: encoder.encode(shotSvg(shot)), contentType: 'image/svg+xml', visibility: 'public', cacheControl: 'public, max-age=3600' });
    }
    const saved = await store.insert({ pathname, width: shot.width, height: shot.height, blurDataURL: shotBlur(shot), alt: shot.alt, hidden: shot.hidden ?? false });
    ids.push(saved.id);
  }
  await store.reorder(ids);
}
