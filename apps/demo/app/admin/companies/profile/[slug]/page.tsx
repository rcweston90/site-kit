import { headers } from 'next/headers';
import { CompanyEditor, adminRecordTitle } from '@rcweston/site-admin';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const { auth, site } = await backend();
  const request = new Request('http://localhost/admin', { headers: await headers() });
  const title = await adminRecordTitle('Company', {
    authenticated: async () => {
      try {
        await auth.requireAdmin(request);
        return true;
      } catch {
        return false;
      }
    },
    lookupName: async () => (await site.reads.companies.directory()).companies.find((company) => company.slug === slug)?.name,
  });
  return { title };
}

export default async function CompanyPage({ params }: Params) {
  const { slug } = await params;
  return <CompanyEditor slug={slug} />;
}
