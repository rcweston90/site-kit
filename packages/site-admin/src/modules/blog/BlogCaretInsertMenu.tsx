'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { AuthoringCommandMenu, AuthoringCommandRow, AuthoringInsertTrigger } from '../../menu/index.js';
import { AUTHORING_COMMAND_MENU_MAX_HEIGHT } from '../../menu/index.js';
import type { SlashInsertAction } from '@rcweston/story-editor';
import { blankBlogLine, blogCaretMenuPlacement } from './blog-caret-insert.js';

export function BlogCaretInsertMenu({ editor, at, actions }: { editor: Editor; at: number | null; actions: SlashInsertAction[] }) {
  const id = useId();
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [placement, setPlacement] = useState<ReturnType<typeof blogCaretMenuPlacement>>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = at !== null && openAt === at;

  useLayoutEffect(() => {
    if (at === null) return;
    let frame = 0;
    const viewport = window.visualViewport;
    const update = () => {
      if (editor.isDestroyed || blankBlogLine(editor.state) !== at || !editor.view.dom.getClientRects().length) return;
      const editorRect = editor.view.dom.getBoundingClientRect();
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const sticky = editor.view.dom.closest('[data-blog-editor]')?.querySelector('[data-story-workspace-bar]');
      const mobileBar = document.querySelector('[data-story-mobile-formatting]');
      setPlacement(blogCaretMenuPlacement(editor.view.coordsAtPos(at), {
        left: viewportLeft,
        right: viewportLeft + (viewport?.width ?? window.innerWidth),
        top: Math.max(viewportTop, sticky?.getBoundingClientRect().bottom ?? 0),
        bottom: mobileBar?.getClientRects().length ? Math.min(viewportBottom, mobileBar.getBoundingClientRect().top) : viewportBottom,
      }, editorRect));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(editor.view.dom);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    viewport?.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      viewport?.removeEventListener('resize', schedule);
    };
  }, [at, editor]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || menu.current?.contains(event.target) || trigger.current?.contains(event.target)) return;
      setOpenAt(null);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  useEffect(() => {
    if (at === null) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || !event.altKey || event.key !== 'F10' || document.activeElement !== editor.view.dom || !trigger.current) return;
      event.preventDefault();
      event.stopPropagation();
      trigger.current.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [at, editor]);

  if (at === null || !placement || !actions.length) return null;
  const restoreCaret = () => {
    setOpenAt(null);
    editor.commands.focus(undefined, { scrollIntoView: false });
  };
  const toggle = () => {
    if (open) { restoreCaret(); return; }
    if (placement.menu.maxHeight < 44) return;
    setOpenAt(at);
    requestAnimationFrame(() => menu.current?.querySelector('button')?.focus({ preventScroll: true }));
  };
  return createPortal(<>
    <AuthoringInsertTrigger ref={trigger} style={placement.plus}
      aria-label="Insert at this line" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      data-story-prose-surface=""
      onPointerDown={event => event.preventDefault()} onClick={toggle}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); restoreCaret(); }
        if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) toggle(); else menu.current?.querySelector('button')?.focus({ preventScroll: true }); }
      }} />
    {open && placement.menu.maxHeight >= 44 && <AuthoringCommandMenu
      ref={menu} id={id} role="menu" aria-label="Insert at this line" data-story-prose-surface=""
      style={{ left: placement.menu.left, top: placement.menu.top, width: placement.menu.width, maxHeight: Math.min(placement.menu.maxHeight, AUTHORING_COMMAND_MENU_MAX_HEIGHT) }}
      data-open-up={placement.menu.up || undefined}
      items={actions.map(action => ({ ...action, group: 'Insert' }))}
      empty="No blocks available" footer="↑↓ move · ↵ choose · esc close"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); restoreCaret(); return; }
        if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const rows = [...event.currentTarget.querySelectorAll('button')];
        const current = rows.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        rows[next]?.focus({ preventScroll: true });
        rows[next]?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }}
      renderItem={(item, index) => <AuthoringCommandRow as="button" role="menuitem" label={item.label} icon={item.icon} data-blog-insert-command={item.key}
        data-command-first={index === 0 ? '' : undefined}
        onPointerDown={event => event.preventDefault()} onClick={() => {
          setOpenAt(null);
          if (blankBlogLine(editor.state) === at) item.run();
          else editor.commands.focus(undefined, { scrollIntoView: false });
        }} />}
    />}
  </>, document.body);
}
