'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_MODULES, AdminProvider, AdminShell, type AdminRouter } from '@rcweston/site-admin';

/**
 * The admin, mounted once for every /admin route: Next's router handed to
 * site-admin, the enabled modules, and the passcode-gated shell.
 */
export function AdminRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const adminRouter = useMemo<AdminRouter>(() => ({
    pathname,
    push: (href) => router.push(href),
    replace: (href) => router.replace(href),
    Link: ({ prefetch, ...props }) => <Link prefetch={prefetch} {...props} />,
  }), [pathname, router]);
  return (
    <AdminProvider router={adminRouter} modules={ADMIN_MODULES}>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
