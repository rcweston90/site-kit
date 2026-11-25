
import { chromeStyles } from './classes.js';/** Shared editor menu geometry. Native selects keep native semantics; Radix
 * action menus use the same row, 12px inset, focus, and surface rhythm. Rows
 * are 48px for touch and 36px under a mouse or trackpad, where 48 turned a
 * dozen commands into a sheet taller than the window. */
/** The menu surface without a width, for menus that size themselves. */
export const menuSurfaceClass = chromeStyles.menuMenuSurface;
export const menuContentClass = `${menuSurfaceClass} ${chromeStyles.menuMenuContent}`;
export const menuItemClass = chromeStyles.menuMenuItem;
export const menuLabelClass = chromeStyles.menuMenuLabel;
export const menuSeparatorClass = chromeStyles.menuMenuSeparator;

/** Match the writer's command surface across different caret adapters. */
export const AUTHORING_COMMAND_MENU_MAX_HEIGHT = 360;

export function authoringCommandMenuWidth(viewportWidth: number) {
  return Math.min(352, Math.max(0, viewportWidth - 48));
}
