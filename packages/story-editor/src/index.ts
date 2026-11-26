/*
 * @rcweston/story-editor: the in-place story editor.
 *
 * - StoryEditor edits one story on the real page: block tools, or continuous
 *   writing over the same typed blocks.
 * - Every load, save, publish, rename and upload goes through an
 *   `EditorTransport` (see @rcweston/story-core), so the editor runs against
 *   a real backend, an in-memory demo or a test fake. Nothing here fetches.
 * - Routing is the host's: `navigate(href)` and `renderLink`.
 * - Saves explain themselves through @rcweston/save-kit: the leave guard,
 *   kept edits, ⌘S and signing back in over the page.
 */
export { default as StoryEditor, default, type StoryEditorProps, type StoryEditorExtension, type StoryEditorExtensionContext } from './StoryEditor.js';
export { SettingsSheet } from './EditorDrawer.js';
export { EDITOR_UI } from './editing-slots.js';
export { default as StoryInspector, type StoryAddressSettings } from './StoryInspector.js';
export { default as ContinuousStoryEditor } from './continuous/ContinuousStoryEditor.js';
export { default as EditorPublishButton, EditorialPublishControl, type PublicationControlProps } from './EditorPublishButton.js';
export { default as EditorThemeToggle, type EditorTheme } from './EditorThemeToggle.js';
export { InlineStoryText, InlineStoryAdd } from './InlineStoryText.js';
export { StoryProseEditor } from './StoryProseEditor.js';
export { CtaEditor, CtaFields } from './CtaEditor.js';
export { Button, type EditorButtonProps } from './Button.js';
export { STORY_BLOCK_LABELS } from './StoryBlockEditor.js';
export { BLOCK_GROUPS, BLOCK_ICONS, blockMatches, type BlockOffer } from './block-catalog.js';
export * from './block-actions.js';
export * from './model.js';
export {
  describePublicationIssue,
  describePublicationIssues,
  describeStoryPlace,
  locateStoryPlace,
  parseIssuePath,
  previewCardSettingsId,
  type PublicationChecklistRow,
  type PublicationIssueLabel,
  type StoryPathSegment,
} from './publication-issue-labels.js';
export { publicationTarget, type PublicationTarget } from './publication-target.js';
export { findInStory, replaceInStory, storyFindPattern, type StoryFindMatch, type StoryFindOptions } from './story-find.js';
export {
  PREVIEW_UPLOAD_NOTE,
  StoryMediaUploadContext,
  StoryMediaUploadError,
  measureMediaAspect,
  uploadStoryMedia,
  useStoryMediaUpload,
  useStoryMediaUploadTarget,
  type StoryMediaUploadTarget,
  type UploadedStoryMedia,
} from './media-upload-client.js';
export { STORY_UPLOAD_ACCEPT, STORY_UPLOAD_MAX_BYTES, checkStoryUpload, type StoryUploadKind } from './upload-checks.js';
export * from './classes.js';
export { ImageCatalog, fetchImageLibrary, type ImageCatalogItem, type ImageCatalogPage, type ImageCatalogQuery, type ImageLibrarySource } from './ImageCatalog.js';
// The authoring pieces other editors (site-admin's post editor) build on.
export { TiptapSelectionToolbar, TiptapLinkChip, PROSE_SURFACE, TEXT_STYLES, type AuthoringTextStyle, type ParagraphSpacing, type SelectionToolbarOptions, type SelectionToolbarState } from './TiptapAuthoringToolbar.js';
export { default as StorySlashMenu, type SlashInsertAction } from './StorySlashMenu.js';
export { StoryParagraphStyle, StoryHighlight, StoryTypography, StoryListBackwardDelete, StorySlash, storySlashKey, changeListIndent, enterInStoryLargeText, listToggleState, selectedListKind, setStoryLarge, toggleStoryList } from './story-prose-schema.js';
