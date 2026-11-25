import { useId } from 'react';
import { HEX_ASPECT, HEX_SHAPE, hexCell, hexNode, type HexField } from './hex-field.js';

const W = 600;
const H = W / HEX_ASPECT;
const SQ3 = Math.sqrt(3);
/** Cell shapes are drawn from this many steps of the hex → circle morph. One
 *  step is a ~0.7px change at card size, so the canvas taking over from this
 *  still can't be seen, and the page carries 16 paths instead of ~250. */
const LEVELS = 16;

const n1 = (value: number) => Math.round(value * 10) / 10;
const n2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The outline of a pointy-top hex of inradius r·(1 − m) grown by a circle of
 * radius r·m — the shader's sdMorph zero line — centred on the origin, in
 * viewBox units. Straight sides at m = 0, a circle of radius r at m = 1.
 */
function morphPath(r: number, m: number, unit: number): string {
  const corner = r * m * unit;
  const reach = ((r * (1 - m) * 2) / SQ3) * unit;
  let d = '';
  for (let k = 0; k < 6; k++) {
    // Vertices from the top, clockwise (SVG's y runs down).
    const a = (-90 + 60 * k) * (Math.PI / 180);
    const vx = reach * Math.cos(a);
    const vy = reach * Math.sin(a);
    const from = a - Math.PI / 6;
    const to = a + Math.PI / 6;
    d += `${k ? 'L' : 'M'}${n1(vx + corner * Math.cos(from))} ${n1(vy + corner * Math.sin(from))}`;
    if (corner > 0.05) d += `A${n1(corner)} ${n1(corner)} 0 0 1 ${n1(vx + corner * Math.cos(to))} ${n1(vy + corner * Math.sin(to))}`;
  }
  return `${d}Z`;
}

/**
 * The shader's frame at `field.start`, as SVG. It paints with the page —
 * nothing in the first screen waits for WebGL — and stays as the still for
 * reduced motion and for browsers without WebGL2. Strokes are 1 CSS px at any
 * card size (non-scaling), like the shader's.
 */
export function HexFieldStill({ field, className }: { field: HexField; className?: string }) {
  // React's ids carry punctuation; an SVG href fragment wants a plain name.
  const id = `hex${useId().replace(/[^\w-]/g, '')}`;
  const unit = W / field.cols;
  const halfX = field.cols / 2 + 0.5;
  const halfY = field.cols / HEX_ASPECT / 2 + 0.5;
  const used = new Set<number>();
  const cells: { x: number; y: number; level: number; scale: number; clearing: number }[] = [];

  for (let j = Math.floor(-halfY / SQ3) - 1; j <= Math.ceil(halfY / SQ3); j++) {
    for (let i = Math.floor(-halfX) - 1; i <= Math.ceil(halfX); i++) {
      // The lattice's two offset grids (hexCentre in hex-field.ts).
      for (const [x, y] of [[i + 0.5, (j + 0.5) * SQ3], [i + 1, (j + 1) * SQ3]]) {
        if (Math.abs(x) > halfX || Math.abs(y) > halfY) continue;
        const cell = hexCell(field, x, y, field.start);
        if (cell.isNode || cell.clearing < 0.01) continue;
        const level = Math.round(cell.m * (LEVELS - 1));
        used.add(level);
        cells.push({ x: W / 2 + x * unit, y: H / 2 - y * unit, level, scale: cell.scale, clearing: cell.clearing });
      }
    }
  }

  const at = (level: number, from: number, to: number) => from + (to - from) * (level / (LEVELS - 1));
  const node = hexNode(field.start);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      <defs>
        {[...used].map((level) => (
          <path
            key={level}
            id={`${id}${level}`}
            d={morphPath(at(level, HEX_SHAPE.rHex, HEX_SHAPE.rCircle), level / (LEVELS - 1), unit)}
            strokeOpacity={n2(at(level, HEX_SHAPE.inkHex, HEX_SHAPE.inkCircle))}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </defs>
      <g fill="none" stroke="var(--story-accent)" strokeWidth={1}>
        {cells.map((cell) => (
          <use
            key={`${n1(cell.x)},${n1(cell.y)}`}
            href={`#${id}${cell.level}`}
            {...(cell.clearing < 0.999
              ? { transform: `translate(${n1(cell.x)} ${n1(cell.y)}) scale(${n2(cell.scale)})`, opacity: n2(cell.clearing) }
              : { x: n1(cell.x), y: n1(cell.y) })}
          />
        ))}
      </g>
      <path
        d={morphPath(node.r, node.m, unit)}
        transform={`translate(${n1(W / 2 + field.node[0] * unit)} ${n1(H / 2 - field.node[1] * unit)})`}
        fill="var(--story-accent-secondary)"
        fillOpacity={HEX_SHAPE.nodeFill}
        stroke="var(--story-accent-secondary)"
        strokeWidth={HEX_SHAPE.nodeLine}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
