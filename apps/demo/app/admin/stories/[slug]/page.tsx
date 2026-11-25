import { Editor } from '@/components/Editor';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

export default async function EditRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { openEditing } = await backend();
  return <Editor slug={slug} openEditing={openEditing} />;
}
