'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { usePrefersReducedMotion } from './useMediaQuery.js';
import { type StoryChapterKey } from '@rcweston/story-core';
import { chapterName, chapterNavItems, type ChapterNavSource } from './chapter-navigation.js';
import { chapterBarStyles as styles } from './classes.js';

/** The hero's anchor (StoryHero). Its row heads the list, and it is the one
 *  marked until the first chapter is reached. */
const TOP = 'top';

// Hover intent: crossing the rail on the way to the scrollbar shouldn't flash
// the card open, and a loose diagonal exit shouldn't snap it shut.
const OPEN_DELAY = 70;
const CLOSE_DELAY = 220;
// A jump scrolls past every chapter in between. The mark goes straight to the
// destination and holds there until the scroll arrives, the reader takes over
// (wheel, touch, a key), or the scroll has been quiet this long.
const SETTLE = 240;

type Focus = 'none' | 'pointer' | 'keyboard';

/** The row under the pointer or keyboard focus, which the hover highlight
 *  slides to. `entry` counts fresh arrivals: each one mounts a new highlight
 *  in place, so it never sweeps in from wherever the last visit ended. `key`
 *  marks a move made by the keyboard, which lands at once instead of sliding:
 *  arrowing down a list shouldn't wait on an animation. Touch never aims, so
 *  a tap leaves no sticky hover behind. */
type Point = { row: number; on: boolean; entry: number; key: boolean };
const aimAt = (row: number, key = false) => (p: Point): Point =>
  p.on
    ? p.row === row && p.key === key ? p : { ...p, row, key }
    : { row, on: true, entry: p.entry + 1, key };
const unaim = (p: Point): Point => (p.on ? { ...p, on: false } : p);

/**
 * The story's contents. At rest it is a rail of dashes at the right
 * edge, one per section, that appears once the hero has scrolled away: the
 * section being read is marked, the ones already read sit a shade darker.
 * Point at it, Tab into it, or tap it on a touch screen and the rail unfurls
 * into a card of headings. The dashes ride the card's leading edge as it slides
 * out, so the rail visibly becomes the list instead of a second thing
 * appearing beside it.
 * Inside the card a highlight follows the pointer from row to row, and a
 * heading too long for the card scrolls its end into view when rested on.
 *
 * Inside an embedded reader the story scrolls in the sheet, not the window:
 * the rail follows the nearest `[data-reader-scroll]` ancestor when there is
 * one, and measures against that box instead of the viewport.
 */
export function ChapterBar({ chapters, title }: { chapters: ChapterNavSource[]; title?: string }) {
  const reduce = usePrefersReducedMotion();
  const items = chapterNavItems(chapters);
  const rows: { key: string; label: string }[] = title ? [{ key: TOP, label: chapterName(title) }, ...items] : items;
  const [active, setActive] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Any focus inside keeps the rail up (going inert under the focus would
  // drop it to <body>); only keyboard focus opens the card.
  const [focus, setFocus] = useState<Focus>('none');
  // Opened by a tap: stays open until a row or anything outside it is tapped.
  const [pinned, setPinned] = useState(false);
  // Escape closes the card in place, without moving focus or the pointer.
  const [dismissed, setDismissed] = useState(false);
  const [point, setPoint] = useState<Point>({ row: -1, on: false, entry: 0, key: false });
  // How far each heading runs past the card, in px: pointing at a long one
  // scrolls the rest into view.
  const [overflow, setOverflow] = useState<number[]>([]);
  const shown = visible || focus !== 'none';
  const open = shown && !dismissed && (hovered || pinned || focus === 'keyboard');
  const here = rows.findIndex((row) => row.key === (active ?? TOP));
  // The grey hover highlight steps aside over the current row, whose own
  // accent highlight deepens instead.
  const pointing = open && point.on && point.row !== here;
  const rowsKey = rows.map(({ key, label }) => `${key}:${label}`).join('|');
  const navRef = useRef<HTMLElement>(null);
  const openRef = useRef(open);
  // The destination of a jump in flight; null means "the top".
  const hold = useRef<{ key: string | null } | null>(null);
  const settle = useRef(0);
  const release = useRef(() => {});

  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let openTimer = 0;
    let closeTimer = 0;
    let pointer = 'mouse';
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      window.clearTimeout(closeTimer);
      openTimer = window.setTimeout(() => setHovered(true), OPEN_DELAY);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      window.clearTimeout(openTimer);
      closeTimer = window.setTimeout(() => {
        setHovered(false);
        setDismissed(false);
      }, CLOSE_DELAY);
    };
    const onDown = (e: PointerEvent) => {
      pointer = e.pointerType;
    };
    // On a touch screen the first tap opens the card instead of jumping: a
    // 32px dash is a guess under a thumb, a named heading isn't.
    const onClick = (e: globalThis.MouseEvent) => {
      if (e.detail === 0 || pointer === 'mouse' || openRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setPinned(true);
    };
    const onFocusIn = (e: FocusEvent) => {
      setFocus((e.target as Element).matches(':focus-visible') ? 'keyboard' : 'pointer');
      setDismissed(false);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (nav.contains(e.relatedTarget as Node | null)) return;
      setFocus('none');
      // A click moves focus to its section; the highlight stays with the pointer.
      if (!nav.matches(':hover')) setPoint(unaim);
    };
    nav.addEventListener('pointerenter', onEnter);
    nav.addEventListener('pointerleave', onLeave);
    nav.addEventListener('pointerdown', onDown);
    nav.addEventListener('click', onClick, true);
    nav.addEventListener('focusin', onFocusIn);
    nav.addEventListener('focusout', onFocusOut);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
      nav.removeEventListener('pointerenter', onEnter);
      nav.removeEventListener('pointerleave', onLeave);
      nav.removeEventListener('pointerdown', onDown);
      nav.removeEventListener('click', onClick, true);
      nav.removeEventListener('focusin', onFocusIn);
      nav.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // While open: Escape closes it wherever focus is, and a tap outside closes a
  // card a tap opened. The Escape is caught on the way down and kept, so the
  // reader sheet underneath doesn't close with it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setDismissed(true);
      setPinned(false);
    };
    const onOutside = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
    };
  }, [open]);

  useEffect(() => {
    const els = items
      .map((c) => ({ key: c.key, el: document.getElementById(c.key) }))
      .filter((x): x is { key: StoryChapterKey; el: HTMLElement } => x.el !== null);
    if (els.length === 0) return;
    const root = navRef.current?.closest<HTMLElement>('[data-reader-scroll]') ?? null;
    const scroller: HTMLElement | Window = root ?? window;
    const frameBox = () => (root ? root.getBoundingClientRect() : { top: 0, height: window.innerHeight });

    let frame = 0;
    const update = () => {
      frame = 0;
      const box = frameBox();
      // The chapter whose top has crossed a third of the way down is the one
      // being read; before the first chapter, nothing is.
      const line = box.top + box.height / 3;
      let current: StoryChapterKey | null = null;
      for (const { key, el } of els) {
        if (el.getBoundingClientRect().top <= line) current = key;
      }
      if (hold.current?.key === current) hold.current = null;
      if (!hold.current) setActive(current);
      const first = els[0].el.getBoundingClientRect().top;
      const last = els[els.length - 1].el.getBoundingClientRect().bottom;
      const inView = first < box.top + box.height * 0.85 && last > box.top + box.height * 0.4;
      setVisible(inView);
      if (!inView) setPinned(false);
    };
    const onScroll = () => {
      if (hold.current) {
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(release.current, SETTLE);
      }
      if (!frame) frame = requestAnimationFrame(update);
    };
    release.current = () => {
      hold.current = null;
      onScroll();
    };
    const takeOver = () => {
      if (hold.current) release.current();
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('wheel', takeOver, { passive: true });
    window.addEventListener('touchstart', takeOver, { passive: true });
    window.addEventListener('keydown', takeOver);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle.current);
      hold.current = null;
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('wheel', takeOver);
      window.removeEventListener('touchstart', takeOver);
      window.removeEventListener('keydown', takeOver);
    };
    // Anchors depend on chapter identity/visibility. A title edit updates the
    // visible label immediately without rebuilding the scroll observers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.map((chapter) => `${chapter.key}:${chapter.hidden ? 1 : 0}`).join('|')]);

  useEffect(() => {
    const labels = Array.from(navRef.current?.querySelectorAll<HTMLElement>(`.${styles.label}`) ?? []);
    if (labels.length === 0) return;
    const measure = () => {
      const next = labels.map((label) => {
        const over = (label.firstElementChild as HTMLElement).getBoundingClientRect().width - label.clientWidth;
        return over > 1 ? Math.ceil(over) : 0;
      });
      setOverflow((prev) => (prev.length === next.length && prev.every((value, i) => value === next[i]) ? prev : next));
    };
    // Fires once on observe, then whenever a font loads or the viewport
    // changes the card's width.
    const observer = new ResizeObserver(measure);
    for (const label of labels) {
      observer.observe(label);
      observer.observe(label.firstElementChild as HTMLElement);
    }
    return () => observer.disconnect();
  }, [rowsKey]);

  if (items.length < 2) return null;

  const go = (key: string) => {
    const el = document.getElementById(key);
    if (!el) return;
    hold.current = { key: key === TOP ? null : key };
    setActive(hold.current.key);
    window.clearTimeout(settle.current);
    // Long enough for a smooth scroll to start; each scroll event extends it.
    settle.current = window.setTimeout(release.current, SETTLE * 2);
    setPinned(false);
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Take keyboard and screen-reader users with the scroll: the next Tab
    // continues inside the chapter, not along the rail.
    if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
    el.focus({ preventScroll: true });
  };

  const follow = (e: MouseEvent<HTMLAnchorElement>, key: string) => {
    // A modified click keeps the browser's own behaviour: open in a new tab,
    // copy the section's link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(key);
  };

  const step = (e: KeyboardEvent<HTMLAnchorElement>) => {
    const links = Array.from(navRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []);
    const at = links.indexOf(e.currentTarget);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: links.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setDismissed(false);
    links[Math.max(0, Math.min(links.length - 1, to))]?.focus();
  };

  return (
    <nav
      ref={navRef}
      aria-label="Contents"
      // In-page navigation: the editor lets clicks here through.
      data-story-nav
      className={styles.bar}
      data-visible={shown}
      data-open={open}
      {...(!shown && { inert: true })}
    >
      <div className={styles.track} style={{ '--here': here } as CSSProperties}>
        <span className={styles.surface} aria-hidden="true" />
        {here >= 0 && <span className={styles.indicator} aria-hidden="true" />}
        {point.row >= 0 && point.row < rows.length && (
          <span
            key={point.entry}
            className={styles.hover}
            data-on={pointing || undefined}
            data-instant={point.key || undefined}
            style={{ '--at': point.row } as CSSProperties}
            aria-hidden="true"
          />
        )}
        <ol className={styles.list} onPointerLeave={() => setPoint(unaim)}>
          {rows.map(({ key, label }, index) => (
            <li key={key}>
              <a
                href={`#${key}`}
                onClick={(e) => follow(e, key)}
                onKeyDown={step}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'touch') setPoint(aimAt(index));
                }}
                onFocus={(e) => {
                  // A click focuses the link too; only keyboard focus counts as a key move.
                  if (e.currentTarget.matches(':focus-visible')) setPoint(aimAt(index, true));
                }}
                className={styles.item}
                data-read={index < here || undefined}
                data-pointed={(point.on && point.row === index) || undefined}
                aria-current={index === here ? 'location' : undefined}
              >
                <span className={styles.tick} aria-hidden="true" />
                <span
                  className={styles.label}
                  data-overflow={overflow[index] > 0 || undefined}
                  style={overflow[index] > 0 ? ({ '--overflow': overflow[index] } as CSSProperties) : undefined}
                >
                  <span className={styles.text}>{label}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
