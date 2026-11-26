import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageLayout } from '@/components/blog/PageLayout';
import { creditHref, photoCredits } from '@/lib/credits';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const generateMetadata = () => pageMetadata('/credits', { title: 'Credits', description: 'Who took the photographs on this site.' });

/** The photographers behind the case-study covers. Answers 404 while no photo has a credit. */
export default async function CreditsPage() {
  const credits = await photoCredits();
  if (!credits.length) notFound();
  return (
    <PageLayout width="narrow">
      <h1 className="text-3xl md:text-4xl font-semibold leading-9 md:leading-12 text-foreground mb-minor tracking-tight">Credits</h1>
      <p className="text-base leading-baseline text-foreground-muted mb-minor-2">The photographs on the case studies, and who took them.</p>
      <ul className="border-t border-default">
        {credits.map((credit) => {
          const profile = creditHref(credit.profileUrl);
          const photo = creditHref(credit.photoUrl);
          return (
            <li key={credit.slug} className="flex flex-col gap-1 border-b border-default py-minor sm:flex-row sm:items-baseline sm:justify-between sm:gap-minor">
              <Link href={`/stories/${credit.slug}`} className="text-base leading-baseline font-medium text-foreground hover:underline underline-offset-4">
                {credit.title}
              </Link>
              <span className="text-sm leading-baseline text-foreground-muted">
                {photo ? <a href={photo} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">Photo</a> : 'Photo'}
                {' by '}
                {profile ? <a href={profile} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">{credit.photographer}</a> : credit.photographer}
                {credit.license ? ` · ${credit.license}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </PageLayout>
  );
}
