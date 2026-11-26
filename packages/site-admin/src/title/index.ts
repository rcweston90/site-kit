/*
 * Tab titles for the admin, framework-free: plain strings a host puts in its
 * own metadata (Next's `metadata.title`, a document.title, a <title>).
 */

/** The admin's title template: "Work — Admin". */
export const ADMIN_TITLE_TEMPLATE = '%s — Admin';
/** For a route with no title of its own. */
export const ADMIN_TITLE = 'Admin';

const MAX_NAME = 48;

/** `title` inside the admin's template. */
export function adminTitle(title?: string | null): string {
  const clean = title?.replace(/\s+/g, ' ').trim();
  return clean ? ADMIN_TITLE_TEMPLATE.replace('%s', clean) : ADMIN_TITLE;
}

/**
 * The title for a record's editor: its own name, then what kind of editor it
 * is ("Harbor Wayfinding · Story"). The name is looked up only for a verified
 * admin session — an unpublished title isn't public — so anyone else, or a
 * failed lookup, gets the plain "Edit story". Long names are cut with an
 * ellipsis. Returns the bare title; wrap it with `adminTitle` if your
 * framework doesn't apply the template itself.
 */
export async function adminRecordTitle(
  kind: string,
  {
    authenticated,
    lookupName,
    fallbackTitle = `Edit ${kind.toLowerCase()}`,
  }: {
    authenticated: () => boolean | Promise<boolean>;
    lookupName: () => Promise<string | null | undefined> | string | null | undefined;
    fallbackTitle?: string;
  },
): Promise<string> {
  if (!(await authenticated())) return fallbackTitle;
  let name: string | undefined;
  try {
    name = (await lookupName())?.replace(/\s+/g, ' ').trim();
  } catch {
    name = undefined;
  }
  if (!name) return fallbackTitle;
  return `${name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1).trimEnd()}…` : name} · ${kind}`;
}
