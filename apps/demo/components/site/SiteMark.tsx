/** The site's mark: a folded corner of paper, drawn in the text colour so it follows every theme. */
export function SiteMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="currentColor" />
      <path d="M9 8h7l4 4v8H9z" fill="var(--background)" />
      <path d="M16 8v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
