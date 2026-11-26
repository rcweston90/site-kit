import { ImageResponse } from 'next/og';
import { SITE } from '@/content/site';

/**
 * The share card (`/og-default.png`, the SEO fallback's image) and the
 * home-screen icons, drawn by Next's ImageResponse on request, so the repo
 * ships no binary images. Replace them with your own files in public/ if you
 * prefer; the addresses stay the same.
 */

const INK = '#141A21';
const PAPER = '#F8F9FB';
const ACCENT = '#0055CC';
const CACHE = { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' };

const initials = SITE.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

export function shareCard(): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: PAPER, color: INK, padding: '72px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>{initials}</div>
          <div style={{ fontSize: 28, color: '#5B6470' }}>{SITE.studio}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>{SITE.name}</div>
          <div style={{ fontSize: 40, color: '#5B6470' }}>{`${SITE.role} · ${SITE.location}`}</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {SITE.descriptors.map((line) => (
            <div key={line} style={{ fontSize: 26, padding: '8px 18px', borderRadius: 999, border: `2px solid ${ACCENT}`, color: ACCENT }}>{line}</div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: CACHE },
  );
}

export function appIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ACCENT, color: '#fff', fontSize: size * 0.42, fontWeight: 700, letterSpacing: -size * 0.01 }}>
        {initials}
      </div>
    ),
    { width: size, height: size, headers: CACHE },
  );
}
