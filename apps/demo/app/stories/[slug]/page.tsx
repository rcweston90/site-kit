import { notFound, redirect } from 'next/navigation';
import { Reader } from '@/components/Reader';
import { backend } from '@/lib/story';
import { forReaders, publishedTeasers } from '@/lib/published';
import { JsonLd, pageMetadata, sitePerson } from '@/lib/seo';
import { creditHref, photoCredits } from '@/lib/credits';
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
      <CoverCredit slug={result.slug} hero={readable.hero} />
    </>
  );
}

/** The cover photograph's credit under the story, while the cover is still the credited photo. */
async function CoverCredit({ slug, hero }: { slug: string; hero: Story['hero'] }) {
  const src = (hero?.kind === 'image' ? hero.src : '') ?? '';
  if (!src.endsWith(`/stories/${slug}/cover.jpg`)) return null;
  const credit = (await photoCredits()).find((entry) => entry.slug === slug);
  if (!credit) return null;
  const profile = creditHref(credit.profileUrl);
  const photo = creditHref(credit.photoUrl);
  return (
    <p className="mx-auto max-w-2xl px-(--page-inset) pb-minor-2 text-center text-xs leading-baseline text-foreground-muted">
      Cover {photo ? <a href={photo} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">photo</a> : 'photo'}
      {' by '}
      {profile ? <a href={profile} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">{credit.photographer}</a> : credit.photographer}
      {credit.license ? ` · ${credit.license}` : ''}
    </p>
  );
}
