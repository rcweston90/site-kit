import type { ReactNode } from 'react';
// Geist stands in for the original's private typeface: an open-licence
// grotesk that matches its widths and light weights, so lines break where
// they did. Swap it by setting --story-font-sans in your theme.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist/wght-italic.css';
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
