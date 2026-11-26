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
import { readConfig } from '@/lib/config';

export const metadata = {
  // SITE_KIT_SITE_URL, so shared links and images point at the real address.
  metadataBase: readConfig().siteUrl,
  title: { default: `${SITE.name} · ${SITE.role}`, template: `%s · ${SITE.name}` },
  description: `Case studies by ${SITE.name}, a made-up designer: the demo site for the story CMS and its admin.`,
  // The drawn icon, so browsers don't ask for a /favicon.ico the site doesn't have.
  icons: { icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icon-192.png' },
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
