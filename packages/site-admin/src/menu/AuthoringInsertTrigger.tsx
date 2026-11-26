'use client';

import type { ComponentProps } from 'react';
import { Plus } from 'lucide-react';

/* Styles: theme.css (.sa-insert-trigger). */

/** Shared caret-local insertion affordance; each schema owns the exact anchor. */
export function AuthoringInsertTrigger(props: Omit<ComponentProps<'button'>, 'className' | 'children' | 'type'>) {
  return <button type="button" className="sa-insert-trigger" aria-label="Add at this line" aria-haspopup="menu"
    onPointerDown={event => event.preventDefault()} {...props}><Plus size={18} aria-hidden="true" /></button>;
}
