import type { ReactNode } from 'react';
// Geist stands in for the original's private typeface: an open-licence
// grotesk that matches its widths and light weights, so lines break where
// they did. Swap it by setting --story-font-sans in your theme.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist/wght-italic.css';
import './globals.css';
import '@rcweston/story-react/tokens.css';
import '@rcweston/story-react/styles.css';
import '@rcweston/save-kit/styles.css';
import '@rcweston/story-editor/styles.css';
import './demo.css';
import { SITE_THEME_SCRIPT } from '@/components/site/theme-script';
import { SITE } from '@/content/site';

export const metadata = {
  title: { default: `${SITE.name} · ${SITE.role}`, template: `%s · ${SITE.name}` },
  description: `Case studies by ${SITE.name}, a made-up designer: the demo site for the story CMS and its admin.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#F8F9FB" />
        <script dangerouslySetInnerHTML={{ __html: SITE_THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
