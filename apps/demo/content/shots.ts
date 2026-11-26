/**
 * The seed's photographs, drawn as SVG so the demo ships no binary files and
 * works offline: a dozen quiet scenes from around the studio, in flat shapes
 * and the covers' warm palette, at the sizes real photos come in (3:2, 2:3,
 * 4:5, 1:1, 16:9). Three start hidden, so the admin shows how that looks.
 *
 * lib/seed-shots.ts writes them to the media store and the shots table once.
 */

export interface SeedShot {
  /** The file name, under `shots/seed/`. */
  file: string;
  alt: string;
  width: number;
  height: number;
  hidden?: boolean;
  /** The scene's two main colours, for the blur shown while it loads. */
  tones: [string, string];
  draw: (width: number, height: number) => string;
}

const frame = (width: number, height: number, label: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">` +
  `<defs><linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/></linearGradient>` +
  `<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#1d1a16" stop-opacity="0.22"/></radialGradient></defs>` +
  `${body}<rect width="${width}" height="${height}" fill="url(#haze)"/><rect width="${width}" height="${height}" fill="url(#vignette)"/></svg>`;

const sky = (w: number, h: number, top: string, bottom: string, id = 'sky') =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;

/** Fishing boats at a harbour wall, the sun low over the water. */
function harbor(w: number, h: number) {
  const water = `<rect y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="#4f6b7a"/>` +
    Array.from({ length: 9 }, (_, i) => `<rect x="${(i * 211) % w}" y="${h * 0.66 + i * 26}" width="${180 - (i % 3) * 40}" height="5" rx="2.5" fill="#e9c79a" opacity="0.55"/>`).join('');
  const sun = `<circle cx="${w * 0.68}" cy="${h * 0.56}" r="${h * 0.09}" fill="#f2c48b"/>`;
  const wall = `<rect y="${h * 0.6}" width="${w * 0.42}" height="${h * 0.08}" fill="#3a3530"/>`;
  const boat = (x: number, y: number, s: number, hull: string) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 L220 0 L190 46 L30 46 Z" fill="${hull}"/><rect x="96" y="-120" width="6" height="120" fill="#2d2a27"/><path d="M102 -112 L170 -20 L102 -20 Z" fill="#efe4d2"/></g>`;
  return sky(w, h, '#d9a77f', '#f0d4b0') + sun + water + wall + boat(w * 0.48, h * 0.7, 1.4, '#2f3a40') + boat(w * 0.18, h * 0.78, 1.1, '#8b4a36');
}

/** Tram wires crossing a steep street, one yellow car climbing. */
function tramHill(w: number, h: number) {
  const street = `<path d="M0 ${h} L${w * 0.38} ${h * 0.42} L${w * 0.62} ${h * 0.42} L${w} ${h} Z" fill="#9a8f82"/>`;
  const rails = `<path d="M${w * 0.3} ${h} L${w * 0.47} ${h * 0.42}" stroke="#d7cfc3" stroke-width="5"/><path d="M${w * 0.7} ${h} L${w * 0.53} ${h * 0.42}" stroke="#d7cfc3" stroke-width="5"/>`;
  const left = Array.from({ length: 5 }, (_, i) => `<rect x="0" y="${h * 0.12 + i * h * 0.14}" width="${w * (0.34 - i * 0.03)}" height="${h * 0.15}" fill="${['#e6d5bd', '#d9b99a', '#efe6d6', '#cf9f80', '#e3d1b4'][i]}"/>`).join('');
  const right = Array.from({ length: 5 }, (_, i) => `<rect x="${w * (0.66 + i * 0.03)}" y="${h * 0.12 + i * h * 0.14}" width="${w}" height="${h * 0.15}" fill="${['#d7c9b3', '#ead9c2', '#c99d84', '#e8dccb', '#d5b59a'][i]}"/>`).join('');
  const windows = Array.from({ length: 10 }, (_, i) => `<rect x="${i < 5 ? w * 0.04 + (i % 5) * 40 : w * 0.78 + (i % 5) * 40}" y="${h * 0.18 + (i % 5) * h * 0.14}" width="22" height="34" rx="2" fill="#5d6a70" opacity="0.7"/>`).join('');
  const tram = `<g transform="translate(${w * 0.43} ${h * 0.5})"><rect width="${w * 0.14}" height="${h * 0.16}" rx="10" fill="#e8b23c"/><rect x="${w * 0.015}" y="${h * 0.025}" width="${w * 0.11}" height="${h * 0.05}" rx="4" fill="#3c4950"/><rect x="${w * 0.067}" y="-${h * 0.09}" width="4" height="${h * 0.09}" fill="#2d2a27"/></g>`;
  const wires = `<path d="M0 ${h * 0.36} Q${w * 0.5} ${h * 0.44} ${w} ${h * 0.34}" stroke="#2d2a27" stroke-width="3" fill="none"/><path d="M0 ${h * 0.4} Q${w * 0.5} ${h * 0.48} ${w} ${h * 0.38}" stroke="#2d2a27" stroke-width="2" fill="none"/>`;
  return sky(w, h, '#bcd0da', '#e9eef0') + left + right + windows + street + rails + tram + wires;
}

/** A wall of blue-and-white tiles, one missing. */
function tiles(w: number, h: number) {
  const size = w / 6;
  let out = `<rect width="${w}" height="${h}" fill="#f4f1ea"/>`;
  for (let row = 0; row * size < h; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const x = col * size;
      const y = row * size;
      if (row === 3 && col === 4) {
        out += `<rect x="${x + 4}" y="${y + 4}" width="${size - 8}" height="${size - 8}" fill="#c9bfae"/>`;
        continue;
      }
      out += `<g transform="translate(${x} ${y})"><rect x="3" y="3" width="${size - 6}" height="${size - 6}" fill="#f7f5ef"/>` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.26}" fill="none" stroke="#2f5d8a" stroke-width="${size * 0.06}"/>` +
        `<path d="M${size / 2} 6 L${size - 6} ${size / 2} L${size / 2} ${size - 6} L6 ${size / 2} Z" fill="none" stroke="#5c86ad" stroke-width="${size * 0.03}"/>` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.07}" fill="#2f5d8a"/></g>`;
    }
  }
  return out;
}

/** Afternoon light falling down a stone stairway. */
function stairs(w: number, h: number) {
  const steps = Array.from({ length: 11 }, (_, i) => {
    const y = h * 0.12 + i * h * 0.08;
    return `<rect x="0" y="${y}" width="${w}" height="${h * 0.08}" fill="${i % 2 ? '#d8cbb7' : '#cbbca6'}"/><rect x="0" y="${y}" width="${w}" height="6" fill="#efe5d4"/>`;
  }).join('');
  const shadow = `<path d="M${w * 0.55} 0 L${w} 0 L${w} ${h} L${w * 0.1} ${h} Z" fill="#5a4c40" opacity="0.38"/>`;
  const rail = `<path d="M${w * 0.2} ${h * 0.05} L${w * 0.8} ${h}" stroke="#2d2a27" stroke-width="8"/>` +
    Array.from({ length: 6 }, (_, i) => `<rect x="${w * (0.24 + i * 0.1)}" y="${h * (0.11 + i * 0.158)}" width="5" height="${h * 0.09}" fill="#2d2a27"/>`).join('');
  const plant = `<circle cx="${w * 0.16}" cy="${h * 0.86}" r="${w * 0.09}" fill="#6f8a6a"/><rect x="${w * 0.1}" y="${h * 0.88}" width="${w * 0.12}" height="${h * 0.1}" fill="#b4683f"/>`;
  return `<rect width="${w}" height="${h}" fill="#e7dccb"/>` + steps + shadow + rail + plant;
}

/** Crates of fruit at a morning market. */
function market(w: number, h: number) {
  const awning = Array.from({ length: 8 }, (_, i) => `<rect x="${i * (w / 8)}" y="0" width="${w / 8}" height="${h * 0.22}" fill="${i % 2 ? '#efe6d6' : '#b5513a'}"/>`).join('') +
    Array.from({ length: 8 }, (_, i) => `<path d="M${i * (w / 8)} ${h * 0.22} q${w / 16} ${h * 0.06} ${w / 8} 0" fill="${i % 2 ? '#efe6d6' : '#b5513a'}"/>`).join('');
  const crate = (x: number, y: number, fruit: string) => {
    const bw = w * 0.28;
    const bh = h * 0.2;
    const dots = Array.from({ length: 12 }, (_, i) => `<circle cx="${x + 26 + (i % 6) * (bw - 52) / 5}" cy="${y + 10 + Math.floor(i / 6) * 34}" r="${bw * 0.07}" fill="${fruit}"/>`).join('');
    return `${dots}<rect x="${x}" y="${y + 20}" width="${bw}" height="${bh}" fill="#c8a57c"/><rect x="${x}" y="${y + 20 + bh * 0.45}" width="${bw}" height="6" fill="#a8845c"/>`;
  };
  return `<rect width="${w}" height="${h}" fill="#e9e0d0"/>` + awning +
    crate(w * 0.05, h * 0.42, '#e3862f') + crate(w * 0.36, h * 0.42, '#c63d32') + crate(w * 0.67, h * 0.42, '#97a43f') +
    crate(w * 0.2, h * 0.68, '#e9c349') + crate(w * 0.51, h * 0.68, '#7a3f5c');
}

/** A lighthouse on a headland under a pale sky. */
function lighthouse(w: number, h: number) {
  const sea = `<rect y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#6f8f9c"/>`;
  const land = `<path d="M${w * 0.25} ${h * 0.72} Q${w * 0.55} ${h * 0.52} ${w} ${h * 0.56} L${w} ${h} L${w * 0.15} ${h} Z" fill="#7c8a5e"/>`;
  const tower = `<g transform="translate(${w * 0.62} ${h * 0.2})"><path d="M0 ${h * 0.36} L${w * 0.04} 0 L${w * 0.1} 0 L${w * 0.14} ${h * 0.36} Z" fill="#f4efe6"/>` +
    `<path d="M${w * 0.012} ${h * 0.25} L${w * 0.128} ${h * 0.25} L${w * 0.132} ${h * 0.29} L${w * 0.008} ${h * 0.29} Z" fill="#b5513a"/>` +
    `<path d="M${w * 0.03} ${h * 0.1} L${w * 0.11} ${h * 0.1} L${w * 0.114} ${h * 0.14} L${w * 0.026} ${h * 0.14} Z" fill="#b5513a"/>` +
    `<rect x="${w * 0.035}" y="-${h * 0.05}" width="${w * 0.07}" height="${h * 0.05}" fill="#f2d27a"/><path d="M${w * 0.025} -${h * 0.05} L${w * 0.07} -${h * 0.09} L${w * 0.115} -${h * 0.05} Z" fill="#2d2a27"/></g>`;
  const birds = Array.from({ length: 3 }, (_, i) => `<path d="M${w * (0.2 + i * 0.07)} ${h * (0.22 + i * 0.03)} q12 -10 24 0 q12 -10 24 0" stroke="#3a3530" stroke-width="3" fill="none"/>`).join('');
  return sky(w, h, '#dfe6e3', '#f4efe2') + sea + land + tower + birds;
}

/** Rooftops and chimneys from a top-floor window. */
function rooftops(w: number, h: number) {
  const roofs = Array.from({ length: 7 }, (_, i) => {
    const x = (i - 1) * w * 0.18;
    const y = h * (0.45 + (i % 3) * 0.08);
    const tone = ['#b9694a', '#c98563', '#a85a3f', '#d09a78'][i % 4];
    return `<path d="M${x} ${y + h * 0.12} L${x + w * 0.13} ${y} L${x + w * 0.26} ${y + h * 0.12} Z" fill="${tone}"/><rect x="${x}" y="${y + h * 0.12}" width="${w * 0.26}" height="${h}" fill="${['#efe5d4', '#e2d3bd', '#f4ede2'][i % 3]}"/>` +
      `<rect x="${x + w * 0.16}" y="${y - h * 0.02}" width="${w * 0.025}" height="${h * 0.07}" fill="#8d4f39"/>`;
  }).join('');
  const sill = `<rect y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="#3a3530"/><rect x="${w * 0.08}" y="${h * 0.84}" width="${w * 0.1}" height="${h * 0.07}" rx="6" fill="#ffffff"/>`;
  return sky(w, h, '#a9c0cc', '#e8e3d6') + roofs + sill;
}

/** Laundry drying on a line between two windows. */
function laundry(w: number, h: number) {
  const walls = `<rect width="${w * 0.5}" height="${h}" fill="#e8c9a0"/><rect x="${w * 0.5}" width="${w * 0.5}" height="${h}" fill="#d9b48a"/>`;
  const windows = `<rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.16}" height="${h * 0.22}" fill="#4d5c63"/><rect x="${w * 0.76}" y="${h * 0.14}" width="${w * 0.16}" height="${h * 0.22}" fill="#4d5c63"/>` +
    `<rect x="${w * 0.06}" y="${h * 0.34}" width="${w * 0.2}" height="10" fill="#8d6a4a"/><rect x="${w * 0.74}" y="${h * 0.36}" width="${w * 0.2}" height="10" fill="#8d6a4a"/>`;
  const line = `<path d="M${w * 0.16} ${h * 0.36} Q${w * 0.5} ${h * 0.5} ${w * 0.84} ${h * 0.38}" stroke="#3a3530" stroke-width="3" fill="none"/>`;
  const clothes = [
    { x: 0.27, c: '#ffffff', ww: 0.09, hh: 0.16 },
    { x: 0.38, c: '#5c86ad', ww: 0.07, hh: 0.22 },
    { x: 0.47, c: '#e3862f', ww: 0.1, hh: 0.13 },
    { x: 0.59, c: '#f3e6cf', ww: 0.08, hh: 0.2 },
    { x: 0.69, c: '#b5513a', ww: 0.06, hh: 0.12 },
  ].map(({ x, c, ww, hh }) => {
    const top = h * (0.38 + Math.sin((x - 0.16) / 0.68 * Math.PI) * 0.09);
    return `<rect x="${w * x}" y="${top}" width="${w * ww}" height="${h * hh}" fill="${c}"/>`;
  }).join('');
  const shade = `<path d="M${w * 0.5} 0 L${w} 0 L${w} ${h * 0.6} Z" fill="#6d5a48" opacity="0.18"/>`;
  return walls + windows + line + clothes + shade;
}

/** The view aft from a river ferry, the far bank in haze. */
function ferry(w: number, h: number) {
  const river = `<rect y="${h * 0.46}" width="${w}" height="${h * 0.54}" fill="#7d97a0"/>`;
  const bank = `<path d="M0 ${h * 0.46} L${w * 0.12} ${h * 0.4} L${w * 0.3} ${h * 0.43} L${w * 0.5} ${h * 0.37} L${w * 0.75} ${h * 0.42} L${w} ${h * 0.39} L${w} ${h * 0.47} L0 ${h * 0.47} Z" fill="#a9b2ad"/>`;
  const bridge = `<path d="M${w * 0.55} ${h * 0.4} L${w} ${h * 0.33}" stroke="#a65a3e" stroke-width="7"/><rect x="${w * 0.7}" y="${h * 0.18}" width="10" height="${h * 0.2}" fill="#a65a3e"/>`;
  const wake = `<path d="M${w * 0.5} ${h} L${w * 0.42} ${h * 0.5} L${w * 0.58} ${h * 0.5} Z" fill="#cfdcdf" opacity="0.5"/>`;
  const deck = `<rect y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#3a3530"/><rect y="${h * 0.76}" width="${w}" height="8" fill="#d9cdb9"/>` +
    Array.from({ length: 12 }, (_, i) => `<rect x="${i * (w / 11)}" y="${h * 0.76}" width="6" height="${h * 0.06}" fill="#d9cdb9"/>`).join('');
  return sky(w, h, '#cfd8d8', '#ece7dc') + bank + bridge + river + wake + deck;
}

/** Ferns and a bench in a glasshouse. */
function greenhouse(w: number, h: number) {
  const panes = Array.from({ length: 7 }, (_, i) => `<line x1="${i * (w / 6)}" y1="0" x2="${i * (w / 6)}" y2="${h}" stroke="#e8eee6" stroke-width="5"/>`).join('') +
    Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${i * (h / 5)}" x2="${w}" y2="${i * (h / 5)}" stroke="#e8eee6" stroke-width="5"/>`).join('');
  const frond = (x: number, y: number, r: number, s: number, c: string) =>
    `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${Array.from({ length: 9 }, (_, i) => `<ellipse cx="${i * 22}" cy="0" rx="26" ry="9" fill="${c}" transform="rotate(${i % 2 ? 32 : -32} ${i * 22} 0)"/>`).join('')}</g>`;
  const ferns = frond(w * 0.08, h * 0.7, -40, 2.2, '#5e7a4f') + frond(w * 0.6, h * 0.82, -150, 2.6, '#6f8a5a') + frond(w * 0.3, h * 0.9, -70, 2, '#4f6a44') + frond(w * 0.82, h * 0.55, -120, 1.8, '#7f9a66');
  const bench = `<rect x="${w * 0.34}" y="${h * 0.66}" width="${w * 0.34}" height="${h * 0.04}" fill="#8a6a4a"/><rect x="${w * 0.36}" y="${h * 0.7}" width="10" height="${h * 0.1}" fill="#5d4632"/><rect x="${w * 0.64}" y="${h * 0.7}" width="10" height="${h * 0.1}" fill="#5d4632"/>`;
  return `<rect width="${w}" height="${h}" fill="#c9d6c4"/>` + panes + bench + ferns;
}

/** A bookshop window at dusk, its lamps on. */
function bookshop(w: number, h: number) {
  const front = `<rect width="${w}" height="${h}" fill="#2f3a40"/><rect x="${w * 0.08}" y="${h * 0.16}" width="${w * 0.84}" height="${h * 0.62}" fill="#f0cf96"/>`;
  const shelves = Array.from({ length: 4 }, (_, row) => {
    let x = w * 0.1;
    let out = `<rect x="${w * 0.08}" y="${h * (0.3 + row * 0.14)}" width="${w * 0.84}" height="8" fill="#6b4c34"/>`;
    for (let i = 0; x < w * 0.88; i += 1) {
      const bw = 14 + ((i * 13 + row * 7) % 18);
      const bh = h * (0.07 + ((i * 7 + row) % 5) * 0.008);
      out += `<rect x="${x}" y="${h * (0.3 + row * 0.14) - bh}" width="${bw}" height="${bh}" fill="${['#b5513a', '#5c86ad', '#efe6d6', '#6f8a6a', '#d9a24a', '#3a3530'][(i + row) % 6]}"/>`;
      x += bw + 3;
    }
    return out;
  }).join('');
  const sign = `<rect x="${w * 0.2}" y="${h * 0.05}" width="${w * 0.6}" height="${h * 0.07}" fill="#d9cdb9"/><rect x="${w * 0.3}" y="${h * 0.075}" width="${w * 0.4}" height="${h * 0.02}" fill="#2f3a40"/>`;
  const step = `<rect y="${h * 0.86}" width="${w}" height="${h * 0.14}" fill="#8f877c"/>`;
  return front + shelves + sign + step;
}

/** A cliff path down to a cove. */
function cove(w: number, h: number) {
  const sea = `<rect y="${h * 0.42}" width="${w}" height="${h * 0.58}" fill="#3f7c86"/><path d="M0 ${h * 0.72} Q${w * 0.4} ${h * 0.6} ${w * 0.7} ${h * 0.8} L${w * 0.7} ${h} L0 ${h} Z" fill="#e7d3ae"/>`;
  const cliff = `<path d="M${w * 0.45} ${h * 0.3} L${w} ${h * 0.26} L${w} ${h} L${w * 0.66} ${h} Q${w * 0.58} ${h * 0.7} ${w * 0.6} ${h * 0.5} Z" fill="#b58f62"/>`;
  const path = `<path d="M${w * 0.95} ${h * 0.3} Q${w * 0.72} ${h * 0.45} ${w * 0.86} ${h * 0.6} Q${w * 0.98} ${h * 0.75} ${w * 0.72} ${h * 0.92}" stroke="#efe1c6" stroke-width="10" fill="none" stroke-dasharray="2 14" stroke-linecap="round"/>`;
  const scrub = Array.from({ length: 6 }, (_, i) => `<circle cx="${w * (0.62 + i * 0.07)}" cy="${h * (0.33 + (i % 2) * 0.04)}" r="${w * 0.03}" fill="#6f8a5a"/>`).join('');
  const surf = Array.from({ length: 4 }, (_, i) => `<path d="M${w * (0.05 + i * 0.1)} ${h * (0.68 - i * 0.02)} q40 -12 80 0" stroke="#ffffff" stroke-width="4" fill="none" opacity="0.7"/>`).join('');
  return sky(w, h, '#bcd5da', '#eef0e6') + sea + surf + cliff + scrub + path;
}

/** A pot of coffee and a notebook on the studio table. */
function studioTable(w: number, h: number) {
  const table = `<rect width="${w}" height="${h}" fill="#c9a77f"/>` + Array.from({ length: 6 }, (_, i) => `<path d="M0 ${h * (0.12 + i * 0.17)} Q${w * 0.5} ${h * (0.1 + i * 0.17)} ${w} ${h * (0.14 + i * 0.17)}" stroke="#b8946a" stroke-width="3" fill="none"/>`).join('');
  const book = `<g transform="rotate(-8 ${w * 0.4} ${h * 0.5})"><rect x="${w * 0.12}" y="${h * 0.3}" width="${w * 0.5}" height="${h * 0.42}" rx="6" fill="#fbf7ef"/><rect x="${w * 0.365}" y="${h * 0.3}" width="3" height="${h * 0.42}" fill="#d8cfc1"/>` +
    Array.from({ length: 7 }, (_, i) => `<rect x="${w * 0.15}" y="${h * (0.36 + i * 0.045)}" width="${w * 0.19}" height="5" rx="2.5" fill="#cfc6b8"/><rect x="${w * 0.39}" y="${h * (0.36 + i * 0.045)}" width="${w * (i === 6 ? 0.1 : 0.19)}" height="5" rx="2.5" fill="#cfc6b8"/>`).join('') + `</g>`;
  const cup = `<circle cx="${w * 0.78}" cy="${h * 0.3}" r="${w * 0.09}" fill="#f4f1ea"/><circle cx="${w * 0.78}" cy="${h * 0.3}" r="${w * 0.065}" fill="#5b3a26"/><rect x="${w * 0.86}" y="${h * 0.28}" width="${w * 0.05}" height="${h * 0.04}" rx="8" fill="#f4f1ea"/>`;
  const pencil = `<g transform="rotate(20 ${w * 0.75} ${h * 0.75})"><rect x="${w * 0.6}" y="${h * 0.74}" width="${w * 0.3}" height="${h * 0.025}" rx="4" fill="#3b3a36"/><polygon points="${w * 0.9},${h * 0.74} ${w * 0.93},${h * 0.7525} ${w * 0.9},${h * 0.765}" fill="#d8b98c"/></g>`;
  return table + book + cup + pencil;
}

export const SEED_SHOTS: SeedShot[] = [
  { file: 'harbor-dusk.svg', alt: 'Fishing boats at the harbour wall, low sun', width: 1800, height: 1200, tones: ['#d9a77f', '#4f6b7a'], draw: harbor },
  { file: 'tram-hill.svg', alt: 'A yellow tram climbing under the wires', width: 1200, height: 1800, tones: ['#bcd0da', '#9a8f82'], draw: tramHill },
  { file: 'tile-wall.svg', alt: 'Blue and white tiles, one missing', width: 1500, height: 1500, tones: ['#f4f1ea', '#2f5d8a'], draw: tiles },
  { file: 'stairway.svg', alt: 'Afternoon light down a stone stairway', width: 1200, height: 1500, tones: ['#e7dccb', '#5a4c40'], draw: stairs },
  { file: 'market.svg', alt: 'Crates of fruit at the morning market', width: 1800, height: 1200, tones: ['#b5513a', '#e9e0d0'], draw: market },
  { file: 'lighthouse.svg', alt: 'Lighthouse on the headland', width: 1200, height: 1800, tones: ['#dfe6e3', '#7c8a5e'], draw: lighthouse },
  { file: 'rooftops.svg', alt: 'Rooftops from a top-floor window', width: 1920, height: 1080, tones: ['#a9c0cc', '#b9694a'], draw: rooftops },
  { file: 'laundry.svg', alt: 'Laundry on a line between two windows', width: 1200, height: 1500, tones: ['#e8c9a0', '#5c86ad'], draw: laundry },
  { file: 'ferry.svg', alt: 'The view aft from the river ferry', width: 1800, height: 1200, tones: ['#cfd8d8', '#7d97a0'], draw: ferry, hidden: true },
  { file: 'greenhouse.svg', alt: 'Ferns and a bench in the glasshouse', width: 1500, height: 1500, tones: ['#c9d6c4', '#5e7a4f'], draw: greenhouse },
  { file: 'bookshop.svg', alt: 'A bookshop window at dusk', width: 1200, height: 1800, tones: ['#2f3a40', '#f0cf96'], draw: bookshop, hidden: true },
  { file: 'cove.svg', alt: 'The cliff path down to the cove', width: 1800, height: 1200, tones: ['#bcd5da', '#3f7c86'], draw: cove },
  { file: 'studio-table.svg', alt: 'Coffee and a notebook on the studio table', width: 1500, height: 1200, tones: ['#c9a77f', '#fbf7ef'], draw: studioTable, hidden: true },
];

/** The scene drawn whole, as the file the media store keeps. */
export const shotSvg = (shot: SeedShot) => frame(shot.width, shot.height, shot.alt, shot.draw(shot.width, shot.height));

/** A tiny blurred stand-in, in the scene's two tones, like an LQIP. */
export function shotBlur(shot: SeedShot): string {
  const [top, bottom] = shot.tones;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(shot.width / 100)} ${Math.round(shot.height / 100)}" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
