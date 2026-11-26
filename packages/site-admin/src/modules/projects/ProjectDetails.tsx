'use client';

import { useEffect, useState } from 'react';
import { siteDataPaths, type WorkFeature } from '@rcweston/site-data/client';
import { useAdminConfig } from '../../config.js';
import { adminRead } from '../../request.js';
import type { SeoOverrideSource } from '../../components/SeoOverrideFields.js';
import { FeatureWorkCardEditor } from './FeatureWorkCardEditor.js';
import { ProjectEditor } from './ProjectEditor.js';

/**
 * `/admin/projects/:slug/edit`: a site feature's Work card, or any other
 * project's details (a case study's card fields, a prototype).
 */
export function ProjectDetails({ slug, seo }: { slug: string; seo?: SeoOverrideSource }) {
  const config = useAdminConfig();
  const [feature, setFeature] = useState<WorkFeature | null | undefined>();
  useEffect(() => {
    let current = true;
    void adminRead<{ features?: WorkFeature[] }>(`${config.siteApi}${siteDataPaths.projects()}`, {})
      .then((data) => { if (current) setFeature(data.features?.find((candidate) => candidate.slug === slug) ?? null); });
    return () => { current = false; };
  }, [config.siteApi, slug]);
  if (feature === undefined) return <div role="status" className="py-20 text-center font-mono text-sm uppercase tracking-wider text-foreground-muted">Loading project...</div>;
  return feature ? <FeatureWorkCardEditor feature={feature} /> : <ProjectEditor mode="edit" slug={slug} seo={seo} />;
}
