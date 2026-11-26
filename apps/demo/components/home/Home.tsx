import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SITE } from '@/content/site';
import { HOME } from '@/content/home';
import type { WorkCard } from '@/lib/published';
import { SocialIcon } from '../site/SocialIcon';
import { WorkCover } from '../work/WorkCards';
import styles from './Home.module.css';

/** Where the original's animated orbit stood: a still of paper and a circle, drawn in the page's own colours. `bare` drops the well, for a frame that has its own. */
export function Portrait({ bare = false }: { bare?: boolean }) {
  const drawing = (
    <svg viewBox="0 0 336 336" aria-hidden="true" style={bare ? { display: 'block', width: '100%', height: 'auto', color: 'var(--preview-ink)' } : undefined}>
      <rect x="64" y="84" width="150" height="196" rx="6" fill="var(--preview-paper)" transform="rotate(-6 139 182)" />
      <rect x="112" y="66" width="150" height="196" rx="6" fill="var(--preview-paper)" stroke="var(--preview-line)" />
      {[0, 1, 2, 3, 4, 5].map((line) => <rect key={line} x="132" y={104 + line * 22} width={line === 5 ? 64 : 110} height="5" rx="2.5" fill="var(--preview-line)" />)}
      <circle cx="238" cy="236" r="34" fill="var(--preview-accent)" opacity="0.85" />
    </svg>
  );
  return bare ? drawing : <div className={styles.portrait} aria-hidden="true">{drawing}</div>;
}

/** The home page, after the original's: the name, a letter, the selected work, where I've worked and how. */
export function Home({ work, workHref, header }: { work: WorkCard[]; workHref: string | null; header?: ReactNode }) {
  return (
    <div className={styles.surface}>
      <div className={styles.page}>
        {header ?? <header className={styles.opening}>
          <div className={styles.introduction}>
            <h1 className={styles.name}><span>{SITE.name.split(' ')[0]}</span>{' '}<span>{SITE.name.split(' ').slice(1).join(' ')}</span></h1>
            <p className={styles.descriptors}><span>{SITE.descriptors[0]}</span>{' '}<span>{SITE.descriptors.slice(1).join(' ')}</span></p>
            <div className={styles.signatureBand}>
              <div className={styles.currentWork} aria-label="Current role">
                <span className={styles.currentCompany}>
                  <span className={styles.currentStatus} aria-hidden="true" />
                  <span className={styles.companyName}>{SITE.studio}</span>
                </span>
                <p className={styles.currentRole}><span>{SITE.role}</span><span>{SITE.location}</span></p>
              </div>
              <div className={styles.heroSocials} aria-label="Profiles">
                {SITE.socials.map((link) => (
                  <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" title={link.name} aria-label={`${link.name} (opens in new tab)`} className={`press-well inline-flex items-center justify-center ${styles.heroSocial}`} data-press="icon">
                    <span className="inline-flex"><SocialIcon platform={link.platform} /></span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.orbit}><Portrait /></div>
        </header>}

        <section className={styles.letterSpread} aria-label={`A letter from ${SITE.name.split(' ')[0]}`}>
          <div className={styles.margin}>
            <p>{HOME.margin}</p>
          </div>
          <div className={styles.letter}>
            <p className={styles.tagline}>{HOME.tagline}</p>
            {HOME.letter.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <ul className={styles.workBullets} aria-label="How I work">
              {HOME.howIWork.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          </div>
        </section>

        {work.length > 0 && (
          <section className={styles.selectedWork} aria-labelledby="selected-work-heading">
            <h2 id="selected-work-heading">Selected work</h2>
            <div>
              {work.map((study) => (
                <Link key={study.slug} href={`/stories/${study.slug}`}>
                  <span className={styles.thumb} aria-hidden="true"><WorkCover card={study} /></span>
                  <span>{[study.company, study.year].filter(Boolean).join(' · ')}</span>
                  <strong>{study.title}</strong>
                  {study.summary && <p>{study.summary}</p>}
                </Link>
              ))}
            </div>
            {workHref && <Link href={workHref} className={styles.selectedMore}>All work <ArrowRight size={16} aria-hidden="true" /></Link>}
          </section>
        )}

        <section className={styles.credentials} aria-label="Experience and education">
          <div className={styles.credentialBand}>
            <h2>Experience</h2>
            <div className={styles.companies} data-experience-years="">
              {HOME.experience.map((item) => (
                <div key={item.name} className={styles.company}>
                  <span className={styles.companyName}>{item.name}</span>
                  <span>{item.years}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.credentialBand}>
            <h2>Education</h2>
            <div className={styles.education}>
              {HOME.education.map((item) => <span key={item} className={styles.educationName}>{item}</span>)}
            </div>
          </div>
        </section>

        <section className={styles.principles} aria-labelledby="principles-heading">
          <h2 id="principles-heading">Ethos</h2>
          <ul>
            {HOME.principles.map((principle) => (
              <li key={principle}>
                <span aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2 21 7v10l-9 5-9-5V7Z" /></svg></span>
                <p>{principle}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
