import { SeoScreen } from '@rcweston/site-admin';

export const metadata = { title: 'SEO' };

export default function SeoPage() {
  // No blog in this site, so the screen leaves Posts out.
  return <SeoScreen postsUrl={null} />;
}
