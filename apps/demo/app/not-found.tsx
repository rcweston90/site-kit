import { SiteChrome } from '@/components/site/SiteChrome';
import { SiteAppearance, readAppearance } from '@/components/site/SiteAppearance';
import { NotFoundBody } from '@/components/site/NotFound';
import { visibleNav } from '@/lib/published';
import './site.css';

export const metadata = { title: 'Not found', robots: { index: false } };

/** Any address the site doesn't know: the 404 in the public site's frame. */
export default async function NotFound() {
  const [nav, appearance] = await Promise.all([visibleNav().catch(() => []), readAppearance().catch(() => null)]);
  return (
    <>
      {appearance && <SiteAppearance {...appearance} />}
      <SiteChrome nav={nav} {...(appearance ? { appearance: appearance.settings } : {})}>
        <NotFoundBody />
      </SiteChrome>
    </>
  );
}
