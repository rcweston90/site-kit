'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState, type Editor } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Dialog } from 'radix-ui';
import { ArrowDown, ArrowUp, ArrowUpRight, Code, Heading2, Heading3, Heading4, ImagePlus, List, ListOrdered, MessageSquare, Minus, MousePointerClick, Pencil, Pilcrow, Quote, Type } from 'lucide-react';
import { useMediaQuery } from '@rcweston/story-react';
import { highlightColor } from '@rcweston/story-core';
import { StorySlashMenu, TiptapLinkChip, TiptapSelectionToolbar, storySlashKey } from '@rcweston/story-editor';
import { safeBlogUrl } from '@rcweston/site-data/client';
import { PROSE_SURFACE, type AuthoringTextStyle, type SelectionToolbarOptions, type SelectionToolbarState } from '@rcweston/story-editor';
import { BlogRelatedTileNode, insertBlogRelatedTile } from './BlogRelatedTile.js';
import { blogEditorExtensions, blogTextStyle, setBlogTextStyle } from './blog-editor-schema.js';
/* Styles: blog.css. */
const styles = {
  canvas: 'sa-blog-canvas', content: 'sa-blog-content', actions: 'sa-blog-actions', page: 'sa-blog-page', header: 'sa-blog-header', backLink: 'sa-blog-back',
  saveDock: 'sa-blog-save-dock', saveRow: 'sa-blog-save-row', saveActions: 'sa-blog-save-actions', saveButton: 'sa-blog-save-button', moreButton: 'sa-blog-more-button',
  settings: 'sa-blog-settings', dialogOverlay: 'sa-blog-dialog-overlay', imagePanel: 'sa-blog-image-panel', imageAction: 'sa-blog-image-action', imageEditLabel: 'sa-blog-image-edit-label',
  imageDialogFooter: 'sa-blog-image-dialog-footer', imageSource: 'sa-blog-image-source', imageHint: 'sa-blog-image-hint', imageStaged: 'sa-blog-image-staged', imageUrl: 'sa-blog-image-url',
} as const;
import { SaveRequestError, explainFailure } from '@rcweston/save-kit';
import { BLOG_IMAGE_ACCEPT, blogClipboardImage, validateBlogBodyImage } from './blog-image-input.js';
import { blogImageActionPosition, blogKeyboardFrame, type BlogImageActionPosition } from './blog-editor-layout.js';
import { blogSelectedImageOrder, moveBlogSelectedImage, type BlogImageMoveDirection } from './blog-image-reorder.js';
import { canInsertBlogCallout, insertBlogCallout } from './BlogCallout.js';
import { blogAfterCallout, insertBlogAfterCallout } from './blog-callout-placement.js';
import { blankBlogLine, blogToolbarDividerTarget, dividerAfterBlogContainer, dividerBeforeBlankBlogLine, inBlogBodyParagraph } from './blog-caret-insert.js';
import { BlogCta, insertBlogCta } from './BlogCta.js';
import { BlogCaretInsertMenu } from './BlogCaretInsertMenu.js';
import type { SlashInsertAction } from '@rcweston/story-editor';

const TEXT_STYLES: AuthoringTextStyle[] = [
  { value: 'text', label: 'Text', icon: Pilcrow, keys: '⌘⌥0' },
  { value: 'large', label: 'Large text', icon: Type, keys: '⌘⌥1' },
  { value: 'heading2', label: 'Heading 2', icon: Heading2, keys: '⌘⌥2' },
  { value: 'heading3', label: 'Heading 3', icon: Heading3, keys: '⌘⌥3' },
  { value: 'heading4', label: 'Heading 4', icon: Heading4, keys: '⌘⌥4' },
  { value: 'bullets', label: 'Bulleted list', icon: List, keys: '⌘⇧8' },
  { value: 'numbered', label: 'Numbered list', icon: ListOrdered, keys: '⌘⇧7' },
  { value: 'quote', label: 'Quote', icon: Quote, keys: '' },
  { value: 'codeBlock', label: 'Code block', icon: Code, keys: '' },
];

function blogFormatting(instance: Editor | null): SelectionToolbarState {
  return {
    style: instance ? blogTextStyle(instance) : 'text',
    bold: instance?.isActive('bold') ?? false, italic: instance?.isActive('italic') ?? false,
    underline: instance?.isActive('underline') ?? false, strike: instance?.isActive('strike') ?? false,
    code: instance?.isActive('code') ?? false, highlight: instance?.isActive('highlight') ?? false,
    highlightColor: instance?.isActive('highlight') ? highlightColor(instance.getAttributes('highlight').color) : null,
    link: instance?.isActive('link') ?? false,
  };
}

function imageAtTarget(target: EventTarget | null) {
  if (target instanceof HTMLImageElement) return target;
  return target instanceof Element && target.matches('a[href]') ? target.querySelector<HTMLImageElement>(':scope > img:only-child') : null;
}

/** Shared case-study authoring controls over the blog's lossless HTML schema. */
export default function TiptapEditor({ content, onChange, uploadBodyImage }: {
  content: string; onChange: (html: string) => void;
  /** Uploads a body image and answers its URL. */
  uploadBodyImage: (file: File) => Promise<string>;
}) {
  const onChangeRef = useRef(onChange);
  const menuRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [linkRequest, setLinkRequest] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageError, setImageError] = useState('');
  const [imageFile, setImageFile] = useState<{ file: File; src: string } | null>(null);
  useEffect(() => () => { if (imageFile) URL.revokeObjectURL(imageFile.src); }, [imageFile]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageUploadActive = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const imagePanel = useRef<HTMLDivElement>(null);
  const imageTrigger = useRef<HTMLButtonElement>(null);
  const imageEditTrigger = useRef<HTMLButtonElement>(null);
  const imageActions = useRef<HTMLDivElement>(null);
  const imageMoveUp = useRef<HTMLButtonElement>(null);
  const imageMoveDown = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef<{ direction: BlogImageMoveDirection; nextPos: number } | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const actionVisible = useRef(false);
  const imagePress = useRef<{ image: HTMLImageElement; pointer: number; x: number; y: number } | null>(null);
  const imageSession = useRef<{ kind: 'insert'; at: number; afterCallout: number | null; returnToEditor: boolean; doc: ProseNode } | { kind: 'edit'; at: number; image: ProseNode } | null>(null);
  const [imageMode, setImageMode] = useState<'edit' | 'insert' | 'afterCallout'>('insert');
  const editingImage = imageMode === 'edit';
  const [imageActionAnchor, setImageActionAnchor] = useState<{ index: number; position: BlogImageActionPosition } | null>(null);
  const imageApplied = useRef(false);
  const mobile = useMediaQuery('(max-width: 767px)');
  const coarsePointer = useMediaQuery('(pointer: coarse)');
  // A narrow desktop editor is still a pointer-driven document, not a phone.
  const touchToolbar = mobile && coarsePointer;
  const [imageFrame, setImageFrame] = useState<{ bottom: number; maxHeight: number } | null>(null);
  useEffect(() => {
    if (!mobile || !imageOpen) return;
    const viewport = window.visualViewport;
    const update = () => setImageFrame(blogKeyboardFrame(window.innerHeight, viewport?.height ?? window.innerHeight, viewport?.offsetTop ?? 0));
    const frame = requestAnimationFrame(update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [mobile, imageOpen]);
  const options = useMemo<SelectionToolbarOptions>(() => ({ placement: coarsePointer ? 'bottom' : 'top', offset: coarsePointer ? 24 : 8, flip: true, shift: { padding: 16 } }), [coarsePointer]);
  const extensions = useMemo(() => blogEditorExtensions(CodeBlockLowlight.configure({ lowlight: createLowlight(common) }), BlogRelatedTileNode, BlogCta), []);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const stageImage = (file: File) => {
    const problem = validateBlogBodyImage(file);
    setImageError(problem ?? '');
    if (!problem) setImageFile({ file, src: URL.createObjectURL(file) });
  };
  const openImage = ({ selection, doc }: Editor['state'], returnToEditor: boolean, edit = false, pasted?: File) => {
    const image = edit && selection instanceof NodeSelection && selection.node.type.name === 'image' ? selection.node : null;
    if (edit && !image) return;
    if (edit) setEditing(true);
    const afterCallout = image ? null : blogAfterCallout({ selection });
    imageSession.current = image
      ? { kind: 'edit', at: selection.from, image }
      : { kind: 'insert', at: selection.to, afterCallout, returnToEditor, doc };
    imageApplied.current = false;
    setImageMode(image ? 'edit' : afterCallout !== null ? 'afterCallout' : 'insert');
    setImageUrl(image?.attrs.src ?? '');
    setImageAlt(image?.attrs.alt ?? '');
    setImageError('');
    setImageFile(null);
    if (pasted) stageImage(pasted);
    setImageOpen(true);
  };

  const insideEditor = (target: EventTarget | null) => target instanceof Node && (
    [editor?.view.dom, menuRef.current, chipRef.current, imageActions.current, imagePanel.current].some((element) => element?.contains(target))
    || (target instanceof Element && Boolean(target.closest(`[${PROSE_SURFACE}]`)))
  );
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content,
    onMount: ({ editor: instance }) => instance.view.dom.classList.remove('tiptap'),
    onUpdate: ({ editor: instance }) => onChangeRef.current(instance.getHTML()),
    onFocus: () => setEditing(true),
    onBlur: ({ event }) => { if (!insideEditor(event.relatedTarget)) setEditing(false); },
    editorProps: {
      attributes: { id: 'blog-content', class: styles.content, role: 'textbox', 'aria-label': 'Post content', 'aria-multiline': 'true', 'aria-description': 'Tap to write. Formatting appears while editing. Select text to format it. Use plus on a blank line, or type slash to insert. Alt+F10 moves to available tools.' },
      handlePaste: (view, event) => {
        const file = blogClipboardImage(event.clipboardData);
        if (!file) return false;
        event.preventDefault();
        openImage(view.state, true, false, file);
        return true;
      },
      handleClickOn: (view, _pos, node, nodePos, event, direct) => {
        if (!direct || node.type.name !== 'image' || event.metaKey || event.ctrlKey) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
        view.focus();
        setEditing(true);
        return true;
      },
      handleClick: (view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey) || !(event.target instanceof Element)) return false;
        const link = event.target.closest('a[href]');
        const href = link && view.dom.contains(link) ? safeBlogUrl(link.getAttribute('href') ?? '') : null;
        if (!href) return false;
        event.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape' || event.isComposing || storySlashKey.getState(view.state)?.active) return false;
        view.dom.blur();
        setEditing(false);
        return true;
      },
    },
  });
  const state = useEditorState({ editor, selector: ({ editor: instance }) => ({
    ...blogFormatting(instance),
    href: String(instance?.getAttributes('link').href ?? ''),
    canInsertCallout: instance ? canInsertBlogCallout(instance) : false,
    slash: instance ? storySlashKey.getState(instance.state) : null,
    blankLine: instance ? blankBlogLine(instance.state) : null,
    bodyParagraph: instance ? inBlogBodyParagraph(instance.state) : false,
    dividerTarget: instance ? blogToolbarDividerTarget(instance.state) : null,
    imageOrder: instance ? blogSelectedImageOrder(instance.state) : null,
    imagePosition: instance?.state.selection instanceof NodeSelection && instance.state.selection.node.type.name === 'image' ? instance.state.selection.from : null,
    canUndo: instance?.can().undo() ?? false, canRedo: instance?.can().redo() ?? false,
  }) });

  const imagePosition = state?.imagePosition ?? null;
  const imageActionPosition = imageActionAnchor?.index === imagePosition ? imageActionAnchor.position : null;
  const trackImageAction = imagePosition !== null && (editing || imageOpen);
  // Measure the real action and image rectangles. Do not add another shared
  // TipTap BubbleMenu or lay out any toolbar inside the article.
  useEffect(() => {
    if (!editor || imagePosition === null || !trackImageAction) return;
    let frame = 0;
    const body = editor.view.dom;
    const dock = body.closest('[data-blog-editor]')?.querySelector('[data-blog-save-dock]');
    const action = imageActions.current;
    const measure = () => {
      if (editor.isDestroyed || !action?.isConnected) return;
      const target = editor.view.nodeDOM(imagePosition);
      if (!(target instanceof HTMLElement)) { actionVisible.current = false; setImageActionAnchor(null); return; }
      const box = target.matches('img') ? target : target.querySelector('img') ?? target;
      // The link wrapper, when present, is still the image's own block.
      const neighbor = box.parentElement?.matches('a') ? box.parentElement : box;
      const view = window.visualViewport;
      const left = view?.offsetLeft ?? 0;
      const top = view?.offsetTop ?? 0;
      const position = blogImageActionPosition({
        image: box.getBoundingClientRect(), editor: body.getBoundingClientRect(),
        viewport: { left, top, right: left + (view?.width ?? window.innerWidth), bottom: top + (view?.height ?? window.innerHeight) },
        dockBottom: dock?.getBoundingClientRect().bottom,
        previousBottom: neighbor.previousElementSibling?.getBoundingClientRect().bottom,
        nextTop: neighbor.nextElementSibling?.getBoundingClientRect().top,
        button: { width: action.offsetWidth, height: action.offsetHeight },
      });
      actionVisible.current = Boolean(position);
      setImageActionAnchor(previous => {
        if (!position) return null;
        return previous?.index === imagePosition && previous.position.top === position.top && previous.position.left === position.left
          && previous.position.placement === position.placement ? previous : { index: imagePosition, position };
      });
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    update();
    const view = window.visualViewport;
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    view?.addEventListener('resize', update);
    view?.addEventListener('scroll', update);
    const observer = new ResizeObserver(update);
    const image = editor.view.nodeDOM(imagePosition);
    [body, dock, image, action].forEach(node => { if (node instanceof HTMLElement) observer.observe(node); });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      view?.removeEventListener('resize', update);
      view?.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [editor, imagePosition, trackImageAction]);
  useEffect(() => {
    const pending = moveFocus.current;
    if (!pending || pending.nextPos !== imagePosition || !imageActionPosition) return;
    moveFocus.current = null;
    const target = pending.direction === 'up' ? imageMoveUp.current : imageMoveDown.current;
    target?.focus({ preventScroll: true });
  }, [imageActionPosition, imagePosition]);
  if (!editor || !state) return null;
  const selectImage = (img: HTMLImageElement) => {
    if (editor.isDestroyed || !editor.view.dom.contains(img)) return false;
    const { view } = editor;
    const matches = (position: number) => {
      if (position < 0 || position >= view.state.doc.content.size || view.state.doc.nodeAt(position)?.type.name !== 'image') return false;
      const dom = view.nodeDOM(position);
      return dom === img || Boolean(dom?.contains(img));
    };
    const at = view.posAtDOM(img, 0, -1);
    let pos = [at, at - 1, at + 1].find(matches);
    // A link mark can shift the DOM offset away from its image. Fall back to
    // exact DOM identity, never the first image with the same src or alt.
    if (pos === undefined) view.state.doc.descendants((node, position) => {
      if (pos === undefined && node.type.name === 'image' && matches(position)) pos = position;
      return pos === undefined;
    });
    if (pos === undefined) return false;
    const selection = view.state.selection;
    if (!(selection instanceof NodeSelection) || selection.from !== pos) {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    }
    view.focus();
    setEditing(true);
    return true;
  };
  const moveImage = (direction: BlogImageMoveDirection, control: HTMLButtonElement) => {
    const result = moveBlogSelectedImage(editor.state, direction);
    if (!result) return;
    if (document.activeElement === control) moveFocus.current = { direction, nextPos: result.nextPos };
    editor.view.dispatch(result.tr);
    const updated = blogSelectedImageOrder(editor.state);
    if (updated) setMoveAnnouncement(`Image moved ${direction}. Block ${updated.index + 1} of ${updated.count}.`);
  };
  const keepImageControls = (target: EventTarget | null) => {
    if (actionVisible.current && !insideEditor(target) && !imageOpen && !moveFocus.current) setEditing(false);
  };
  const requestLink = () => {
    if (editor.state.selection.empty && editor.isActive('link')) editor.chain().focus().extendMarkRange('link').run();
    if (!editor.state.selection.empty || touchToolbar) setLinkRequest((count) => count + 1);
  };
  const applyImage = async () => {
    const session = imageSession.current;
    if (!session || imageUploadActive.current) return;
    const targetUnchanged = () => session.kind === 'edit'
      ? editor.state.doc.nodeAt(session.at) === session.image
      : editor.state.doc === session.doc;
    if (!targetUnchanged()) {
      setImageError('The article changed. Close this window and choose the image position again.');
      return;
    }
    const alt = imageAlt.trim();
    let src = safeBlogUrl(imageUrl, true);
    if (imageFile) {
      imageUploadActive.current = true;
      setUploadingImage(true);
      setImageError('');
      try {
        src = safeBlogUrl(await uploadBodyImage(imageFile.file), true);
        if (!src) throw new Error('Upload did not return a usable image.');
      } catch (reason) {
        setImageError(reason instanceof SaveRequestError ? explainFailure(reason, 'uploaded') : 'Could not upload the image. Your image and alt text are still here. Try again.');
        return;
      } finally {
        imageUploadActive.current = false;
        setUploadingImage(false);
      }
      if (editor.isDestroyed || imageSession.current !== session) return;
      if (!targetUnchanged()) {
        // Keep the completed URL in the dialog; don't silently place the image
        // at a stale cursor or upload the same bytes again.
        setImageFile(null);
        setImageUrl(src);
        setImageError('The article changed during upload. Copy the image URL below and insert it at the new position.');
        return;
      }
    }
    if (!src) { setImageError('Choose an image, paste a screenshot, or enter a valid image URL.'); return; }
    if (session.kind === 'edit') {
      const current = session.image;
      if (current.attrs.src !== src || (current.attrs.alt ?? '') !== alt) {
        const tr = closeHistory(editor.state.tr).setNodeMarkup(session.at, undefined, { ...current.attrs, src, alt });
        editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, session.at)));
      }
    } else {
      const previous = editor.state.doc;
      // A selected passage is not a replacement target for an image.
      if (session.afterCallout !== null) {
        const tr = insertBlogAfterCallout(editor.state, session.afterCallout, editor.schema.nodes.image.create({ src, alt }));
        if (tr) editor.view.dispatch(tr);
      } else {
        editor.chain().command(({ tr }) => { closeHistory(tr); return true; })
          .setTextSelection(session.at).setImage({ src, alt }).run();
      }
      if (editor.state.doc.eq(previous)) {
        if (imageFile) { setImageFile(null); setImageUrl(src); }
        setImageError('This position cannot take an image. Place the cursor in the article body.');
        return;
      }
    }
    imageApplied.current = true;
    setImageOpen(false);
  };
  const addDivider = () => {
    const target = blogToolbarDividerTarget(editor.state);
    if (target === 'cursor') { editor.chain().focus().setHorizontalRule().run(); return; }
    if (target === null) return;
    const tr = dividerAfterBlogContainer(editor.state);
    if (!tr) return;
    editor.view.dispatch(tr);
    editor.commands.focus(undefined, { scrollIntoView: false });
  };
  const closeImage = (event: Event) => {
    event.preventDefault();
    const session = imageSession.current;
    imageSession.current = null;
    setImageFile(null);
    if (session?.kind === 'edit' && imageActionPosition && imageEditTrigger.current?.isConnected) {
      imageEditTrigger.current.focus({ preventScroll: true });
    } else if (imageApplied.current || session?.kind === 'edit' || session?.kind === 'insert' && session.returnToEditor) {
      editor.commands.focus(undefined, { scrollIntoView: false });
    } else imageTrigger.current?.focus({ preventScroll: true });
  };

  const keepSelection = (event: React.PointerEvent<HTMLButtonElement>) => event.preventDefault();
  const actionFocus = () => editor.chain().focus(undefined, { scrollIntoView: false });
  const insertActions: SlashInsertAction[] = [
    { key: 'related-tile', label: 'Learn more card', terms: ['related', 'post', 'case study'], icon: ArrowUpRight, run: () => insertBlogRelatedTile(editor) },
    { key: 'image', label: 'Image', terms: ['picture', 'photo', 'media'], icon: ImagePlus, run: () => openImage(editor.state, true) },
    ...(state.bodyParagraph ? [{ key: 'cta', label: 'Button', terms: ['cta', 'link', 'action'], icon: MousePointerClick, run: () => insertBlogCta(editor) }] : []),
    ...(state.bodyParagraph ? [{ key: 'divider', label: 'Divider', terms: ['line', 'rule', 'separator'], icon: Minus, run: () => {
      if (!inBlogBodyParagraph(editor.state)) return;
      const transaction = dividerBeforeBlankBlogLine(editor.state);
      if (transaction) {
        editor.view.dispatch(transaction);
        editor.commands.focus(undefined, { scrollIntoView: false });
      } else addDivider();
    } }] : []),
    ...(state.canInsertCallout ? [{ key: 'callout', label: 'Callout', terms: ['notice', 'aside', 'tip'], icon: MessageSquare, run: () => insertBlogCallout(editor) }] : []),
  ];

  return <div className={styles.canvas}>
    <p className="text-sm leading-baseline text-foreground-muted mb-0">Use + on a blank line or type / to insert. Select text to format it.</p>
    <div className={styles.actions} aria-label="Post content actions">
      <button ref={imageTrigger} type="button" onClick={() => openImage(editor.state, false)} aria-haspopup="dialog" aria-expanded={imageOpen}>Insert image</button>
      <button type="button" disabled={!state.bodyParagraph} onPointerDown={keepSelection} onClick={() => insertBlogCta(editor)}>Insert button</button>
      <button type="button" onPointerDown={keepSelection} onClick={() => insertBlogRelatedTile(editor)}>Learn more card</button>
      <button type="button" disabled={!state.canInsertCallout} onPointerDown={keepSelection} onClick={() => insertBlogCallout(editor)}>Insert callout</button>
      <button type="button" disabled={state.dividerTarget === null} onPointerDown={keepSelection} onClick={() => addDivider()}>Divider</button>
      <button type="button" disabled={!state.canUndo} onPointerDown={keepSelection} onClick={() => actionFocus().undo().run()}>Undo</button>
      <button type="button" disabled={!state.canRedo} onPointerDown={keepSelection} onClick={() => actionFocus().redo().run()}>Redo</button>
    </div>
    <Dialog.Root open={imageOpen} onOpenChange={open => { if (!imageUploadActive.current) setImageOpen(open); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content ref={imagePanel} className={styles.imagePanel} style={mobile && imageFrame ? imageFrame : undefined} onCloseAutoFocus={closeImage}
          onOpenAutoFocus={event => { event.preventDefault(); uploadButton.current?.focus({ preventScroll: true }); }}
          onPaste={event => {
            const file = blogClipboardImage(event.clipboardData);
            if (file && !imageUploadActive.current) { event.preventDefault(); stageImage(file); }
          }}>
          <Dialog.Title className="font-sans text-lg font-semibold leading-baseline">{editingImage ? 'Edit image' : 'Insert image'}</Dialog.Title>
          <Dialog.Description className="text-sm leading-baseline text-foreground-muted">
            {editingImage ? 'Replace the image or update its alt text without moving it.' : imageMode === 'afterCallout'
              ? 'The image will be placed after the callout.' : 'The image goes where you left the cursor.'}
          </Dialog.Description>
          <div className={styles.imageSource}>
            <input ref={imageInput} type="file" accept={BLOG_IMAGE_ACCEPT} hidden aria-label="Image file" onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file && !imageUploadActive.current) stageImage(file);
            }} />
            <div className={styles.actions}>
              <button ref={uploadButton} type="button" disabled={uploadingImage} onClick={() => imageInput.current?.click()}>
                <ImagePlus size={16} aria-hidden="true" />{imageFile ? 'Choose another image' : 'Choose image file'}
              </button>
              {imageFile && <button type="button" disabled={uploadingImage} onClick={() => { setImageFile(null); setImageError(''); }}>Remove file</button>}
            </div>
            <p className={styles.imageHint}>Or paste an image here. PNG, JPEG, WebP, GIF, or AVIF, up to 4 MB.</p>
            {imageFile && <div className={styles.imageStaged}>
              <img src={imageFile.src} width={72} height={48} alt="" />
              <p role="status" className={styles.imageHint}><strong>{imageFile.file.name || 'Clipboard image'}</strong> · {uploadingImage ? 'Uploading…' : 'Ready to upload'}</p>
            </div>}
            {imageFile && <p className={styles.imageHint}>The uploaded file will have a public URL, even while the post is a draft.</p>}
          </div>
          <details className={styles.imageUrl} open={editingImage || Boolean(imageError && safeBlogUrl(imageUrl, true)) || undefined}>
            <summary>Use an image URL instead</summary>
            <label>Image URL<input type="url" disabled={uploadingImage} autoCapitalize="none" autoCorrect="off" value={imageUrl} onChange={event => { setImageUrl(event.target.value); setImageFile(null); setImageError(''); }} placeholder="https://… or /blog/image.jpg" /></label>
          </details>
          <label>Alt text<input disabled={uploadingImage} value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Describe the image for readers who cannot see it" /></label>
          {imageError && <p role="alert" className="text-sm leading-baseline text-status-error-text">{imageError}</p>}
          <div className={styles.imageDialogFooter}>
            <button type="button" className={styles.moreButton} disabled={uploadingImage} onClick={() => setImageOpen(false)}>Cancel</button>
            <button type="button" className={styles.saveButton} disabled={uploadingImage} onClick={() => void applyImage()}>{editingImage ? 'Apply image changes' : 'Insert image'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <div className="blog-content blog-cms-content" data-blog-authoring="">
      <EditorContent editor={editor}
      onPointerDownCapture={event => {
        const image = imageAtTarget(event.target);
        imagePress.current = image && event.isPrimary && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
          ? { image, pointer: event.pointerId, x: event.clientX, y: event.clientY } : null;
      }}
      onPointerCancelCapture={() => { imagePress.current = null; }}
      onPointerUpCapture={event => {
        const pressed = imagePress.current;
        imagePress.current = null;
        if (!pressed || event.pointerId !== pressed.pointer || imageAtTarget(event.target) !== pressed.image
            || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
            || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6) return;
        // A linked image click can be retargeted to neighboring text after
        // pointerup. Reconcile a short, exact image activation after that
        // default hit test, without turning text selection or drags into clicks.
        requestAnimationFrame(() => selectImage(pressed.image));
      }}
      onClickCapture={event => {
        if (event.metaKey || event.ctrlKey || !(event.target instanceof Element)) return;
        if (event.target.closest('a[href]')) event.preventDefault();
        const img = imageAtTarget(event.target);
        if (!img || event.shiftKey || event.altKey || !selectImage(img)) return;
        event.preventDefault();
        event.stopPropagation();
      }} onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.defaultPrevented) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); requestLink(); }
        if (event.altKey && event.key === 'F10') {
          const first = [imagePosition !== null && imageActionPosition ? imageEditTrigger.current : null, menuRef.current?.querySelector<HTMLElement>('button[tabindex="0"]'), chipRef.current?.querySelector<HTMLElement>('a, button')].find((element) => element?.isConnected);
          if (first) { event.preventDefault(); first.focus(); }
        }
      }} />
    </div>
    <span className="sr-only" role="status">{moveAnnouncement}</span>
    {trackImageAction &&
      <div ref={imageActions} className={styles.imageAction} role="group" aria-label="Selected image actions"
        data-blog-image-action="" data-image-arrangement={state.imageOrder ? "" : undefined} data-placement={imageActionPosition?.placement}
        style={imageActionPosition ? { top: imageActionPosition.top, left: imageActionPosition.left } : { visibility: 'hidden' }}>
        <button ref={imageEditTrigger} type="button" aria-label="Edit image" title="Edit image" aria-haspopup="dialog" aria-expanded={imageOpen}
          onPointerDown={event => event.preventDefault()} onClick={() => openImage(editor.state, true, true)}
          onBlur={event => keepImageControls(event.relatedTarget)}>
          <Pencil size={16} aria-hidden="true" /><span className={styles.imageEditLabel}>Edit image</span>
        </button>
        {state.imageOrder && <>
          <button ref={imageMoveUp} type="button" aria-label="Move image up" title="Move image up" aria-disabled={!state.imageOrder.canUp}
            onPointerDown={event => event.preventDefault()} onBlur={event => keepImageControls(event.relatedTarget)}
            onClick={event => moveImage('up', event.currentTarget)}>
            <ArrowUp size={16} aria-hidden="true" />
          </button>
          <button ref={imageMoveDown} type="button" aria-label="Move image down" title="Move image down" aria-disabled={!state.imageOrder.canDown}
            onPointerDown={event => event.preventDefault()} onBlur={event => keepImageControls(event.relatedTarget)}
            onClick={event => moveImage('down', event.currentTarget)}>
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        </>}
      </div>}
    {editing && !imageOpen && imagePosition === null && !state.slash?.active && state.blankLine !== null && <BlogCaretInsertMenu editor={editor} at={state.blankLine} actions={insertActions} />}
    {editing && state.slash?.active && <StorySlashMenu editor={editor} slash={state.slash} textStyles={TEXT_STYLES} onTextStyle={setBlogTextStyle} insertActions={insertActions} />}
    <TiptapSelectionToolbar editor={editor} state={state}
      open={editing && imagePosition === null} mobile={touchToolbar} options={options} menuRef={menuRef}
      linkRequest={linkRequest} validateHref={safeBlogUrl} textStyles={TEXT_STYLES} onTextStyle={setBlogTextStyle}
      onMobileInsertImage={() => openImage(editor.state, true)}
      onMobileDone={() => { editor.view.dom.blur(); setEditing(false); }} onBlur={(event) => { if (!insideEditor(event.relatedTarget)) setEditing(false); }} />
    <TiptapLinkChip editor={editor} open={editing && !touchToolbar} href={state.href} chipRef={chipRef} onEdit={requestLink} onBlur={(event) => { if (!insideEditor(event.relatedTarget)) setEditing(false); }} />
  </div>;
}
