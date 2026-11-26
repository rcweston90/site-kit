import { BlogEditor } from '@rcweston/site-admin';

export const metadata = { title: 'New post' };

export default function NewPostPage() {
  return <BlogEditor mode="create" />;
}
