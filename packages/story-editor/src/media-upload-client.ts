import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { UploadedMedia } from '@rcweston/story-core';
import { SaveRequestError, explainFailure, markSessionEnded } from '@rcweston/save-kit';
import {
  STORY_UPLOAD_SIGNATURE_BYTES,
  UPLOAD_ERRORS,
  checkStoryUpload,
  matchesStoryUploadSignature,
  signatureError,
  type StoryUploadKind,
} from './upload-checks.js';

/*
 * Uploading an image or clip from the editor — from the media settings
 * popover, or by dropping a file on an empty slot on the page. Both go
 * through `useStoryMediaUpload`, so they check, upload and report the same way.
 */

/** Which story an upload belongs to, and how a file gets there. */
export interface StoryMediaUploadTarget {
  /** The story's address: the folder its uploads land in. */
  slug: string;
  /** The transport's `uploadMedia`. */
  upload: (file: File, context: { slug: string; signal?: AbortSignal }) => Promise<UploadedMedia>;
  /** The largest file the server takes. Default 4 MB. */
  maxBytes?: number;
}

/** Provided by the editor shell. Without it the upload controls stay hidden. */
export const StoryMediaUploadContext = createContext<StoryMediaUploadTarget | null>(null);
/** Lets read-only asset node views show local object URLs without enabling the reader. */
export const StoryMediaObjectPreviewContext = createContext(false);

export function useStoryMediaUploadTarget(): StoryMediaUploadTarget | null {
  return useContext(StoryMediaUploadContext);
}

/** Images and clips in a paste or drop; leave other payloads to the text editor. */
export const storyMediaFiles = (data: DataTransfer | null) => Array.from(data?.files ?? []).filter((file) => /^(image|video)\//.test(file.type));

/** Said under a file that only lives in this tab (an in-memory transport's object URL). */
export const PREVIEW_UPLOAD_NOTE = 'Preview only, not uploaded';

export interface UploadedStoryMedia {
  src: string;
  kind: StoryUploadKind;
  bytes: number;
  /** The media store's key, when the transport gave one. */
  key?: string;
  /** An in-memory source (a `blob:` URL) that lasts as long as the tab. */
  preview: boolean;
  /** Width ÷ height, read from the file itself; absent when the browser
   *  couldn't decode it. The frame takes this shape, so nothing is cropped. */
  aspect?: number;
}

const MEASURE_TIMEOUT_MS = 5000;

const withAspect = (media: UploadedStoryMedia, aspect: number | undefined): UploadedStoryMedia => (aspect ? { ...media, aspect } : media);

/**
 * The file's own shape, read locally while it uploads: an image's natural
 * size or a video's frame size. Never throws; undefined when the browser
 * can't decode the file in time.
 */
export async function measureMediaAspect(file: File): Promise<number | undefined> {
  if (typeof document === 'undefined') return undefined;
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('timeout')), MEASURE_TIMEOUT_MS);
      const done = (width: number, height: number) => { window.clearTimeout(timer); resolve({ width, height }); };
      const fail = () => { window.clearTimeout(timer); reject(new Error('unreadable')); };
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.onloadedmetadata = () => done(video.videoWidth, video.videoHeight);
        video.onerror = fail;
        video.src = url;
      } else {
        const image = new Image();
        image.onload = () => done(image.naturalWidth, image.naturalHeight);
        image.onerror = fail;
        image.src = url;
      }
    });
    return size.width > 0 && size.height > 0 ? Number((size.width / size.height).toFixed(4)) : undefined;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A failure the author can read; `retryable` when the same file could still work. */
export class StoryMediaUploadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'StoryMediaUploadError';
  }
}

/**
 * Checks a file the way the server will, then hands it to the transport.
 * Rejects with a `StoryMediaUploadError`, or an `AbortError` when `signal`
 * fires.
 */
export async function uploadStoryMedia(file: File, target: StoryMediaUploadTarget, signal?: AbortSignal): Promise<UploadedStoryMedia> {
  const check = checkStoryUpload(file, target.maxBytes);
  if (!check.ok) throw new StoryMediaUploadError(check.error, false);
  const head = new Uint8Array(await file.slice(0, STORY_UPLOAD_SIGNATURE_BYTES).arrayBuffer());
  if (!matchesStoryUploadSignature(check.contentType, head)) throw new StoryMediaUploadError(signatureError(check.label), false);
  signal?.throwIfAborted();
  // Read alongside the upload; it never fails the upload.
  const measuring = measureMediaAspect(file);
  let uploaded: UploadedMedia;
  try {
    uploaded = await target.upload(file, { slug: target.slug, signal });
  } catch (reason) {
    if (signal?.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) throw reason;
    if (reason instanceof SaveRequestError) {
      if (reason.kind === 'session') markSessionEnded();
      throw new StoryMediaUploadError(explainFailure(reason, 'uploaded'), reason.kind !== 'too-large' && reason.kind !== 'refused');
    }
    throw new StoryMediaUploadError(reason instanceof Error && reason.message ? reason.message : UPLOAD_ERRORS.storage, true);
  }
  const kind: StoryUploadKind = uploaded.kind === 'video' ? 'video' : 'image';
  return withAspect({ src: uploaded.src, key: uploaded.key, kind, bytes: uploaded.size, preview: uploaded.src.startsWith('blob:') }, await measuring);
}

export type StoryMediaUploadState =
  | { status: 'idle' }
  | { status: 'uploading'; name: string }
  | { status: 'done'; src: string; preview: boolean }
  | { status: 'error'; message: string; retryable: boolean };

/**
 * One upload at a time for one piece of media. `onUploaded` is read when the
 * upload finishes, not when it starts, so it applies the result to the
 * media as it is then. Unmounting cancels the request: a closed popover or a
 * deleted block has nothing left to apply it to.
 */
export function useStoryMediaUpload(onUploaded: (media: UploadedStoryMedia) => void) {
  const target = useStoryMediaUploadTarget();
  const [state, setState] = useState<StoryMediaUploadState>({ status: 'idle' });
  const lastFile = useRef<File | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(onUploaded);
  useLayoutEffect(() => {
    latest.current = onUploaded;
  });
  useEffect(() => () => controller.current?.abort(), []);

  const start = (file: File) => {
    if (!target) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    lastFile.current = file;
    setState({ status: 'uploading', name: file.name });
    uploadStoryMedia(file, target, abort.signal).then(
      (uploaded) => {
        if (abort.signal.aborted) return;
        setState({ status: 'done', src: uploaded.src, preview: uploaded.preview });
        latest.current(uploaded);
      },
      (reason: unknown) => {
        if (abort.signal.aborted) return;
        setState(reason instanceof StoryMediaUploadError
          ? { status: 'error', message: reason.message, retryable: reason.retryable }
          : { status: 'error', message: UPLOAD_ERRORS.storage, retryable: true });
      },
    );
  };

  const retry = () => {
    if (lastFile.current) start(lastFile.current);
  };

  return { available: target !== null, state, start, retry };
}

const carriesFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes('Files');

/**
 * Drag-and-drop of a file onto an element. Enter/leave are counted because
 * they fire for every child the pointer crosses. While `onFile` is null the
 * drop is still taken — otherwise the browser would open the file in place of
 * the editor — but nothing happens with it.
 */
export function useFileDrop(onFile: ((file: File) => void) | null) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const handlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = onFile ? 'copy' : 'none';
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setOver(false);
      const file = event.dataTransfer.files[0];
      if (file && onFile) onFile(file);
    },
  };
  return { over: over && onFile !== null, handlers };
}
