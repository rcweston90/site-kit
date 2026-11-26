'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Photo } from './types';
import styles from './ShotsReel.module.css';

/*
 * The home page's shots carousel: the visible shots one at a time, a slide
 * every 4 seconds while it's on screen, with Previous, Pause and Next in a
 * recessed well and the whole frame linking to /shots. It is the original's
 * home showreel in its shots mode; the generative mode belongs to another
 * module and isn't here.
 *
 *   const shots = await (await backend()).site.reads['shots'].photos();
 *   <ShotsReel shots={shots} />
 */

function isNearActive(i: number, active: number, len: number): boolean {
  if (len <= 3) return true;
  const d = Math.abs(i - active);
  return Math.min(d, len - d) <= 1;
}

const REDUCE = '(prefers-reduced-motion: reduce)';
const subscribeReduce = (listener: () => void) => {
  const query = window.matchMedia(REDUCE);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const useReducedMotion = () => useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE).matches, () => false);

export function ShotsReel({ shots, galleryHref = '/shots' }: { shots: Photo[]; galleryHref?: string }) {
  const [shotIndex, setShotIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [carouselInView, setCarouselInView] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const goToPrev = useCallback(() => {
    setShotIndex((prev) => (prev - 1 + shots.length) % Math.max(1, shots.length));
  }, [shots.length]);

  const goToNext = useCallback(() => {
    setShotIndex((prev) => (prev + 1) % Math.max(1, shots.length));
  }, [shots.length]);

  const handleCarouselKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setCarouselPaused(true); goToPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCarouselPaused(true); goToNext(); }
  }, [goToPrev, goToNext]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setCarouselInView(entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (shots.length < 2 || carouselPaused || !carouselInView || reduceMotion) return;
    const id = setInterval(() => setShotIndex((prev) => (prev + 1) % shots.length), 4000);
    return () => clearInterval(id);
  }, [shots.length, carouselPaused, carouselInView, reduceMotion]);

  const activeIndex = shots.length ? shotIndex % shots.length : 0;

  return (
      <section
        data-build-target="showreel"
        style={{ animationDelay: '0.28s', '--enter-y': '16px' } as CSSProperties}
        className={`${styles.reel} @container`}
      >
        {/* Aspect boxes are the fallback; where CSS round() is supported the
            height snaps down to a whole baseline so the grid resumes exactly
            at the carousel's bottom edge. */}
        {/* A keyboard-focusable carousel region supports arrow-key browsing. */}
        <div
          ref={carouselRef}
          className="rounded-sm bg-card-bg overflow-hidden relative w-full aspect-[3/2] sm:aspect-[2/1] md:aspect-[21/9] h-[round(down,66.667cqw,var(--rhythm-minor))] sm:h-[round(down,50cqw,var(--rhythm-minor))] md:h-[round(down,42.857cqw,var(--rhythm-minor))]"
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label={`Shots slideshow — ${activeIndex + 1} of ${shots.length}`}
          onKeyDown={handleCarouselKeyDown}
          onFocus={(event) => {
            // A transport button must keep its state until its own click runs.
            if (event.target === event.currentTarget) setCarouselPaused(true);
          }}
          onMouseEnter={() => setCarouselPaused(true)}
        >
          {/* Chrome comes in last, once the slide it sits on top of has
              painted. The click handler only swallows taps that land between
              the buttons, so they don't fall through to the gallery link
              underneath — every control in here is a real button. */}
          {shots.length > 1 && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              style={{ animationDelay: '0.95s', animationDuration: '0.4s' }}
              data-xray-spacing-scale="micro"
              className="enter-fade surface-well absolute top-2 right-2 md:top-3 md:right-3 z-20 flex items-center gap-1 rounded-lg p-1 font-mono text-xs leading-baseline uppercase tracking-wide"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              {/* Transport */}
              <div className="flex items-center gap-0.5" role="group" aria-label="Slideshow controls">
                <button
                  type="button"
                  onClick={() => { setCarouselPaused(true); goToPrev(); }}
                  className="control-surface relative grid h-6 w-7 place-items-center rounded-md text-foreground-muted before:absolute before:inset-x-0 before:-inset-y-half before:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary"
                  aria-label="Previous slide"
                >
                  <svg width="7" height="10" viewBox="0 0 7 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5.5 1 1.5 5l4 4" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => setCarouselPaused(!carouselPaused)}
                  data-active={carouselPaused ? 'true' : undefined}
                  className="control-surface relative grid h-6 w-7 place-items-center rounded-md text-foreground-muted before:absolute before:inset-x-0 before:-inset-y-half before:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary"
                  aria-label={carouselPaused ? 'Play slideshow' : 'Pause slideshow'}
                  title={carouselPaused ? 'Play slideshow' : 'Pause slideshow'}
                >
                  {carouselPaused ? (
                    <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor" aria-hidden="true"><path d="M0 0v10l9-5z" /></svg>
                  ) : (
                    <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true"><rect width="2.5" height="10" rx="0.5" /><rect x="5.5" width="2.5" height="10" rx="0.5" /></svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setCarouselPaused(true); goToNext(); }}
                  className="control-surface relative grid h-6 w-7 place-items-center rounded-md text-foreground-muted before:absolute before:inset-x-0 before:-inset-y-half before:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary"
                  aria-label="Next slide"
                >
                  <svg width="7" height="10" viewBox="0 0 7 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 1l4 4-4 4" /></svg>
                </button>
              </div>
            </div>
          )}

          <div className="absolute inset-0">
            {shots.length > 0 ? (
              shots.map((img, i) => (
                <div
                  key={`shots-${img.src}`}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${shots.length}: ${img.alt}`}
                  aria-hidden={i !== activeIndex}
                  className="absolute inset-0"
                  style={{ opacity: i === activeIndex ? 1 : 0, transition: 'opacity 1s ease-in-out' }}
                >
                  {isNearActive(i, activeIndex, shots.length) && (
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover"
                      // Match the preview’s capped content width and responsive gutters.
                      sizes="(min-width: 1440px) 1296px, (min-width: 1280px) calc(100vw - 144px), (min-width: 1024px) calc(100vw - 96px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 48px)"
                      priority={i === 0}
                      fetchPriority={i === 0 ? 'high' : undefined}
                      placeholder={img.blurDataURL ? 'blur' : 'empty'}
                      blurDataURL={img.blurDataURL}
                    />
                  )}
                </div>
              ))
            ) : (
              <div className="absolute inset-0 bg-background-secondary animate-pulse" />
            )}
            <Link href={galleryHref} aria-label="View all shots" className="absolute inset-0" />
          </div>
        </div>
      </section>
  );
}

export default ShotsReel;
