import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, CircleMinus, Search, X } from 'lucide-react';
import { CALLOUT_PALETTES, calloutAppearanceAttributes, calloutPalettes, calloutTone, setCalloutIcon, setCalloutPalette, type StoryCallout } from '@rcweston/story-core';
import { CALLOUT_ICON_GROUPS, calloutIconOption, resolvedCalloutIcon } from '@rcweston/story-react';
import { StoryCalloutIcon } from '@rcweston/story-react';
import { blockStyles as blockStyles } from '@rcweston/story-react';
import { calloutAppearanceStyles as styles } from './classes.js';

const paletteGroups = ['Signals', 'Editorial'] as const;
const normalize = (text: string) => text.toLowerCase().trim().split(/\s+/).filter(Boolean);

export default function CalloutAppearanceEditor({ block, onChange }: { block: StoryCallout; onChange: (block: StoryCallout) => void }) {
  const group = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All icons');
  const explicitPalette = calloutPalettes.get(block.appearance?.palette ?? '');
  const selectedPalette = explicitPalette?.key ?? calloutTone(block.tone);
  const selectedIcon = resolvedCalloutIcon(block.icon, block.appearance?.icon);
  const SelectedGlyph = calloutIconOption(selectedIcon)?.[2] ?? CircleMinus;
  const filters = normalize(query);
  // Search always uses the whole catalogue. Category only scopes browsing.
  const visible = CALLOUT_ICON_GROUPS.filter(section => filters.length || category === 'All icons' || section.name === category).map(section => ({
    ...section,
    icons: section.icons.filter(([id, name, , tags]) => filters.every(term => `${id} ${name} ${tags} ${section.name}`.toLowerCase().includes(term))),
  })).filter(section => section.icons.length > 0);

  const resultCount = visible.reduce((sum, section) => sum + section.icons.length, 0);
  const dismiss = () => {
    if (disclosure.current) disclosure.current.open = false;
    summary.current?.focus({ preventScroll: true });
  };
  const closePicker = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !disclosure.current?.open) return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  };

  return <div className={styles.editor}>
    <div className={styles.preview} aria-label="Callout appearance preview">
      <span className={styles.kicker}>Preview</span>
      <aside className={`${blockStyles.callout} ${blockStyles.calloutPalette} ${styles.sample}`} {...calloutAppearanceAttributes(block)}>
        <div className={blockStyles.calloutHeader}>
          <StoryCalloutIcon icon={selectedIcon} />
          <p className={blockStyles.calloutTitle}>{block.title?.trim() || 'A useful detail'}</p>
        </div>
        <div className={blockStyles.calloutBody}><p>Draw attention to what matters in this section.</p></div>
      </aside>
    </div>

    <div className={`${styles.iconField} ${selectedIcon ? styles.hasIcon : ''}`}>
      <div className={styles.iconLabel}>
        {selectedIcon && <button type="button" aria-label="Remove icon" className={styles.clearIcon} onClick={() => {
          onChange(setCalloutIcon(block));
          dismiss();
        }}><X aria-hidden="true" /></button>}
      </div>
      <details ref={disclosure} className={styles.disclosure} onToggle={event => {
        if (!event.currentTarget.open) { setQuery(''); setCategory('All icons'); return; }
        // Do not summon the phone keyboard for someone who wants to browse.
        if (window.matchMedia('(pointer: fine)').matches) search.current?.focus({ preventScroll: true });
      }}>
        <summary ref={summary} className={styles.iconSummary} aria-label={`Choose icon, current: ${calloutIconOption(selectedIcon)?.[1] ?? 'No icon'}`} onKeyDown={closePicker}>
          <SelectedGlyph aria-hidden="true" />
          <span>{calloutIconOption(selectedIcon)?.[1] ?? 'No icon'}</span>
          <span className={styles.changeLabel}>Browse icons</span>
          <ChevronDown className={styles.caret} aria-hidden="true" />
        </summary>
        <div className={styles.iconBrowser} aria-label="Icon library">
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <input ref={search} type="search" value={query} onKeyDown={closePicker} aria-label="Search icons" placeholder="Search by name or purpose" onChange={event => setQuery(event.currentTarget.value)} />
          </label>
          <div className={styles.browseControls}>
            {filters.length === 0 && <select aria-label="Icon category" value={category} onKeyDown={closePicker} onChange={event => setCategory(event.currentTarget.value)}>
              <option>All icons</option>
              {CALLOUT_ICON_GROUPS.map(section => <option key={section.name}>{section.name}</option>)}
            </select>}
            <span role="status" className={styles.help}>{filters.length
              ? `${resultCount} ${resultCount === 1 ? 'match' : 'matches'}`
              : `${resultCount} icons`}</span>
          </div>
          {resultCount === 0 && <div className={styles.emptyResults}>
            <strong>No icons match</strong>
            <p className={styles.help}>Try a name like “shield” or a purpose like “research”.</p>
            <button type="button" className={styles.reset} onKeyDown={closePicker} onClick={() => {
              setQuery('');
              search.current?.focus({ preventScroll: true });
            }}>Clear search</button>
          </div>}
          {visible.map(section => <section key={section.name} aria-label={section.name} className={styles.iconGroup}>
            <p className={styles.kicker}>{section.name}</p>
            <div className={styles.icons}>
              {section.icons.map(([id, name, Glyph, , fallback]) => <button type="button" key={id} aria-pressed={selectedIcon === id}
                className={styles.icon} onKeyDown={closePicker} onClick={() => {
                  onChange(setCalloutIcon(block, id, fallback));
                  dismiss();
                }}>
                <Glyph aria-hidden="true" />
                <span>{name}</span>
                {selectedIcon === id && <Check className={styles.iconMark} aria-hidden="true" />}
              </button>)}
            </div>
          </section>)}
        </div>
      </details>
    </div>
    <fieldset className={styles.fieldset}>
      <legend>Color</legend>
      {!explicitPalette && <p className={styles.help}>Current: {calloutPalettes.get(selectedPalette)?.label}, original style. Choose a color to tint the callout.</p>}
      {paletteGroups.map(paletteGroup => <div key={paletteGroup} className={styles.paletteGroup}>
        <p className={styles.kicker}>{paletteGroup}</p>
        <div className={styles.colors}>
          {CALLOUT_PALETTES.filter(entry => entry.group === paletteGroup).map(entry => <label key={entry.key} className={styles.colorOption}>
            <input type="radio" name={group} checked={explicitPalette?.key === entry.key} onChange={() => onChange(setCalloutPalette(block, entry.key))} />
            <span className={`${blockStyles.calloutPalette} ${styles.swatch}`} data-callout-palette={entry.key} aria-hidden="true" />
            <span>{entry.label}</span>
            {explicitPalette?.key === entry.key && <Check className={styles.mark} aria-hidden="true" />}
          </label>)}
        </div>
      </div>)}
      {explicitPalette && <button type="button" className={styles.reset} onClick={() => {
        const appearance = { ...block.appearance };
        delete appearance.palette;
        onChange({ ...block, appearance: Object.keys(appearance).length ? appearance : undefined });
      }}>Use legacy treatment</button>}
    </fieldset>

  </div>;
}
