import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import type { StoryBlock } from '@rcweston/story-core';
import { AuthoringCommandMenu, AuthoringCommandRow } from './AuthoringCommandMenu.js';
import { AUTHORING_COMMAND_MENU_MAX_HEIGHT, authoringCommandMenuWidth } from './menu.js';
import { BLOCK_GROUPS, blockMatches } from './block-catalog.js';
import { STORY_BLOCK_LABELS } from './StoryBlockEditor.js';
import { dismissStorySlash, listToggleState, setStorySlashKeys, setStoryTextStyle, type StorySlashState, type StoryTextStyle } from './story-prose-schema.js';
import { TEXT_STYLES, type AuthoringTextStyle } from './TiptapAuthoringToolbar.js';

/*
 * The slash menu, as in Notion: "/" in text lists what this line can become
 * (a paragraph style) and, in a prose block, every block that can go here;
 * typing filters; arrows move, Enter or Tab chooses, Escape closes and keeps
 * the text. The text box stays focused throughout and points at the active
 * option (aria-activedescendant), so it reads as a combobox.
 */

export interface SlashInsertAction {
  key: string;
  label: string;
  terms: string[];
  icon: LucideIcon;
  run: () => void;
}

const NO_INSERT_ACTIONS: SlashInsertAction[] = [];
interface SlashItem {
  key: string;
  group: string;
  label: string;
  hint?: string;
  keys?: string;
  icon: LucideIcon;
  run: () => void;
}

const STYLE_WORDS: Record<string, string[]> = {
  text: ['paragraph', 'body', 'plain'],
  large: ['lede', 'big', 'intro'],
  heading2: ['h2', 'heading', 'subheading', 'title'],
  heading3: ['h3', 'heading', 'subheading', 'title'],
  heading4: ['h4', 'heading', 'subheading', 'small'],
  heading5: ['h5', 'heading', 'subheading'],
  heading6: ['h6', 'heading', 'subheading'],
  bullets: ['bullet', 'list', 'unordered', 'ul'],
  numbered: ['number', 'list', 'ordered', 'ol'],
};

export default function StorySlashMenu({ editor, slash, onInsertBlock, textStyles = TEXT_STYLES, onTextStyle, insertActions = NO_INSERT_ACTIONS }: {
  editor: Editor;
  slash: StorySlashState;
  insertActions?: SlashInsertAction[];
  /** Reuse the text menu for another document schema, without story blocks. */
  textStyles?: AuthoringTextStyle[];
  onTextStyle?: (editor: Editor, style: string) => void;
  /** Present in a prose block, where a block can be inserted at the caret. */
  onInsertBlock?: (type: StoryBlock['type']) => void;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [, setFrame] = useState(0);

  const items = useMemo<SlashItem[]>(() => {
    const query = slash.query.trim().toLowerCase();
    const styles = textStyles
      .filter(style => !['bullets', 'numbered'].includes(style.value) || listToggleState(editor.state).enabled)
      .filter((style) => !query || [style.label, ...(STYLE_WORDS[style.value] ?? [style.value])].some((word) => word.toLowerCase().split(/\s+/).some((part) => part.startsWith(query))))
      .map((style) => ({
        key: `style-${style.value}`, group: 'Turn into', label: style.label, keys: style.keys, icon: style.icon,
        run: () => { if (onTextStyle) onTextStyle(editor, style.value); else setStoryTextStyle(editor, style.value as StoryTextStyle); },
      }));
    const blocks = onInsertBlock ? BLOCK_GROUPS.flatMap((group) => group.blocks
      .filter((offer) => offer.type !== 'prose' && blockMatches(offer, STORY_BLOCK_LABELS[offer.type], query))
      .map((offer) => ({
        key: `block-${offer.type}`, group: `Insert · ${group.label}`, label: STORY_BLOCK_LABELS[offer.type], hint: offer.hint, icon: offer.icon,
        run: () => onInsertBlock(offer.type),
      }))) : [];
    const inserts = insertActions.filter(action => !query || [action.label, ...action.terms]
      .some(word => word.toLowerCase().split(/\s+/).some(part => part.startsWith(query))))
      .map(action => ({ ...action, key: `insert-${action.key}`, group: 'Insert' }));
    return [...styles, ...blocks, ...inserts];
  }, [editor, insertActions, onInsertBlock, onTextStyle, slash.query, textStyles]);

  const current = Math.min(active, Math.max(items.length - 1, 0));
  // A new query starts at the top.
  const [query, setQuery] = useState(slash.query);
  if (query !== slash.query) {
    setQuery(slash.query);
    setActive(0);
  }

  const pick = (item: SlashItem | undefined) => {
    if (!item) {
      dismissStorySlash(editor);
      return;
    }
    if ((item.key === 'style-bullets' || item.key === 'style-numbered') && !listToggleState(editor.state).enabled) return;
    // The slash and its query go; what was asked for applies at the caret.
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
    item.run();
  };

  // The keys a menu needs, while it's open (story-prose-schema.ts hands them over).
  useEffect(() => {
    setStorySlashKeys(editor, (event) => {
      const count = items.length;
      if (event.key === 'Escape') { dismissStorySlash(editor); return true; }
      if (event.key === 'Enter' || (event.key === 'Tab' && count > 0)) { pick(items[current]); return true; }
      if (count === 0) return false;
      if (event.key === 'ArrowDown') setActive((current + 1) % count);
      else if (event.key === 'ArrowUp') setActive((current - 1 + count) % count);
      else if (event.key === 'Home') setActive(0);
      else if (event.key === 'End') setActive(count - 1);
      else return false;
      return true;
    });
    return () => setStorySlashKeys(editor, null);
  });

  // The text box is the combobox; it points at the option a key would choose.
  useEffect(() => {
    const dom = editor.view.dom;
    dom.setAttribute('aria-controls', `${id}-list`);
    dom.setAttribute('aria-expanded', 'true');
    dom.setAttribute('aria-autocomplete', 'list');
    if (items[current]) dom.setAttribute('aria-activedescendant', `${id}-${items[current].key}`);
    else dom.removeAttribute('aria-activedescendant');
    return () => {
      for (const name of ['aria-controls', 'aria-expanded', 'aria-autocomplete', 'aria-activedescendant']) dom.removeAttribute(name);
    };
  }, [current, editor, id, items]);

  useLayoutEffect(() => {
    listRef.current?.querySelector('[data-highlighted]')?.scrollIntoView({ block: 'nearest' });
  }, [current, items]);

  // It follows the caret when the page scrolls or resizes.
  useEffect(() => {
    const update = () => setFrame((frame) => frame + 1);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  let caret: { left: number; top: number; bottom: number };
  try { caret = editor.view.coordsAtPos(slash.from); } catch { return null; }
  const viewport = window.visualViewport;
  const start = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const availableAbove = caret.top - viewportTop - 18;
  const availableBelow = viewportBottom - caret.bottom - 18;
  const up = availableBelow < AUTHORING_COMMAND_MENU_MAX_HEIGHT && availableAbove > availableBelow;
  const maxHeight = Math.min(AUTHORING_COMMAND_MENU_MAX_HEIGHT, up ? availableAbove : availableBelow);
  if (maxHeight < 36) return null;
  const width = authoringCommandMenuWidth(viewportWidth);
  const left = Math.max(start + 12, Math.min(caret.left, start + viewportWidth - width - 12));

  return createPortal(
    <AuthoringCommandMenu
      ref={listRef}
      id={`${id}-list`}
      role="listbox"
      aria-label="Insert or turn into"
      data-story-editor-action
      data-open-up={up || undefined}
      style={{ left, top: up ? caret.top - 6 : caret.bottom + 6, width, maxHeight }}
      items={items}
      empty={<>Nothing matches “{slash.query}”. Esc to keep typing.</>}
      footer="↑↓ move · ↵ choose · esc close"
      renderItem={(item, index) => <AuthoringCommandRow as="div" label={item.label} icon={item.icon} hint={item.hint} keys={item.keys}
        id={`${id}-${item.key}`}
        role="option"
        aria-selected={index === current}
        data-highlighted={index === current ? '' : undefined}
        tabIndex={-1}
        onPointerDown={event => event.preventDefault()}
        onPointerMove={() => { if (index !== current) setActive(index); }}
        onClick={() => pick(item)}
        onKeyDown={event => { if (event.key === 'Enter') pick(item); }}
      />}
    />,
    document.body,
  );
}
