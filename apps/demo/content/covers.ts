/**
 * Stand-in cover pictures, drawn here so the demo works offline and ships no
 * binary files. Each is a quiet, editorial still life in flat shapes: paper,
 * shelves, a route map. Photographs listed in public/samples/photos take
 * their place when present (see lib/seed-media.ts).
 *
 * 1600 × 1000, the 1.6 aspect the story hero and the Work cards share.
 */

const W = 1600;
const H = 1000;

const svg = (title: string, body: string, background: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}">` +
  `<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#2b2620" flood-opacity="0.16"/></filter>` +
  `<linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="${background}"/>${body}<rect width="${W}" height="${H}" fill="url(#light)"/></svg>`;

const lines = (x: number, y: number, width: number, count: number, gap = 22, color = '#cfc6b8') =>
  Array.from({ length: count }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === count - 1 ? width * 0.6 : width}" height="6" rx="3" fill="${color}"/>`).join('');

/** Note cards fanned on a warm desk. */
function notes() {
  const cards = [
    { x: 330, y: 250, r: -7, fill: '#fbf7ef' },
    { x: 620, y: 220, r: 3, fill: '#f6efe1' },
    { x: 900, y: 280, r: -2, fill: '#fffdf8' },
  ].map(({ x, y, r, fill }) => `<g transform="rotate(${r} ${x + 180} ${y + 230})" filter="url(#soft)"><rect x="${x}" y="${y}" width="360" height="460" rx="6" fill="${fill}"/>${lines(x + 40, y + 70, 280, 9, 30)}</g>`).join('');
  const pencil = `<g transform="rotate(-24 1240 760)"><rect x="1080" y="740" width="340" height="18" rx="4" fill="#3b3a36"/><polygon points="1420,740 1450,749 1420,758" fill="#d8b98c"/></g>`;
  return svg('Handwritten note cards fanned across a warm desk', cards + pencil, '#e7dccb');
}

/** A phone on pale linen, one card on its screen. */
function onboarding() {
  const phone = `<g filter="url(#soft)"><rect x="640" y="140" width="320" height="660" rx="44" fill="#26282b"/><rect x="656" y="156" width="288" height="628" rx="32" fill="#f4f1ea"/>` +
    `<rect x="688" y="230" width="224" height="150" rx="14" fill="#ffffff"/>${lines(708, 262, 180, 4, 26, '#d9d4c9')}<rect x="688" y="410" width="160" height="40" rx="20" fill="#7d8f7a"/></g>`;
  const leaf = `<ellipse cx="1180" cy="760" rx="150" ry="46" fill="#b9c3ad" transform="rotate(-18 1180 760)"/><ellipse cx="380" cy="300" rx="110" ry="34" fill="#c7cfbb" transform="rotate(28 380 300)"/>`;
  return svg('A phone resting on pale linen, a single card on its screen', leaf + phone, '#dfe3d6');
}

/** A transit diagram on a sheet of drafting paper. */
function wayfinding() {
  const grid = Array.from({ length: 16 }, (_, i) => `<line x1="${120 + i * 90}" y1="120" x2="${120 + i * 90}" y2="880" stroke="#c9d3dc" stroke-width="1"/>`).join('') +
    Array.from({ length: 9 }, (_, i) => `<line x1="120" y1="${120 + i * 95}" x2="1470" y2="${120 + i * 95}" stroke="#c9d3dc" stroke-width="1"/>`).join('');
  const routes = [
    { d: 'M200 700 L520 700 L700 520 L1100 520 L1380 240', c: '#3f6e8c' },
    { d: 'M260 260 L600 260 L700 360 L700 820', c: '#c0794a' },
    { d: 'M380 860 L380 600 L520 460 L1000 460 L1200 660 L1420 660', c: '#6f8a6a' },
  ].map(({ d, c }) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const stops = [[520, 700], [700, 520], [1100, 520], [700, 360], [520, 460], [1000, 460], [1200, 660]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="#fbfaf7" stroke="#2f3438" stroke-width="6"/>`).join('');
  return svg('A transit route diagram drawn on drafting paper', `<rect x="90" y="90" width="1420" height="820" rx="8" fill="#f3f5f6" filter="url(#soft)"/>${grid}${routes}${stops}`, '#d5dde3');
}

/** A week of appointments as a paper calendar. */
function booking() {
  const cells = Array.from({ length: 5 * 4 }, (_, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 300 + col * 210;
    const y = 300 + row * 130;
    const filled = [1, 7, 8, 13, 16].includes(i);
    return `<rect x="${x}" y="${y}" width="190" height="110" rx="10" fill="${filled ? '#d7e3e0' : '#ffffff'}" stroke="#d9dcd8"/>${filled ? `<rect x="${x + 18}" y="${y + 22}" width="110" height="10" rx="5" fill="#7e9c96"/>` : ''}`;
  }).join('');
  const head = Array.from({ length: 5 }, (_, i) => `<rect x="${330 + i * 210}" y="240" width="90" height="12" rx="6" fill="#b8bfbb"/>`).join('');
  return svg('A paper week planner with five appointments marked', `<rect x="250" y="190" width="1100" height="690" rx="14" fill="#f7f7f4" filter="url(#soft)"/>${head}${cells}`, '#e4e8e4');
}

/** Buttons sorted into rows on a light table, like a type case. */
function buttons() {
  const tones = ['#2f3438', '#8a8f93', '#d9dcde', '#ffffff'];
  const rows = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 6 }, (_, col) => {
      const x = 260 + col * 190;
      const y = 250 + row * 140;
      const tone = tones[(row + col) % 4];
      return `<rect x="${x}" y="${y}" width="${row === 0 ? 150 : 150 - ((col * 13) % 40)}" height="54" rx="${row % 2 ? 27 : 8}" fill="${tone}" stroke="#c4c8cb"/>`;
    }).join(''),
  ).join('');
  return svg('Rows of button shapes sorted on a light table', `<rect x="200" y="190" width="1200" height="620" rx="12" fill="#eef0f1" filter="url(#soft)"/>${rows}`, '#dadfe2');
}

/** Three price cards on folded paper. */
function pricing() {
  const card = (x: number, lift: number, fill: string) =>
    `<g filter="url(#soft)"><rect x="${x}" y="${260 - lift}" width="320" height="480" rx="12" fill="${fill}"/><rect x="${x + 36}" y="${310 - lift}" width="120" height="14" rx="7" fill="#b9ad9b"/><rect x="${x + 36}" y="${350 - lift}" width="170" height="44" rx="6" fill="#4a4338"/>${lines(x + 36, 440 - lift, 240, 6, 34, '#d8cfc1')}</g>`;
  return svg('Three price cards standing on folded paper', card(330, 0, '#fbf8f2') + card(640, 40, '#ffffff') + card(950, 0, '#fbf8f2'), '#e9e2d6');
}

/** Archive shelves of boxes and spines. */
function archive() {
  const spines = Array.from({ length: 3 }, (_, shelf) => {
    let x = 200;
    let out = `<rect x="160" y="${330 + shelf * 220}" width="1280" height="16" fill="#9c8f7d"/>`;
    for (let i = 0; x < 1380; i += 1) {
      const width = 40 + ((i * 37 + shelf * 11) % 70);
      const height = 120 + ((i * 53 + shelf * 29) % 70);
      const tones = ['#d9cdb9', '#c7b79e', '#e6ddcd', '#b8a88f', '#efe8db'];
      out += `<rect x="${x}" y="${330 + shelf * 220 - height}" width="${width}" height="${height}" rx="3" fill="${tones[(i + shelf) % tones.length]}"/>`;
      x += width + 6;
    }
    return out;
  }).join('');
  return svg('Archive shelves lined with boxes and bound spines', spines, '#efe9df');
}

export interface SeedCover {
  /** The file name the cover is kept under, beside the story's other media. */
  file: string;
  svg: string;
}

export const covers: Record<string, () => string> = {
  'field-notes': notes,
  'quiet-onboarding': onboarding,
  'transit-map': wayfinding,
  'clinic-booking': booking,
  'button-audit': buttons,
  'pricing-page': pricing,
  'archive-search': archive,
};
