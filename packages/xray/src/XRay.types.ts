import type { AxeLoader } from './a11y.js';
import type { Breakpoint, FrameConfig, PaletteConfig, RhythmInput, TrackingToken } from './config.js';

export interface XRayProps {
  /**
   * Whether X-ray may run at all. When false nothing renders, ⌥X and
   * `?xray=1` do nothing, and an open inspector closes.
   * @default process.env.NODE_ENV !== 'production'
   */
  enabled?: boolean;
  /**
   * An optional server check, asked once per tab before X-ray becomes
   * available (for example, whether the visitor is signed in as an admin).
   * Resolve true to allow it.
   */
  verify?: () => Promise<boolean>;
  /**
   * Which pages X-ray runs on, given the current pathname. Build one with
   * `matchRoutes(include, exclude)`.
   * @default every page
   */
  routes?: (pathname: string) => boolean;
  /**
   * The current pathname, from your router. Optional: without it X-ray
   * reads `window.location.pathname` and listens for navigation.
   */
  pathname?: string;
  /** The rhythm to measure against. Missing parts derive from `unit` (default 12). */
  rhythm?: RhythmInput;
  /** Canvas and panel colours by role: custom property names or CSS colours. */
  palette?: Partial<PaletteConfig>;
  /** Breakpoints by min-width (default: Tailwind's). */
  breakpoints?: Breakpoint[];
  /** Letter-spacing tokens the Type tab names (default: Tailwind's). */
  tracking?: TrackingToken[];
  /** The page frame overlay: content max width and gutter, as CSS lengths. */
  frame?: Partial<FrameConfig>;
  /**
   * Loads axe-core for the accessibility tab, e.g. `() => import('axe-core')`.
   * Without it the tab says how to turn the check on.
   */
  axe?: AxeLoader;
  /**
   * Show the floating X-ray button. Turn it off when your app has its own
   * trigger (call `setXRay(true)`).
   * @default true
   */
  launcher?: boolean;
  /**
   * Mount the baseline grid overlay, so ⌥G and the dock's grid switch work.
   * Turn it off if you render <RhythmGrid /> yourself.
   * @default true
   */
  grid?: boolean;
}

export interface XRayInspectorProps {
  /** Turn X-ray off (the dock's Exit button, or Esc with nothing pinned). */
  onExit: () => void;
  /** The current pathname: a change starts the inspector over. */
  pathname: string;
  axe?: AxeLoader;
}
