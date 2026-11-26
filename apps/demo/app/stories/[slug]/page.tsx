import { notFound, redirect } from 'next/navigation';
import { Reader } from '@/components/Reader';
import { backend } from '@/lib/story';
import { forReaders, publishedTeasers, storyCompany } from '@/lib/published';

export const dynamic = 'force-dynamic';

export default async function StoryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { story } = await backend();
  const result = await story.getPublishedStory(slug);
  if (result.status === 'none') notFound();
  if (result.status === 'failed') throw result.error;
  if (result.redirectFrom) redirect(`/stories/${result.slug}`);

  const [teasers, company] = await Promise.all([publishedTeasers(), storyCompany(result.story)]);
  const related = result.story.related ?? [];
  const next = teasers.find((teaser) => related.includes(teaser.slug)) ?? teasers.find((teaser) => teaser.slug !== result.slug);
  return <Reader story={forReaders(result.story)} next={next} company={company} />;
}
