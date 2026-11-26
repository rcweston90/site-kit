import { notFound } from 'next/navigation';
import home from '@/components/home/Home.module.css';
import { CommunityPageView } from '@/components/community/CommunityPageView';
import s from '@/components/community/Community.module.css';
import { isPageVisible } from '@/lib/published';
import { backend } from '@/lib/story';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const generateMetadata = () => pageMetadata('/community', {
  title: 'Community',
  description: 'Mentoring, recorded talks and the groups Lena Ortiz shows up for.',
});

/** Community, as Admin → Community saved it, unless it's switched off in the admin. */
export default async function CommunityPage() {
  if (!(await isPageVisible('/community'))) notFound();
  const content = await (await backend()).site.reads.community.content();
  return (
    <div className={home.surface}>
      <div className={`${home.page} ${s.community}`}>
        <CommunityPageView content={content} />
      </div>
    </div>
  );
}
