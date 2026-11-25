import type { ReactNode } from 'react';
import '@rcweston/story-react/tokens.css';
import '@rcweston/story-react/styles.css';
import '@rcweston/save-kit/styles.css';
import '@rcweston/story-editor/styles.css';
import './demo.css';

export const metadata = {
  title: 'Story CMS demo',
  description: 'A local demo of the story reader and in-place editor, with made-up content.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
