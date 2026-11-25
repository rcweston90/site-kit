import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';

import { chromeStyles } from './classes.js';
export interface EditorSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Width and layout classes belong on the component shell. */
  shellClassName?: string;
  /** Tight horizontal footprint for utility rows; identical native semantics. */
  compact?: boolean;
}

/** Native select semantics with an owned, consistently inset visual chevron. */
export const EditorSelect = forwardRef<HTMLSelectElement, EditorSelectProps>(function EditorSelect(
  { className = '', shellClassName = '', compact = false, children, ...props },
  ref,
) {
  return (
    <span className={`${chromeStyles.selectPart} ${shellClassName}`.trim()}>
      <select
        ref={ref}
        className={`${chromeStyles.selectSelect} ${compact ? chromeStyles.selectSelectOn : chromeStyles.selectSelectOff} ${chromeStyles.selectSelect2} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className={`${chromeStyles.selectChevronDown} ${compact ? chromeStyles.selectChevronDownOn : chromeStyles.selectChevronDownOff}`} />
    </span>
  );
});
