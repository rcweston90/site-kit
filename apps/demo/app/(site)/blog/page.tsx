import { notFound } from 'next/navigation';
import { BlogClient } from '@/components/blog/BlogClient';
import { isPageVisible } from '@/lib/published';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Posts' };

/** Posts, unless the page is switched off in the admin. */
export default async function BlogPage() {
  if (!(await isPageVisible('/blog'))) notFound();
  const posts = await (await backend()).site.reads.blog.posts();
  const feedItems = [...posts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(({ slug, title, description, tags, date, readingTime }) => ({ slug, title, description, tags, date, readingTime }));
  return <BlogClient feedItems={feedItems} />;
}
