import type { MetadataRoute } from 'next';
import { SITE } from '@/content/site';

/** The web app manifest: the name and the home-screen icons (lib/share-images.tsx draws them). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} · ${SITE.role}`,
    short_name: SITE.name,
    description: `Case studies by ${SITE.name}.`,
    start_url: '/',
    display: 'browser',
    background_color: '#F8F9FB',
    theme_color: '#0055CC',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
