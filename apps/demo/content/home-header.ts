/**
 * Stand-in photographs for the home header, drawn here like the covers so the
 * demo ships no camera files. Three are the header's defaults (where the
 * original showed the first three Shots); the fourth is seeded as an image
 * uploaded to one slot, so Admin → Home opens with both kinds.
 *
 * 800 × 1000, the 4:5 frame the header crops into.
 */

const W = 800;
const H = 1000;

const svg = (title: string, body: string, background: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}">` +
  `<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#2b2620" flood-opacity="0.18"/></filter>` +
  `<linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="0.65" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>` +
  `<rect width="${W}" height="${H}" fill="${background}"/>${body}<rect width="${W}" height="${H}" fill="url(#light)"/></svg>`;

/** A tall window, a plant on the sill, late light across the wall. */
function window() {
  const frame = `<rect x="200" y="120" width="400" height="560" fill="#cfe0e6"/><rect x="200" y="120" width="400" height="560" fill="none" stroke="#f7f3ea" stroke-width="24"/><line x1="400" y1="120" x2="400" y2="680" stroke="#f7f3ea" stroke-width="16"/><line x1="200" y1="400" x2="600" y2="400" stroke="#f7f3ea" stroke-width="16"/>`;
  const sill = `<rect x="160" y="680" width="480" height="34" fill="#efe7d8" filter="url(#soft)"/>`;
  const plant = `<g filter="url(#soft)"><path d="M330 690 h140 l-18 120 h-104 z" fill="#c4704b"/><ellipse cx="380" cy="610" rx="40" ry="90" fill="#6f8a63" transform="rotate(-24 380 610)"/><ellipse cx="430" cy="600" rx="36" ry="96" fill="#7f9b70" transform="rotate(18 430 600)"/><ellipse cx="400" cy="580" rx="30" ry="100" fill="#5f7a55"/></g>`;
  const light = `<polygon points="600,140 800,60 800,620 600,700" fill="#fff4d6" opacity="0.45"/>`;
  return svg('A tall window with a plant on the sill in late light', light + frame + sill + plant, '#e4d8c6');
}

/** Notebooks stacked on a shelf, spines in muted colours. */
function shelf() {
  const spines = [
    ['#7d8f7a', 64, 420], ['#c9a46a', 48, 380], ['#3f4a5a', 72, 450], ['#d7cbb6', 40, 360], ['#a2553c', 58, 410], ['#5f7f8e', 66, 440],
  ] as const;
  let x = 150;
  const books = spines.map(([fill, width, height]) => {
    const book = `<rect x="${x}" y="${760 - height}" width="${width}" height="${height}" rx="4" fill="${fill}"/><rect x="${x + 10}" y="${800 - height}" width="${width - 20}" height="8" rx="3" fill="#f4efe4" opacity="0.7"/>`;
    x += width + 8;
    return book;
  }).join('');
  const board = `<rect x="100" y="760" width="600" height="28" fill="#b89b78" filter="url(#soft)"/>`;
  const lean = `<g transform="rotate(14 600 560)"><rect x="560" y="360" width="60" height="400" rx="4" fill="#e3b8a0"/></g>`;
  return svg('Notebooks stacked on a wooden shelf', `<g filter="url(#soft)">${books}${lean}</g>` + board, '#ece5d8');
}

/** A tram stop by the water: the sign, a bench, a line of sea. */
function stop() {
  const sea = `<rect x="0" y="640" width="${W}" height="360" fill="#9fb8c2"/><rect x="0" y="640" width="${W}" height="14" fill="#c9d8dc"/>`;
  const sign = `<g filter="url(#soft)"><rect x="470" y="220" width="16" height="560" fill="#3b3a36"/><circle cx="478" cy="230" r="78" fill="#f2c14e"/><circle cx="478" cy="230" r="58" fill="#fdf6e3"/><rect x="452" y="210" width="52" height="40" rx="6" fill="#2f6fdb"/></g>`;
  const bench = `<g filter="url(#soft)"><rect x="130" y="700" width="260" height="22" rx="4" fill="#a2553c"/><rect x="130" y="660" width="260" height="16" rx="4" fill="#a2553c"/><rect x="150" y="722" width="12" height="70" fill="#3b3a36"/><rect x="358" y="722" width="12" height="70" fill="#3b3a36"/></g>`;
  const ground = `<rect x="0" y="790" width="${W}" height="210" fill="#d9d2c4"/>`;
  return svg('A tram stop sign and a bench beside the sea', sea + ground + sign + bench, '#f0e6d4');
}

/** A studio wall pinned with sketches and one bright card. */
function wall() {
  const sheets = [
    { x: 120, y: 150, r: -4, fill: '#fffdf8' },
    { x: 430, y: 130, r: 3, fill: '#f6efe1' },
    { x: 150, y: 520, r: 2, fill: '#fbf7ef' },
    { x: 440, y: 540, r: -3, fill: '#f2c14e' },
  ].map(({ x, y, r, fill }) => `<g transform="rotate(${r} ${x + 120} ${y + 150})" filter="url(#soft)"><rect x="${x}" y="${y}" width="240" height="300" rx="4" fill="${fill}"/><circle cx="${x + 120}" cy="${y + 18}" r="8" fill="#c4704b"/>` +
    Array.from({ length: 5 }, (_, i) => `<rect x="${x + 30}" y="${y + 70 + i * 36}" width="${i === 4 ? 100 : 180}" height="6" rx="3" fill="#cfc6b8"/>`).join('') + '</g>').join('');
  return svg('Sketches pinned to a studio wall, one card in yellow', sheets, '#dcd3c3');
}

/** The header's stand-in library, in order: its first three are the default slots. */
export const headerShots = [
  { file: 'window.svg', alt: 'A tall window with a plant on the sill in late light', draw: window },
  { file: 'shelf.svg', alt: 'Notebooks stacked on a wooden shelf', draw: shelf },
  { file: 'stop.svg', alt: 'A tram stop sign and a bench beside the sea', draw: stop },
] as const;

/** Seeded into the third slot as if uploaded from Admin → Home. */
export const headerUpload = { file: 'studio-wall.svg', alt: 'Sketches pinned to a studio wall, one card in yellow', draw: wall } as const;
