import { notFound, redirect } from 'next/navigation';
import { Reader } from '@/components/Reader';
import { backend } from '@/lib/story';
import { forReaders, publishedTeasers } from '@/lib/published';
import { JsonLd, pageMetadata, sitePerson } from '@/lib/seo';
import { creativeWorkSchema, type SeoContentMeta } from '@rcweston/site-data';
import { storyCardMedia, type Story } from '@rcweston/story-core';

export const dynamic = 'force-dynamic';

/** What a story says about itself, for its metadata and structured data. */
function storyMeta(story: Story): SeoContentMeta {
  const cover = storyCardMedia(story);
  const image = cover?.kind === 'video' ? cover.poster : cover?.src;
  return {
    title: story.company ? `${story.title} — ${story.company}` : story.title,
    description: story.summary ?? story.thesis,
    ...(image ? { image } : {}),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { story } = await backend();
  const result = await story.getPublishedStory(slug);
  const content = result.status === 'published' ? storyMeta(forReaders(result.story)) : undefined;
  return pageMetadata(`/stories/${slug}`, content);
}

export default async function StoryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { story } = await backend();
  const result = await story.getPublishedStory(slug);
  if (result.status === 'none') notFound();
  if (result.status === 'failed') throw result.error;
  if (result.redirectFrom) redirect(`/stories/${result.slug}`);

  const teasers = await publishedTeasers();
  const related = result.story.related ?? [];
  const next = teasers.find((teaser) => related.includes(teaser.slug)) ?? teasers.find((teaser) => teaser.slug !== result.slug);
  const readable = forReaders(result.story);
  const meta = storyMeta(readable);
  return (
    <>
      <JsonLd data={creativeWorkSchema(sitePerson(), { path: `/stories/${result.slug}`, title: readable.title, company: readable.company || undefined, description: meta.description, image: meta.image })} />
      <Reader story={readable} next={next} />
    </>
  );
}
