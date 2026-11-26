'use client';

import { useMemo } from 'react';
import { ImageCatalog, fetchImageLibrary, type ImageLibrarySource } from '@rcweston/story-editor';
import { siteDataPaths } from '@rcweston/site-data/client';
import { useAdminConfig } from '../config.js';

/**
 * Every uploaded case-study image, to browse and filter: which story each was
 * uploaded to, who can see it, and where it's used. Reads the media library
 * (site-data's MediaStore list); there is no index to keep in step.
 */
export function ImageLibrary({ source }: { source?: ImageLibrarySource }) {
  const config = useAdminConfig();
  const library = useMemo(() => source ?? fetchImageLibrary(`${config.siteApi}${siteDataPaths.mediaLibrary()}`), [source, config.siteApi]);
  return <section className="mx-auto grid max-w-5xl gap-half px-half py-minor md:px-minor">
    <h1 className="text-2xl font-medium text-foreground">Image library</h1>
    <p className="mb-half text-foreground-muted">Browse case-study images. Signed-in-only images still require a signed-in session.</p>
    <ImageCatalog source={library} />
  </section>;
}
