/**
 * The made-up designer's one-page resume, the base `/resume` serves until
 * one is uploaded in Admin → Resume. It's drawn here as a plain PDF 1.4 with
 * the standard Helvetica faces, so the repo ships no binary file and nothing
 * is downloaded or embedded. Change the text below to make it yours, or
 * point `RESUME_BASE` in lib/settings.ts at a file of your own.
 */

// Everything here is fictional.
export const RESUME = {
  name: 'Lena Ortiz',
  line: 'Product designer · Lisbon · example.com',
  summary: [
    'Research-led product designer. Eight years shaping tools for people who',
    'study, plan and decide, from first interviews to shipped systems.',
  ],
  roles: [
    {
      title: 'Senior product designer',
      place: 'Fieldnote Studio',
      dates: '2023 - now',
      points: [
        'Lead design on the research repository used by 40 product teams.',
        'Built the studio design system with Sam Rivera; forty buttons became four.',
        'Wrote the decision-log pattern behind the weekly Friday call.',
      ],
    },
    {
      title: 'Design lead (contract)',
      place: 'Tidewater Transit',
      dates: '2024',
      points: [
        'Redrew the bus map around the questions riders ask at the stop.',
        'Ran platform tests with Sam Rivera and Jun Ito; wrong-bus complaints fell 58%.',
      ],
    },
    {
      title: 'Product designer',
      place: 'Harbor Lane Clinics',
      dates: '2021 - 2023',
      points: [
        'Cut online booking from nine screens to three; online share 22% to 48%.',
        'Set up the first patient research panel.',
      ],
    },
    {
      title: 'Designer',
      place: 'Northfold Library',
      dates: '2018 - 2021',
      points: [
        'Designed catalogue search for the special collections.',
        'Started the volunteer mentoring program, still running.',
      ],
    },
  ],
  skills: 'Research synthesis · Interaction design · Design systems · Prototyping · Writing',
  education: 'Studio for Information Design, 2017 · Research methods certificate, 2020',
};

// ── PDF writing ──────────────────────────────────────────────────────────────

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
// WinAnsi and Latin-1 agree on every character used here (· is 0xB7 in both).
const encode = (text: string) => escape(text);

export function resumePdf(): Uint8Array {
  const ops: string[] = [];
  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 64;
  let y = PAGE_H - 84;

  const text = (value: string, { size = 10, font = 'F1', x = LEFT, gray = 0.1 } = {}) => {
    ops.push(`${gray} g BT /${font} ${size} Tf ${x} ${y.toFixed(1)} Td (${encode(value)}) Tj ET`);
  };
  const rule = (gray = 0.8) => {
    ops.push(`${gray} G 0.75 w ${LEFT} ${y.toFixed(1)} m ${PAGE_W - LEFT} ${y.toFixed(1)} l S`);
  };
  const down = (by: number) => {
    y -= by;
  };

  text(RESUME.name, { size: 26, font: 'F2' });
  down(22);
  text(RESUME.line, { size: 10, gray: 0.4 });
  down(18);
  rule(0.2);
  down(22);
  for (const line of RESUME.summary) {
    text(line, { size: 10.5 });
    down(15);
  }
  down(12);
  text('EXPERIENCE', { size: 9, font: 'F2', gray: 0.4 });
  down(8);
  rule();
  down(18);
  for (const role of RESUME.roles) {
    text(role.title, { size: 11.5, font: 'F2' });
    text(role.dates, { size: 10, gray: 0.4, x: PAGE_W - LEFT - 72 });
    down(15);
    text(role.place, { size: 10, gray: 0.35 });
    down(16);
    for (const point of role.points) {
      text('-', { size: 10, x: LEFT + 4 });
      text(point, { size: 10, x: LEFT + 16 });
      down(14);
    }
    down(12);
  }
  text('SKILLS', { size: 9, font: 'F2', gray: 0.4 });
  down(8);
  rule();
  down(18);
  text(RESUME.skills, { size: 10 });
  down(28);
  text('EDUCATION', { size: 9, font: 'F2', gray: 0.4 });
  down(8);
  rule();
  down(18);
  text(RESUME.education, { size: 10 });

  const stream = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    // A fixed date, so running the script again gives the same bytes.
    '<< /Title (Lena Ortiz - Resume) /Author (Lena Ortiz) /Producer (site-kit demo) /CreationDate (D:20261101000000Z) >>',
  ];

  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
