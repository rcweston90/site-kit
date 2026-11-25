/*
 * A call to action is navigational, never a script or a form action. Its
 * link may be a path on this site (or an anchor on the page), an https URL,
 * or a mailto address.
 */

export const CTA_LABEL_MAX = 80;
export const CTA_URL_MAX = 2048;

export interface StoryCta {
  label: string;
  href: string;
  newTab?: boolean;
}

/** The trimmed link when it's a safe CTA destination, else undefined. */
export function ctaHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > CTA_URL_MAX || /[\u0000-\u001f\u007f\\]/.test(value)) return;
  const href = value.trim();
  if (!href || /\s/.test(href)) return;
  if (/^(?:\/(?!\/)|#.+)/.test(href)) return href;
  if (/^mailto:/i.test(href)) return /^mailto:[^@?/]+@[^@?/]+\.[^@?/]+(?:\?\S*)?$/i.test(href) ? href : undefined;
  if (!/^https:\/\//i.test(href)) return;
  try {
    const url = new URL(href);
    if (url.hostname && !url.username && !url.password) return href;
  } catch {
    /* An incomplete URL is not a destination. */
  }
  return undefined;
}

/** The trimmed label when it's short, visible text, else undefined. */
export function ctaLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return;
  const label = value.trim();
  return label && label.length <= CTA_LABEL_MAX ? label : undefined;
}

/** A finished CTA, or null while either half is missing or unsafe. */
export function completedCta(label: unknown, href: unknown, newTab?: unknown): StoryCta | null {
  const cleanLabel = ctaLabel(label);
  const cleanHref = ctaHref(href);
  return cleanLabel && cleanHref ? { label: cleanLabel, href: cleanHref, ...(newTab === true ? { newTab: true } : {}) } : null;
}
