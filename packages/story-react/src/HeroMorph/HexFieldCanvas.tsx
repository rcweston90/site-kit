'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { HexField } from './hex-field.js';
import { fragmentShader, vertexShader } from './shaders.js';
import { heroMorphStyles as styles } from '../classes.js';

export interface HexFieldCanvasProps {
  field: HexField;
  /** The reader's intent. False holds the current frame; off-screen and
   *  hidden-tab pauses happen here on top of it. */
  playing: boolean;
  /** Seconds on the card's clock; starts at `field.start`, the still's frame. */
  clock: RefObject<number>;
  /** Called if WebGL2 or the shader isn't available; the card keeps its still. */
  onUnsupported?: () => void;
  /** Called once the first frame is on screen. */
  onReady?: () => void;
}

/** ~30 fps. The field moves a fraction of a pixel a frame, so more frames
 *  look the same and only cost battery (a 120 Hz display would draw 4× as
 *  often). Just under 1000/30, so a 60 Hz display draws every other frame. */
const FRAME_MS = 31;

type Rgb = [number, number, number];

let colourProbe: CanvasRenderingContext2D | null = null;

/** Any CSS colour → 0–1 RGB, composited over `under` when it carries alpha.
 *  A 1×1 2D canvas parses every syntax the browser does, so the tokens can
 *  change format without this changing. */
function resolveColour(value: string, under: Rgb = [0, 0, 0]): Rgb {
  colourProbe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const ctx = colourProbe;
  if (!ctx || !value.trim()) return under;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = value.trim();
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const alpha = a / 255;
  return [r, g, b].map((c, i) => (c / 255) * alpha + under[i] * (1 - alpha)) as Rgb;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn('Hero pattern shader:', gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

interface Surface {
  setField: (field: HexField) => void;
  draw: () => void;
}

/**
 * The hex field on WebGL2. Lines need the full (capped) DPR to stay
 * hairline-crisp; the context is low-power and released when the canvas
 * leaves the page. Not core/hooks/useWebGL: a paused frame must survive a
 * resize (which clears the buffer), so this redraws inside its own
 * ResizeObserver instead of only resizing.
 */
export default function HexFieldCanvas({ field, playing, clock, onUnsupported, onReady }: HexFieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const fieldRef = useRef(field);
  const callbacks = useRef({ onUnsupported, onReady });

  // Latest callbacks for the GL lifecycle, without re-creating the context
  // whenever the parent passes a new function.
  useLayoutEffect(() => {
    callbacks.current = { onUnsupported, onReady };
  }, [onUnsupported, onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // Decorative: never wake a discrete GPU for it.
      powerPreference: 'low-power',
    });
    if (!gl) {
      callbacks.current.onUnsupported?.();
      return;
    }

    let program: WebGLProgram | null = null;
    let ready = false;
    let cssWidth = 0;
    let cssHeight = 0;
    let live: { setSize: () => void; setColours: () => void; draw: () => void } | null = null;

    const layout = () => {
      if (!live || !cssWidth || !cssHeight) return;
      live.setSize();
      live.draw();
      if (!ready) {
        ready = true;
        callbacks.current.onReady?.();
      }
    };

    const init = (): boolean => {
      live = null;
      const vs = compile(gl, gl.VERTEX_SHADER, vertexShader);
      const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
      const linked = gl.createProgram();
      if (!vs || !fs || !linked) return false;
      gl.attachShader(linked, vs);
      gl.attachShader(linked, fs);
      gl.linkProgram(linked);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
        console.warn('Hero pattern program:', gl.getProgramInfoLog(linked));
        gl.deleteProgram(linked);
        return false;
      }
      program = linked;
      gl.useProgram(linked);

      const at = (name: string) => gl.getUniformLocation(linked, name);
      const loc = {
        res: at('u_res'), px: at('u_px'), time: at('u_time'),
        cols: at('u_cols'), dir: at('u_dir'), phase: at('u_phase'), node: at('u_node'),
        bg: at('u_bg'), ink: at('u_ink'), accent: at('u_accent'),
      };

      const draw = () => {
        if (gl.isContextLost() || !cssWidth) return;
        gl.uniform1f(loc.time, clock.current);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      const setField = (value: HexField) => {
        gl.uniform1f(loc.cols, value.cols);
        gl.uniform2fv(loc.dir, value.dir);
        gl.uniform1f(loc.phase, value.phase);
        gl.uniform2fv(loc.node, value.node);
      };
      const setColours = () => {
        const style = getComputedStyle(canvas);
        const bg = resolveColour(style.getPropertyValue('--story-card'));
        gl.uniform3fv(loc.bg, bg);
        gl.uniform3fv(loc.ink, resolveColour(style.getPropertyValue('--story-accent'), bg));
        gl.uniform3fv(loc.accent, resolveColour(style.getPropertyValue('--story-accent-secondary'), bg));
      };
      const setSize = () => {
        const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        const width = Math.max(1, Math.round(cssWidth * ratio));
        const height = Math.max(1, Math.round(cssHeight * ratio));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        gl.viewport(0, 0, width, height);
        gl.uniform2f(loc.res, width, height);
        gl.uniform1f(loc.px, width / cssWidth);
      };

      setField(fieldRef.current);
      setColours();
      live = { setSize, setColours, draw };
      surfaceRef.current = { setField, draw };
      layout();
      return true;
    };

    if (!init()) {
      callbacks.current.onUnsupported?.();
      return;
    }

    // Resizing clears the drawing buffer, so every resize redraws at once —
    // a paused frame would otherwise go blank.
    const resizeObserver = new ResizeObserver(([entry]) => {
      cssWidth = entry.contentRect.width;
      cssHeight = entry.contentRect.height;
      layout();
    });
    resizeObserver.observe(canvas);

    // The tokens change with the page theme; repaint with them.
    const themeObserver = new MutationObserver(() => {
      live?.setColours();
      live?.draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

    const onLost = (event: Event) => {
      event.preventDefault();
      live = null;
      surfaceRef.current = null;
    };
    const onRestored = () => {
      if (!init()) callbacks.current.onUnsupported?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      surfaceRef.current = null;
      if (program) gl.deleteProgram(program);
      // Strict Mode re-runs this effect on the same, still-mounted canvas,
      // which would get this context back already lost. Release it only once
      // the canvas has really left the page.
      if (!canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [clock]);

  useEffect(() => {
    fieldRef.current = field;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.setField(field);
    surface.draw();
  }, [field]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !playing) return;
    let onScreen = false;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (last && now - last < FRAME_MS) return;
      // Capped, so a long task or a throttled frame is a pause in the drawing
      // rather than a jump.
      clock.current += last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      surfaceRef.current?.draw();
    };
    const sync = () => {
      const run = onScreen && document.visibilityState === 'visible';
      if (run && !frame) {
        last = 0;
        frame = requestAnimationFrame(tick);
      } else if (!run && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const viewport = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    viewport.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    return () => {
      viewport.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(frame);
    };
  }, [playing, clock]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
