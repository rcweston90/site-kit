/**
 * Where X-ray mounts. By default it runs on every page; pass `routes` to
 * <XRay> to limit it. `matchRoutes` builds that test from path prefixes.
 */

/** `/docs` holds `/docs` and `/docs/x`, but not `/docs-preview`. */
const within = (path: string, base: string) => {
  const b = normalise(base);
  return b === '/' ? path === '/' : path === b || path.startsWith(`${b}/`);
};

/** Strips the query, the hash and any trailing slash: `/docs/?a=1` → `/docs`. */
function normalise(pathname: string): string {
  return pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

/**
 * A route test from path prefixes. A path matches when it is one of
 * `include` or inside one (`/docs` covers `/docs/intro`), and is not one of
 * `exclude` or inside one. `'/'` in `include` matches the home page only.
 * Empty or missing paths never match.
 *
 * @example
 * <XRay routes={matchRoutes(['/', '/docs', '/guides'], ['/docs/internal'])} />
 */
export function matchRoutes(include: readonly string[], exclude: readonly string[] = []): (pathname: string | null | undefined) => boolean {
  return (pathname) => {
    if (!pathname) return false;
    const path = normalise(pathname);
    if (exclude.some((base) => within(path, base))) return false;
    return include.some((base) => within(path, base));
  };
}

/** The default: everywhere. */
export const everyRoute = () => true;
