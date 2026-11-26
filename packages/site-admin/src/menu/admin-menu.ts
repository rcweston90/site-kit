/** Shared admin menu geometry. Native selects keep native semantics; Radix
 * action menus use the same row, 12px inset, focus, and surface rhythm. Rows
 * are 48px for touch and 36px under a mouse or trackpad, where 48 turned a
 * dozen commands into a sheet taller than the window. */
/** The menu surface without a width, for menus that size themselves. */
export const adminMenuSurfaceClass = 'z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-56 overflow-y-auto overscroll-contain rounded-md border border-default bg-card-bg p-half text-foreground shadow-lg';
export const adminMenuContentClass = `${adminMenuSurfaceClass} w-[min(22rem,calc(100vw-3rem))]`;
export const adminMenuItemClass = 'relative flex min-h-12 pointer-fine:min-h-9 cursor-default select-none items-center gap-3 rounded-sm px-3 text-sm leading-baseline text-foreground outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary';
export const adminMenuLabelClass = 'flex min-h-12 pointer-fine:min-h-9 items-center truncate px-3 font-mono text-xs uppercase leading-baseline tracking-wider text-foreground-muted';
export const adminMenuSeparatorClass = 'mx-3 my-half h-px bg-default';
