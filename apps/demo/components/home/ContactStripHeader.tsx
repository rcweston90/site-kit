'use client';

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { SITE } from '@/content/site';
import { SocialIcon } from '../site/SocialIcon';
import s from './ContactStripHeader.module.css';

export interface StripPhoto { src: string; alt: string; objectPosition?: string }

/** The home header: the name and profiles, up to three photographs beside the portrait, then the record. */
export function ContactStripHeader({ shots, portrait, professionalRecord }: { shots: StripPhoto[]; portrait: ReactNode; professionalRecord?: ReactNode }) {
  const photographs = shots.slice(0, 3);
  const [first, ...rest] = SITE.name.split(' ');

  return <div className={s.container}>
    <header className={s.header} data-home-header="contact-strip">
      <div className={s.masthead}>
        <h1 className={s.name}><span>{first}</span>{' '}<span>{rest.join(' ')}</span></h1>
        <div className={s.socials} aria-label="Social and contact links">{SITE.socials.map(item => (
          <a key={item.platform} href={item.href} target="_blank" rel="noopener noreferrer" title={item.name} aria-label={`${item.name} (opens in new tab)`} className="press-well inline-flex min-h-minor-2 min-w-minor-2 items-center justify-center [&_svg]:size-4" data-press="icon">
            <span aria-hidden="true" className="inline-flex"><SocialIcon platform={item.platform} /></span>
          </a>
        ))}</div>
      </div>
      <div className={s.strip} data-photo-count={photographs.length} style={{ '--frame-count': photographs.length + 1 } as CSSProperties}>
        {photographs.map((photo, index) => <figure className={s.photoFrame} key={index}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a stored image at its own address */}
          <img
            src={photo.src}
            alt={photo.alt}
            loading="eager"
            fetchPriority={index === 0 ? 'high' : 'auto'}
            className={s.photo}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectPosition: photo.objectPosition }}
          />
        </figure>)}
        <div className={s.portrait}>
          <div className={s.object}>{portrait}</div>
        </div>
      </div>
      {professionalRecord ?? <div className={s.record}>
        <p className={s.descriptor}>{SITE.descriptors.map((text, index) => <Fragment key={text}>{index > 0 ? ' ' : ''}<span>{text}</span></Fragment>)}</p>
        <div className={s.meta}>
          <div className={s.credential} aria-label="Current role">
            <span className={s.company}>
              <span className={s.status} aria-hidden="true" />
              {SITE.studio}
            </span>
            <p>{SITE.role}</p>
          </div>
        </div>
      </div>}
    </header>
  </div>;
}
