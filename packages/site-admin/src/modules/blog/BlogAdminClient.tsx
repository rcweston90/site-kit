'use client';

import { useState, useEffect } from 'react';
import { SaveStatus, deleteWithUndo, recordKey, useListSave } from '@rcweston/save-kit';
import { blogPaths, blogSummaryOf, type BlogEditorState, type BlogPostSummary as BlogPost } from '@rcweston/site-data/client';
import { AdminPage, AdminPageHeader } from '../../primitives/index.js';
import { adminPath, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { AdminLink as Link } from '../../router.js';


function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function BlogAdminClient() {
  const config = useAdminConfig();
  const api = (path: string) => `${config.siteApi}${path}`;
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status, hidden } = useListSave();
  const visiblePosts = posts.filter((post) => !hidden.has(recordKey('post', post.slug)));

  // Only ever runs on mount, when there's no error to clear yet. State is set
  // once the request settles, never synchronously inside the effect.
  const fetchPosts = () =>
    fetch(api(blogPaths.posts()), { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json() as { posts: BlogPost[] };
          setPosts(data.posts);
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to fetch posts');
        }
      })
      .catch(() => setError('Failed to fetch posts'))
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchPosts();
    // Once, on mount; the endpoint is fixed for the life of the admin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePublish = async (post: BlogPost) => {
    // Publish puts the newest saved version live; Unpublish takes the post off the site.
    const body = post.published
      ? { expectedPublishedDocumentId: post.publishedDocumentId }
      : { documentId: post.latestDocumentId, expectedPublishedDocumentId: post.publishedDocumentId };
    await status.run(() => adminRequest<BlogEditorState>(api(post.published ? blogPaths.unpublish(post.slug) : blogPaths.publish(post.slug)), { method: 'POST', body: JSON.stringify(body) }), {
      key: `publish:${post.slug}`,
      success: post.published ? 'Post unpublished' : 'Post published',
      done: post.published ? 'unpublished' : 'published',
      onSaved: (updated) => setPosts((prev) => prev.map((p) => (p.slug === post.slug ? blogSummaryOf(updated, p) : p))),
    });
  };

  const handleDelete = (slug: string) => {
    deleteWithUndo({
      key: recordKey('post', slug),
      label: 'Post deleted',
      send: ({ keepalive }) => adminRequest(api(blogPaths.post(slug)), { method: 'DELETE', keepalive }),
    });
  };

  return (
    <AdminPage width="wide">
        <AdminPageHeader
          title="Manage Posts"
          description={`${visiblePosts.length} post${visiblePosts.length !== 1 ? 's' : ''}`}
          action={(
            <Link
              href={adminPath(config, 'blog/new')}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-foreground px-5 font-mono text-xs font-semibold uppercase leading-baseline tracking-wider text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
            >
              New Post +
            </Link>
          )}
        />

        <SaveStatus status={status} className="mb-minor" />

        {/* Error */}
        {error && (
          <div className="mb-8 p-4 rounded-md bg-red-500/10 border-2 border-red-500/30">
            <p className="text-sm font-mono text-red-600 flex items-center gap-2">
              <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7.25 4.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5ZM8 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" /></svg>
              {error}
            </p>
          </div>
        )}

        {/* Posts List */}
        {loading ? (
          <div className="text-center py-12 text-foreground-muted font-mono text-sm uppercase tracking-wider">
            Loading posts...
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="text-center py-12 text-foreground-muted font-mono text-sm">
            No posts yet.{' '}
            <Link
              href={adminPath(config, 'blog/new')}
              className="text-accent-primary hover:underline"
            >
              Create your first post
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map((post, index) => (
              <div
                key={post.slug}
                style={{ animationDelay: `${index * 0.05}s` }}
                className="sa-blog-row p-6 rounded-md bg-card-bg border-2 border-foreground-muted/30"
              >
                <div className="flex flex-col gap-x-4 gap-y-half sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="font-mono text-lg font-bold text-foreground truncate">
                        {post.title}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider shrink-0 ${
                          post.published
                            ? 'bg-green-500/10 text-green-600 border border-green-500/30'
                            : 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/30'
                        }`}
                      >
                        {post.published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm text-foreground-muted truncate mb-1">
                      {post.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-foreground-muted font-mono">
                      <span>{formatDate(post.createdAt)}</span>
                      <span>&middot;</span>
                      <span>{post.readingTime}</span>
                      <span>&middot;</span>
                      <span>/{post.slug}</span>
                      {post.unpublishedChanges && <span>· Unpublished changes</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <Link
                      href={adminPath(config, `blog/${post.slug}/edit`)}
                      className="px-3 py-2 rounded-md border border-foreground-muted text-foreground hover:text-accent-primary hover:border-accent-primary transition-colors font-mono text-xs uppercase tracking-wider"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => void handleTogglePublish(post)}
                      className="px-3 py-2 rounded-md border border-foreground-muted text-foreground hover:text-accent-primary hover:border-accent-primary transition-colors font-mono text-xs uppercase tracking-wider"
                    >
                      {post.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => handleDelete(post.slug)}
                      className="px-3 py-2 rounded-md border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors font-mono text-xs uppercase tracking-wider"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </AdminPage>
  );
}
