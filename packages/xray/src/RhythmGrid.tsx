'use client';

import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { rhythmStyles as styles } from './classes.js';
import { gridLabel, paletteStyle, useXRayConfig } from './config.js';

const STORAGE_KEY = 'rhythm-grid';

// The on/off state lives in sessionStorage (so it survives navigation within
// the tab) and is exposed to React as an external store — no setState inside
// effects, and the server snapshot keeps hydration clean.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getSnapshot = () => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
const getServerSnapshot = () => false;
/**
 * Turn the grid on or off from elsewhere: the X-ray dock has a switch for
 * it, and a Storybook toolbar or your own control can use it too. Same
 * effect as ⌥G or `?rhythm=1`, including persistence.
 */
export const setRhythmGrid = (on: boolean) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    // no storage — the grid simply won't persist
  }
  listeners.forEach((cb) => cb());
};
/** Whether the grid is showing, kept in step with ⌥G and `?rhythm=`. */
export const useRhythmGrid = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

/**
 * RhythmGrid
 *
 * A toggleable baseline-grid overlay for checking that vertical spacing sits
 * on the rhythm: a line every minor step, a heavier one every major step
 * (24px and 72px by default; both come from the rhythm config).
 * Toggle with ⌥G (Alt+G), or load any page with `?rhythm=1` (`?rhythm=0`
 * clears). The choice persists for the tab session so you can browse with
 * the grid on. Purely visual: aria-hidden and pointer-events: none.
 *
 * <XRay> mounts one for you; render this yourself only with `grid={false}`
 * there, or without X-ray at all.
 */
export function RhythmGrid() {
  const on = useRhythmGrid();
  const config = useXRayConfig();
  const { minor, major } = config.rhythm;
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('rhythm')) setRhythmGrid(params.get('rhythm') !== '0');

    const onKeyDown = (e: KeyboardEvent) => {
      // e.code, not e.key: Option+G types "©" on macOS.
      if (e.code !== 'KeyG' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      setRhythmGrid(!getSnapshot());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Scroll the fixed overlay's pattern with the document so the lines stay
  // glued to the content. Each layer repeats on its own step, so each gets
  // its own offset (with the defaults 24 divides 72 and they agree anyway).
  useEffect(() => {
    if (!on) return;
    const el = linesRef.current;
    if (!el) return;
    let raf = 0;
    const sync = () => {
      el.style.backgroundPositionY = `${-(window.scrollY % major)}px, ${-(window.scrollY % minor)}px`;
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [on, minor, major]);

  if (!on) return null;

  const style = { ...paletteStyle(config.palette), '--xr-grid-minor': `${minor}px`, '--xr-grid-major': `${major}px` } as CSSProperties;
  return (
    <div className={styles.grid} style={style} aria-hidden="true">
      <div ref={linesRef} className={styles.lines} />
      <div className={styles.label}>
        <span>&#8801;</span>
        <span>{gridLabel(config.rhythm)}</span>
        <kbd>&#8997;G</kbd>
      </div>
    </div>
  );
}

export default RhythmGrid;
