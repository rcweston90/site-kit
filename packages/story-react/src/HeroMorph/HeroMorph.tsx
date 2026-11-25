'use client';

import { lazy, Suspense, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MotionToggle } from '../MotionToggle.js';
import { heroFrameStyles as frame } from '../classes.js';
import { heroMorphStyles as styles } from '../classes.js';
import { hexField } from './hex-field.js';
import { HexFieldStill } from './HexFieldStill.js';

// WebGL never runs on the server, and the shader stays off the critical
// path: the SVG still paints with the page and the canvas takes over from it.
const HexFieldCanvas = lazy(() => import('./HexFieldCanvas.js'));

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
/** Null until hydrated, so the canvas waits to know before it loads: a
 *  reduced-motion reader never pays for a GL context to show a still. */
function useReducedMotionPreference(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => null,
  );
}

/**
 * The hero card for a story with no motion study of its own: a field of thin
 * pointy-top hexes that round into circles and back in a slow wave, around
 * one orange hex, seeded by the story's slug. It sits in the motion study's
 * frame (same size, same pause control) and is decorative — readers get the
 * control, not the drawing.
 *
 * It stops off screen and in hidden tabs. Under reduced motion it holds its
 * still until the reader presses play, and without WebGL2 the still is all
 * there is.
 */
export function HeroMorph({ seed, editable = false }: {
  /** The story's slug: picks the pattern and the frame its still shows. */
  seed: string;
  /** In the editor the card stands where an authored animation would go, so
   *  it reads as media there: a click opens the hero graphic's settings. */
  editable?: boolean;
}) {
  const field = useMemo(() => hexField(seed), [seed]);
  const reduce = useReducedMotionPreference();
  const [intent, setIntent] = useState<'auto' | 'play' | 'pause'>('auto');
  const [unsupported, setUnsupported] = useState(false);
  const [ready, setReady] = useState(false);
  const clock = useRef(field.start);
  // Until the preference is known the control says "Pause", the common case,
  // so most readers never see it flip after hydration.
  const paused = intent === 'auto' ? reduce === true : intent === 'pause';
  const live = reduce !== null && !unsupported && (intent !== 'auto' || !reduce);

  const Root = editable ? 'figure' : 'div';
  return (
    <Root className={frame.figure}>
      <div className={frame.media}>
        <div
          className={styles.stage}
          data-ready={ready || undefined}
          {...(editable ? { role: 'img', 'aria-label': 'Hero pattern' } : { 'aria-hidden': true })}
        >
          <HexFieldStill field={field} className={styles.still} />
          {live && (
            <Suspense fallback={null}><HexFieldCanvas
              field={field}
              playing={!paused}
              clock={clock}
              onReady={() => setReady(true)}
              onUnsupported={() => setUnsupported(true)}
            /></Suspense>
          )}
        </div>
        {!unsupported && <MotionToggle paused={paused} onClick={() => setIntent(paused ? 'play' : 'pause')} label="hero pattern" />}
      </div>
      <div className={`${frame.footer} ${styles.footer}`}>
        <span className={frame.note} />
      </div>
    </Root>
  );
}
