import { NewStory } from '@rcweston/site-admin';

export const metadata = { title: 'New case study' };

/** Addresses the site already uses, so a new story can't take one. */
const RESERVED = ['admin', 'api', 'samples', 'work', 'new'];

export default function NewStoryPage() {
  return <NewStory reserved={RESERVED} />;
}
