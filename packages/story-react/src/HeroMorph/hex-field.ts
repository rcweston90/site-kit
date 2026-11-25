/**
 * The hex field's geometry, shared by the WebGL shader (shaders.ts) and the
 * server-rendered SVG still (HexFieldStill.tsx). Both read the same numbers
 * from here, so the still that paints with the page is the shader's first
 * frame, and the canvas can take over without anything moving.
 *
 * Units: one cell is 1 wide, flat side to flat side; the card is `cols`
 * cells across, centred on its middle, y up (as gl_FragCoord is).
 */

/** The hero card's media box (story-frame-media). */
export const HEX_ASPECT = 6 / 5;
/** Shader time per clock second: one wave crossing ≈ 16 s. */
export const HEX_SPEED = 0.4;
const SQ3 = Math.sqrt(3);
const TAU = Math.PI * 2;

export interface HexField {
  /** Cells across the card. */
  cols: number;
  /** Unit vector the wave travels along. */
  dir: [number, number];
  phase: number;
  /** The orange focus: a cell centre. */
  node: [number, number];
  /** Clock seconds the still is drawn at — each story's own composition. */
  start: number;
}

/** FNV-1a, as GenerativeMark seeds its marks (not exported there). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. */
function makeRng(state: number): () => number {
  let s = state;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nearest cell centre of the pointy-top lattice. */
export function hexCentre(x: number, y: number): [number, number] {
  const ax = (Math.floor(x) + 0.5);
  const ay = (Math.floor(y / SQ3) + 0.5) * SQ3;
  const bx = Math.floor(x - 0.5) + 1;
  const by = (Math.floor((y - SQ3 / 2) / SQ3) + 1) * SQ3;
  return (x - ax) ** 2 + (y - ay) ** 2 < (x - bx) ** 2 + (y - by) ** 2 ? [ax, ay] : [bx, by];
}

/** A story's field. Stable per slug, so a new story gets its own pattern the
 *  moment it lands and the same slug always draws the same one. */
export function hexField(seed: string): HexField {
  const rand = makeRng(hashSeed(seed));
  const cols = 12 + Math.floor(rand() * 4);
  const rows = cols / HEX_ASPECT;
  // Off centre, never near an edge: within the middle half across and 40% down.
  const node = hexCentre((rand() - 0.5) * cols * 0.5, (rand() - 0.5) * rows * 0.4);
  const angle = rand() * TAU;
  const phase = rand() * TAU;
  return { cols, dir: [Math.cos(angle), Math.sin(angle)], phase, node, start: 8 + rand() * 40 };
}

/**
 * Every number that shapes the field, in one place: hexCell/hexNode below
 * read them, and shaders.ts writes them into the GLSL, so the still and the
 * shader can't drift apart.
 */
export const HEX_SHAPE = {
  /** Wave across the field: spatial frequency (per cell), weight. */
  waveK: 0.42, waveWeight: 0.65,
  /** Ripple out of the focus: frequency, speed relative to the wave. */
  rippleK: 0.55, rippleSpeed: 0.6,
  /** Wave value at which a cell is fully hex (−) or fully circle (+). */
  edge: 0.7,
  /** The clearing around the focus, in cells, and how small cells get in it. */
  clearFrom: 1.2, clearTo: 3.6, clearScale: 0.6,
  /** Inradius as a hex → as a circle (0.5 would touch the neighbours). */
  rHex: 0.34, rCircle: 0.37,
  /** Stroke strength over the card, as a hex → as a circle. */
  inkHex: 0.32, inkCircle: 0.6,
  /** The focus: inradius, its morph speed and phase, its edge. */
  nodeR: 0.36, nodeSpeed: 0.7, nodePhase: 1.3, nodeEdge: 0.8,
  /** Fill strength inside the focus outline; the outline is 1.5 CSS px. */
  nodeFill: 0.18, nodeLine: 1.5,
} as const;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * One cell at a moment. `m` runs 0 (hex) → 1 (circle); `r` is the inradius
 * before `scale`; `ink` is the stroke's strength over the card, `clearing`
 * the part of it that fades cells around the focus (GenerativeMark's void
 * around its orange node), where they also shrink.
 */
export function hexCell(field: HexField, x: number, y: number, time: number) {
  const k = HEX_SHAPE;
  const t = time * HEX_SPEED;
  const dn = Math.hypot(x - field.node[0], y - field.node[1]);
  const wave = k.waveWeight * Math.sin((x * field.dir[0] + y * field.dir[1]) * k.waveK - t + field.phase)
    + (1 - k.waveWeight) * Math.sin(dn * k.rippleK - t * k.rippleSpeed);
  const m = smoothstep(-k.edge, k.edge, wave);
  const clearing = smoothstep(k.clearFrom, k.clearTo, dn);
  return {
    m,
    r: mix(k.rHex, k.rCircle, m),
    clearing,
    scale: mix(k.clearScale, 1, clearing),
    ink: mix(k.inkHex, k.inkCircle, m) * clearing,
    isNode: dn < 0.01,
  };
}

/** The focus cell's own, slower morph. */
export function hexNode(time: number) {
  const k = HEX_SHAPE;
  return { m: smoothstep(-k.nodeEdge, k.nodeEdge, Math.sin(time * HEX_SPEED * k.nodeSpeed + k.nodePhase)), r: k.nodeR };
}
