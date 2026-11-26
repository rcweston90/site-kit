'use client';

import { Fragment } from 'react';

export type TextElement = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';

const WORD_STAGGER = 0.08;

/** Text whose words flip in one after another. Pure CSS (`.enter-word`), so it paints with the first frame. */
export function AnimatedText({ text, className = '', innerClassName = '', delay = 0, as = 'h1' }: {
  text: string;
  className?: string;
  innerClassName?: string;
  delay?: number;
  as?: TextElement;
}) {
  const words = text.split(' ');
  const Tag = as;
  return (
    <Tag className={className} aria-label={text}>
      <span className={`inline-flex flex-wrap gap-x-[0.25em] ${innerClassName}`} aria-hidden="true">
        {words.map((word, index) => (
          <Fragment key={index}>
            <span className="enter-word inline-block" style={{ animationDelay: `${delay + index * WORD_STAGGER}s` }}>
              {word}
            </span>
            {index < words.length - 1 && ' '}
          </Fragment>
        ))}
      </span>
    </Tag>
  );
}
