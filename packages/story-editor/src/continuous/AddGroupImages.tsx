import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import type { StoryMedia } from '@rcweston/story-core';
import { ImageCatalog } from '../ImageCatalog.js';
import { uploadStoryMedia, useStoryMediaUploadTarget } from '../media-upload-client.js';
import { continuousStyles as styles, chromeStyles } from '../classes.js';

export function AddGroupImages({ onAdd, onClose, trigger }: { onAdd: (media: StoryMedia[]) => boolean; onClose: () => void; trigger: HTMLButtonElement }) {
  const target = useStoryMediaUploadTarget();
  const [mode, setMode] = useState<'existing' | 'upload'>(target?.library ? 'existing' : 'upload');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const running = useRef<AbortController | null>(null);
  const stop = () => { running.current?.abort(); running.current = null; };
  useEffect(() => stop, []);
  if (!target) return null;

  const load = async (files: File[]) => {
    if (!files.length || running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setMessage('');
    // All-or-nothing in the document: a rejected file never leaves a partial
    // group, and retrying a selection cannot accidentally append duplicates.
    const results = await Promise.allSettled(files.map(async file => {
      if (!file.type.startsWith('image/')) throw new Error('Choose a supported image file.');
      const { kind, src, aspect } = await uploadStoryMedia(file, target, controller.signal);
      return { kind, src, alt: '', ...(aspect ? { aspect } : {}) } satisfies StoryMedia;
    }));
    const added = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const discardPreviews = () => added.forEach(media => { if (media.src?.startsWith('blob:')) URL.revokeObjectURL(media.src); });
    if (running.current !== controller || controller.signal.aborted) { discardPreviews(); return; }
    running.current = null;
    setBusy(false);
    const errors = results.flatMap((result, index) => result.status === 'rejected'
      ? [`${files[index].name}: ${result.reason instanceof Error ? result.reason.message : 'Could not add this image.'}`] : []);
    const committed = errors.length === 0 && onAdd(added);
    if (!committed) discardPreviews();
    if (committed) onClose();
    else setMessage(errors.length ? errors.join(' ') : 'This block changed. Close and reopen Add image, then try again.');
  };

  return <Dialog.Root open onOpenChange={next => { if (!next) { stop(); onClose(); } }}>
    <Dialog.Portal>
      <Dialog.Overlay className={`${styles.groupUploadOverlay} ${chromeStyles.addGroupImagesOverlay}`} />
      <Dialog.Content className={`${styles.groupUploadDialog} ${chromeStyles.addGroupImagesContent}`} data-catalog={mode === 'existing' || undefined} onCloseAutoFocus={event => {
        event.preventDefault();
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
      }} onPaste={event => {
        const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'));
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        void load(files);
      }}>
        <Dialog.Title>Add images</Dialog.Title>
        {target.library ? <>
          <Dialog.Description>Reuse a saved image, upload a file, or paste an image here.</Dialog.Description>
          <div className={styles.groupUploadModes} role="group" aria-label="Image source">
            <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Choose existing</button>
            <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>Upload new</button>
          </div>
          {mode === 'existing' && <ImageCatalog source={target.library} slug={target.slug} disabled={busy}
            onChoose={(images) => { const ok = onAdd(images); if (ok) onClose(); return ok; }} />}
          {mode === 'upload' && <p>Choose image files below or paste from your clipboard. New images are added at the end.</p>}
        </> : <Dialog.Description>Upload image files or paste an image here. New images are added at the end.</Dialog.Description>}
        <input hidden ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          void load(files);
        }} />
        {busy && <p role="status">Adding images…</p>}
        {message && <p role="alert">{message}</p>}
        <div className={styles.groupUploadActions}>
          <Dialog.Close>Cancel</Dialog.Close>
          {mode === 'upload' && <button type="button" disabled={busy} onClick={() => input.current?.click()}>Choose images</button>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
