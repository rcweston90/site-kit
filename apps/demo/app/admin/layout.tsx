import type { ReactNode } from 'react';
import { ADMIN_TITLE, ADMIN_TITLE_TEMPLATE } from '@rcweston/site-admin';
import { AdminRoot } from '@/components/admin/AdminRoot';

export const metadata = {
  title: { default: ADMIN_TITLE, template: ADMIN_TITLE_TEMPLATE },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRoot>{children}</AdminRoot>;
}
