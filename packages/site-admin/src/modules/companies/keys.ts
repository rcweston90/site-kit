import { recordKey } from '@rcweston/save-kit';

/** A company waiting for its delete's Undo window, hidden from every list. */
export const companyRecordKey = (slug: string) => recordKey('company', slug);
