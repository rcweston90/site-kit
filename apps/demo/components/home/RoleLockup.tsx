import { SITE } from '@/content/site';
import s from './RoleLayouts.module.css';

export type RoleTreatment = 'stack' | 'split' | 'roleFirst' | 'inset';

// The original shows the employer's logo here; the demo sets the studio's name as a wordmark.
function Company() {
  return <span className={`${s.company} ${s.wordmark}`}>{SITE.studio}</span>;
}

function Location() {
  return <p className={s.location}><span aria-hidden="true" />{SITE.location}</p>;
}

function Role() {
  return <div className={s.role}><p className={s.title}>{SITE.role}</p><p className={s.affiliation}>{SITE.affiliation}</p></div>;
}

/** The statement, then where the work happens now, in one of four compositions. */
export function RoleLockup({ treatment, mobileStatementFirst = false }: { treatment: RoleTreatment; mobileStatementFirst?: boolean }) {
  return <div className={`${s.frame} ${mobileStatementFirst ? s.mobileStatementFirst : ''}`} data-role-treatment={treatment}>
    <div className={`${s.record} ${s[treatment]}`}>
      <p className={s.statement}>{SITE.descriptors.map((text, index) => <span key={text}>{index > 0 ? ' ' : ''}{text}</span>)}</p>
      <div className={s.credential} aria-label="Current role and location">
        {treatment === 'stack' && <><Company /><Role /><Location /></>}
        {treatment === 'split' && <><Company /><div className={s.details}><Role /><Location /></div></>}
        {treatment === 'roleFirst' && <><Role /><div className={s.baseline}><Company /><Location /></div></>}
        {treatment === 'inset' && <><div className={s.panelTop}><Company /><Location /></div><Role /></>}
      </div>
    </div>
  </div>;
}
