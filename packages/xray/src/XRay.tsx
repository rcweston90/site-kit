'use client';

import { lazy, Suspense, useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { ScanSearch } from 'lucide-react';
import { styles } from './classes.js';
import { configureXRay, paletteStyle, useXRayConfig } from './config.js';
import { RhythmGrid } from './RhythmGrid.js';
import { getXRay, setXRay, setXRayAllowed, showInTopLayer, useXRay, useXRayAllowed, verifyXRay } from './store.js';
import type { XRayProps } from './XRay.types.js';

// The inspector (canvas, measuring, dock) is its own chunk, fetched the first
// time X-ray opens: this shell is all an app ships until then.
const XRayInspector = lazy(() => import('./XRayInspector.js'));

/** True in a production build. Bundlers replace `process.env.NODE_ENV`; where nothing does and `process` is missing, it isn't production. */
function isProduction(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

const exit = () => setXRay(false);

// Inside a frame — the breakpoint compare loads the page in off-screen
// ones — X-ray stays out of the way. False on the server and while hydrating.
const noSubscribe = () => () => {};
const isFramed = () => window.self !== window.top;
const notFramed = () => false;

// The pathname without a router: history moves, the Navigation API where the
// browser has it, and a slow poll for pushState elsewhere.
const subscribePath = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('currententrychange', cb);
  const poll = nav ? 0 : window.setInterval(cb, 500);
  return () => {
    window.removeEventListener('popstate', cb);
    nav?.removeEventListener('currententrychange', cb);
    if (poll) window.clearInterval(poll);
  };
};
const readPath = () => window.location.pathname;
const serverPath = () => '';

function usePathname(given: string | undefined): string {
  const fromWindow = useSyncExternalStore(given === undefined ? subscribePath : noSubscribe, readPath, serverPath);
  return given ?? fromWindow;
}

/**
 * XRay
 *
 * An inspector for checking spacing on the live page: padding, and the space
 * inside, around and between what you see, text measured to its box or by
 * its letters. Vertical values off the configured rhythm show red.
 *
 * Off in production unless `enabled` says otherwise, and limited to the
 * pages `routes` allows. Entirely client-side: it reads the page and never
 * sends anything anywhere.
 */
export function XRay({
  enabled = !isProduction(),
  verify,
  routes,
  pathname: givenPath,
  rhythm,
  palette,
  breakpoints,
  tracking,
  frame,
  axe,
  launcher = true,
  grid = true,
}: XRayProps) {
  const pathname = usePathname(givenPath);
  const framed = useSyncExternalStore(noSubscribe, isFramed, notFramed);
  const routeOk = !pathname || !routes || routes(pathname);
  const allowed = useXRayAllowed();
  const on = useXRay();
  const config = useXRayConfig();

  // Props → configuration. Serialised so inline objects don't reapply every render.
  const configKey = JSON.stringify({ rhythm, palette, breakpoints, tracking, frame });
  useEffect(() => {
    const input = JSON.parse(configKey) as Parameters<typeof configureXRay>[0];
    configureXRay(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  }, [configKey]);

  // Gating: enabled, on an allowed route, not framed, and verified if asked.
  const verifyRef = useRef(verify);
  useEffect(() => {
    verifyRef.current = verify;
  }, [verify]);
  const hasVerify = !!verify;
  useEffect(() => {
    if (!enabled || !routeOk || framed) {
      setXRayAllowed(false);
      return;
    }
    if (!hasVerify) {
      setXRayAllowed(true);
      return;
    }
    let live = true;
    void verifyXRay(() => verifyRef.current?.() ?? Promise.resolve(false)).then((ok) => {
      if (live) setXRayAllowed(ok);
    });
    return () => {
      live = false;
    };
  }, [enabled, routeOk, framed, hasVerify]);

  // ⌥X and ?xray=1, once allowed.
  useEffect(() => {
    if (!allowed) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('xray')) setXRay(params.get('xray') !== '0');

    const onKeyDown = (e: KeyboardEvent) => {
      // e.code, not e.key: Option+X types "≈" on macOS.
      if (e.code !== 'KeyX' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      setXRay(!getXRay());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowed]);

  if (!allowed) return null;
  const themed = paletteStyle(config.palette) as CSSProperties;

  return (
    <>
      {grid && <RhythmGrid />}
      {launcher && !on && <Launcher style={themed} />}
      {on && (
        <Suspense fallback={null}>
          <XRayInspector onExit={exit} pathname={pathname} axe={axe} />
        </Suspense>
      )}
    </>
  );
}

function Launcher({ style }: { style: CSSProperties }) {
  const ref = useRef<HTMLButtonElement>(null);
  // In the top layer, so it sits above navigation, players and modals without a z-index.
  useEffect(() => {
    showInTopLayer(ref.current);
  }, []);
  return (
    <button ref={ref} type="button" popover="manual" className={styles.launcher} style={style} onClick={() => setXRay(true)} aria-label="X-ray: inspect spacing (Alt+X)">
      <ScanSearch aria-hidden="true" size={20} strokeWidth={1.75} />
      <span className={styles.launcherLabel} aria-hidden="true">
        X-ray <kbd>⌥X</kbd>
      </span>
    </button>
  );
}

export default XRay;
