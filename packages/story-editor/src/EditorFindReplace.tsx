import { useId, useMemo, useState } from 'react';
import type { Story } from '@rcweston/story-core';
import { locateStoryPlace } from './publication-issue-labels.js';
import { findInStory, replaceInStory, storyFindPattern, type StoryFindOptions } from './story-find.js';

import { chromeStyles } from './classes.js';
const SHOWN = 40;
const field = chromeStyles.findReplaceField;
const button = chromeStyles.findReplaceRow;

/** The matched words in a field, shown in context with the match marked. */
function Snippet({ text, pattern }: { text: string; pattern: RegExp }) {
  const plain = text.replace(/\s+/g, ' ');
  const match = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(plain);
  if (!match) return <>{plain.slice(0, 80)}</>;
  const start = Math.max(0, match.index - 32);
  return <>
    {start > 0 && '…'}{plain.slice(start, match.index)}
    <mark className={chromeStyles.findReplaceMark}>{match[0]}</mark>
    {plain.slice(match.index + match[0].length, match.index + match[0].length + 48)}…
  </>;
}

/**
 * Find and replace for the whole story (⌘⇧F, or More → Find and replace).
 * Matches count as you type and list where they are; Go to selects the block
 * and closes the sheet. Replace all is one step, so ⌘Z takes it back.
 */
export default function EditorFindReplace({ story, onReplace, onGoTo }: {
  story: Story;
  onReplace: (story: Story, replaced: number) => void;
  onGoTo: (selectionId: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<StoryFindOptions>({ matchCase: false, wholeWord: false });
  const matches = useMemo(() => findInStory(story, query, options), [story, query, options]);
  const pattern = storyFindPattern(query, options);
  const total = matches.reduce((sum, match) => sum + match.count, 0);

  return (
    <form
      className={chromeStyles.findReplaceStack}
      onSubmit={(event) => {
        event.preventDefault();
        const result = replaceInStory(story, query, replacement, options);
        if (result.replaced) onReplace(result.story, result.replaced);
      }}
    >
      <div className={chromeStyles.findReplaceStack2}>
        <label htmlFor={`${id}-find`} className={chromeStyles.findReplaceSmallText}>Find</label>
        {/* The sheet opens to search, as a find bar does. */}
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input id={`${id}-find`} className={field} value={query} autoFocus autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
        <label htmlFor={`${id}-replace`} className={chromeStyles.findReplaceSmallText}>Replace with</label>
        <input id={`${id}-replace`} className={field} value={replacement} autoComplete="off" onChange={(event) => setReplacement(event.target.value)} />
        <div className={chromeStyles.findReplacePart}>
          {([['matchCase', 'Match case'], ['wholeWord', 'Whole words']] as const).map(([key, label]) => (
            <label key={key} className={chromeStyles.findReplaceRow2}>
              <input type="checkbox" className={chromeStyles.findReplaceCheckbox} checked={options[key]} onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className={chromeStyles.findReplaceSpreadRow}>
        <p role="status" className={chromeStyles.findReplaceStatus}>
          {!query ? 'Type to search every word in the story.' : total === 0 ? 'No matches.' : `${total} ${total === 1 ? 'match' : 'matches'} in ${matches.length} ${matches.length === 1 ? 'place' : 'places'}`}
        </p>
        <button type="submit" className={`${button} ${chromeStyles.findReplaceSubmit}`} disabled={total === 0}>
          Replace all
        </button>
      </div>

      {pattern && matches.length > 0 && (
        <ol className={chromeStyles.findReplaceStack3}>
          {matches.slice(0, SHOWN).map((match) => {
            const place = locateStoryPlace(story, match.path);
            return (
              <li key={match.path.join('.')} className={chromeStyles.findReplaceStack4}>
                <span className={chromeStyles.findReplacePart2}>
                  <span className={chromeStyles.findReplaceTruncated}>{place.where}{match.count > 1 ? ` · ${match.count}` : ''}</span>
                  <span className={chromeStyles.findReplaceTruncated2}><Snippet text={match.text} pattern={pattern} /></span>
                </span>
                <button type="button" className={`${button} ${chromeStyles.findReplaceButton}`} onClick={() => onGoTo(place.selectionId)} aria-label={`Go to ${place.where}`}>
                  Go to
                </button>
              </li>
            );
          })}
          {matches.length > SHOWN && <li className={chromeStyles.findReplaceHint}>And {matches.length - SHOWN} more places.</li>}
        </ol>
      )}
    </form>
  );
}
