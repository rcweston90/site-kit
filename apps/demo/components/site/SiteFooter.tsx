'use client';

import Link from 'next/link';
import { SITE } from '@/content/site';
import { RevealGroup } from './Reveal';
import { SocialIcon } from './SocialIcon';
import type { SiteNavItem } from './SiteNavigation';
import type { SiteTheme } from './SiteChrome';
import { THEME_OPTIONS } from './siteControls';

/**
 * The site footer: the pages again, the profiles, the copyright and the
 * colour theme, with a link to the photo credits once there are any. Each
 * row is one 48px step, so the stack needs no gaps.
 */
export function SiteFooter({ items, theme, onSetTheme, credits = false }: { items: SiteNavItem[]; theme: SiteTheme; onSetTheme: (theme: SiteTheme) => void; credits?: boolean }) {
  const links = [{ label: 'Readme', href: '/' }, ...items];
  return (
    <RevealGroup as="footer" className="reveal-fade border-t border-default mt-major bg-background">
      <div className="max-w-6xl mx-auto px-6 py-minor">
        <div className="flex flex-col items-center gap-0">
          <nav aria-label="Site" className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="press-well block px-2 py-half font-mono text-xs leading-baseline uppercase tracking-wider">
                <span className="block">{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-minor flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-half">
            {SITE.socials.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.name} (opens in new tab)`}
                data-press="icon"
                className="press-well inline-flex min-h-minor-2 min-w-minor-2 items-center justify-center [&_svg]:size-4"
              >
                <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-flex"><SocialIcon platform={link.platform} /></span></span>
              </a>
            ))}
          </div>

          <p className="py-half mb-0 text-[16px] leading-baseline text-foreground-muted font-mono uppercase tracking-wider">
            {`© ${new Date().getFullYear()} – ${SITE.name}`}
          </p>
          {credits && (
            <Link href="/credits" className="press-well block px-2 py-half font-mono text-xs leading-baseline uppercase tracking-wider text-foreground-muted">
              Photo credits
            </Link>
          )}

          <div className="mt-minor flex flex-wrap items-center justify-center gap-half">
            <div className="surface-well flex h-minor-2 items-stretch gap-1 rounded-lg px-1" role="radiogroup" aria-label="Color theme">
              {THEME_OPTIONS.map(({ id, label, icon }) => {
                const selected = theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSetTheme(id)}
                    className={`relative min-w-minor-2 h-full flex items-center justify-center rounded-md transition-[color,scale] duration-200 active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary ${
                      selected ? 'text-foreground' : 'text-foreground-muted/55 hover:text-foreground-muted'
                    }`}
                    aria-label={label}
                    title={label}
                    role="radio"
                    aria-checked={selected}
                  >
                    {selected && <span aria-hidden="true" className="site-theme-chip surface-chip absolute inset-x-0 inset-y-1 rounded-md" />}
                    <span className="relative flex">{icon(selected)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </RevealGroup>
  );
}
