import { notFound } from 'next/navigation';
import home from '@/components/home/Home.module.css';
import s from '@/components/showreel/Showreel.module.css';
import { isPageVisible } from '@/lib/published';
import { backend } from '@/lib/story';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const generateMetadata = () => pageMetadata('/showreel', { title: 'Showreel', description: 'A short reel of recent work by Lena Ortiz.' });

/** The poster the page shows while no reel is set (and the sample reel hasn't been drawn). */
const WAITING_POSTER = '/samples/showreel-poster.svg';

/**
 * The reel Admin → Showreel set: a video played here, or a Figma deck in a
 * frame. Answers 404 when the Showreel resource is switched off. With nothing
 * set (and no sample reel drawn by scripts/make-showreel.sh) the page still
 * opens, with the poster and a line saying the reel is on its way.
 */
export default async function ShowreelPage() {
  if (!(await isPageVisible('/showreel'))) notFound();
  const links = await (await backend()).site.reads.showreel.links();
  if (!links) return <ShowreelWaiting />;
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

function ShowreelWaiting() {
  return (
    <div className={home.surface}>
      <div className={`${home.page} ${s.showreel}`}>
        <header className={s.opening}>
          <h1>Showreel</h1>
        </header>
        <figure className={`${s.frame} ${s.waiting}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a drawn poster from public/samples */}
          <img src={WAITING_POSTER} alt="" />
          <figcaption>
            <strong>The reel is on its way.</strong>
            <span>Until then, the <a href="/work">case studies</a> tell the same stories at reading pace.</span>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
