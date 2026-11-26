import { FileText } from 'lucide-react';
import styles from './WorkResourceLinks.module.css';

/**
 * Work's resource buttons: the resume, while it's switched on in the
 * dashboard's Site resources and there's a file to serve. It opens in a new
 * tab, as the PDF it is.
 */
export function WorkResourceLinks({ resumeHref }: { resumeHref: string | null }) {
  if (!resumeHref) return null;
  return (
    <nav className={styles.links} aria-label="Work resources" data-work-resource-links="">
      <a data-resource-kind="resume" className={styles.link} href={resumeHref} target="_blank" rel="noopener noreferrer">
        <FileText size={16} aria-hidden="true" />View resume
      </a>
    </nav>
  );
}
