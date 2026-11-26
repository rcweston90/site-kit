'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PhotoCollage, ImageModal, type Photo } from './index';

const VIEWER_ENTRY = '__siteShotsViewer';
type ViewerEntry = { href: string; index: number };

function viewerEntry(): ViewerEntry | undefined {
  const entry: ViewerEntry | undefined = window.history.state?.[VIEWER_ENTRY];
  return entry?.href === window.location.href && Number.isInteger(entry.index) ? entry : undefined;
}

function overrideStyle(style: CSSStyleDeclaration, property: string, value: string) {
  const previous = style.getPropertyValue(property);
  const priority = style.getPropertyPriority(property);
  style.setProperty(property, value, priority);
  return () => {
    if (previous) style.setProperty(property, previous, priority);
    else style.removeProperty(property);
  };
}

interface ShotsClientProps {
  photos: Photo[];
}

export function ShotsClient({ photos }: ShotsClientProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const leaving = useRef(false);

  // One same-URL entry belongs to the viewer. Back closes it; Forward
  // restores that photo. Do not add one entry per Previous/Next interaction.
  useEffect(() => {
    const restore = () => {
      leaving.current = false;
      const entry = viewerEntry();
      if (entry && entry.index >= 0 && entry.index < photos.length) {
        setSelectedIndex(entry.index);
        setIsModalOpen(true);
      } else {
        setIsModalOpen(false);
      }
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [photos.length]);

  // Lock the actual scrolling element for the lifetime of this history entry.
  // Keep native pinch/pan and retain any classic scrollbar's layout gutter.
  useLayoutEffect(() => {
    if (!isModalOpen || photos.length === 0) return;
    const root = document.documentElement;
    const body = document.body;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    // Cap the page at its pre-lock width, without double-counting a UA gutter.
    // Apply before hiding overflow so scroll anchoring sees one stable layout.
    const maxWidth = getComputedStyle(body).maxWidth;
    const bodyCap = `calc(100vw - ${scrollbarWidth}px)`;
    const restoreWidth = scrollbarWidth > 0
      ? overrideStyle(body.style, 'max-width', maxWidth === 'none' ? bodyCap : `min(${maxWidth}, ${bodyCap})`)
      : undefined;
    const restoreAnchor = overrideStyle(root.style, 'overflow-anchor', 'none');
    const restoreRoot = overrideStyle(root.style, 'overflow-y', 'hidden');
    const restoreBody = overrideStyle(body.style, 'overflow-y', 'hidden');
    return () => {
      restoreWidth?.();
      restoreBody();
      restoreRoot();
      restoreAnchor();
    };
  }, [isModalOpen, photos.length]);

  const handlePhotoClick = (index: number) => {
    if (leaving.current) return;
    const href = window.location.href;
    // Save the list entry while it still has the gallery position, before
    // the modal's existing scroll lock and focus effects run.
    const method = viewerEntry() ? 'replaceState' : 'pushState';
    window.history[method]({ ...window.history.state, [VIEWER_ENTRY]: { href, index } }, '', href);
    setSelectedIndex(index);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    if (leaving.current) return;
    if (!viewerEntry()) {
      setIsModalOpen(false);
      return;
    }
    leaving.current = true;
    window.history.back();
  };

  const move = (step: number) => {
    if (leaving.current) return;
    const index = (selectedIndex + step + photos.length) % photos.length;
    const entry = viewerEntry();
    if (entry) {
      window.history.replaceState({ ...window.history.state, [VIEWER_ENTRY]: { ...entry, index } }, '', entry.href);
    }
    setSelectedIndex(index);
  };

  if (photos.length === 0) {
    return (
      <div className="w-full min-h-screen sm:-mt-major flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground-muted font-mono leading-baseline mb-0">No shots yet</p>
          <p className="text-sm text-foreground-muted font-mono leading-baseline mb-0">
            New shots land here soon — check back.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* The one page outside the home page's frame, on purpose: the collage
          runs wall to wall. Keep the desktop underlay, but let the in-flow phone
          header reserve its own space. loading.tsx uses the same offset. */}
      <div className="w-full min-h-screen sm:-mt-major">
        <h1 className="sr-only">Photo Shots</h1>
        <PhotoCollage
          photos={photos}
          onPhotoClick={handlePhotoClick}
        />
      </div>

      {/* Leave no exiting dialog on a gallery history entry. */}
      {isModalOpen && (
        <ImageModal
          photos={photos}
          currentIndex={selectedIndex}
          isOpen
          lockBodyScroll={false}
          onClose={handleClose}
          onNext={() => move(1)}
          onPrevious={() => move(-1)}
        />
      )}
    </>
  );
}

export default ShotsClient;
