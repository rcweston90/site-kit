import { NotFoundBody } from '@/components/site/NotFound';

export const metadata = { title: 'Not found', robots: { index: false } };

/** A page in the site that's missing or switched off, inside the site's own frame. */
export default function SiteNotFound() {
  return <NotFoundBody />;
}
