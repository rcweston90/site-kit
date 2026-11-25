import { useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { DropdownMenu } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { EmptySlot, SPACER_LABEL, SPACER_SIZES, ShotSlot, blockStyles, type MediaEmptySlotProps, type SlotDrop, type SpacerControlProps, type SpacerSize, type StoryEditingSlots } from '@rcweston/story-react';
import { InlineStoryAdd, InlineStoryText } from './InlineStoryText.js';
import { StoryProseEditor } from './StoryProseEditor.js';
import { CtaEditor } from './CtaEditor.js';
import { useFileDrop, useStoryMediaUpload, type UploadedStoryMedia } from './media-upload-client.js';
import { utilityStyles } from './classes.js';
import { menuItemClass, menuSurfaceClass } from './menu.js';

/** A spacer's own size control, drawn in the room it makes. */
function SpacerControl({ size, onChange }: SpacerControlProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={blockStyles.spacerControl} aria-label={`Spacer size: ${SPACER_LABEL[size]}`}>
        <span>Spacer</span>
        <strong>{SPACER_LABEL[size]}</strong>
        <ChevronDown aria-hidden="true" className={blockStyles.spacerChevron} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} collisionPadding={12} className={`${menuSurfaceClass} ${blockStyles.spacerMenu}`}>
          <DropdownMenu.RadioGroup value={size} onValueChange={(value) => onChange(value as SpacerSize)}>
            {SPACER_SIZES.map((choice) => (
              <DropdownMenu.RadioItem key={choice.value} value={choice.value} className={menuItemClass}>
                <span className={blockStyles.spacerCheck}>
                  <DropdownMenu.ItemIndicator><Check aria-hidden="true" width={16} height={16} /></DropdownMenu.ItemIndicator>
                </span>
                {choice.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Media with nothing to show yet. Clicking it opens its settings (the editor
 * shell does that); dropping a file on it uploads the file and fills the
 * slot, as one undoable change.
 */
function MediaEmptySlot({ media, aspect, editor, path, selectionId }: MediaEmptySlotProps) {
  // The upload finishes after renders this one never sees, so it applies to
  // the media, path and editor as they are by then.
  const latest = useRef({ editor, path, media });
  useLayoutEffect(() => {
    latest.current = { editor, path, media };
  });

  const apply = (uploaded: UploadedStoryMedia) => {
    const { editor: current, path: at, media: before } = latest.current;
    // The inline-edit bracket is how the page records a change, so the drop
    // is one undo step however many fields it sets.
    current.onTextEditStart();
    if (uploaded.kind !== before.kind) flushSync(() => current.onTextInput([...at, 'kind'], uploaded.kind));
    // The shape goes in before the source: writing the source swaps this
    // slot for the media.
    if (uploaded.aspect) {
      const step = latest.current;
      const measured = uploaded.aspect;
      flushSync(() => step.editor.onTextInput([...step.path, 'aspect'], measured));
    }
    const next = latest.current;
    next.editor.onTextInput([...next.path, 'src'], uploaded.src);
    next.editor.onTextEditEnd();
  };

  const upload = useStoryMediaUpload(apply);
  const busy = upload.state.status === 'uploading';
  const { over, handlers } = useFileDrop(busy ? null : (file) => {
    editor.onSelect(selectionId);
    upload.start(file);
  });
  const drop: SlotDrop | undefined = upload.available
    ? { state: over ? 'over' : busy ? 'busy' : upload.state.status === 'error' ? 'error' : 'idle', handlers }
    : undefined;
  const status = over
    ? 'Release to upload.'
    : upload.state.status === 'uploading'
      ? 'Uploading…'
      : upload.state.status === 'error'
        ? upload.state.message
        : undefined;
  const announcement = upload.state.status === 'uploading' ? `Uploading ${upload.state.name}…` : over ? '' : status;

  return (
    <>
      {media.shot
        ? <ShotSlot media={media} aspect={aspect} drop={drop} status={status} />
        : <EmptySlot media={media} aspect={aspect} drop={drop} status={status} busy={busy} dropHint={upload.available} />}
      {/* Announced separately: the slot is an image to assistive tech. */}
      {upload.available && <span className={utilityStyles.visuallyHidden} role="status">{announcement}</span>}
    </>
  );
}

/** What the reader renders in place when the editor drives it. */
export const EDITOR_UI: StoryEditingSlots = {
  InlineText: InlineStoryText,
  InlineAdd: InlineStoryAdd,
  Prose: StoryProseEditor,
  Cta: CtaEditor,
  SpacerControl,
  MediaEmptySlot,
};
