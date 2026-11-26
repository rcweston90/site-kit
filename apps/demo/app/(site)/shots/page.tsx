import { notFound } from 'next/navigation';
import { backend } from '@/lib/story';
import { isPageVisible } from '@/lib/published';
import { ShotsClient } from '@/components/shots/ShotsClient';

// Render fresh from the shots table on each request. The heavy work
// (compress + dimensions + LQIP) happens once at ingestion, so reading the
// table is cheap, and the gallery always shows the latest upload or order.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Shots',
  description: 'A collection of photographs displayed in a collage layout',
};

/** Shots, unless it's switched off in the admin. */
export default async function ShotsPage() {
  if (!(await isPageVisible('/shots'))) notFound();
  // Metadata (dimensions + LQIP blur) is computed once at ingestion and stored,
  // so the page just reads the table.
  const photos = await (await backend()).site.reads['shots'].photos();
  return <ShotsClient photos={photos} />;
}
