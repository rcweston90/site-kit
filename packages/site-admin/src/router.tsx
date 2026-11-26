'use client';

import { createContext, forwardRef, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from 'react';

/**
 * The admin doesn't import a framework. The host hands it the current path,
 * a way to navigate and its own link component (Next's `Link`, Remix's…),
 * once, at the top of the admin.
 */
export interface AdminLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  prefetch?: boolean;
}

export interface AdminRouter {
  pathname: string;
  push(href: string): void;
  replace(href: string): void;
  /** Your framework's link. Default: a plain `<a>`. */
  Link?: ComponentType<AdminLinkProps>;
}

const fallback: AdminRouter = {
  pathname: typeof window === 'undefined' ? '/' : window.location.pathname,
  push: (href) => window.location.assign(href),
  replace: (href) => window.location.replace(href),
};

const RouterContext = createContext<AdminRouter>(fallback);

export function AdminRouterProvider({ router, children }: { router: AdminRouter; children: ReactNode }) {
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>;
}

export const useAdminRouter = () => useContext(RouterContext);

/** A link through the host's router. */
export const AdminLink = forwardRef<HTMLAnchorElement, AdminLinkProps>(function AdminLink({ prefetch, ...props }, ref) {
  const { Link } = useAdminRouter();
  if (Link) return <Link {...props} prefetch={prefetch} />;
  return <a ref={ref} {...props} />;
});
