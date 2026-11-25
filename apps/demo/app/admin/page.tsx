import Link from 'next/link';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

export default async function AdminIndex() {
  const { store } = await backend();
  const stories = await store.list();
  return (
    <main className="demo-index">
      <header className="demo-index__header">
        <p className="demo-index__eyebrow">Editor</p>
        <h1>All stories</h1>
        <p className="demo-index__lede">
          Pick one to edit in place. <Link href="/">Back to the stories</Link>.
        </p>
      </header>
      <ul className="demo-index__list">
        {stories.map((story) => (
          <li key={story.slug}>
            <Link className="demo-index__card" href={`/admin/stories/${story.slug}`}>
              <span className="demo-index__company">{story.publishedDocumentId ? 'Published' : 'Draft'}</span>
              <span className="demo-index__title">{story.title || story.slug}</span>
              <span className="demo-index__summary">Version {story.latestVersion}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
