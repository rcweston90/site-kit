'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ImageOff } from 'lucide-react';
import type { StoryMedia } from '@rcweston/story-core';

/** One image the library offers (the shape `@rcweston/site-data`'s media library answers with). */
export interface ImageCatalogItem {
  key?: string;
  src: string;
  label: string;
  /** The story folder it was uploaded to. */
  source: string;
  access: 'public' | 'protected';
  /** Whether it can be put in the story being edited. */
  available: boolean;
  usedIn?: { slug: string; title: string }[];
}

export interface ImageCatalogPage {
  items: ImageCatalogItem[];
  next: string | null;
  /** False when a group scope found no group for the story. */
  assigned?: boolean;
}

export interface ImageCatalogQuery {
  scope: string;
  slug?: string;
  after?: string;
}

/** Where the library's images come from: your handler, or a fixture. */
export interface ImageLibrarySource {
  load(query: ImageCatalogQuery, options: { signal: AbortSignal }): Promise<ImageCatalogPage>;
  /** The scopes offered while editing a story, first is the default. Default: this story, all images. */
  scopes?: { key: string; label: string }[];
}

const DEFAULT_SCOPES = [{ key: 'story', label: 'This case study' }, { key: 'all', label: 'All images' }];

const css = {
  catalog: 'story-editor-image-catalog',
  scopes: 'story-editor-image-catalog-scopes',
  action: 'story-editor-image-catalog-action',
  primary: 'story-editor-image-catalog-primary',
  filter: 'story-editor-image-catalog-filter',
  images: 'story-editor-image-catalog-images',
  card: 'story-editor-image-catalog-card',
  thumbnail: 'story-editor-image-catalog-thumbnail',
  checked: 'story-editor-image-catalog-checked',
  imageName: 'story-editor-image-catalog-name',
  imageInfo: 'story-editor-image-catalog-info',
  selectionBar: 'story-editor-image-catalog-selection',
  textButton: 'story-editor-image-catalog-text-button',
};

/**
 * Every uploaded image, browsable and filterable. With `onChoose` (inside the
 * editor's Add images) the cards select, and the chosen images go into the
 * block; without it (the admin's image library) it's a catalogue to look at.
 */
export function ImageCatalog({ source, slug, onChoose, disabled }: {
  source: ImageLibrarySource;
  /** The story being edited: offers its own scope and marks what it can use. */
  slug?: string;
  onChoose?: (items: StoryMedia[]) => boolean;
  disabled?: boolean;
}) {
  const scopes = source.scopes ?? DEFAULT_SCOPES;
  const [scope, setScope] = useState<string>(slug ? scopes[0]!.key : 'all');
  const [page, setPage] = useState<ImageCatalogPage | null>(null);
  const [filter, setFilter] = useState('');
  const [selection, setSelection] = useState<ImageCatalogItem[]>([]);
  const [rejected, setRejected] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [clipped, setClipped] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const aspect = useRef(new Map<string, number>());
  const load = async (signal: AbortSignal, after?: string) => {
    const result = await source.load({ scope, ...(slug ? { slug } : {}), ...(after ? { after } : {}) }, { signal });
    if (signal.aborted) return;
    setPage((previous) => after && previous
      ? { ...result, items: [...previous.items, ...result.items.filter((item) => !previous.items.some((known) => known.src === item.src))] }
      : result);
    setStatus('ready');
  };
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    // Stage the reset outside React's render and before displaying results.
    queueMicrotask(() => {
      if (abort.signal.aborted) return;
      setPage(null);
      setStatus('loading');
      setClipped([]);
      void load(abort.signal).catch(() => { if (!abort.signal.aborted) setStatus('error'); });
    });
    return () => abort.abort();
    // load reads the current scope and slug; page only affects Load more.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, slug, source, attempt]);

  const matches = page?.items.filter((item) => `${item.label} ${item.source.replaceAll('-', ' ')} ${item.usedIn?.map((use) => use.title).join(' ') ?? ''}`.toLowerCase().includes(filter.toLowerCase().trim())) ?? [];
  return <div className={css.catalog}>
    {slug && <div className={css.scopes} role="group" aria-label="Image scope">
      {scopes.map((item) => <button type="button" key={item.key} aria-pressed={scope === item.key}
        onClick={() => { if (item.key === scope) return; setPage(null); setStatus('loading'); setScope(item.key); setSelection([]); setRejected(false); }}>
        {item.label}
      </button>)}
    </div>}
    <label className={css.filter}>Filter loaded images
      <input type="search" value={filter} onChange={(event) => setFilter(event.currentTarget.value)} placeholder="Image or case study" />
    </label>
    {page?.assigned === false && <p role="status">This case study isn’t in a group yet. Try another scope.</p>}
    {page?.assigned !== false && status === 'ready' && !matches.length
      && <p role="status">{filter.trim() ? 'No loaded images match.' : page?.next ? 'No images on this page. Load more to keep browsing.' : 'No images in this scope.'}</p>}
    {matches.length > 0 && <ul className={css.images}>
      {matches.map((item) => {
        const selected = selection.some((value) => value.src === item.src);
        const unavailable = Boolean(onChoose && !item.available);
        const card = <>
          <span className={css.thumbnail}>{clipped.includes(item.src) ? <ImageOff size={20} aria-hidden="true" /> :
            // Protected thumbnails use the browser's session, never a public image proxy.
            <img alt="" src={item.src} loading="lazy" onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) aspect.current.set(item.src, Math.round(naturalWidth / naturalHeight * 10000) / 10000);
            }} onError={() => setClipped((previous) => [...previous, item.src])} />}
            {selected && <span className={css.checked}><Check size={16} aria-hidden="true" /></span>}
          </span>
          <span className={css.imageName}>{item.label}</span>
          <span className={css.imageInfo}>{item.source.replaceAll('-', ' ')} · {item.access === 'public' ? 'Public' : 'Signed-in only'}</span>
          {item.usedIn && <span className={css.imageInfo}>{item.usedIn.length ? `Used in ${item.usedIn.map((use) => use.title).join(', ')}` : 'Not found in saved stories'}</span>}
          {unavailable && <span className={css.imageInfo}>Not available on this case study</span>}
        </>;
        return <li key={item.src}>{onChoose ? <button type="button" className={css.card} aria-pressed={selected}
          disabled={disabled || unavailable || clipped.includes(item.src)} onClick={() => {
            setRejected(false);
            setSelection((previous) => selected ? previous.filter((value) => value.src !== item.src) : [...previous, item]);
          }}>{card}</button> : <div className={css.card}>{card}</div>}</li>;
      })}
    </ul>}
    {status === 'loading' && <p role="status">Loading images…</p>}
    {status === 'error' && <p role="alert">Couldn’t load the image library. <button type="button" className={css.textButton} onClick={() => setAttempt(attempt + 1)}>Try again</button></p>}
    {page?.next && status !== 'error' && <button type="button" className={css.action} disabled={status === 'loading'} onClick={() => {
      setStatus('loading');
      const signal = controller.current?.signal;
      if (signal) void load(signal, page.next ?? undefined).catch(() => { if (!signal.aborted) setStatus('error'); });
    }}>Load more images</button>}
    {rejected && <p role="alert">This block changed. Reopen Add image and try again.</p>}
    {onChoose && <div className={css.selectionBar}>
      <span role="status">{selection.length ? `${selection.length} selected` : 'Select images to reuse'}</span>
      <button type="button" className={css.primary} disabled={!selection.length || disabled} onClick={() => {
        const items = selection.filter((item) => item.available && !clipped.includes(item.src));
        if (items.length !== selection.length || !onChoose(items.map((item) => ({ kind: 'image' as const, src: item.src, alt: '', ...(aspect.current.has(item.src) ? { aspect: aspect.current.get(item.src) } : {}) })))) setRejected(true);
      }}>{selection.length > 1 ? `Add ${selection.length} images` : 'Add selected image'}</button>
    </div>}
  </div>;
}

/** A source backed by `@rcweston/site-data`'s media-library route (default `/api/site/media-library`). */
export function fetchImageLibrary(url = '/api/site/media-library', scopes?: ImageLibrarySource['scopes']): ImageLibrarySource {
  return {
    scopes,
    async load(query, { signal }) {
      const params = new URLSearchParams({ scope: query.scope });
      if (query.slug) params.set('slug', query.slug);
      if (query.after) params.set('after', query.after);
      const response = await fetch(`${url}?${params}`, { signal, cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not load images.');
      return (await response.json()) as ImageCatalogPage;
    },
  };
}
