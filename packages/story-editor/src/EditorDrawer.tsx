import { useRef, type ReactNode, type RefObject } from 'react';
import { Dialog, Popover } from 'radix-ui';
import { X } from 'lucide-react';
import { drawerStyles as styles, chromeStyles } from './classes.js';

/*
 * The editor's on-demand settings surfaces. Nothing here is docked beside the
 * page: a region's settings open in a popover next to what they configure
 * (a bottom sheet on phones), and story-level settings in one centred dialog.
 * All of them close with Esc and give focus back to whatever opened them.
 */

/** Anything a popover can point at: an element, or a virtual point on one. */
export interface SettingsAnchor { getBoundingClientRect: () => DOMRect }

/** Esc inside a text control cancels that edit (the inspector listens for it);
 *  it must not also close the surface around it. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && ['text', 'url', 'number', 'search', 'email'].includes(target.type);
}

function focusSettingsInput(content: HTMLElement | null, selector?: string): boolean {
  const target = selector ? content?.querySelector<HTMLElement>(selector) : null;
  if (!target || target.matches(':disabled')) return false;
  for (let fold = target.closest('details'); fold; fold = fold.parentElement?.closest('details') ?? null) fold.open = true;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  return true;
}

function restoreTriggerFocus(original: HTMLElement | null, findReplacementTrigger?: () => HTMLElement | null) {
  const trigger = original?.isConnected ? original : findReplacementTrigger?.();
  trigger?.focus({ preventScroll: true });
}

const closeButton = chromeStyles.drawerCloseButton;
const surfaceHeader = chromeStyles.drawerSurfaceHeader;
const compactClose = chromeStyles.drawerIcon;
const surfaceSubtitle = chromeStyles.drawerSurfaceSubtitle;
const surfaceTitle = chromeStyles.drawerSurfaceTitle;
/* `relative` makes the scrolling body the containing block for anything
   absolutely placed inside it (a visually hidden radio, a badge). Otherwise
   that element belongs to the fixed frame, overflows it, and focusing it
   scrolls the frame itself — the whole surface goes blank. */
const surfaceBody = chromeStyles.drawerSurfaceBody;

/**
 * A region's settings, anchored to the thing they configure: the block handle,
 * or the media frame that was clicked. Non-modal, so the page stays readable
 * and a click elsewhere on it simply closes the popover.
 */
export function SettingsPopover({
  open,
  onOpenChange,
  anchorRef,
  side = 'bottom',
  title,
  subtitle,
  compact = false,
  returnFocusRef,
  findReplacementTrigger,
  initialFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the popover points at. Re-read on every render, so it can change between opens. */
  anchorRef: RefObject<SettingsAnchor | null>;
  /** `right` for a point on media, so the popover can use the viewport's full
   *  height beside it; `bottom` under the handle, clear of the block's first line. */
  side?: 'bottom' | 'right';
  title: string;
  subtitle?: string;
  compact?: boolean;
  /** Receives focus when the popover closes with Esc or its close button. */
  returnFocusRef: RefObject<HTMLElement | null>;
  findReplacementTrigger?: () => HTMLElement | null;
  initialFocus?: string;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  // A click on the page closes the popover; focus belongs where that click
  // landed, not back on the handle.
  const dismissedByOutsideRef = useRef(false);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          side={side}
          align={compact ? 'end' : 'start'}
          sideOffset={compact || side === 'right' ? 12 : 8}
          // Keep clear of the sticky top bar (48px) rather than covering it.
          collisionPadding={{ top: 64, right: 16, bottom: 16, left: 16 }}
          // The handle moves by transform, and a point on media moves with
          // scroll; floating-ui's observers miss both.
          updatePositionStrategy="always"
          tabIndex={-1}
          aria-label={title}
          data-story-editor-action
          className={`${styles.popover} ${chromeStyles.drawerContent}`}
          onOpenAutoFocus={(event) => {
            // Land on the popover itself, not its first field: opening
            // settings must not start editing anything.
            event.preventDefault();
            dismissedByOutsideRef.current = false;
            if (!focusSettingsInput(contentRef.current, initialFocus)) contentRef.current?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            // Esc in text, or in an enlarged image's own dialog, is theirs.
            if (isTextEntry(event.target) || (event.target instanceof Element && event.target.closest('dialog[open]'))) event.preventDefault();
          }}
          onInteractOutside={() => {
            dismissedByOutsideRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!dismissedByOutsideRef.current) restoreTriggerFocus(returnFocusRef.current, findReplacementTrigger);
            dismissedByOutsideRef.current = false;
          }}
        >
          <div className={surfaceHeader}>
            <div className={chromeStyles.drawerPart}>
              <p className={surfaceTitle}>{title}</p>
              {subtitle && <p className={surfaceSubtitle} title={subtitle}>{subtitle}</p>}
            </div>
            <Popover.Close className={compact ? `${closeButton} ${compactClose}` : closeButton} aria-label={compact ? `Close ${title}` : `Close ${title} settings`}>
              <X aria-hidden="true" className={chromeStyles.drawerIcon2} strokeWidth={1.75} />
            </Popover.Close>
          </div>
          <div className={`${surfaceBody} ${compact ? chromeStyles.drawerPartOn : chromeStyles.drawerPartOff}`}>{children}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * A modal settings surface: `bottom` is a phone's bottom sheet for a region's
 * settings, `center` the story settings dialog (full screen on phones).
 * Radix traps focus, handles Esc and locks page scroll.
 */
export function SettingsSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  compact = false,
  placement,
  wide = false,
  returnFocusRef,
  findReplacementTrigger,
  initialFocus,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  compact?: boolean;
  placement: 'bottom' | 'center';
  /** `center` only: room for two versions side by side. */
  wide?: boolean;
  /** Receives focus when the sheet closes; Radix has no trigger to fall back to. */
  returnFocusRef: RefObject<HTMLElement | null>;
  findReplacementTrigger?: () => HTMLElement | null;
  initialFocus?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const frame = placement === 'bottom'
    ? `${styles.bottomSheet} ${chromeStyles.drawerFrameOn}`
    : `${styles.dialog} ${chromeStyles.drawerFrameOff} ${wide ? chromeStyles.drawerFrameOn2 : chromeStyles.drawerFrameOff3} ${chromeStyles.drawerFrameOff2}`;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={`${styles.overlay} ${chromeStyles.drawerOverlay}`} />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            if (!initialFocus) return;
            event.preventDefault();
            if (!focusSettingsInput(contentRef.current, initialFocus)) contentRef.current?.focus({ preventScroll: true });
          }}
          aria-describedby={undefined}
          data-story-editor-action
          className={`${frame} ${chromeStyles.drawerContent2}`}
          onEscapeKeyDown={(event) => {
            // Esc in text, or in an enlarged image's own dialog, is theirs.
            if (isTextEntry(event.target) || (event.target instanceof Element && event.target.closest('dialog[open]'))) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreTriggerFocus(returnFocusRef.current, findReplacementTrigger);
          }}
        >
          <div className={surfaceHeader}>
            <div className={chromeStyles.drawerPart}>
              <Dialog.Title className={surfaceTitle}>{title}</Dialog.Title>
              {subtitle && <p className={surfaceSubtitle} title={subtitle}>{subtitle}</p>}
            </div>
            <Dialog.Close className={compact ? `${closeButton} ${compactClose}` : closeButton} aria-label={`Close ${title}`}>
              <X aria-hidden="true" className={chromeStyles.drawerIcon2} strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <div className={`${surfaceBody} ${compact ? chromeStyles.drawerPartOn : chromeStyles.drawerPartOff}`}>{children}</div>
          {footer && <div className={chromeStyles.drawerPart2}>{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
