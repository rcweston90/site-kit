'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_HEADER_IMAGES, homePaths, type HomeHeaderImage, type HomeHeaderImages as ImageSlots, type HomeHeaderImagesResponse, type HomePhoto as Photo } from '@rcweston/site-data/client';
import { KeptEditsNotice, SaveStatus, explainFailure, useFormSave } from '@rcweston/save-kit';
import { storyMediaUploader, useAdminConfig } from '../../config.js';
import { adminRequest } from '../../request.js';
import { withConflict } from './conflict.js';

const isImageSlots = (value: unknown): value is ImageSlots =>
  Array.isArray(value) && value.length === 3 && value.every((slot) => slot === null || (typeof slot === 'object' && typeof slot.src === 'string'));

const button = 'min-h-11 rounded-md border border-default px-3 text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed';
const field = 'w-full min-h-11 rounded-md border border-default bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';
const fill = 'absolute inset-0 h-full w-full';
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif';

export function HomeHeaderImages() {
  const config = useAdminConfig();
  const url = `${config.siteApi}${homePaths.headerImages()}`;
  const [images, setImages] = useState<ImageSlots>(DEFAULT_HEADER_IMAGES);
  const [saved, setSaved] = useState<ImageSlots>(DEFAULT_HEADER_IMAGES);
  const [version, setVersion] = useState(0);
  const [shots, setShots] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const chooserRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  // Its own save, beside the copy's: ⌘S saves whichever has changes.
  const { dirty, status, kept } = useFormSave({
    storageKey: 'admin:unsaved:home-header-images',
    ready,
    value: images,
    saved,
    accept: isImageSlots,
    onSave: () => void save(),
  });
  const saving = status.pending.length > 0;
  const busy = saving || uploading !== null;

  // State is only set once the request settles, so the mount effect can call
  // this directly. On mount it's already loading with no error; "Try again"
  // resets both first.
  const load = useCallback((isCurrent: () => boolean = () => true) => adminRequest<HomeHeaderImagesResponse>(url)
    .then(data => {
      if (!isCurrent()) return;
      setImages(data.images);
      setSaved(data.images);
      setVersion(data.version);
      setShots(data.shots);
      setReady(true);
    })
    .catch(err => { if (isCurrent()) setError(explainFailure(err, 'loaded')); })
    .finally(() => { if (isCurrent()) setLoading(false); }), [url]);

  function retry() {
    setLoading(true);
    setError('');
    void load();
  }

  // A late answer from an earlier run never overwrites the picks being made.
  useEffect(() => {
    let current = true;
    void load(() => current);
    return () => { current = false; };
  }, [load]);
  useEffect(() => { if (picker !== null) searchRef.current?.focus(); }, [picker]);

  function setSlot(index: number, image: HomeHeaderImage | null) {
    setImages(current => current.map((item, slot) => slot === index ? image : item) as ImageSlots);
  }

  function closePicker() {
    const slot = picker;
    setPicker(null);
    if (slot !== null) chooserRefs.current[slot]?.focus();
  }

  async function upload(index: number, file: File) {
    if (!file.size || file.size > MAX_BYTES) { status.fail('Choose an image smaller than 4 MB.', 'upload'); return; }
    setUploading(index);
    const send = storyMediaUploader(config.storyApi, 'home-header');
    await status.run(async () => ({ image: { source: 'upload', src: await send(file), alt: '' } as HomeHeaderImage }), {
      key: 'upload',
      doing: `Uploading image ${index + 1}…`,
      success: 'Image uploaded. Add a description, then save the header images.',
      done: 'uploaded',
      onSaved: (value) => setSlot(index, value.image),
    });
    setUploading(null);
  }

  /** What's stored now, after a save met a newer one. */
  async function refresh() {
    const data = await adminRequest<HomeHeaderImagesResponse>(url);
    setSaved(data.images);
    setVersion(data.version);
    setShots(data.shots);
  }

  async function save() {
    await status.run(() => withConflict(() => adminRequest<HomeHeaderImagesResponse>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, expectedVersion: version }),
    }), refresh), {
      success: 'Header images saved. The homepage is updating.',
      onSaved: (value) => {
        setImages(value.images);
        setSaved(value.images);
        setVersion(value.version);
        setShots(value.shots);
      },
    });
  }

  function restore() {
    const value = kept.offer?.value;
    kept.restore();
    if (value) setImages(value);
  }

  return <section className="mb-12 border-b border-default pb-12" aria-labelledby="header-images-title">
    <h2 id="header-images-title" className="font-mono text-lg font-bold uppercase tracking-wide">Header images</h2>
    <p className="mt-3 text-sm leading-6 text-foreground-muted">Three image slots, left to right. Choose from Shots or upload a custom image. Changes appear on the homepage after saving.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {kept.offer && <KeptEditsNotice offer={kept.offer} onRestore={restore} onDiscard={kept.discard} className="mt-3" />}
    {loading ? <p role="status" className="mt-6 text-sm">Loading header images…</p> : !ready ? <button type="button" className={`${button} mt-3`} onClick={retry}>Try again</button> : <>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {images.map((image, index) => {
          const photo = image ?? shots[index];
          return <fieldset key={index} className="min-w-0" disabled={busy}>
            <legend className="mb-3 text-sm font-medium">Image {index + 1}</legend>
            <div className="relative aspect-[4/5] max-h-64 overflow-hidden rounded-2xl border border-default bg-card-bg">
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored image at its own address */}
              {photo ? <img src={config.mediaSrc(photo.src)} alt={photo.alt || `Header image ${index + 1}`} className={`${fill} object-cover`} sizes="240px" /> : <span className="absolute inset-0 grid place-items-center text-sm text-foreground-muted">No default photo</span>}
            </div>
            <p className="my-3 text-xs text-foreground-muted">{image ? image.source === 'shots' ? 'From Shots' : 'Custom upload' : `Default · Shot ${index + 1}`}</p>
            <div className="flex flex-col gap-3">
              <button ref={element => { chooserRefs.current[index] = element; }} type="button" className={button} aria-expanded={picker === index} aria-controls="header-shots-picker" onClick={() => { setPicker(picker === index ? null : index); setQuery(''); }}>Choose from Shots</button>
              <label className="block text-xs text-foreground-muted" htmlFor={`header-upload-${index}`}>Upload image · JPG, PNG, WebP, AVIF · 4 MB max</label>
              <input id={`header-upload-${index}`} type="file" accept={ACCEPT} aria-label={`Upload header image ${index + 1}`} className="w-full min-w-0 text-xs file:mr-2 file:min-h-11 file:rounded-md file:border file:border-default file:bg-background file:px-3 file:text-foreground" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(index, file); }} />
              <label className="text-xs text-foreground-muted" htmlFor={`header-alt-${index}`}>Image description</label>
              <input id={`header-alt-${index}`} className={field} value={photo?.alt ?? ''} maxLength={300} disabled={!photo || busy} onChange={event => { if (photo) setSlot(index, { source: image?.source ?? 'shots', src: photo.src, alt: event.target.value }); }} />
              <button type="button" className={button} disabled={!image || busy} onClick={() => setSlot(index, null)}>Use default</button>
            </div>
          </fieldset>;
        })}
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape closes this inline picker and returns focus to its trigger. */}
      {picker !== null && <div id="header-shots-picker" role="group" aria-label={`Choose a shot for image ${picker + 1}`} className="mt-6 rounded-lg border border-default p-3" onKeyDown={event => { if (event.key === 'Escape') closePicker(); }}>
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Shots · image {picker + 1}</h3><button type="button" className={button} onClick={closePicker}>Close</button></div>
        <input ref={searchRef} type="search" aria-label="Filter shots" placeholder="Filter by description" value={query} onChange={event => setQuery(event.target.value)} className={`${field} mt-3`} />
        <div className="mt-3 grid max-h-96 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a stored image at its own address */}
          {shots.filter(shot => shot.alt.toLowerCase().includes(query.toLowerCase())).map((shot, index) => <button key={shot.src} type="button" disabled={busy} aria-label={`Use shot ${index + 1}: ${shot.alt || 'Untitled photo'}`} className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-default focus-visible:outline-2 focus-visible:outline-offset-2 hover:ring-2 hover:ring-foreground" onClick={() => { setSlot(picker, { source: 'shots', src: shot.src, alt: shot.alt }); closePicker(); }}><img src={config.mediaSrc(shot.src)} alt={shot.alt} loading="lazy" sizes="180px" className={`${fill} object-cover`} style={{ objectPosition: shot.objectPosition }} /></button>)}
        </div>
        {!shots.length && <p className="my-3 text-sm text-foreground-muted">Your Shots library is empty. You can upload a custom image above.</p>}
        {!!shots.length && !shots.some(shot => shot.alt.toLowerCase().includes(query.toLowerCase())) && <p className="my-3 text-sm text-foreground-muted">No matching shots.</p>}
      </div>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" className={`${button} bg-foreground text-background hover:opacity-90 hover:bg-foreground`} disabled={busy || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save header images'}</button><button type="button" className={button} disabled={busy || !dirty} onClick={() => { setImages(saved); status.clear(); }}>Discard image changes</button></div>
      <SaveStatus status={status} dirty={dirty} className="mt-3" />
    </>}
  </section>;
}
