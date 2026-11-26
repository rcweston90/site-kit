import { CommunityScreen } from '@rcweston/site-admin';
import { CommunityPreview } from '@/components/community/CommunityPreview';

export const metadata = { title: 'Community' };

export default function AdminCommunityPage() {
  return <CommunityScreen Preview={CommunityPreview} />;
}
