import { headers } from 'next/headers';
import { adminRecordTitle, BlogEditor } from '@rcweston/site-admin';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const { auth, site } = await backend();
  const request = new Request('http://localhost/admin', { headers: await headers() });
  const title = await adminRecordTitle('Post', {
    authenticated: async () => {
      try {
        await auth.requireAdmin(request);
        return true;
      } catch {
        return false;
      }
    },
    lookupName: async () => (await site.stores.blog.get(slug))?.documents[0]?.content.title,
  });
  return { title };
}

export default async function EditPostRoute({ params }: Params) {
  const { slug } = await params;
  return <BlogEditor mode="edit" slug={slug} />;
}
