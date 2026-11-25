import Link from 'next/link';
import { publishedTeasers } from '@/lib/published';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const stories = await publishedTeasers();
  return (
    <main className="demo-index">
      <header className="demo-index__header">
        <p className="demo-index__eyebrow">Story CMS demo</p>
        <h1>Stories</h1>
        <p className="demo-index__lede">
          Made-up stories from a made-up studio. Open one to read it, or open the <Link href="/admin">editor</Link> to change it.
        </p>
      </header>
      <ul className="demo-index__list">
        {stories.map((story) => (
          <li key={story.slug}>
            <Link className="demo-index__card" href={`/stories/${story.slug}`}>
              <span className="demo-index__company">{story.company}</span>
              <span className="demo-index__title">{story.title}</span>
              <span className="demo-index__summary">{story.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
