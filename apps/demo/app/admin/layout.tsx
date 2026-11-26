import type { ReactNode } from 'react';
import { ADMIN_TITLE, ADMIN_TITLE_TEMPLATE } from '@rcweston/site-admin';
import { AdminOff } from '@/components/admin/AdminOff';
import { AdminRoot } from '@/components/admin/AdminRoot';
import { adminProblem, readConfig } from '@/lib/config';
import { storagePlan } from '@/lib/story';

// The storage notice reflects the server it runs on, not the build machine.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: { default: ADMIN_TITLE, template: ADMIN_TITLE_TEMPLATE },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  // Without a passcode and session secret a production server keeps its
  // public pages up and switches only the admin off, saying what to set.
  const problem = adminProblem(readConfig());
  if (problem) return <AdminOff problem={problem} />;
  return <AdminRoot storageWarnings={storagePlan().warnings}>{children}</AdminRoot>;
}
