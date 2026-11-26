import { Dashboard } from '@rcweston/site-admin';
import { StartHere, type StartHereStep } from '@/components/admin/StartHere';
import { blogSeed } from '@/content/blog-seed';
import { seed } from '@/content/seed';
import { adminProblem, readConfig } from '@/lib/config';
import { backend } from '@/lib/story';

export const metadata = { title: 'Dashboard' };

const SEED_STORIES = new Set([...seed.published, ...seed.drafts, seed.drift.published].map((story) => story.slug));
const SEED_POSTS = new Set(blogSeed.map((post) => post.slug));

const STEPS: StartHereStep[] = [
  { id: 'story', label: 'Edit your first story', hint: 'Change a line, save with ⌘S, then publish when it reads right.', href: '/admin/stories/field-notes' },
  { id: 'post', label: 'Write a post', hint: 'Start a draft; nothing goes live until you publish it.', href: '/admin/blog/new' },
  { id: 'home', label: 'Set your home page', hint: 'Pick the three header photos and rewrite the letter.', href: '/admin/home' },
  { id: 'site', label: 'See the public site', hint: 'Every change you publish shows up there.', href: '/', external: true },
];

/** Whether the store still holds only the sample stories and posts: the first-run card shows until you add your own. */
async function sampleOnly(): Promise<boolean> {
  try {
    const { store, site } = await backend();
    const [stories, posts] = await Promise.all([store.list(), site.stores.blog.list()]);
    return stories.every((story) => SEED_STORIES.has(story.slug)) && posts.every((post) => SEED_POSTS.has(post.slug));
  } catch {
    return false;
  }
}

export default async function DashboardPage() {
  // The layout shows the switched-off notice instead; don't read the store for a page nobody sees.
  if (adminProblem(readConfig())) return null;
  return <Dashboard intro={(await sampleOnly()) ? <StartHere steps={STEPS} /> : null} />;
}
