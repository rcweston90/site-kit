/**
 * Justified-row packing for PhotoCollage, done once per breakpoint band so
 * the server render is already the final layout.
 *
 * The collage used to pack rows in the browser from `window.innerWidth`,
 * after rendering a 1280px packing on the server. At any other width the
 * whole gallery repacked after hydration — /shots measured a CLS of
 * 0.28–0.39 on desktop. Now every tile carries its width for each band as a
 * CSS variable and a media query picks one, so nothing moves once painted.
 *
 * Within a band the rows scale with the viewport instead of repacking, so a
 * row's height drifts from the target (≈245–385px across the bands below).
 * Each band packs at the width a common viewport in it has, so the widths
 * design-guard shoots (390, 1440) lay out exactly as the old client did.
 */

/** Desired row height (px). Rows fill the full width at ~this height. */
export const TARGET_ROW_H = 300;

/** The packing width for each band, keyed by the band's min viewport width. */
export const BANDS = [
  { min: 0, width: 390 },
  { min: 480, width: 600 },
  { min: 768, width: 880 },
  { min: 1024, width: 1140 },
  { min: 1280, width: 1440 },
  { min: 1600, width: 1760 },
] as const;

export interface Row {
  /** Indexes into the packed list, in order. */
  items: number[];
  arSum: number;
}

/**
 * Justified rows (Flickr/Unsplash style): greedily fill each row until, scaled
 * to the container width, it reaches the target height, so every row spans the
 * full width and the gallery has a clean bottom edge. A leftover partial row is
 * merged into the previous row (rather than left floating), so the last row
 * always fills the width too — no lone orphan photo at the bottom.
 */
export function buildRows(aspects: number[], containerWidth: number, targetH = TARGET_ROW_H): Row[] {
  const targetArSum = containerWidth / targetH;
  const rows: Row[] = [];
  let cur: number[] = [];
  let arSum = 0;
  aspects.forEach((ar, index) => {
    cur.push(index);
    arSum += ar;
    if (arSum >= targetArSum) {
      rows.push({ items: cur, arSum });
      cur = [];
      arSum = 0;
    }
  });
  if (cur.length) {
    if (rows.length) {
      const prev = rows[rows.length - 1];
      prev.items.push(...cur);
      prev.arSum += arSum;
    } else {
      rows.push({ items: cur, arSum });
    }
  }
  return rows;
}

/**
 * Each tile's width in every band, as a percentage string. Rounded down to
 * four decimals so a row never sums past 100% and wraps a tile early; the
 * shortfall is under 0.003px per tile at 2560px.
 */
export function tileWidths(aspects: number[]): string[][] {
  const widths = aspects.map(() => BANDS.map(() => '100%'));
  BANDS.forEach((band, b) => {
    for (const row of buildRows(aspects, band.width)) {
      for (const index of row.items) {
        const pct = Math.floor((aspects[index] / row.arSum) * 1_000_000) / 10_000;
        widths[index][b] = `${pct}%`;
      }
    }
  });
  return widths;
}
