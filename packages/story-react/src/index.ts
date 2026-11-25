/*
 * @rcweston/story-react: the story reader.
 *
 * - StoryPage renders a whole story: hero, chapters, decisions, hindsight,
 *   credits and the next story, with a contents rail.
 * - Every part is exported too, for hosts that lay a story out themselves
 *   and for the editor, which renders the same components in place.
 * - Custom blocks come from a `blocks` registry; links go through
 *   `renderLink`, so nothing here depends on a router.
 * - Styling is one plain stylesheet (`styles.css`) over a token contract
 *   (`tokens.css`).
 */
export { StoryPage, type StoryPageProps } from './StoryPage.js';
export { StoryHero, type StoryHeroReviewLayout, type StoryCompany } from './StoryHero.js';
export { StoryChapter, StoryCredits, StoryHindsight } from './StoryChapter.js';
export { StoryBlocks, StoryHeading, StoryCalloutIcon, SPACER_SIZES, SPACER_LABEL, type StoryBlockIdentity } from './StoryBlocks.js';
export {
  StoryMedia,
  StoryMediaEmptyEditorContext,
  StoryMediaPreviewContext,
  PREVIEW_NOTE,
  Caption,
  EmptySlot,
  ShotSlot,
  boxStyle,
  type SlotDrop,
} from './StoryMedia.js';
export { StoryLines, StoryRichText, StoryRichParagraph } from './StoryRichText.js';
export { StoryDecisions } from './StoryDecisions.js';
export { ChapterBar } from './ChapterBar.js';
export { ContributionSection } from './ContributionSection.js';
export { CompareSwitch, type CompareItem } from './CompareSwitch.js';
export { NextStudy } from './NextStudy.js';
export { StoryImageLightbox } from './StoryImageLightbox.js';
export { InlineStoryText, InlineStoryAdd } from './InlineStoryText.js';
export { MotionToggle } from './MotionToggle.js';
export { HeroMorph } from './HeroMorph/HeroMorph.js';
export { StoryProvider, useStoryEnvironment, defaultRenderLink, type RenderLink, type StoryEnvironment } from './context.js';
export {
  isStoryVisible,
  type BlockDefinition,
  type BlockInspectorProps,
  type BlockRegistry,
  type BlockRenderProps,
  type CtaEditorProps,
  type InlineAddProps,
  type InlineTextProps,
  type MediaEmptySlotProps,
  type ProseEditorProps,
  type SpacerControlProps,
  type SpacerSize,
  type StoryEditingSlots,
  type StoryProseBlock,
  type StoryProseSplit,
  type StoryRenderEditor,
} from './editor.js';
export { CALLOUT_ICON_GROUPS, calloutIconOption, resolvedCalloutIcon } from './callout-icons.js';
export { chapterName, chapterNavItems, chapterShortName, type ChapterNavSource } from './chapter-navigation.js';
export { heroLogo } from './hero-logo.js';
export { hasAuthoredHeroMedia, resolveHeroMediaSlots, type HeroMediaSlots, type HeroPrimaryVisual } from './hero-media-slots.js';
export { storyHeroPresentation, type PersistedHeroPresentationLayout } from './hero-presentation.js';
export { mediaAppearanceStyle, mediaMatAppearanceStyle } from './media-appearance.js';
export {
  DEFAULT_MEDIA_POSITION,
  MAX_MEDIA_ZOOM,
  clampMediaPosition,
  embedFramingHidesControls,
  embedFramingStyle,
  mediaFramingStyle,
  normalizeMediaFraming,
} from './media-framing.js';
export { STORY_MAT_PRESETS, isStoryMatPreset, lowMatContrast, normalizeMatHex, sharedMatColor, storyMatStyle, storyToneMat } from './media-mat.js';
export { mobileToolbarFrame } from './story-editor-layout.js';
export { useMediaQuery, usePrefersReducedMotion } from './useMediaQuery.js';
export * from './classes.js';
