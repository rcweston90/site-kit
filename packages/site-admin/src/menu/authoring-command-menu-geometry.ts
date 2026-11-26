/** Match the writer's command surface across different caret adapters. */
export const AUTHORING_COMMAND_MENU_MAX_HEIGHT = 360;

export function authoringCommandMenuWidth(viewportWidth: number) {
  return Math.min(352, Math.max(0, viewportWidth - 48));
}
