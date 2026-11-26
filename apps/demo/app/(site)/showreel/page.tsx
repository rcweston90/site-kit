import { notFound } from 'next/navigation';
import home from '@/components/home/Home.module.css';
import s from '@/components/showreel/Showreel.module.css';
import { isPageVisible } from '@/lib/published';
import { backend } from '@/lib/story';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Showreel' };

/**
 * The reel Admin → Showreel set: a video played here, or a Figma deck in a
 * frame. Answers 404 when the Showreel resource is switched off or nothing
 * is set.
 */
export default async function ShowreelPage() {
  if (!(await isPageVisible('/showreel'))) notFound();
  const links = await (await backend()).site.reads.showreel.links();
  if (!links) notFound();
  return (
    <div className={home.surface}>
      <div className={`${home.page} ${s.showreel}`}>
        <header className={s.opening}>
          <h1>Showreel</h1>
          <a href={links.deck} target="_blank" rel="noopener noreferrer" className={s.open}>
            {links.kind === 'video' ? 'Open the video' : 'Open in Figma'}<span className="sr-only"> (opens in new tab)</span>
          </a>
        </header>
        <div className={s.frame}>
          {links.kind === 'video'
            ? <video src={links.video ?? undefined} poster={links.poster ?? undefined} controls playsInline preload="metadata" aria-label="Showreel" />
            : <iframe src={links.embed ?? undefined} title="Showreel" allowFullScreen />}
        </div>
      </div>
    </div>
  );
}
