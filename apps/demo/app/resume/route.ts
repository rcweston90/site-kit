import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

/**
 * The resume PDF: the upload from Admin → Resume, else the one shipped in
 * content/resume. Hiding it on the dashboard takes it off Work and out of
 * the sitemap and asks search engines not to index it; the address keeps
 * working for links already shared.
 */
export async function GET(request: Request) {
  const { site } = await backend();
  const [response, visible] = await Promise.all([
    site.reads.resume.respond(request),
    site.reads['site-resources'].isPathVisible('/resume'),
  ]);
  if (!visible) response.headers.set('X-Robots-Tag', 'noindex');
  return response;
}
