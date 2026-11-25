import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Crop, Expand, Scan, RotateCcw, Check, X, SlidersHorizontal, Square } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { StoryMedia as MediaData } from '@rcweston/story-core';
import { EditorSelect } from './Select.js';
import { StoryMedia } from '@rcweston/story-react';
import { embedFramingHidesControls, normalizeMediaFraming } from '@rcweston/story-react';
import { normalizeMediaAppearance, normalizeMediaExpansion } from '@rcweston/story-core';
import { mediaSource, mediaSourceAspect, mediaSupports, youTubeStill } from '@rcweston/story-core';
import { DEFAULT_IMAGE_ZOOM, IMAGE_ZOOM_LEVELS } from '@rcweston/story-core';
import { STORY_MAT_PRESETS, normalizeMatHex } from '@rcweston/story-react';
// A custom mat starts from a pale blue the author can change.
const CUSTOM_MAT_START = '#e9f2ff';
import { mediaDisplayStyles as styles, chromeStyles } from './classes.js';
import { storyStyles as storyStyles } from '@rcweston/story-react';

type Tab = 'mat' | 'style' | 'crop' | 'expand';
type Draft = Pick<MediaData, 'framing' | 'appearance' | 'expansion' | 'frame' | 'matColor' | 'matPadding'>;
type Appearance = NonNullable<MediaData['appearance']>;
const TABS = [
  { id: 'mat', label: 'Mat', icon: Square },
  { id: 'style', label: 'Image', icon: Scan },
  { id: 'crop', label: 'Frame', icon: Crop },
  { id: 'expand', label: 'Expand', icon: Expand },
] as const;
const ASPECTS = [
  ['', 'Original shape'], [String(16 / 9), 'Landscape · 16:9'], [String(3 / 2), 'Photo · 3:2'],
  [String(4 / 3), 'Classic · 4:3'], ['1', 'Square · 1:1'], [String(4 / 5), 'Portrait · 4:5'],
  [String(21 / 9), 'Panorama · 21:9'],
] as const;
const POSITIONS = [
  [0, 0, 'Top left', '↖'], [50, 0, 'Top center', '↑'], [100, 0, 'Top right', '↗'],
  [0, 50, 'Center left', '←'], [50, 50, 'Center', '·'], [100, 50, 'Center right', '→'],
  [0, 100, 'Bottom left', '↙'], [50, 100, 'Bottom center', '↓'], [100, 100, 'Bottom right', '↘'],
] as const;
const PRESETS: { id: string; label: string; description: string; value: MediaData['appearance'] }[] = [
  { id: 'original', label: 'Original', description: 'Keep the story’s existing treatment', value: undefined },
  { id: 'clean', label: 'Clean', description: 'Sharp corners, no border or shadow', value: { radius: 0, borderWidth: 0, outlineWidth: 0, shadow: 'none' } },
  { id: 'soft', label: 'Soft', description: 'Rounded corners and a soft shadow', value: { radius: 12, borderWidth: 0, outlineWidth: 0, shadow: 'soft' } },
  { id: 'lifted', label: 'Lifted', description: 'A fine border with a deep floating shadow', value: { radius: 12, borderWidth: 1, borderTone: 'edge', outlineWidth: 0, shadow: 'lifted' } },
  { id: 'outlined', label: 'Outline', description: 'A separate accent outline outside the image', value: { radius: 6, borderWidth: 0, outlineWidth: 2, outlineOffset: 6, outlineTone: 'accent', shadow: 'none' } },
  { id: 'graphic', label: 'Graphic', description: 'Ink border with a crisp offset shadow', value: { radius: 0, borderWidth: 2, borderTone: 'ink', outlineWidth: 0, shadow: 'crisp' } },
];
const fromMedia = (media: MediaData): Draft => ({ framing: media.framing, appearance: media.appearance, expansion: media.expansion, frame: media.frame, matColor: media.matColor, matPadding: media.matPadding });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className={styles.field}><div className={styles.fieldTitle}>{label}</div>{children}{hint && <p className={styles.help}>{hint}</p>}</div>;
}

function Range({ label, value, max, min = 0, unit = 'px', onChange }: { label: string; value: number; max: number; min?: number; unit?: string; onChange: (value: number) => void }) {
  const id = useId();
  const set = (raw: string) => {
    if (raw === '') return;
    const next = Number(raw);
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
  };
  return <div className={styles.rangeField}>
    <label htmlFor={`${id}-range`}>{label}</label>
    <div className={styles.rangeRow}>
      <input id={`${id}-range`} type="range" min={min} max={max} value={value} onChange={(event) => set(event.currentTarget.value)} />
      <span className={styles.numberField}><input type="number" aria-label={`${label} value`} min={min} max={max} value={value} onChange={(event) => set(event.currentTarget.value)} /><span aria-hidden="true">{unit}</span></span>
    </div>
  </div>;
}

function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div className={styles.choices} role="group" aria-label={label}>{options.map((option) => <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function Position({ label, x, y, onChange }: { label: string; x: number; y: number; onChange: (x: number, y: number) => void }) {
  return <div className={styles.positionGroup}>
    <div className={styles.positionGrid} role="group" aria-label={label}>{POSITIONS.map(([px, py, title, arrow]) => <button key={title} type="button" aria-label={`${label}: ${title}`} title={title} aria-pressed={x === px && y === py} onClick={() => onChange(px, py)}><span aria-hidden="true">{arrow}</span></button>)}</div>
    <details className={styles.fineTune}><summary>Precise position</summary><div className={styles.positionValues}><Range label={`${label} horizontal`} value={x} max={100} unit="%" onChange={(next) => onChange(next, y)} /><Range label={`${label} vertical`} value={y} max={100} unit="%" onChange={(next) => onChange(x, next)} /></div></details>
  </div>;
}

/** Transactional image inspector. The preview is the reader, not a CSS imitation.
 * Changes stay local until Apply; source and captions are never overwritten. */
export function MediaDisplayEditor({ media, onChange, ownPlate = true, padded = true }: { media: MediaData; ownPlate?: boolean; padded?: boolean; onChange: (media: MediaData, history?: 'record' | 'merge') => void }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('mat');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applied, setApplied] = useState(false);
  const value = draft ?? fromMedia(media);
  const preview = { ...media, ...value, heading: undefined, caption: undefined, link: undefined };
  const appearance = value.appearance ?? {};
  const framing = value.framing ?? {};
  const expansion = value.expansion ?? {};
  const canFrame = mediaSupports(media, 'framing');
  const canExpand = mediaSupports(media, 'enlarge') && media.kind === 'image' && !media.animated;
  const tabs = TABS.filter((item) => item.id !== 'crop' || canFrame).filter((item) => item.id !== 'expand' || canExpand);
  const selectedTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;
  const pending = draft !== null && !same(draft, fromMedia(media));
  const sourceAspect = mediaSourceAspect(media);
  const update = (patch: Partial<Draft>) => { setDraft({ ...value, ...patch }); setApplied(false); };
  const changeAppearance = (patch: Partial<Appearance>) => update({ appearance: { ...appearance, ...patch } });
  const changeFraming = (patch: NonNullable<MediaData['framing']>) => update({ framing: { ...framing, ...patch } });
  const changeExpansion = (patch: NonNullable<MediaData['expansion']>) => update({ expansion: { ...expansion, ...patch } });
  const preset = PRESETS.find((item) => same(normalizeMediaAppearance(item.value), normalizeMediaAppearance({ ...value.appearance, matInsetX: undefined, matInsetY: undefined })))?.id;
  const source = mediaSource(media) === 'pdf' ? undefined : youTubeStill(media) ?? (media.kind === 'video' ? media.poster : media.src);
  // The preview is a still: no media plays and no PDF loads just to tune the frame.
  const previewMedia: MediaData = source ? { ...preview, heading: undefined, kind: 'image', src: source, aspect: sourceAspect, sourceMode: undefined, animated: false, expansion: { ...expansion, enabled: canExpand && expansion.enabled !== false } } : preview;
  const switchTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  const close = () => { setDraft(null); setOpen(false); };
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); else { setApplied(false); setOpen(true); } }}>
    <Dialog.Trigger className={styles.launch}><SlidersHorizontal aria-hidden="true" /><span><strong>Edit display</strong><small>Mat, image & expanded view</small></span><span className={styles.launchState}>{media.appearance || media.framing || media.expansion || media.frame || media.matColor || media.matPadding ? 'Custom' : 'Default'}</span></Dialog.Trigger>
    {applied && <p className={styles.status} role="status">Display applied. Save the story to keep it.</p>}
    <Dialog.Portal>
      <Dialog.Overlay className={`${styles.overlay} ${chromeStyles.mediaDisplayEditorOverlay}`} />
      <Dialog.Content className={`${styles.inspector} ${chromeStyles.mediaDisplayEditorOverlay}`} data-story-editor-action onEscapeKeyDown={(event) => {
        // The expanded image owns Escape while its native dialog is open.
        const expanded = event.target instanceof Element ? event.target.closest('dialog[open]') : null;
        if (expanded instanceof HTMLDialogElement) { event.preventDefault(); expanded.close(); }
      }} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        <header className={styles.header}><div><Dialog.Title className={styles.title}>Image display</Dialog.Title><Dialog.Description className={styles.help}>See the result. Apply when it feels right.</Dialog.Description></div><Dialog.Close className={styles.close} aria-label="Cancel display changes"><X aria-hidden="true" /></Dialog.Close></header>
        <div className={styles.workspace}>
          <div className={styles.previewColumn}>
            <div className={styles.previewHeader}><span>Preview</span><span>{pending ? 'Unsaved changes' : 'Current display'}</span></div>
            <div className={`${styles.stage} ${storyStyles.story}`} data-checkerboard style={{ '--preview-aspect': framing.aspect ?? sourceAspect } as CSSProperties}>
              {source ? <StoryMedia key={`${source}:${JSON.stringify(expansion)}`} media={previewMedia} hideCaption /> : <div className={styles.empty}>Add an image or poster to preview its treatment.</div>}
            </div>
            <p className={styles.help}>{canExpand && source && expansion.enabled !== false ? 'Click the image to try the expanded view.' : 'Changes stay here until you apply.'}</p>
          </div>
          <div className={styles.controls}>
      <div className={styles.tabs} role="tablist" aria-label="Display controls">{tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={selectedTab === item.id} tabIndex={selectedTab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => switchTab(event, index)}><item.icon aria-hidden="true" />{item.label}</button>)}</div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable tabpanel is the keyboard destination prescribed by the ARIA tabs pattern */}
      <div className={styles.tabPanel} id={`${id}-panel-${selectedTab}`} role="tabpanel" aria-labelledby={`${id}-${selectedTab}`} tabIndex={0}>
        {selectedTab === 'mat' && <>
          <Field label="Background mat" hint="A mat adds space and color behind the image. Its stroke is a separate control under Image.">
            <Choices label="Background mat" value={value.frame ?? 'mat'} options={[{ value: 'mat', label: 'Mat on' }, { value: 'bleed', label: 'No mat' }]} onChange={(frame) => update({ frame })} />
          </Field>
          {(value.frame ?? 'mat') === 'mat' && <>
            {ownPlate ? <Field label="Mat color">
              <EditorSelect aria-label="Mat color" value={value.matColor?.startsWith('#') ? 'custom' : value.matColor ?? ''} onChange={(event) => update({ matColor: event.currentTarget.value === 'custom' ? CUSTOM_MAT_START : (event.currentTarget.value || undefined) as MediaData['matColor'] })}>
                <option value="">Story default</option>{STORY_MAT_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}<option value="custom">Custom color</option>
              </EditorSelect>
              {value.matColor?.startsWith('#') && <label className={styles.customColor}>Custom mat color<input type="color" aria-label="Custom mat color" value={value.matColor} onChange={(event) => update({ matColor: normalizeMatHex(event.currentTarget.value) })} /><span>{value.matColor}</span></label>}
            </Field> : <p className={styles.notice}>This image shares its background with the group. Change the group’s mat color in its settings.</p>}
            {ownPlate && padded ? <>
              <Field label="Mat size"><EditorSelect aria-label="Mat size" value={appearance.matInsetX !== undefined || appearance.matInsetY !== undefined ? 'custom' : value.matPadding ?? ''} onChange={(event) => event.currentTarget.value === 'custom' ? changeAppearance({ matInsetX: 48, matInsetY: 48 }) : update({ matPadding: (event.currentTarget.value || undefined) as MediaData['matPadding'], appearance: { ...appearance, matInsetX: undefined, matInsetY: undefined } })}>
                <option value="">Story default</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="custom">Custom spacing</option>
              </EditorSelect></Field>
              {(appearance.matInsetX !== undefined || appearance.matInsetY !== undefined) && <>
                <Range label="Left & right space" value={appearance.matInsetX ?? 48} max={144} onChange={(matInsetX) => changeAppearance({ matInsetX })} />
                <Range label="Top & bottom space" value={appearance.matInsetY ?? 48} max={144} onChange={(matInsetY) => changeAppearance({ matInsetY })} />
                <p className={styles.help}>Each side is capped at 15% of the frame on smaller screens, keeping the image readable.</p>
              </>}
            </> : <p className={styles.help}>Spacing belongs to this image’s surrounding layout.</p>}
          </>}
        </>}
        {selectedTab === 'style' && <>
          <Field label="Image stroke" hint="A thin line around the image itself, independent of its background mat."><Choices label="Image stroke" value={(appearance.borderWidth ?? 0) > 0 ? 'on' : 'off'} options={[{ value: 'off', label: 'No stroke' }, { value: 'on', label: 'Stroke on' }]} onChange={(stroke) => changeAppearance({ borderWidth: stroke === 'on' ? 1 : 0 })} /></Field>
      <div className={styles.presetGrid} role="group" aria-label="Display presets">{PRESETS.map((item) => <button key={item.id} type="button" className={styles.preset} data-preset={item.id} title={item.description} aria-pressed={preset === item.id} onClick={() => update({ appearance: { ...item.value, matInsetX: appearance.matInsetX, matInsetY: appearance.matInsetY } })}><span className={styles.presetSample} aria-hidden="true" /><span>{item.label}</span></button>)}</div>
<details className={styles.fineTune}><summary>Fine-tune style</summary><div className={styles.fineTuneBody}>
          <Field label="Corners"><Range label="Corner radius" value={appearance.radius ?? 6} max={48} onChange={(radius) => changeAppearance({ radius })} /></Field>
          <Field label="Image stroke" hint="The border hugs the image inside its frame. A thicker border leaves slightly less space for the image.">
            <Range label="Border width" value={appearance.borderWidth ?? 0} max={12} onChange={(borderWidth) => changeAppearance({ borderWidth })} />
            {(appearance.borderWidth ?? 0) > 0 && <><Choices label="Border style" value={appearance.borderStyle ?? 'solid'} options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]} onChange={(borderStyle) => changeAppearance({ borderStyle })} /><Choices label="Border color" value={appearance.borderTone ?? 'edge'} options={[{ value: 'edge', label: 'Subtle' }, { value: 'ink', label: 'Ink' }, { value: 'accent', label: 'Accent' }]} onChange={(borderTone) => changeAppearance({ borderTone })} /></>}
          </Field>
          <Field label="Outside outline" hint="A separate ring outside the image. Offset opens space between the image and the ring.">
            <Range label="Outline width" value={appearance.outlineWidth ?? 0} max={8} onChange={(outlineWidth) => changeAppearance({ outlineWidth })} />
            {(appearance.outlineWidth ?? 0) > 0 && <><Range label="Outline offset" value={appearance.outlineOffset ?? 0} max={24} onChange={(outlineOffset) => changeAppearance({ outlineOffset })} /><Choices label="Outline color" value={appearance.outlineTone ?? 'edge'} options={[{ value: 'edge', label: 'Subtle' }, { value: 'ink', label: 'Ink' }, { value: 'accent', label: 'Accent' }]} onChange={(outlineTone) => changeAppearance({ outlineTone })} /></>}
          </Field>
          <Field label="Shadow" hint="Soft adds gentle separation. Lifted floats above the page. Crisp creates a graphic offset edge.">
            <div className={styles.shadowChoices} role="group" aria-label="Shadow style">{([{ value: 'none', label: 'None' }, { value: 'soft', label: 'Soft' }, { value: 'lifted', label: 'Lifted' }, { value: 'crisp', label: 'Crisp' }] as const).map((item) => <button type="button" key={item.value} data-shadow={item.value} aria-pressed={appearance.shadow === item.value} onClick={() => changeAppearance({ shadow: item.value })}><span aria-hidden="true" />{item.label}</button>)}</div>
          </Field>
          <p className={styles.help}>{appearance.shadow === undefined ? 'Using the story’s original shadow. Choose None to remove it explicitly.' : 'Shadow follows the image, while the matte stays flat. All colors follow the reader’s theme.'}</p>
</div></details></>}
        {selectedTab === 'crop' && <>
          <Field label="Viewport"><EditorSelect aria-label="Viewport shape" value={framing.aspect ? String(framing.aspect) : ''} onChange={(event) => changeFraming({ aspect: event.currentTarget.value ? Number(event.currentTarget.value) : undefined })}>
            {framing.aspect && !ASPECTS.some(([ratio]) => Number(ratio) === framing.aspect) && <option value={String(framing.aspect)}>Custom · {framing.aspect.toFixed(2)}:1</option>}
            {ASPECTS.map(([ratio, label]) => <option key={ratio} value={ratio}>{label}</option>)}
          </EditorSelect></Field>
          <Field label="Image fit" hint={(framing.fit ?? 'cover') === 'cover' ? 'Fill crops the image to the selected shape. Position chooses what stays visible.' : 'Whole image keeps every edge visible. Position aligns it inside the available space.'}>
            <Choices label="Image fit" value={framing.fit ?? 'cover'} options={[{ value: 'cover', label: 'Fill frame' }, { value: 'contain', label: 'Whole image' }]} onChange={(fit) => changeFraming({ fit })} />
          </Field>
          <Field label={(framing.fit ?? 'cover') === 'cover' ? 'Focal point' : 'Image position'}><Position label="Image position" x={framing.x ?? 50} y={framing.y ?? 50} onChange={(x, y) => changeFraming({ x, y })} /></Field>
          <p className={styles.help}>Source {sourceAspect.toFixed(2)}:1 · viewport {(framing.aspect ?? sourceAspect).toFixed(2)}:1. A matching shape has no extra space to reposition.</p>
          {youTubeStill(media) && embedFramingHidesControls(preview, sourceAspect) && <p className={styles.notice}>This crop can hide YouTube’s controls. Use Whole image or a wider viewport to keep them visible.</p>}
        </>}
        {selectedTab === 'expand' && <>
          <Field label="Click to expand"><Choices label="Allow image expansion" value={expansion.enabled === false ? 'off' : 'on'} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} onChange={(enabled) => changeExpansion({ enabled: enabled === 'on' })} /></Field>
          {expansion.enabled !== false && <>
            <Field label="Opening size" hint="Relative to screen fit, not source pixels. Readers can still zoom and pan."><EditorSelect aria-label="Expanded opening size" value={expansion.zoom ?? DEFAULT_IMAGE_ZOOM} onChange={(event) => changeExpansion({ zoom: Number(event.currentTarget.value) })}>{IMAGE_ZOOM_LEVELS.map((zoom) => <option key={zoom} value={zoom}>{zoom}%{zoom === 75 ? ' · breathing room' : zoom === 100 ? ' · screen fit' : zoom > 100 ? ' · detail' : ''}</option>)}</EditorSelect></Field>
            <Field label="Opening position" hint="Place a smaller image within the screen, or choose the detail readers see first when zoomed in."><Position label="Expanded position" x={expansion.x ?? 50} y={expansion.y ?? 50} onChange={(x, y) => changeExpansion({ x, y })} /></Field>
            <p className={styles.help}>The expanded view always uses the full original image. Inline borders, crop and shadow do not cover the detail.</p>
          </>}
        </>}
      </div>
          </div>
        </div>
      <footer className={styles.footer}><p className={styles.status} role="status">{pending ? 'Preview only. Apply adds one undoable change.' : 'Your original stays unchanged until you apply.'}</p><div className={styles.actions}>
        <button className={styles.reset} type="button" title="Reset display controls to the story defaults" onClick={() => update({ framing: undefined, appearance: undefined, expansion: undefined, frame: undefined, matColor: undefined, matPadding: undefined })}><RotateCcw aria-hidden="true" />Reset</button>
        <button type="button" onClick={close}>Cancel</button>
        <button type="button" className={styles.apply} disabled={!pending} onClick={() => {
          onChange({ ...media, ...value, framing: normalizeMediaFraming(value.framing), appearance: normalizeMediaAppearance(value.appearance), expansion: normalizeMediaExpansion(value.expansion) }, 'record');
          setDraft(null);
          setApplied(true);
          setOpen(false);
        }}><Check aria-hidden="true" />Apply</button>
      </div>
      </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
