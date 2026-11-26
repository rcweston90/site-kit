'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE } from '@/content/site';
import { SiteMark } from './SiteMark';
import { SocialIcon } from './SocialIcon';
import styles from './SiteNavigation.module.css';

export interface SiteNavItem {
  label: string;
  href: string;
}

const PHONE = '(max-width: 639px)';
const SLIDE: KeyframeAnimationOptions = { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

function Mark() {
  return <span className={styles.mark} aria-hidden="true"><SiteMark /></span>;
}

function LinkLabel({ name }: { name: string }) {
  const { pending } = useLinkStatus();
  return <span className={styles.label} data-pending={pending || undefined}>{name}<span className={styles.pending} aria-hidden="true" /></span>;
}

/**
 * The same navigation on every public page: the mark and name, then the
 * pages in a recessed rail. `items` comes from the server, already without
 * the pages switched off in the admin.
 */
export function SiteNavigation({ items }: { items: SiteNavItem[] }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const navigationTarget = useRef<string | null>(null);
  const menuCloseScrollTarget = useRef<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLElement>(null);
  const railPlaced = useRef(false);
  const selection = useRef<HTMLSpanElement>(null);
  const selectedLink = useRef<HTMLElement | null>(null);
  const isHome = pathname === '/';

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) menuButton.current?.focus({ preventScroll: true });
  }, []);

  // The phone menu is modal navigation: focus moves into it, stays there,
  // and Escape hands it back to the button.
  useEffect(() => {
    if (!menuOpen) return;
    const phone = window.matchMedia(PHONE);
    const firstLink = rail.current?.querySelector<HTMLElement>('a[href]');
    const focusFrame = requestAnimationFrame(() => firstLink?.focus({ preventScroll: true }));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = rail.current?.querySelectorAll<HTMLElement>('a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleBreakpoint = () => {
      if (!phone.matches) closeMenu();
    };
    window.addEventListener('keydown', handleKeyDown);
    phone.addEventListener('change', handleBreakpoint);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      phone.removeEventListener('change', handleBreakpoint);
    };
  }, [closeMenu, menuOpen]);

  // Pin the page at its reading offset while the phone menu is open, and put
  // it back before paint on close.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      rootOverflow: root.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      root.style.overflow = previous.rootOverflow;
      const target = menuCloseScrollTarget.current ?? scrollY;
      menuCloseScrollTarget.current = null;
      window.scrollTo({ top: target, left: window.scrollX, behavior: 'instant' });
    };
  }, [menuOpen]);

  // The divider shows once content passes under the bar: at once on phones,
  // after 72px on wider screens.
  useEffect(() => {
    const phone = window.matchMedia(PHONE);
    const update = () => setScrolled(window.scrollY >= (phone.matches ? 1 : 72));
    update();
    window.addEventListener('scroll', update, { passive: true });
    phone.addEventListener('change', update);
    return () => {
      window.removeEventListener('scroll', update);
      phone.removeEventListener('change', update);
    };
  }, []);

  // Fade whichever end of the rail has pages past it.
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const end = element.scrollWidth - element.clientWidth;
      element.toggleAttribute('data-more-before', element.scrollLeft > 1);
      element.toggleAttribute('data-more-after', element.scrollLeft < end - 1);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(element);
    if (element.firstElementChild) resize.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, [menuOpen]);

  // Slide the selection over from the page it left, measured against the row.
  useLayoutEffect(() => {
    const chip = selection.current;
    const from = selectedLink.current;
    const to = chip?.parentElement ?? null;
    selectedLink.current = to;
    if (!chip || !to || !from?.isConnected || from === to) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const width = chip.offsetWidth;
    chip.animate([
      { transform: `translateX(${from.offsetLeft - to.offsetLeft}px)`, width: `${width + from.offsetWidth - to.offsetWidth}px` },
      { transform: 'none', width: `${width}px` },
    ], SLIDE);
  }, [pathname]);

  // Centre the current page in the rail when the rail scrolls.
  useEffect(() => {
    const element = rail.current;
    const current = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!element || !current) return;
    const box = element.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    const left = element.scrollLeft + item.left - box.left - (box.width - item.width) / 2;
    const smooth = railPlaced.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
    railPlaced.current = true;
  }, [pathname]);

  // A navigation starts at the top; the back button keeps its place.
  useEffect(() => {
    const target = navigationTarget.current;
    if (target && (pathname === target || (target !== '/' && pathname.startsWith(`${target}/`)))) {
      navigationTarget.current = null;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname]);

  function navigate(href: string) {
    if (menuOpen) menuCloseScrollTarget.current = 0;
    closeMenu();
    if (pathname === href) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    else navigationTarget.current = href;
  }

  const links = [{ label: 'Readme', href: '/' }, ...items];
  const homeLabel = `${SITE.name}: home`;

  return (
    <header className={styles.header} data-concept="index" data-home={isHome || undefined} data-scrolled={scrolled || undefined} data-menu-open={menuOpen || undefined}>
      <div className={styles.frame}>
        <Link href="/" onNavigate={() => navigate('/')} className={styles.identity} aria-label={homeLabel}>
          <Mark /><span>{SITE.handle}</span>
        </Link>
        <div className={styles.bar}>
          <Link href="/" onNavigate={() => navigate('/')} className={styles.dock} aria-label={homeLabel}><Mark /></Link>
          <button ref={menuButton} type="button" className={styles.menuButton} aria-expanded={menuOpen} aria-controls={menuId} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen((open) => !open)}>
            <span className={styles.menuIcon} aria-hidden="true"><span /><span /><span /></span>
          </button>
          <nav ref={rail} id={menuId} aria-label="Main navigation" className={styles.navigation} data-open={menuOpen || undefined}>
            <ul className={styles.links}>
              {links.map((item) => {
                const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.href}>
                    <Link href={item.href} onNavigate={() => navigate(item.href)} className={styles.link} aria-current={active ? 'page' : undefined}>
                      {active && <span ref={selection} className={styles.selected} aria-hidden="true" />}
                      <LinkLabel name={item.label} />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className={styles.socials} aria-label="Profiles">
              {SITE.socials.map((link) => (
                <a key={link.name} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={`${link.name} (opens in new tab)`}>
                  <span aria-hidden="true"><SocialIcon platform={link.platform} /></span>
                </a>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
