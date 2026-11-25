'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_IMAGE_ZOOM, IMAGE_ZOOM_LEVELS, lightboxImageSize, stepImageZoom, type ImageSize, type ImageZoom } from '@rcweston/story-core';
import type { StoryMedia } from '@rcweston/story-core';
import { mediaExpansionSettings } from '@rcweston/story-core';
import { storyStyles as styles } from './classes.js';

interface Props {
  /** Original authenticated source, never an optimized thumbnail or public copy. */
  src: string;
  alt: string;
  caption?: string;
  expansion?: StoryMedia['expansion'];
  /** The existing inline image. Its framing does not apply to the original. */
  children: ReactNode;
}

/** Native modal with breathing room around the image, simple zoom steps and panning. */
export function StoryImageLightbox({ src, alt, caption, children, expansion }: Props) {
  const initial = mediaExpansionSettings(expansion);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const captionId = useId();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<ImageZoom>(DEFAULT_IMAGE_ZOOM);
  const [source, setSource] = useState<{ src: string; size: ImageSize } | null>(null);
  const [viewport, setViewport] = useState<ImageSize>({ width: 0, height: 0 });
  const size = source?.src === src ? lightboxImageSize(source.size, viewport, zoom) : undefined;

  useEffect(() => {
    if (!open || !viewportRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewportRef.current);
    // Preserve the surrounding reader's scroll lock, if there is one.
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      observer.disconnect();
      html.style.overflow = overflow;
    };
  }, [open]);

  useLayoutEffect(() => {
    const view = viewportRef.current;
    if (!open || !view) return;
    // Author-selected initial anchor; all overflow remains reachable on both axes.
    view.scrollLeft = (view.scrollWidth - view.clientWidth) * initial.x / 100;
    view.scrollTop = (view.scrollHeight - view.clientHeight) * initial.y / 100;
  }, [open, zoom, size?.width, size?.height, initial.x, initial.y]);

  return (
    <>
      <button
        type="button"
        className={styles.zoomTrigger}
        aria-label={`Enlarge: ${alt}`}
        aria-haspopup="dialog"
        onClick={() => {
          setZoom(initial.zoom);
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        {children}
      </button>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop shortcut; Close and Escape provide keyboard dismissal */}
      <dialog onClick={(event) => {
        if (event.target === event.currentTarget || (event.target instanceof HTMLElement && event.target.classList.contains(styles.lightboxCanvas))) event.currentTarget.close();
      }} ref={dialogRef} className={styles.lightbox} aria-label={alt} aria-describedby={caption ? captionId : undefined} onClose={() => { setOpen(false); dragRef.current = null; }}>
        <div className={styles.lightboxToolbar}>
          <div className={styles.lightboxZoom} role="group" aria-label="Image size">
            <button
              type="button"
              className={styles.lightboxControl}
              aria-label="Zoom out"
              disabled={zoom === IMAGE_ZOOM_LEVELS[0]}
              onClick={() => setZoom((current) => stepImageZoom(current, -1))}
            ><span aria-hidden="true">−</span></button>
            <output className={styles.lightboxZoomValue} aria-live="polite" aria-label={`Image size: ${zoom}% of screen fit`} title="Relative to screen fit">{zoom}%</output>
            <button
              type="button"
              className={styles.lightboxControl}
              aria-label="Zoom in"
              disabled={zoom === IMAGE_ZOOM_LEVELS[IMAGE_ZOOM_LEVELS.length - 1]}
              onClick={() => setZoom((current) => stepImageZoom(current, 1))}
            ><span aria-hidden="true">+</span></button>
          </div>
          <button type="button" className={styles.lightboxControl} onClick={() => dialogRef.current?.close()}>Close</button>
        </div>
        <figure className={styles.lightboxFigure}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- named scroll region must be keyboard-scrollable in every browser */}
          <div tabIndex={0}
            ref={viewportRef}
            className={styles.lightboxViewport}
            data-pannable={Boolean(size && (size.width > viewport.width || size.height > viewport.height))}
            role="region"
            aria-label="Image detail. Scroll or drag to pan."
            onPointerDown={(event) => {
              if (event.pointerType !== 'mouse' || event.button !== 0) return;
              const view = event.currentTarget;
              if (view.scrollWidth <= view.clientWidth && view.scrollHeight <= view.clientHeight) return;
              dragRef.current = { x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop };
              view.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX;
              event.currentTarget.scrollTop = drag.top + drag.y - event.clientY;
            }}
            onPointerUp={(event) => {
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { dragRef.current = null; }}
            onLostPointerCapture={() => { dragRef.current = null; }}
          >
            <div className={styles.lightboxCanvas}>
              {/* Mount only on demand: full resolution stays behind the same auth boundary. */}
              {open && (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad only measures the image, never handles input
                <img
                  src={src}
                  alt={alt}
                  decoding="async"
                  draggable={false}
                  className={styles.lightboxImage}
                  data-sized={Boolean(size)}
                  style={size ? {
                    ...size,
                    margin: 0,
                    marginLeft: Math.max(0, viewport.width - size.width) * initial.x / 100,
                    marginTop: Math.max(0, viewport.height - size.height) * initial.y / 100,
                  } : undefined}
                  onLoad={(event) => setSource({ src, size: { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight } })}
                />
              )}
            </div>
          </div>
          {caption && <figcaption id={captionId} className={styles.lightboxCaption}>{caption}</figcaption>}
        </figure>
      </dialog>
    </>
  );
}
