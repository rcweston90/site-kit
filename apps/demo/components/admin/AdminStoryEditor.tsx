'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { StoryEditor, fetchImageLibrary } from '@rcweston/story-editor';
import { createFetchTransport } from '@rcweston/story-server/client';
import { siteDataPaths } from '@rcweston/site-data/client';
import { useAdminConfig, useAdminTheme, usePublishedUpdates } from '@rcweston/site-admin';
import { blocks } from '../SignupFunnel';
import { mediaUrl, renderLink } from '../links';

/** The story editor inside the admin: the admin's theme, its image library and the published-version review. */
export function AdminStoryEditor({ slug, settingsOpen }: { slug: string; settingsOpen: boolean }) {
  const router = useRouter();
  const config = useAdminConfig();
  const { resolvedTheme, setPreference } = useAdminTheme();
  const transport = useMemo(() => createFetchTransport({ baseUrl: config.storyApi }), [config.storyApi]);
  const imageLibrary = useMemo(() => fetchImageLibrary(`${config.siteApi}${siteDataPaths.mediaLibrary()}`), [config.siteApi]);
  return (
    <StoryEditor
      slug={slug}
      transport={transport}
      navigate={(href) => router.push(href)}
      routes={{ editor: config.editorHref, reader: config.storyHref }}
      backLink={{ href: `${config.adminBase}/stories`, label: 'Work' }}
      renderLink={renderLink}
      blocks={blocks}
      media={{ mediaUrl }}
      theme={resolvedTheme}
      onThemeChange={setPreference}
      imageLibrary={imageLibrary}
      initialSettingsOpen={settingsOpen}
      useExtension={usePublishedUpdates}
    />
  );
}
