'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/*
 * A drag-to-reorder list with the shape of an animation library's Reorder (Group and
 * Item, `values` and `onReorder`), drawn with pointer events so the package
 * needs no animation library. The held item follows the pointer; it trades
 * places with each neighbour whose middle it passes, and the others slide to
 * their new places. Pressing on an input or a button inside an item doesn't
 * start a drag (they stop the pointer event, as the original's did). Alt + ↑/↓ moves
 * the focused item from the keyboard.
 */

interface GroupContext<T> {
  values: { current: T[] };
  onReorder: (next: T[]) => void;
  dragging: { current: T | null };
}

const ReorderContext = createContext<GroupContext<unknown> | null>(null);

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Group<T>({ axis: _axis = 'y', values, onReorder, className, children, ...rest }: {
  axis?: 'y';
  values: T[];
  onReorder: (next: T[]) => void;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLUListElement>, 'children' | 'onReorder'>) {
  const list = useRef<HTMLUListElement>(null);
  const latest = useRef(values);
  latest.current = values;
  const dragging = useRef<T | null>(null);
  const tops = useRef(new Map<Element, number>());

  // The others slide to their new places (FLIP), the held one stays under the pointer.
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const items = [...element.querySelectorAll<HTMLElement>(':scope > [data-reorder-item]')];
    const previous = tops.current;
    const next = new Map<Element, number>();
    for (const item of items) {
      const top = item.offsetTop;
      next.set(item, top);
      const before = previous.get(item);
      if (before === undefined || before === top || item.dataset.dragging === 'true' || reducedMotion()) continue;
      item.style.transition = 'none';
      item.style.transform = `translateY(${before - top}px)`;
      requestAnimationFrame(() => {
        item.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
        item.style.transform = '';
      });
    }
    tops.current = next;
  }, [values]);

  return (
    <ReorderContext.Provider value={{ values: latest, onReorder: onReorder as (next: unknown[]) => void, dragging } as GroupContext<unknown>}>
      <ul ref={list} className={className} {...rest}>{children}</ul>
    </ReorderContext.Provider>
  );
}

function Item<T>({ value, className, style, children, onKeyDown, ...rest }: {
  value: T;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLLIElement>, 'children'>) {
  const group = useContext(ReorderContext) as GroupContext<T> | null;
  const ref = useRef<HTMLLIElement>(null);
  const [held, setHeld] = useState(false);
  const drag = useRef<{ pointerY: number; startTop: number; delta: number } | null>(null);

  const follow = () => {
    const element = ref.current;
    const state = drag.current;
    if (!element || !state) return;
    element.style.transform = `translateY(${state.delta - (element.offsetTop - state.startTop)}px)`;
  };

  // After a trade the item has a new layout place; keep it under the pointer.
  useLayoutEffect(() => {
    if (held) follow();
  });

  const start = (event: ReactPointerEvent<HTMLLIElement>) => {
    rest.onPointerDown?.(event);
    if (!group || event.defaultPrevented || event.button !== 0 || !event.isPrimary) return;
    const element = ref.current;
    const list = element?.parentElement;
    if (!element || !list) return;
    drag.current = { pointerY: event.clientY, startTop: element.offsetTop, delta: 0 };
    group.dragging.current = value;
    let moved = false;

    const move = (pointer: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      state.delta = pointer.clientY - state.pointerY;
      if (!moved) {
        if (Math.abs(state.delta) < 3) return;
        moved = true;
        element.dataset.dragging = 'true';
        element.style.transition = 'none';
        setHeld(true);
      }
      pointer.preventDefault();
      follow();
      // Where the held item's middle now is, among the others' middles, in
      // layout terms (offsetTop ignores the slides in flight).
      const middle = state.startTop + state.delta + element.offsetHeight / 2;
      const values = group.values.current;
      const from = values.indexOf(value);
      if (from < 0) return;
      let to = 0;
      for (const other of list.querySelectorAll<HTMLElement>(':scope > [data-reorder-item]')) {
        if (other === element) continue;
        if (middle > other.offsetTop + other.offsetHeight / 2) to += 1;
      }
      if (to === from) return;
      const next = values.filter((entry) => entry !== value);
      next.splice(to, 0, value);
      group.values.current = next;
      group.onReorder(next);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      drag.current = null;
      group.dragging.current = null;
      if (!moved) return;
      delete element.dataset.dragging;
      setHeld(false);
      if (reducedMotion()) {
        element.style.transform = '';
        return;
      }
      element.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
      element.style.transform = '';
    };
    // On the window: the held item moves in the DOM, which would drop a capture.
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const keyMove = (event: ReactKeyboardEvent<HTMLLIElement>) => {
    onKeyDown?.(event);
    if (!group || event.defaultPrevented || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const values = group.values.current;
    const from = values.indexOf(value);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= values.length) return;
    event.preventDefault();
    const next = [...values];
    next.splice(from, 1);
    next.splice(to, 0, value);
    group.values.current = next;
    group.onReorder(next);
  };

  return (
    <li
      ref={ref}
      data-reorder-item=""
      className={className}
      style={{ position: 'relative', touchAction: 'pan-x', ...(held ? { zIndex: 1 } : {}), ...style }}
      {...rest}
      onPointerDown={start}
      onKeyDown={keyMove}
    >
      {children}
    </li>
  );
}

export const Reorder = { Group, Item };
