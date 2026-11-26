import { headers } from 'next/headers';
import { ProjectDetails, adminRecordTitle } from '@rcweston/site-admin';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const { auth, site, store } = await backend();
  const request = new Request('http://localhost/admin', { headers: await headers() });
  const title = await adminRecordTitle('Project', {
    authenticated: async () => {
      try {
        await auth.requireAdmin(request);
        return true;
      } catch {
        return false;
      }
    },
    lookupName: async () => (await site.reads.projects.get(slug))?.title ?? (await store.latest(slug))?.content.title,
  });
  return { title };
}

export default async function ProjectDetailsPage({ params }: Params) {
  const { slug } = await params;
  return <ProjectDetails slug={slug} />;
}
