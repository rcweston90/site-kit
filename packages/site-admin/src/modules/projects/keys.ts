import { recordKey } from '@rcweston/save-kit';

/** A project row hidden while its delete can be undone. */
export const projectRecordKey = (slug: string) => recordKey('project', slug);
