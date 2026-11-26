import { appearanceBootScript } from '@rcweston/site-data';
import { backend } from '@/lib/story';
import { SITE_THEME_KEY } from './theme-script';
import { SunnyOverlay } from './SunnyOverlay';

/** What Admin → Appearance saved, as the public pages need it. */
export async function readAppearance() {
  const { site } = await backend();
  return site.reads.appearance.styles();
}

/**
 * The saved appearance on a public page: the accent and typefaces as token
 * overrides, the default theme and sunny mode set before the page paints,
 * and the cloud overlay sunny mode shows.
 */
export function SiteAppearance({ settings, css }: Awaited<ReturnType<typeof readAppearance>>) {
  return (
    <>
      {css && <style data-site-appearance="" dangerouslySetInnerHTML={{ __html: css }} />}
      <script dangerouslySetInnerHTML={{ __html: appearanceBootScript(settings, SITE_THEME_KEY) }} />
      <SunnyOverlay />
    </>
  );
}
