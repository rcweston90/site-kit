'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import Image from 'next/image';
import type { Photo, PhotoCollageProps } from './types';
import { BANDS, tileWidths } from './justify';

/** How many photos to render in the initial batch */
const INITIAL_BATCH = 15;
/** How many to add per subsequent batch when scrolling near bottom */
const BATCH_SIZE = 10;

/** A photo's aspect ratio (width / height). */
const aspectW = (p: Photo) => (p.width && p.height ? p.width / p.height : 1);

/** Picks the tile's width for the viewport from the per-band variables
 *  (breakpoints match BANDS in ./justify). */
const TILE_WIDTH =
  'w-(--w0) min-[480px]:w-(--w1) md:w-(--w2) lg:w-(--w3) xl:w-(--w4) min-[1600px]:w-(--w5)';

const IMG_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 40vw, 22vw';

/**
 * A single gallery tile: the tile reserves the photo's natural aspect ratio (no
 * layout shift) and a static LQIP layer shows instantly behind the image, which
 * simply appears when it loads — no fade/scale reveal. A subtle zoom on hover
 * (pointer devices, respecting reduced-motion) is the only motion.
 */
function GridPhoto({ photo, index }: { photo: Photo; index: number }) {
  const ratio = aspectW(photo);

  return (
    <div
      className="relative w-full overflow-hidden bg-card-bg"
      style={{ aspectRatio: String(ratio) }}
    >
      {photo.blurDataURL && (
        <div
          aria-hidden
          className="absolute inset-0 scale-110 bg-cover bg-center"
          style={{ backgroundImage: `url(${photo.blurDataURL})`, filter: 'blur(14px)' }}
        />
      )}
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={IMG_SIZES}
        loading={index < 9 ? 'eager' : 'lazy'}
        // Reduced motion is decided in CSS, not by a hook reading the query:
        // that reads the media query during render, so the server (false) and a
        // reduced-motion client (true) rendered different classes on every
        // tile. motion-safe drops the zoom itself, not just its easing.
        className="object-cover transition-transform duration-300 ease-out motion-reduce:transition-none [@media(hover:hover)]:motion-safe:group-hover:scale-105"
      />
    </div>
  );
}

/**
 * A wall-to-wall justified-rows gallery that packs photos at their natural
 * aspect ratios into full-width rows — so there's no ragged trailing column.
 * Progressive rendering mounts a batch at a time, loading more near the bottom.
 */
export function PhotoCollage({ photos, onPhotoClick, className = '' }: PhotoCollageProps) {
  const [visibleCount, setVisibleCount] = useState(
    Math.min(INITIAL_BATCH, photos.length)
  );

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, photos.length));
  }, [photos.length]);

  // Load more when a bottom sentinel nears the viewport. Unlike a scroll
  // listener, this also fires when the loaded batch is *shorter* than the
  // viewport (nothing to scroll) — the effect re-runs on each visibleCount
  // change, so it keeps pulling batches until the page fills or all photos load.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visibleCount >= photos.length) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '800px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, photos.length, loadMore]);

  // Packed for every band (see ./justify) and over every photo, not just the
  // rendered batch: the server render is the final layout at any width, and
  // a batch loading in only adds tiles. Packing per batch made the last rows
  // repack as each batch arrived, and on desktop the first batch doesn't fill
  // the screen, so that reflow happened in view.
  const widths = useMemo(() => tileWidths(photos.map(aspectW)), [photos]);

  return (
    <div className={`w-full ${className}`}>
      <div role="group" aria-label={`Photo gallery, ${photos.length} photos`} className="flex w-full flex-wrap">
        {photos.slice(0, visibleCount).map((photo, index) => (
          <div
            key={index}
            style={Object.fromEntries(BANDS.map((_, b) => [`--w${b}`, widths[index][b]])) as CSSProperties}
            className={`group relative block cursor-pointer ${TILE_WIDTH}`}
            role={onPhotoClick ? 'button' : undefined}
            tabIndex={onPhotoClick ? 0 : undefined}
            aria-label={onPhotoClick ? `Photo ${index + 1} of ${photos.length}: ${photo.alt}` : undefined}
            onClick={() => onPhotoClick?.(index)}
            onKeyDown={onPhotoClick ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPhotoClick(index);
              }
            } : undefined}
          >
            <GridPhoto photo={photo} index={index} />
          </div>
        ))}
      </div>
      {visibleCount < photos.length && (
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      )}
    </div>
  );
}

export default PhotoCollage;
