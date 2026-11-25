'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { StoryMedia as StoryMediaData } from '@rcweston/story-core';
import { resolveMedia, type MediaResolveOptions, type ResolvedMedia } from '@rcweston/story-core';
import { DEFAULT_MEDIA_ASPECT, aspectDiffers, mediaAspect, rememberMediaAspect } from '@rcweston/story-core';
import { embedFramingStyle, mediaFramingStyle } from './media-framing.js';
import { mediaNoun, mediaSource, mediaSourceAspect } from '@rcweston/story-core';
import { mediaAppearanceStyle, mediaMatAppearanceStyle } from './media-appearance.js';
import { normalizeMediaAppearance } from '@rcweston/story-core';
import { storyMatStyle } from './media-mat.js';
import { storyStyles as styles } from './classes.js';
import { InlineStoryText } from './InlineStoryText.js';
import { StoryImageLightbox } from './StoryImageLightbox.js';
import { StoryLines } from './StoryRichText.js';
import type { StoryFieldPath } from '@rcweston/story-core';
import type { MediaEmptySlotProps, StoryRenderEditor } from './editor.js';
import type { StoryBlockIdentity } from './StoryBlocks.js';
import { Play } from 'lucide-react';
import { normalizeMediaSource } from '@rcweston/story-core';
import { YOUTUBE_MISSING_STILL_WIDTH, normalizeYouTubeUrl, youTubePlayingUrl, youTubeThumbnail } from '@rcweston/story-core';
import { normalizePdfUrl } from '@rcweston/story-core';
import { MotionToggle } from './MotionToggle.js';
import { useStoryEnvironment } from './context.js';

export const StoryMediaEmptyEditorContext = createContext<((media: StoryMediaData, path: StoryFieldPath) => ReactNode) | null>(null);

/** Lets read-only previews (an editor's asset views) show local object URLs
 *  without turning the whole reader into an editor. */
export const StoryMediaPreviewContext = createContext(false);

/** Shown on a file previewed from memory that hasn't been uploaded. */
export const PREVIEW_NOTE = 'Preview only, not uploaded';

/**
 * How the media box keeps the page below on the 24px grid (docs/RHYTHM.md
 * rule 5). `100cqw` is the width of the nearest `@container`, which the frame
 * supplies; where CSS round() is unsupported each falls back to the plain
 * ratio.
 * - `framed`: product UI on a plate is never cropped, nor is an embed
 *   (YouTube, PDF) on one. The box keeps the file's exact shape and the
 *   plate takes up the remainder to the next baseline, split above and below.
 * - `rounded`: film and photography that run to the frame's edge round their
 *   height down to whole baselines; `object-cover` trims at most 23px.
 * - `exact`: supplied animations keep their authored ratio so their SVG
 *   viewport is never cropped; an embed edge to edge keeps its shape too,
 *   since a player in a rounded box letterboxes instead of cropping.
 */
type BoxFit = 'framed' | 'rounded' | 'exact' | 'gallery';
export function boxStyle(aspect: number, fit: BoxFit = 'rounded'): CSSProperties | undefined {
  if (fit === 'gallery') return undefined;
  const ratio = aspect.toFixed(4);
  if (fit === 'exact') return { aspectRatio: String(aspect) };
  if (fit === 'framed') {
    return {
      aspectRatio: String(aspect),
      marginBlock: `calc((round(up, calc(100cqw / ${ratio}), var(--story-rhythm-minor)) - 100cqw / ${ratio}) / 2)`,
    };
  }
  return {
    aspectRatio: String(aspect),
    height: `round(down, calc(100cqw / ${ratio}), var(--story-rhythm-minor))`,
  };
}


interface Props {
  media: StoryMediaData;
  /** Hero media loads eagerly and is the page's largest paint. */
  priority?: boolean;
  sizes?: string;
  /** Rendered when there's no footage in production (e.g. the study's mark). */
  fallback?: ReactNode;
  className?: string;
  /** Drop the caption (a parent is rendering one for a pair). */
  hideCaption?: boolean;
  /** Opt-in sizing from the surrounding side-by-side Gallery. */
  galleryAlignment?: 'auto' | 'normal' | 'custom';
  /** Override the media's own frame: `inset` for media already sitting on a
   *  band, `edge` for full-bleed film with no radius. */
  frame?: 'mat' | 'bleed' | 'inset' | 'edge';
  editor?: StoryRenderEditor;
  path?: StoryFieldPath;
  selectionId?: string;
  /** Editor only: set when this media is a whole block, so the block's
   *  identity sits on the figure itself (see StoryBlockIdentity). */
  identity?: StoryBlockIdentity;
  /** Semantic depth chosen by the surrounding story structure. */
  headingLevel?: 2 | 3 | 4;
}

/**
 * One piece of story media: a still, a silent loop, or a walkthrough.
 *
 * Missing footage is a first-class state. In development the frame shows the
 * shot it's waiting for — what to capture, where to cut it from — or a draft
 * cut from the local media folder, badged as a draft. In production an empty
 * slot renders its fallback, or nothing.
 */
const FRAME_CLASS = {
  mat: styles.mat,
  bleed: styles.bleed,
  inset: styles.inset,
  edge: styles.edge,
} as const;

/** Editor only: a file previewed from memory (a preview that never uploads).
 *  The published resolver rejects `blob:` sources, so a reader never gets one. */
function resolveEditorMedia(media: StoryMediaData, options: MediaResolveOptions): ResolvedMedia & { preview: boolean } {
  if (media.src?.startsWith('blob:')) return { src: media.src, draft: false, unoptimized: true, preview: true };
  return { ...resolveMedia(media, options), preview: false };
}

export function StoryMedia({ media, priority, sizes, fallback, className = '', hideCaption, galleryAlignment, frame: frameOverride, editor, path = [], selectionId = 'media', identity, headingLevel = 3 }: Props) {
  const stored = media.aspect ?? DEFAULT_MEDIA_ASPECT;
  const youtubeSrc = media.sourceMode === 'youtube' ? normalizeYouTubeUrl(media.youtubeUrl) : null;
  const pdfSrc = media.sourceMode === 'pdf' ? normalizePdfUrl(media.pdfUrl) : null;
  const allowObjectPreview = useContext(StoryMediaPreviewContext);
  const renderEmpty = useContext(StoryMediaEmptyEditorContext);
  const environment = useStoryEnvironment();
  const { src, poster, draft, preview } = editor || allowObjectPreview ? resolveEditorMedia(media, environment.media) : { ...resolveMedia(media, environment.media), preview: false };
  const frame = frameOverride ?? media.frame ?? 'mat';
  const plated = frame === 'mat' || frame === 'inset';
  // The file's own shape, once it has loaded (media-aspects.ts): a wrong
  // stored shape would crop it, so the box takes the real one. Keyed by
  // source, so a replaced file is measured afresh.
  const [measured, setMeasured] = useState<{ src: string; aspect: number } | null>(null);
  const actual = measured && measured.src === src ? measured.aspect : null;
  const sourceAspect = actual && aspectDiffers(stored, actual) ? actual : stored;
  const automatic = galleryAlignment === 'auto';
  const natural = galleryAlignment === 'normal';
  const aspect = (automatic ? DEFAULT_MEDIA_ASPECT : natural ? undefined : media.framing?.aspect) ?? sourceAspect;
  const framingMedia = automatic ? { ...media, framing: { aspect, fit: 'contain' as const } }
    : natural ? { ...media, framing: { fit: 'contain' as const } } : media;
  const framingStyle = mediaFramingStyle(framingMedia);
  const appearance = normalizeMediaAppearance(media.appearance);
  const measure = (width: number, height: number) => {
    if (!src || width <= 0 || height <= 0) return;
    const next = mediaAspect(width, height);
    // The source as stored, which is what a save matches on.
    if (media.src) rememberMediaAspect(media.src, next);
    setMeasured({ src, aspect: next });
  };

  // Every state renders through one figure, frame and box. In the editor an
  // empty slot and the media that fills it are then the same elements, so the
  // settings popover anchored to the frame stays put when an upload or a
  // pasted source fills the slot.
  const figure = (content: ReactNode, empty = false) => (
    <figure className={automatic ? `${className} ${styles.galleryAuto}` : className} data-empty-media={empty && !media.shot ? true : undefined} data-gallery-alignment={galleryAlignment} {...identity}>
      {(media.heading || editor) && <MediaHeading media={media} editor={editor} path={path} selectionId={selectionId} level={headingLevel} />}
      {/* An inset frame sits on a plate its parent draws (a band, a grid),
          which sets the colour there. */}
      <div className={`${styles.frame} ${FRAME_CLASS[frame]}`} style={frame === 'mat' ? { ...storyMatStyle(media.matColor), ...mediaMatAppearanceStyle(media) } : undefined} data-appearance={appearance ? true : undefined} data-padding={frame === 'mat' ? media.matPadding : undefined}>
        <div className={styles.box} style={mediaAppearanceStyle(media)}>{content}</div>
      </div>
      {!hideCaption && (media.caption || media.link || editor) && <MediaCaption media={media} editor={editor} path={path} selectionId={selectionId} />}
    </figure>
  );

  if (youtubeSrc) {
    // Framed like a file: the viewport sets the box, the player
    // keeps the video's shape inside it and the box crops it.
    const playerAspect = mediaSourceAspect(media);
    const frameStyle = boxStyle(media.framing?.aspect ?? playerAspect, plated ? 'framed' : 'exact');
    return figure(
      <div className={styles.media} style={automatic ? undefined : natural ? boxStyle(playerAspect, plated ? 'framed' : 'exact') : frameStyle}>
        <YouTubeEmbed key={youtubeSrc} media={framingMedia} src={youtubeSrc} playerAspect={playerAspect} priority={priority} interactive={!editor} />
      </div>,
    );
  }

  if (pdfSrc) {
    // The browser's own viewer: paging, zoom, search and download come with
    // it. The caption link covers phones that only show the first page.
    return figure(
      <div className={styles.media} style={automatic ? undefined : boxStyle((galleryAlignment === 'custom' ? media.framing?.aspect : undefined) ?? media.aspect ?? (4 / 3), plated ? 'framed' : 'exact')}>
        <iframe
          className={styles.documentEmbed}
          src={`${pdfSrc}#view=FitH`}
          title={media.alt || 'PDF document'}
          loading={priority ? 'eager' : 'lazy'}
        />
      </div>,
    );
  }

  // An embed whose link is missing or isn't one shows that, never the file
  // it set aside; a reader never gets one (prepare-public drops it).
  if (mediaSource(media) !== 'media') {
    if (renderEmpty) return figure(renderEmpty(media, path), true);
    if (editor) return figure(<EmbedEmptySlot media={media} />, true);
    return fallback ? <>{fallback}</> : null;
  }

  if (!src) {
    if (renderEmpty) return figure(renderEmpty(media, path), true);
    if (editor) {
      const Slot = editor.ui.MediaEmptySlot ?? EditorEmptySlot;
      return figure(<Slot media={media} aspect={aspect} editor={editor} path={path} selectionId={selectionId} />, true);
    }
    if (environment.showShots && media.shot) return figure(<ShotSlot media={media} aspect={aspect} />);
    return fallback ? <>{fallback}</> : null;
  }

  const body =
    media.kind === 'video' ? (
      <StoryVideo media={media} src={src} poster={poster} priority={priority} onMeasure={measure} framingStyle={framingStyle} />
    ) : media.animated && src.endsWith('.svg') ? (
      <StoryAnimatedSvg media={media} src={src} />
    ) : editor || media.expansion?.enabled === false ? (
      <StoryImage src={src} alt={media.alt} sizes={sizes ?? '(min-width: 1152px) 1104px, 100vw'} priority={priority} style={framingStyle} onMeasure={measure} />
    ) : (
      <ZoomableImage
        src={src}
        alt={media.alt}
        caption={media.caption}
        expansion={media.expansion}
        sizes={sizes ?? '(min-width: 1152px) 1104px, 100vw'}
        priority={priority}
        onMeasure={measure}
        framingStyle={framingStyle}
      />
    );
  const fit: BoxFit = automatic ? 'gallery' : natural || media.animated ? 'exact' : plated ? 'framed' : 'rounded';

  return figure(
    <div className={styles.media} data-media-kind={media.kind} style={boxStyle(aspect, fit)}>
      {body}
      {draft && <span className={styles.draftBadge}>Draft cut · not uploaded</span>}
      {preview && <span className={styles.previewBadge}>{PREVIEW_NOTE}</span>}
    </div>,
  );
}

/**
 * A same-origin animated SVG needs a real pause control: an <img> keeps its
 * internal CSS timeline out of reach. A lazy, same-origin iframe supplies a
 * responsive object wrapper, keeping the SVG's authored bytes intact while
 * exposing its Web Animations timeline to the pause control.
 */
function StoryAnimatedSvg({ media, src }: { media: StoryMediaData; src: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const held = useRef(false);
  const reduce = useLiveReducedMotion();
  const [paused, setPaused] = useState(reduce);

  const apply = (shouldPause: boolean) => {
    ref.current?.contentWindow?.postMessage(
      { type: 'story-animation-control', paused: shouldPause },
      window.location.origin,
    );
    setPaused(shouldPause);
  };

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const onLoad = () => {
      if (held.current) return;
      iframe.contentWindow?.postMessage(
        { type: 'story-animation-control', paused: reduce },
        window.location.origin,
      );
      setPaused(reduce);
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [reduce]);

  useEffect(() => {
    if (!reduce) return;
    const frame = requestAnimationFrame(() => {
      ref.current?.contentWindow?.postMessage(
        { type: 'story-animation-control', paused: true },
        window.location.origin,
      );
      setPaused(true);
    });
    // The SVG's own reduced-motion rule selects its meaningful answered frame;
    // this effect also prevents later timeline movement.
    return () => cancelAnimationFrame(frame);
  }, [reduce]);

  return (
    <>
      <iframe
        ref={ref}
        srcDoc={`<!doctype html><meta charset="utf-8"><style>html,body,object{display:block;width:100%;height:100%;margin:0;overflow:hidden}</style><object id="art" data="${src}" type="image/svg+xml" aria-hidden="true"></object><script>addEventListener('message',function(event){if(event.source!==parent||event.data?.type!=='story-animation-control')return;try{var nodes=document.getElementById('art').contentDocument.querySelectorAll('*');nodes.forEach(function(node){node.getAnimations().forEach(function(animation){event.data.paused?animation.pause():animation.play()})})}catch{}})</script>`}
        title={media.alt}
        aria-label={media.alt}
        loading="lazy"
        tabIndex={-1}
        className={styles.fill}
      />
      <MotionToggle
        paused={paused}
        onClick={() => {
          held.current = true;
          apply(!paused);
        }}
        label={media.alt}
      />
    </>
  );
}

/**
 * A still that opens full size. Screens are often denser than the column can
 * show, so every image is a button that opens a native <dialog> — focus is
 * trapped and restored, Escape and a backdrop click close it. The full-size
 * view is a plain <img> of the same file.
 */
function ZoomableImage({
  src,
  alt,
  caption,
  sizes,
  priority,
  onMeasure,
  framingStyle,
  expansion,
}: {
  src: string;
  alt: string;
  caption?: string;
  expansion?: StoryMediaData['expansion'];
  sizes: string;
  priority?: boolean;
  /** Receives the file's natural size once it loads. */
  onMeasure: (width: number, height: number) => void;
  framingStyle: CSSProperties;
}) {
  return (
    <StoryImageLightbox src={src} alt={alt} caption={caption} expansion={expansion}>
      <StoryImage src={src} alt={alt} sizes={sizes} priority={priority} style={framingStyle} onMeasure={onMeasure} />
    </StoryImageLightbox>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <figcaption className={styles.caption}>{children}</figcaption>;
}

function MediaHeading({ media, editor, path, selectionId, level }: { media: StoryMediaData; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string; level: 2 | 3 | 4 }) {
  const Heading = `h${level}` as const;
  return (
    <Heading className={styles.mediaHeading}>
      {editor ? (
        <InlineStoryText value={media.heading ?? ''} path={[...path, 'heading']} editor={editor} selectionId={selectionId} label="Media heading" placeholder="Add media heading" />
      ) : media.heading}
    </Heading>
  );
}

function MediaCaption({ media, editor, path, selectionId }: { media: StoryMediaData; editor?: StoryRenderEditor; path: StoryFieldPath; selectionId: string }) {
  const link = media.link;
  return (
    <figcaption className={styles.caption}>
      {editor ? (
        <InlineStoryText value={media.caption ?? ''} path={[...path, 'caption']} editor={editor} selectionId={selectionId} label="Media caption" placeholder="Add caption" multiline />
      ) : <StoryLines value={media.caption} />}
      {link && (
        <>
          {media.caption ? ' · ' : ''}
          <a href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined} onClick={editor ? (event) => event.preventDefault() : undefined}>
            {editor ? <InlineStoryText value={link.label ?? 'View source'} path={[...path, 'link', 'label']} editor={editor} selectionId={selectionId} label="Media link label" /> : link.label ?? 'View source'}
          </a>
        </>
      )}
    </figcaption>
  );
}

/** Development-only: the frame a clip will fill, and what should fill it. In
 *  the editor it also takes a dropped file (`drop`), and `status` replaces the
 *  source line while one uploads or fails. */
export function ShotSlot({ media, aspect, drop, status }: { media: StoryMediaData; aspect: number; drop?: SlotDrop; status?: string }) {
  const shot = media.shot!;
  return (
    <div className={styles.slot} style={boxStyle(aspect)} role="img" aria-label={`Footage needed: ${shot.brief}`} data-drop={drop?.state} {...drop?.handlers}>
      <div className={styles.slotBody}>
        <p className={styles.slotLabel}>
          {media.kind === 'video' ? 'Footage needed' : 'Still needed'}
          {shot.length ? ` · ${shot.length}` : ''}
        </p>
        <p className={styles.slotBrief}>{shot.brief}</p>
        {status ? <p className={styles.slotStatus}>{status}</p> : shot.source && <p className={styles.slotSource}>{shot.source}</p>}
      </div>
    </div>
  );
}

/**
 * A YouTube video shows as a still until a reader asks for it: no YouTube
 * title bar, red button or scripts until the click, which swaps in the player
 * and starts it. The player only exists once they've clicked, so a video
 * never starts on its own. The still (the poster, else YouTube's own) is
 * placed exactly where the player will be, so framing crops both alike. In
 * the editor it stays a still: a click there selects the block.
 */
function YouTubeEmbed({ media, src, playerAspect, priority, interactive }: {
  media: StoryMediaData;
  src: string;
  playerAspect: number;
  priority?: boolean;
  interactive: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [lowRes, setLowRes] = useState(false);
  const player = useRef<HTMLIFrameElement>(null);
  const title = media.alt || 'YouTube video';
  const placement = embedFramingStyle(media, playerAspect);
  const poster = normalizeMediaSource(media.poster);
  const still = poster ?? youTubeThumbnail(media.youtubeUrl, lowRes ? 'hqdefault' : 'maxresdefault');

  // The still button is gone once the player is in; keep the reader's place
  // by handing focus to the player, whose keys (space, f, m) then work.
  useEffect(() => {
    if (playing) player.current?.focus();
  }, [playing]);

  if (playing) {
    return (
      <iframe
        ref={player}
        className={styles.youtubeEmbed}
        style={placement}
        src={youTubePlayingUrl(src)}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }

  const content = (
    <>
      <span className={styles.embedStill} style={placement}>
        {still && (
          <img
            src={still}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            className={`${styles.fillCover} ${styles.embedStillImage}`}
            onLoad={(event) => { if (!poster && event.currentTarget.naturalWidth <= YOUTUBE_MISSING_STILL_WIDTH) setLowRes(true); }}
            onError={() => { if (!poster) setLowRes(true); }}
          />
        )}
      </span>
      <span className={styles.embedPlay} aria-hidden="true"><Play size={20} /></span>
    </>
  );
  if (!interactive) return content;
  return (
    <button type="button" className={styles.embedButton} onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`}>
      {content}
    </button>
  );
}

/** Editor only: an embed with no working link yet. Clicking it opens its
 *  settings, where the link goes; there is no file to drop on it. */
function EmbedEmptySlot({ media }: { media: StoryMediaData }) {
  const youtube = mediaSource(media) === 'youtube';
  const link = (youtube ? media.youtubeUrl : media.pdfUrl)?.trim();
  const fix = youtube ? 'paste a YouTube link and its title' : 'link a PDF and its title';
  return (
    <div className={styles.slot} style={boxStyle(media.framing?.aspect ?? mediaSourceAspect(media))} role="img" aria-label={`Empty ${mediaNoun(media)} placeholder`}>
      <div className={styles.slotBody}>
        <p className={styles.slotLabel}>{youtube ? 'YouTube link needed' : 'PDF link needed'}</p>
        <p className={link ? styles.slotStatus : styles.slotBrief}>
          {link && (youtube ? 'That link isn’t a YouTube video. ' : 'That link isn’t a PDF your media route serves. ')}
          <span className={styles.slotDropHint}>Click to {link ? 'fix it' : fix}.</span>
          <span className={styles.slotTouchHint}>Tap to {link ? 'fix it' : fix}.</span>
        </p>
      </div>
    </div>
  );
}

/** What an empty slot does with a dropped file (the editor's upload slot sets it). */
export interface SlotDrop {
  state: 'idle' | 'over' | 'busy' | 'error';
  handlers: Partial<Record<'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop', (event: DragEvent<HTMLElement>) => void>>;
}

/**
 * Editor only: media with nothing to show yet. Clicking it opens its settings
 * (the editor shell does that). The editor's own slot (`editor.ui.MediaEmptySlot`)
 * adds dropping a file to upload it; this one is the plain fallback.
 */
function EditorEmptySlot({ media, aspect }: MediaEmptySlotProps) {
  if (media.shot) return <ShotSlot media={media} aspect={aspect} />;
  return <EmptySlot media={media} aspect={aspect} />;
}

/** The empty frame itself, shared with the editor's upload slot. */
export function EmptySlot({ media, aspect, drop, status, busy = false, dropHint = false }: { media: StoryMediaData; aspect: number; drop?: SlotDrop; status?: string; busy?: boolean; dropHint?: boolean }) {
  return (
    <div className={styles.slot} style={boxStyle(aspect)} role="img" aria-label={`Empty ${media.kind} placeholder`} data-drop={drop?.state} {...drop?.handlers}>
      <div className={styles.slotBody}>
        <p className={styles.slotLabel}>{busy ? 'Uploading' : media.kind === 'video' ? 'Video needed' : 'Image needed'}</p>
        {/* Status is the smaller line: an error has to fit a phone-width slot. */}
        <p className={status ? styles.slotStatus : styles.slotBrief}>
          {status ?? (dropHint ? (
            <>
              <span className={styles.slotDropHint}>Drop a file here, or click to add one and its description.</span>
              <span className={styles.slotTouchHint}>Tap to add a file and its description.</span>
            </>
          ) : 'Click to add a file and its description.')}
        </p>
      </div>
    </div>
  );
}

/**
 * A still, filling its box. A plain <img>: a host that wants an image
 * optimizer can serve optimized URLs from its media route.
 */
function StoryImage({ src, alt, sizes, priority, style, onMeasure }: { src: string; alt: string; sizes?: string; priority?: boolean; style?: CSSProperties; onMeasure: (width: number, height: number) => void }) {
  const ref = useRef<HTMLImageElement>(null);
  const measureRef = useRef(onMeasure);
  useEffect(() => { measureRef.current = onMeasure; });
  // A cached image can finish before hydration attaches onLoad.
  useEffect(() => {
    const image = ref.current;
    if (image?.complete && image.naturalWidth) measureRef.current(image.naturalWidth, image.naturalHeight);
  }, [src]);
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={styles.fillCover}
      style={style}
      onLoad={(event) => onMeasure(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
    />
  );
}

/**
 * The reduced-motion preference, kept current: a hook that reads it
 * once per mount, and this follows the OS setting if the reader changes it
 * mid-page. The server has no preference, so it renders as "motion allowed";
 * no markup depends on the answer, only effects.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function useLiveReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * Silent loops play only while they're on screen, and never on their own when
 * the reader has asked for reduced motion — they get the poster and a play
 * button instead. Every loop can be paused (WCAG 2.2.2). Longer walkthroughs
 * (`loop: false`) get native controls and never autoplay.
 */
function StoryVideo({
  media,
  src,
  poster,
  priority,
  onMeasure,
  framingStyle,
}: {
  media: StoryMediaData;
  src: string;
  poster?: string;
  priority?: boolean;
  /** Receives the clip's frame size once its metadata loads. */
  onMeasure: (width: number, height: number) => void;
  framingStyle: CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useLiveReducedMotion();
  const loop = media.loop ?? true;
  // Which source is playing, not just whether: a new source loads paused
  // without a pause event, so the button would otherwise keep saying
  // "Pause" over a frozen first frame.
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);
  const paused = playingSrc !== src;
  // The reader's own play/pause wins over the in-view autoplay: once they've
  // pressed it, nothing restarts the loop for them. A new file starts fresh.
  const held = useRef(false);
  const heldSrc = useRef(src);
  const measureRef = useRef(onMeasure);
  useEffect(() => { measureRef.current = onMeasure; });

  // Metadata that arrived before hydration fired its event with no listener.
  useEffect(() => {
    const video = ref.current;
    if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) measureRef.current(video.videoWidth, video.videoHeight);
  }, [src]);

  // Re-run for a new source too: swapping the file in the editor reloads the
  // element paused, and an in-view loop should start the new one.
  useEffect(() => {
    const video = ref.current;
    if (!video || !loop) return;
    if (heldSrc.current !== src) {
      heldSrc.current = src;
      held.current = false;
    }
    if (reduce && !held.current) video.pause();
    const io = new IntersectionObserver(
      ([entry]) => {
        // Out of view, every loop stops, including one the reader started.
        if (!entry.isIntersecting) video.pause();
        else if (!reduce && !held.current) void video.play().catch(() => {});
      },
      { threshold: 0.4 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [loop, reduce, src]);

  if (!loop) {
    return (
      <video
        ref={ref}
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        aria-label={media.alt}
        onLoadedMetadata={(event) => onMeasure(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        className={styles.fill}
        style={framingStyle}
      />
    );
  }

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    held.current = true;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        // Under reduced motion the loop never autoplays, so don't fetch it all.
        preload={priority && !reduce ? 'auto' : 'metadata'}
        aria-label={media.alt}
        onLoadedMetadata={(event) => onMeasure(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        onPlay={() => setPlayingSrc(src)}
        onPause={() => setPlayingSrc(null)}
        className={styles.fill}
        style={framingStyle}
      />
      <MotionToggle paused={paused} onClick={toggle} label={media.alt} />
    </>
  );
}
