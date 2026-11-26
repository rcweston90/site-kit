import { headers } from 'next/headers';
import { adminRecordTitle } from '@rcweston/site-admin';
import { AdminStoryEditor } from '@/components/admin/AdminStoryEditor';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ settings?: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const { auth, store } = await backend();
  const request = new Request('http://localhost/admin', { headers: await headers() });
  const title = await adminRecordTitle('Story', {
    authenticated: async () => {
      try {
        await auth.requireAdmin(request);
        return true;
      } catch {
        return false;
      }
    },
    lookupName: async () => (await store.latest(slug))?.content.title,
  });
  return { title };
}

export default async function EditRoute({ params, searchParams }: Params) {
  const [{ slug }, { settings }] = await Promise.all([params, searchParams]);
  return <AdminStoryEditor slug={slug} settingsOpen={settings === '1'} />;
}
