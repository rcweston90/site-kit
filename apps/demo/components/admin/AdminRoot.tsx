'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN_MODULES, AdminProvider, AdminShell, type AdminRouter } from '@rcweston/site-admin';

/**
 * The admin, mounted once for every /admin route: Next's router handed to
 * site-admin, the enabled modules, and the passcode-gated shell.
 */
export function AdminRoot({ children, storageWarnings = [] }: { children: ReactNode; storageWarnings?: string[] }) {
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
      {storageWarnings.length > 0 && <StorageNotice warnings={storageWarnings} />}
    </AdminProvider>
  );
}

/** Pinned to the bottom of every admin page while saved work won't last. */
function StorageNotice({ warnings }: { warnings: string[] }) {
  return (
    <div
      role="alert"
      data-storage-notice=""
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-status-warning bg-background px-4 py-2 font-sans text-sm leading-baseline text-foreground shadow-lg md:px-8"
    >
      <strong className="font-medium">Your changes won’t last.</strong>{' '}
      {warnings.join(' ')}
    </div>
  );
}
