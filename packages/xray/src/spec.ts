/**
 * The copied spec: one element written up as Markdown — size, box, the space
 * around and inside it, type and colour by token, and what's off the rhythm —
 * ready to paste into a review, an issue or a conversation with an AI agent.
 * The idea is react-grab's (copy an element's context for an agent) and
 * Figma Dev Mode's (a spec you can hand off); the vocabulary is the
 * configured rhythm's.
 */
import { formatPx, rhythmFit, rhythmUnit, unitsLabel } from './measure.js';
import { hasAny, SIDES, type Inspection, type Sides } from './inspect.js';

export interface SpecContext {
  path: string;
  viewport: [number, number];
  breakpoint: string;
}

/** A vertical value with its rhythm reading: `24 (minor)`, `36 (3×12)`, `23 ⚠ off-grid` (with the default rhythm). */
export function y(px: number): string {
  const fit = rhythmFit(px);
  const v = formatPx(px);
  if (fit.fit === 'off') return `${v} ⚠ off-grid`;
  if (fit.fit === 'grid') return `${v} (${unitsLabel(fit.units)})`;
  return fit.name === '0' ? v : `${v} (${fit.name})`;
}

const sidesLine = (s: Sides) => SIDES.map((k) => (k === 'top' || k === 'bottom' ? y(s[k]) : formatPx(s[k]))).join(' · ');

/** Equal gaps once, with a count: `24 (minor) ×3 · 48 (minor-2)`. */
function groupGaps(values: number[], fmt: (v: number) => string): string {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(fmt(v), (counts.get(fmt(v)) ?? 0) + 1));
  return [...counts].map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(' · ');
}

/** Every vertical value in the reading that's off the grid, labelled. */
export function offRhythm(i: Inspection): string[] {
  const out: string[] = [];
  const check = (label: string, px: number | null | undefined) => {
    if (px != null && Math.abs(px) >= 0.5 && rhythmFit(px).fit === 'off') out.push(`${label} ${formatPx(px)}`);
  };
  check('margin-top', i.margin.top);
  check('margin-bottom', i.margin.bottom);
  check('padding-top', i.padding.top);
  check('padding-bottom', i.padding.bottom);
  if (!i.spacing || i.spacing.mode === 'box') {
    check('space above', i.space.above);
    check('space below', i.space.below);
  }
  if (i.gap) check('row gap', i.gap.row);
  i.children.filter((c) => c.axis === 'y').forEach((c) => check('gap between children', c.value));
  if (i.type) {
    if (i.type.leading === null) out.push('line height normal');
    else check('line height', i.type.leading);
  }
  return out;
}

const sidesOf = (s: Partial<Sides>, optical: boolean) =>
  SIDES.map((k) => (s[k] === undefined ? '–' : (k === 'top' || k === 'bottom') && !optical ? y(s[k]!) : formatPx(s[k]!))).join(' · ');

export function buildSpec(i: Inspection, ctx: SpecContext): string {
  const lines: string[] = [];
  const role = i.spacing ? `${i.spacing.role} ` : '';
  lines.push(`### ${role}\`${i.name}\`${i.component ? ` · ${i.component}` : ''}`);
  lines.push(`- Page: ${ctx.path} · ${ctx.viewport[0]} × ${ctx.viewport[1]} (${ctx.breakpoint})`);
  lines.push(`- Selector: \`${i.selector}\``);
  lines.push(`- Size: ${formatPx(i.width)} × ${formatPx(i.height)} — height ${y(i.height)}`);
  const gap = i.gap && (i.gap.row > 0 || i.gap.column > 0) ? ` · gap ${y(i.gap.row)} row / ${formatPx(i.gap.column)} column` : '';
  lines.push(`- Layout: ${i.layout}${gap}`);
  if (i.tracks?.columns.length) lines.push(`- Grid columns: ${i.tracks.columns.map(formatPx).join(' · ')}`);
  if (i.tracks?.rows.length) lines.push(`- Grid rows: ${i.tracks.rows.map(y).join(' · ')}`);
  lines.push(`- Margin (top · right · bottom · left): ${sidesLine(i.margin)}`);
  lines.push(`- Padding (top · right · bottom · left): ${sidesLine(i.padding)}`);
  if (hasAny(i.border)) lines.push(`- Border: ${SIDES.map((k) => formatPx(i.border[k])).join(' · ')}`);
  const s = i.spacing;
  if (s) {
    const optical = s.mode === 'text';
    lines.push(`- Measured to: ${optical ? 'letters (cap height to baseline)' : 'box edges'}`);
    if (s.inside) lines.push(`- Inside, edges to content (top · right · bottom · left): ${sidesOf(s.inside, optical)}`);
    if (Object.keys(s.around).length) lines.push(`- Around, to the nearest layer (top · right · bottom · left): ${sidesOf(s.around, optical)}`);
    if (s.toBox) lines.push(`- Text to its box${s.boxRole ? ` (${s.boxRole})` : ''}: ${sidesOf(s.toBox, true)}`);
    if (s.text) lines.push(`- Text metrics: ${s.text.lines} line${s.text.lines === 1 ? '' : 's'} · cap height ${formatPx(s.text.cap)} · x-height ${formatPx(s.text.xHeight)}${s.text.step !== null ? ` · baseline step ${formatPx(s.text.step)}` : ''}`);
  }

  const space = (['above', 'below', 'left', 'right'] as const)
    .filter((k) => i.space[k] !== undefined)
    .map((k) => `${k} ${k === 'above' || k === 'below' ? y(i.space[k]!) : formatPx(i.space[k]!)}`);
  if (space.length && !s) lines.push(`- Space to siblings: ${space.join(' · ')}`);
  const ys = i.children.filter((c) => c.axis === 'y').map((c) => c.value);
  const xs = i.children.filter((c) => c.axis === 'x').map((c) => c.value);
  if (ys.length || xs.length) {
    const parts = [ys.length && `vertical ${groupGaps(ys, y)}`, xs.length && `horizontal ${groupGaps(xs, formatPx)}`].filter(Boolean);
    lines.push(`- Between children: ${parts.join(' · ')}`);
  }
  if (i.between?.length) {
    lines.push(`- To the compared element: ${i.between.map((m) => (m.axis === 'y' ? `y ${y(m.value)}` : `x ${formatPx(m.value)}`)).join(' · ')}`);
  }

  if (i.type) {
    const t = i.type;
    const leading = t.leading === null ? 'normal ⚠' : y(t.leading);
    const tracking = `${t.tracking}em${t.trackingToken ? ` (${t.trackingToken})` : ''}`;
    lines.push(`- Type: ${t.family} ${t.weight} · ${formatPx(t.size)} / ${leading} · tracking ${tracking}${t.transform !== 'none' ? ` · ${t.transform}` : ''}`);
  }

  const c = i.colour;
  const name = (s: { hex: string; alpha: number; tokens: string[] }) =>
    `${s.hex}${s.alpha < 1 ? ` @ ${Math.round(s.alpha * 100)}%` : ''}${s.tokens.length ? ` \`${s.tokens[0]}\`` : ' (no token)'}`;
  let colour = `- Colour: text ${name(c.text)} on ${name(c.background)}${c.background.overImage ? ' (over an image)' : ''}`;
  if (c.contrast) colour += ` — ${c.contrast.ratio}:1 ${c.contrast.aa ? 'AA ✓' : 'AA ✗'}${c.contrast.aaa ? ' AAA ✓' : ''}${c.contrast.large ? ' (large text)' : ''}`;
  lines.push(colour);
  if (c.border) lines.push(`- Border colour: ${name(c.border)}`);

  const off = offRhythm(i);
  const grid = `${rhythmUnit()}px grid`;
  lines.push(off.length ? `- Rhythm: ⚠ off the ${grid} — ${off.join(', ')}` : `- Rhythm: ✓ every vertical value is on the ${grid}`);
  return lines.join('\n');
}
