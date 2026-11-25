
import { chromeStyles } from './classes.js';/*
 * Every shortcut and typed shortcut the story editor answers to, in one
 * sheet (⌘/, or More → Keyboard shortcuts). The selection toolbar, the slash
 * menu and the block menu show the same keys beside their items; this is the
 * one place to learn them all.
 */

interface Shortcut { keys: string; does: string }

export const EDITOR_SHORTCUTS: { title: string; note?: string; items: Shortcut[] }[] = [
  { title: 'Formatting', note: 'Select text first.', items: [
    { keys: '⌘B', does: 'Bold' },
    { keys: '⌘I', does: 'Italic' },
    { keys: '⌘U', does: 'Underline' },
    { keys: '⌘⇧S', does: 'Strikethrough' },
    { keys: '⌘E', does: 'Inline code' },
    { keys: '⌘⇧H', does: 'Highlight' },
    { keys: '⌘K', does: 'Add or edit a link' },
    { keys: '⌘-click', does: 'Open a link in a new tab' },
    { keys: '⌘\\', does: 'Clear formatting' },
    { keys: '⌥F10', does: 'Move to the formatting toolbar' },
  ] },
  { title: 'Paragraph style', items: [
    { keys: '⌘⌥0', does: 'Text' },
    { keys: '⌘⌥1', does: 'Large text' },
    { keys: '⌘⌥3', does: 'Heading 3' },
    { keys: '⌘⌥4', does: 'Heading 4' },
    { keys: '⌘⇧8', does: 'Bulleted list' },
    { keys: '⌘⇧7', does: 'Numbered list' },
  ] },
  { title: 'As you type', items: [
    { keys: '/', does: 'Turn this line into a style, or insert any block here' },
    { keys: '- or *', does: 'Start a bulleted list' },
    { keys: '1.', does: 'Start a numbered list' },
    { keys: '### / ####', does: 'Heading 3 / Heading 4' },
    { keys: '**text**', does: 'Bold' },
    { keys: '*text*', does: 'Italic' },
    { keys: '~~text~~', does: 'Strikethrough' },
    { keys: '==text==', does: 'Highlight' },
    { keys: '`text`', does: 'Inline code' },
    { keys: '--  ...  ->', does: 'Em dash, ellipsis, arrow — and quotes curl' },
    { keys: 'https://…', does: 'A typed or pasted address becomes a link' },
    { keys: '⌘V an image', does: 'Paste or drop images into text: they become an image block there and upload' },
  ] },
  { title: 'Blocks', note: 'With a block selected and the caret out of its text.', items: [
    { keys: '⌘D', does: 'Duplicate' },
    { keys: '⌘⇧↑ / ⌘⇧↓', does: 'Move up / down, across sections at the edges' },
    { keys: 'Drag ⋮⋮', does: 'Move it anywhere; a line shows where it lands' },
    { keys: '⇧-click / ⇧↑ ⇧↓', does: 'Select several blocks in a section; the keys here then act on all of them' },
    { keys: 'Esc', does: 'Clear a selection of several blocks' },
    { keys: '⌫', does: 'Delete' },
    { keys: '⌘C / ⌘X', does: 'Copy / cut the block' },
    { keys: '⌘V', does: 'Paste the copied block below' },
    { keys: '⌥E', does: 'Open the block’s menu' },
  ] },
  { title: 'Document', items: [
    { keys: '↑ / ↓', does: 'At the first or last line, carry on into the text above or below' },
    { keys: 'Hover a gap', does: 'A + between blocks adds a text line there; type / to make it a component' },
    { keys: '⌘S', does: 'Save changes' },
    { keys: '⌘⇧F', does: 'Find and replace across the story' },
    { keys: '⌘Z / ⌘⇧Z', does: 'Undo / redo' },
    { keys: 'Esc', does: 'Leave the text and select its block; what you typed stays (⌘Z takes it back)' },
    { keys: '⌘/', does: 'This sheet' },
  ] },
];

export default function EditorShortcuts({ continuousMode = false }: { continuousMode?: boolean }) {
  // The legacy block commands require its handles and selection model.
  const groups = continuousMode ? [{ title: 'Continuous writing', items: [
    { keys: '/', does: 'Open the available insertion commands' },
    { keys: '⌘S', does: 'Save changes' },
    { keys: '⌘⇧F', does: 'Find and replace across the story' },
    { keys: '⌘Z / ⌘⇧Z', does: 'Undo / redo' },
    { keys: '⌘/', does: 'This sheet' },
  ], note: 'For block range selection, reorder, duplication and the full builder controls, choose More → Block tools. Both views share your draft.' }] : EDITOR_SHORTCUTS;
  return (
    <div className={chromeStyles.shortcutsStack}>
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`shortcuts-${group.title}`}>
          <h3 id={`shortcuts-${group.title}`} className={chromeStyles.shortcutsKeys}>
            {group.title}
          </h3>
          {group.note && <p className={chromeStyles.shortcutsHint}>{group.note}</p>}
          <dl className={chromeStyles.shortcutsDl}>
            {group.items.map((item) => (
              <div key={item.keys + item.does} className={chromeStyles.shortcutsPart}>
                <dt className={chromeStyles.shortcutsDt}><kbd>{item.keys}</kbd></dt>
                <dd className={chromeStyles.shortcutsHint}>{item.does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
