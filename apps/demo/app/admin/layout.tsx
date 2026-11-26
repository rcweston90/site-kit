import type { ReactNode } from 'react';
import { ADMIN_TITLE, ADMIN_TITLE_TEMPLATE } from '@rcweston/site-admin';
import { AdminRoot } from '@/components/admin/AdminRoot';
import { storagePlan } from '@/lib/story';

// The storage notice reflects the server it runs on, not the build machine.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: { default: ADMIN_TITLE, template: ADMIN_TITLE_TEMPLATE },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRoot storageWarnings={storagePlan().warnings}>{children}</AdminRoot>;
}
