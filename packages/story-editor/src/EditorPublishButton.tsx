import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { ArrowUpRight, Check, ChevronRight, Upload } from 'lucide-react';
import type { Story } from '@rcweston/story-core';
import { validatePublication, type PublicationReadiness } from '@rcweston/story-core';
import { publicationTarget } from './publication-target.js';
import { describePublicationIssues, type PublicationChecklistRow } from './publication-issue-labels.js';

import { chromeStyles } from './classes.js';
export interface EditorPublishButtonProps {
  /** Phone bars use a shorter trigger; the full confirmation remains in the popover. */
  compact?: boolean;
  /** One-row phone toolbars use an icon while retaining the full accessible
   *  action name and the complete review gate in the popover. */
  iconOnly?: boolean;
  /** The story as it stands in the editor, unsaved edits included — the
   *  checklist judges what would go live, not the last save. */
  story: Story;
  hasUnsavedChanges: boolean;
  savedReadiness?: PublicationReadiness;
  /** Version currently live; `null` when the story has never been published. */
  publishedVersion: number | null;
  /** Latest saved version number; 0 when nothing has been saved yet. */
  latestVersion: number;
  /** The live version is the latest save and nothing is unsaved. */
  isPublishedCurrent: boolean;
  /** Why publishing isn't possible right now (e.g. turned off here); shown in
   *  place of the publish action. */
  disabledReason: string | null;
  publishing: boolean;
  /** Saves first when needed, then publishes. `acknowledgeWarnings` is true
   *  when the person published past notes. Rejecting shows a retry line. */
  onPublish: (acknowledgeWarnings: boolean) => Promise<void>;
  /** Selects and scrolls to a canvas region (`data-story-editor-id`). */
  onShowIssue: (row: PublicationChecklistRow, returnFocus: HTMLElement | null) => void;
  /** Public URL once published. */
  liveHref: string | null;
}

const focusRing = chromeStyles.publishButtonFocusRing;
const primaryAction = `${chromeStyles.publishButtonPrimaryAction} ${focusRing}`;
// mb-0: the global `p` rule adds a baseline under every paragraph; these
// lines stack as lockups and the popover owns its own spacing.
const mutedLine = chromeStyles.publishButtonMutedLine;
const checklistRow = chromeStyles.publishButtonChecklistRow;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The editor's one publish control. It never asks "are you sure?" — the
 * popover is the confirmation, and it doubles as a checklist: anything that
 * would block or degrade the live page is listed in plain words, and each row
 * jumps to the spot on the canvas that needs it. Unfinished parts don't stop
 * a publish; the button carries their count, before and after, so they stay
 * in view until they're done.
 */
export default function EditorPublishButton({
  compact = false,
  iconOnly = false,
  story,
  hasUnsavedChanges,
  savedReadiness,
  publishedVersion,
  latestVersion,
  isPublishedCurrent,
  disabledReason,
  publishing,
  onPublish,
  onShowIssue,
  liveHref,
}: EditorPublishButtonProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Set when a checklist row closes the popover, so focus follows the jump
   *  to the canvas instead of snapping back to this button. */
  const jumpingRef = useRef(false);
  const headingId = useId();

  // The count on the button follows the text, so the checks run on every
  // edit — deferred, so they never hold up typing.
  const deferredStory = useDeferredValue(story);
  const checkedStory = open ? story : deferredStory;
  const rows = useMemo<PublicationChecklistRow[]>(() => {
    const readiness = validatePublication(checkedStory);
    return describePublicationIssues(checkedStory, [...readiness.errors, ...readiness.warnings, ...(savedReadiness?.errors ?? []), ...(savedReadiness?.warnings ?? [])]);
  }, [checkedStory, savedReadiness]);
  const errors = rows.filter((row) => row.severity === 'error');
  const notes = rows.filter((row) => row.severity === 'warning');
  const noteCount = notes.length;

  const actionLabel = publishedVersion === null ? 'Publish' : 'Publish changes';
  const triggerLabel = publishing
    ? 'Publishing…'
    : isPublishedCurrent
      ? 'Published'
      : publishedVersion === null
        ? 'Review and publish'
        : 'Review and publish changes';
  const savesFirst = hasUnsavedChanges || latestVersion === 0;

  const publish = async () => {
    setFailed(false);
    try {
      // Only the gate's own notes are acknowledged to the server; the
      // original-version note is the browser's, and the server never asks.
      await onPublish(notes.length > 0);
    } catch {
      setFailed(true);
    }
  };

  const showIssue = (row: PublicationChecklistRow) => {
    jumpingRef.current = true;
    setOpen(false);
    onShowIssue(row, triggerRef.current);
  };


  let heading: string;
  let detail: string | null = null;
  if (isPublishedCurrent) {
    heading = notes.length > 0 ? `Live, with ${plural(notes.length, 'note', 'notes')}` : 'Published';
    detail = notes.length > 0 ? 'Your latest changes are live. Choose a note to go to what needs attention.' : 'Your latest changes are live.';
  } else if (errors.length > 0) {
    heading = `${plural(errors.length, 'thing', 'things')} to fix before publishing`;
  } else if (noteCount > 0) {
    heading = `Ready, with ${plural(noteCount, 'note', 'notes')}`;
  } else {
    heading = 'Everything looks good.';
  }
  // Once live, only the page's own gaps are still worth listing.
  const hasList = isPublishedCurrent ? notes.length > 0 : rows.length > 0;
  // The same count the popover's heading gives.
  const flagCount = isPublishedCurrent ? notes.length : errors.length + noteCount;
  const flag = flagCount > 0 && !publishing && (
    <span
      aria-hidden="true"
      title={`${plural(flagCount, 'note', 'notes')} — open to see ${flagCount === 1 ? 'it' : 'them'}`}
      // The published button already spaces its contents (gap-2).
      className={`${chromeStyles.publishButtonKeys} ${iconOnly
        ? `${chromeStyles.publishButtonPinnedOn} ${isPublishedCurrent ? chromeStyles.publishButtonPartOn : chromeStyles.publishButtonPartOff}`
        : `${chromeStyles.publishButtonPartOff2} ${isPublishedCurrent ? chromeStyles.publishButtonPartOn : chromeStyles.publishButtonPartOff3}`}`}
    >{flagCount}</span>
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // A publish in flight keeps its status on screen until it settles.
        if (!next && publishing) return;
        if (next) setFailed(false);
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          // Where Review hands focus when the notice that opened it is gone.
          data-editor-publish-trigger
          aria-description={flagCount > 0 ? plural(flagCount, 'note', 'notes') : undefined}
          aria-label={iconOnly ? triggerLabel : undefined}
          title={iconOnly ? triggerLabel : undefined}
          disabled={publishing}
          className={
            isPublishedCurrent
              ? `${chromeStyles.publishButtonRowOn} ${iconOnly ? chromeStyles.publishButtonButtonOn : chromeStyles.publishButtonButtonOff} ${chromeStyles.publishButtonHintOn} ${focusRing}`
              : `${chromeStyles.publishButtonRowOff} ${iconOnly ? chromeStyles.publishButtonButtonOn : chromeStyles.publishButtonButtonOff} ${chromeStyles.publishButtonSmallTextOff} ${focusRing}`
          }
        >
          {iconOnly ? (
            isPublishedCurrent
              ? <Check aria-hidden="true" className={chromeStyles.publishButtonIcon} />
              : <Upload aria-hidden="true" className={chromeStyles.publishButtonIcon} />
          ) : publishing ? (
            'Publishing…'
          ) : isPublishedCurrent ? (
            <><Check aria-hidden="true" className={chromeStyles.publishButtonIcon} />Published</>
          ) : publishedVersion === null ? (
            compact ? 'Publish' : 'Review & publish'
          ) : (
            // The long label crowds a phone-width top bar; the popover says
            // "Publish changes" either way.
            compact ? 'Publish' : 'Review & publish'
          )}
          {flag}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-story-editor-action
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={headingId}
          className={chromeStyles.publishButtonContent}
          onEscapeKeyDown={(event) => { if (publishing) event.preventDefault(); }}
          onInteractOutside={(event) => { if (publishing) event.preventDefault(); }}
          onCloseAutoFocus={(event) => {
            if (!jumpingRef.current) return;
            jumpingRef.current = false;
            event.preventDefault();
            // The shell may move focus to the region it scrolled to. If it
            // doesn't, keep focus on this button rather than dropping it on the
            // page, without scrolling the bar back into view.
            requestAnimationFrame(() => {
              const active = document.activeElement;
              if (!active || active === document.body) triggerRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <div className={chromeStyles.publishButtonPart}>
            <div className={chromeStyles.publishButtonPart2} aria-live="polite">
              <p id={headingId} className={chromeStyles.publishButtonRow}>
                {isPublishedCurrent && <Check aria-hidden="true" className={chromeStyles.publishButtonIcon} />}
                {heading}
              </p>
              {detail && <p className={mutedLine}>{detail}</p>}
            </div>

            {hasList && errors.length > 0 && <ChecklistRows story={checkedStory} rows={errors} onShow={showIssue} />}
            {isPublishedCurrent && hasList && <ChecklistRows story={checkedStory} rows={notes} onShow={showIssue} />}
            {!isPublishedCurrent && hasList && noteCount > 0 && (
              <>
                {errors.length > 0 && <p className={`${chromeStyles.publishButtonP} ${mutedLine}`}>Notes</p>}
                {notes.length > 0 && <ChecklistRows story={checkedStory} rows={notes} onShow={showIssue} />}
              </>
            )}
          </div>

          {!(isPublishedCurrent && !liveHref) && <div className={`${chromeStyles.publishButtonPart3} ${hasList ? chromeStyles.publishButtonPartOn2 : ''}`}>
            {isPublishedCurrent ? (
              liveHref && (
                <a
                  href={liveHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${chromeStyles.publishButtonRow2} ${focusRing}`}
                >
                  View live
                  <ArrowUpRight aria-hidden="true" className={chromeStyles.publishButtonIcon} />
                  <span className={chromeStyles.publishButtonVisuallyHidden}>(opens in a new tab)</span>
                </a>
              )
            ) : disabledReason ? (
              <p className={mutedLine}>{disabledReason}</p>
            ) : (
              <>
                {failed && !hasList && <p role="alert" className={chromeStyles.publishButtonAlert}>Couldn’t publish. Try again.</p>}
                {savesFirst && errors.length === 0 && (
                  <p className={mutedLine}>{hasUnsavedChanges ? 'Your changes will be saved first.' : 'The story will be saved first.'}</p>
                )}
                <button
                  type="button"
                  className={`${primaryAction} ${failed || (savesFirst && errors.length === 0) ? chromeStyles.publishButtonButtonOn2 : ''}`}
                  disabled={publishing || errors.length > 0}
                  onClick={publish}
                >
                  {publishing ? 'Publishing…' : noteCount > 0 && errors.length === 0 ? 'Publish anyway' : actionLabel}
                </button>
              </>
            )}
          </div>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ChecklistRows({ story, rows, onShow }: { story: Story; rows: PublicationChecklistRow[]; onShow: (row: PublicationChecklistRow) => void }) {
  return (
    <ul>
      {rows.map((row) => (
        <li key={`${row.severity}|${row.code}|${row.path}`}>
          <button
            type="button"
            className={checklistRow}
            onClick={() => onShow(row)}
          >
            <span className={chromeStyles.publishButtonPart4}>
              <span className={chromeStyles.publishButtonSmallText}>{row.what}</span>
              <span className={chromeStyles.publishButtonHint}>{row.where}</span>
              <span className={chromeStyles.publishButtonSmallText2}>{
                row.code === 'missing-media-alt' ? 'Edit alt text'
                  : row.code === 'invalid-media-source' ? 'Check the source'
                  : publicationTarget(story, row).kind === 'settings' ? 'Open settings'
                  : publicationTarget(story, row).kind === 'section' ? 'Show on page'
                  : 'Go to text'
              }</span>
            </span>
            <ChevronRight aria-hidden="true" className={chromeStyles.publishButtonIcon2} />
          </button>
        </li>
      ))}
    </ul>
  );
}
