import { CalendarDays, ExternalLink, Mail } from 'lucide-react';
import type { CommunityContent } from '@rcweston/site-data/client';
import { InlineRichText } from '../site/InlineRichText';
import s from './Community.module.css';

// The homepage's Ethos mark, so the topic list reads as the same family.
const hexagon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2 21 7v10l-9 5-9-5V7Z" /></svg>;
const newTab = <><ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (opens in new tab)</span></>;

/** Prose fields carry `[label](url)` / `**bold**` markup. */
const Rich = ({ text }: { text: string }) => <InlineRichText text={text} linkClassName={s.inlineLink} />;

/** A raised key with an icon and a label: the header's contact button and the booking button. */
function Key({ href, label, icon, className }: { href: string; label: string; icon: React.ReactNode; className: string }) {
  const mail = href.startsWith('mailto:');
  return (
    <a
      href={href}
      target={mail ? undefined : '_blank'}
      rel={mail ? undefined : 'noopener noreferrer'}
      aria-label={mail ? label : `${label} (opens in new tab)`}
      className={`inline-flex items-center justify-center gap-2 min-w-minor-2 min-h-minor-2 ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="inline-flex">{icon}</span>
        <span className="text-sm leading-baseline font-medium">{label}</span>
      </span>
    </a>
  );
}

interface CommunityPageViewProps {
  /** The page's words and lists: the live copy, or the admin's unsaved form. */
  content: CommunityContent;
  /** Prefixes the section heading ids, so a second copy (the admin preview) can share a document. */
  idPrefix?: string;
}

/**
 * The whole of /community below the site nav: the header well, then
 * Mentoring, Speaking and Events. Plain markup with no hooks, so the page and
 * the admin preview render the same component. Empty optional lines are left
 * out rather than leaving gaps.
 */
export function CommunityPageView({ content, idPrefix = '' }: CommunityPageViewProps) {
  const { mentoring, speaking, events } = content;
  const id = (name: string) => `${idPrefix}${name}-heading`;
  return <>
    <header className={s.opening}>
      <div className={s.well}>
        <div>
          <h1>{content.title}</h1>
          {content.summary && <p className={s.summary}><Rich text={content.summary} /></p>}
        </div>
        {content.contactLabel && content.contactHref && <Key href={content.contactHref} icon={<Mail />} label={content.contactLabel} className={`${s.pill} ${s.headerPill}`} />}
      </div>
    </header>

    <section className={s.section} aria-labelledby={id('mentoring')}>
      <div className={s.intro}>
        <h2 id={id('mentoring')}>{mentoring.heading}</h2>
        {mentoring.intro && <p><Rich text={mentoring.intro} /></p>}
        {mentoring.bookingLabel && mentoring.bookingHref && <Key href={mentoring.bookingHref} icon={<CalendarDays />} label={mentoring.bookingLabel} className={s.pill} />}
        {mentoring.bookingNote && <p className={s.note}><Rich text={mentoring.bookingNote} /></p>}
      </div>
      <div className={s.mentoring}>
        {mentoring.pitch && <p className={s.pitch}><Rich text={mentoring.pitch} /></p>}
        {mentoring.body.map((paragraph, i) => <p key={i} className={s.body}><Rich text={paragraph} /></p>)}
        {mentoring.topics.length > 0 && <>
          {mentoring.topicsHeading && <h3>{mentoring.topicsHeading}</h3>}
          <ul className={s.topics}>{mentoring.topics.map((topic, i) => <li key={i}><span aria-hidden="true">{hexagon}</span>{topic}</li>)}</ul>
        </>}
        {mentoring.history && <p className={s.note}><Rich text={mentoring.history} /></p>}
      </div>
    </section>

    <section className={s.section} aria-labelledby={id('speaking')}>
      <div className={s.intro}>
        <h2 id={id('speaking')}>{speaking.heading}</h2>
        {speaking.intro && <p><Rich text={speaking.intro} /></p>}
      </div>
      {speaking.talks.length > 0 ? <ul className={s.rows}>{speaking.talks.map((talk, i) => <li key={i}>
        <a className={s.row} href={talk.href} target="_blank" rel="noopener noreferrer">
          <time dateTime={talk.date}>{talk.date.slice(0, 4)}</time>
          <span className={s.rowBody}>
            <strong>{talk.title}</strong>
            <span>{[talk.kind, talk.venue].filter(Boolean).join(' · ')}</span>
            {talk.description && <span className={s.rowDescription}>{talk.description}</span>}
          </span>
          <span className={s.rowAction}>{[talk.action, talk.minutes && `${talk.minutes} min`].filter(Boolean).join(' · ')}{newTab}</span>
        </a>
      </li>)}</ul> : <p className={s.empty}>No recorded talks yet.</p>}
    </section>

    <section className={s.section} aria-labelledby={id('events')}>
      <div className={s.intro}>
        <h2 id={id('events')}>{events.heading}</h2>
        {events.intro && <p><Rich text={events.intro} /></p>}
      </div>
      {events.groups.length > 0 ? <ul className={s.rows}>{events.groups.map((group, i) => <li key={i}>
        <a className={`${s.row} ${s.groupRow}`} href={group.href} target="_blank" rel="noopener noreferrer">
          <span className={s.rowBody}><strong>{group.name}</strong><span>{group.about}</span></span>
          <span className={s.rowAction}>{group.action}{newTab}</span>
        </a>
      </li>)}</ul> : <p className={s.empty}>No groups listed yet.</p>}
    </section>
  </>;
}
