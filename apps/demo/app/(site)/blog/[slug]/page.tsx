import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageLayout } from '@/components/blog/PageLayout';
import { formatBlogDate } from '@/components/blog/format-date';
import { isPageVisible } from '@/lib/published';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

async function readPost(slug: string) {
  if (!(await isPageVisible('/blog'))) return null;
  return (await backend()).site.reads.blog.post(slug);
}

export async function generateMetadata({ params }: Params) {
  const post = await readPost((await params).slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: post.title,
    ...(post.description ? { description: post.description } : {}),
    ...(post.tags.length ? { keywords: post.tags } : {}),
  };
}

/** One published post, with the newer and older posts under it. */
export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await readPost(slug);
  if (!post) notFound();

  // Newer/older posts for the end of the article (newest first).
  const sortedPosts = [...await (await backend()).site.reads.blog.posts()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const idx = sortedPosts.findIndex((p) => p.slug === slug);
  const newerPost = idx > 0 ? sortedPosts[idx - 1] : null;
  const olderPost = idx >= 0 && idx < sortedPosts.length - 1 ? sortedPosts[idx + 1] : null;

  return (
    <PageLayout width="narrow">
      <Link
        href="/blog"
        className="text-sm leading-baseline text-foreground-muted hover:text-foreground mb-minor-2 block w-fit"
      >
        &larr; Back
      </Link>

      <div className="flex items-center gap-3 text-sm leading-baseline text-foreground-muted">
        <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
        {post.readingTime && (
          <>
            <span>&middot;</span>
            <span>{post.readingTime}</span>
          </>
        )}
      </div>

      <h1 className="text-3xl md:text-4xl font-semibold leading-9 md:leading-12 text-foreground mb-minor-2 tracking-tight">
        {post.title}
      </h1>

      {post.image && (
        <div className="mb-minor-2 @container">
          <div className="relative snap-video w-full overflow-hidden rounded-xl bg-card-bg">
            {/* eslint-disable-next-line @next/next/no-img-element -- covers are site media or the sample drawings */}
            <img src={post.image} alt={post.title} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
          </div>
        </div>
      )}

      <article className="blog-content" data-blog-reader-prose>
        <div className="blog-cms-content" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>

      {(newerPost || olderPost) && (
        <nav
          className="mt-major grid grid-cols-2 gap-minor border-t border-default pt-[calc(var(--rhythm-minor)_-_1px)]"
          aria-label="More posts"
        >
          {newerPost ? (
            <Link href={`/blog/${newerPost.slug}`} className="group flex flex-col">
              <span className="font-mono text-xs leading-baseline uppercase tracking-widest text-foreground-muted">
                &larr; Newer
              </span>
              <span className="font-medium leading-baseline text-foreground line-clamp-2 transition-colors group-hover:text-accent-primary">
                {newerPost.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {olderPost ? (
            <Link href={`/blog/${olderPost.slug}`} className="group flex flex-col items-end text-right">
              <span className="font-mono text-xs leading-baseline uppercase tracking-widest text-foreground-muted">
                Older &rarr;
              </span>
              <span className="font-medium leading-baseline text-foreground line-clamp-2 transition-colors group-hover:text-accent-primary">
                {olderPost.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageLayout>
  );
}
