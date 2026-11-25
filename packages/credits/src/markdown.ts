import type { CreditField } from './types.js';

const escapeCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * The credits as Markdown, one table per field, for a README or a docs page.
 * Generated from the same data the check reads, so the two can't drift.
 */
export function creditsToMarkdown(fields: CreditField[], { headingLevel = 3 }: { headingLevel?: number } = {}): string {
  const hashes = '#'.repeat(Math.min(6, Math.max(1, headingLevel)));
  return fields
    .map((field) => {
      const rows = field.credits.map((credit) => {
        const name = credit.href ? `[${escapeCell(credit.name)}](${credit.href})` : escapeCell(credit.name);
        return `| ${escapeCell(credit.role)} | ${name} | ${escapeCell(credit.note ?? '')} |`;
      });
      return [`${hashes} ${field.title}`, '', ...(field.summary ? [field.summary, ''] : []), '| Role | Credit | What it does here |', '| --- | --- | --- |', ...rows].join('\n');
    })
    .join('\n\n');
}
