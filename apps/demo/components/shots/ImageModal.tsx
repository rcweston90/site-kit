'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { Button } from '@rcweston/site-admin';
import type { ImageModalProps, Photo } from './types';
import styles from './ImageModal.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Real shots often carry filename-derived alt text (blob UUIDs, camera names
 * like IMG_1234) rather than a human caption. Those read as garbage in the
 * title line, so anything machine-looking falls back to "Untitled nn".
 */
const looksGenerated = (alt: string) =>
  alt.split(/\s+/).some((t) => /^[0-9a-f]{7,}$/i.test(t)) ||
  /^(img|dsc|dscf|pxl|image|photo|screenshot)[-_ ]?\d+/i.test(alt);

const photoTitle = (p: Photo, i: number) => {
  const alt = p.alt?.trim();
  return alt && !looksGenerated(alt) ? alt : `Untitled ${pad(i + 1)}`;
};

/**
 * ImageModal Component
 *
 * Fullscreen photo viewer on the site's dark-panel surface. Beyond the bare
 * image, an info column carries a sense of place in the collection: a mono
 * `SHOT nn / NN` position, the photo's title, and Previous / Next keys. Its
 * controls are the site's keycap Button on the panel's tokens; from tablet
 * up, each nav key carries a preview of the photo it goes to.
 *
 * Supports keyboard navigation (ESC to close, arrow keys to navigate), traps
 * focus while open, restores focus to the trigger on close, and locks body
 * scroll. The viewer fades in and each photo settles in with CSS (see
 * ImageModal.module.css), so it needs no animation library.
 *
 * @example
 * ```tsx
 * <ImageModal
 *   photos={photos}
 *   currentIndex={selectedIndex}
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   onNext={() => setSelectedIndex((i) => (i + 1) % photos.length)}
 *   onPrevious={() => setSelectedIndex((i) => (i - 1 + photos.length) % photos.length)}
 * />
 * ```
 */
export function ImageModal({
  photos,
  currentIndex,
  isOpen,
  lockBodyScroll = true,
  onClose,
  onNext,
  onPrevious,
}: ImageModalProps) {
  const currentPhoto = photos[currentIndex];
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Capture the trigger, focus the close button on open, restore focus on close
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => closeButtonRef.current?.focus(), 100);
    return () => {
      clearTimeout(t);
      previouslyFocused.current?.focus();
    };
  }, [isOpen]);

  // Keyboard navigation + focus trap + scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        onNext();
      } else if (e.key === 'ArrowLeft') {
        onPrevious();
      } else if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    if (lockBodyScroll) document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (lockBodyScroll) document.body.style.overflow = 'unset';
    };
  }, [isOpen, lockBodyScroll, onClose, onNext, onPrevious]);

  if (!currentPhoto) return null;

  const prevIdx = (currentIndex - 1 + photos.length) % photos.length;
  const nextIdx = (currentIndex + 1) % photos.length;

  return (
    <>
      {isOpen && (
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Image viewer: Photo ${currentIndex + 1} of ${photos.length}`}
          aria-roledescription="image viewer"
          className={`fixed inset-0 z-50 flex flex-col md:flex-row ${styles.viewer}`}
        >
          {/* Navigation instructions for screen readers */}
          <p className="sr-only">
            Use left and right arrow keys to navigate between photos. Press Escape to close.
          </p>

          {/* Image area */}
          <div
            key={currentIndex}
            className={`relative m-half min-h-0 flex-1 md:m-minor ${styles.photo}`}
          >
            <Image
              src={currentPhoto.src}
              alt={currentPhoto.alt}
              fill
              sizes="(max-width: 768px) 100vw, 75vw"
              priority
              {...(currentPhoto.blurDataURL
                ? { placeholder: 'blur' as const, blurDataURL: currentPhoto.blurDataURL }
                : {})}
              className="object-contain"
            />
          </div>

          {/* Info column */}
          <div className="flex shrink-0 items-center justify-between gap-minor border-t border-[color:var(--on-panel-divider)] p-minor pb-[max(1.5rem,env(safe-area-inset-bottom))] md:w-72 md:flex-col md:items-stretch md:justify-start md:border-l md:border-t-0 md:px-8 lg:w-80">
            <div>
              <p
                className="mb-0 font-mono text-xs leading-baseline tracking-caps"
                style={{ color: 'var(--on-panel-muted)' }}
              >
                SHOT {pad(currentIndex + 1)} / {pad(photos.length)}
              </p>
              <span aria-live="polite" className="sr-only">
                Photo {currentIndex + 1} of {photos.length}: {photoTitle(currentPhoto, currentIndex)}
              </span>
              <h2 className="mt-0 text-sm font-medium leading-baseline">
                {photoTitle(currentPhoto, currentIndex)}
              </h2>
            </div>

            {/* Previous / Next. On phones two square arrow keys beside the
                title; from tablet up each key grows a 40px preview of the
                photo it goes to above its label, so the thumbnail is part of
                the key rather than a second control. */}
            {photos.length > 1 && (
              <div className="flex gap-2 md:mt-auto md:grid md:grid-cols-2">
                {[
                  { label: 'Previous', idx: prevIdx, onClick: onPrevious, Arrow: ArrowLeft },
                  { label: 'Next', idx: nextIdx, onClick: onNext, Arrow: ArrowRight },
                ].map(({ label, idx, onClick, Arrow }) => (
                  <Button key={label} size="sm" onClick={onClick} className="group min-h-12 min-w-12 md:w-full md:flex-col">
                    <span className="relative hidden h-10 w-full overflow-hidden rounded-[3px] opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none md:block">
                      <Image src={photos[idx].src} alt="" fill sizes="140px" className="object-cover" />
                    </span>
                    <span className={`flex items-center gap-2 ${Arrow === ArrowRight ? 'flex-row-reverse' : ''}`}>
                      <Arrow size={16} aria-hidden="true" />
                      <span className="sr-only md:not-sr-only">{label}</span>
                      <span className="sr-only"> photo</span>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Close */}
          <Button
            ref={closeButtonRef}
            variant="secondary"
            size="sm"
            onClick={onClose}
            aria-label="Close image viewer"
            className="absolute right-half top-half z-10 min-h-12 min-w-12"
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
      )}
    </>
  );
}

export default ImageModal;
