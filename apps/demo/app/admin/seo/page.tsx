import { SeoScreen } from '@rcweston/site-admin';

export const metadata = { title: 'SEO' };

export default function SeoPage() {
  // Posts come from the blog module's list (`/api/site/blog`), each row an override for /blog/<slug>.
  return <SeoScreen />;
}
