'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { useCanHover } from './useMediaQuery.js';

export const TAG_VARIANTS = ['default', 'outline', 'solid', 'bracket'] as const;
export type TagVariant = (typeof TAG_VARIANTS)[number];
type MotionConflicts = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart';

export interface TagProps extends Omit<HTMLAttributes<HTMLElement>, MotionConflicts> {
  children: ReactNode;
  variant?: TagVariant;
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
}

const tagVariantStyles = {
  default: 'bg-background-secondary text-foreground-muted border border-default',
  outline: 'bg-transparent text-foreground-muted border border-default hover:border-accent-primary',
  solid: 'bg-accent-primary text-background border border-transparent',
  bracket: '',
};

const tagSizeStyles = {
  sm: 'h-minor px-2 text-xs leading-baseline',
  md: 'h-minor-2 px-3 text-sm leading-baseline',
};

export const Tag = forwardRef<HTMLElement, TagProps>(
  ({ children, variant = 'default', size = 'sm', onClick, 'aria-pressed': ariaPressed, removable = false, onRemove, className = '', ...props }, ref) => {
    const isInteractive = !!onClick;
    const canHover = useCanHover();
    const Component = isInteractive ? 'button' : 'span';
    if (variant === 'bracket') {
      return (
        <span {...props} ref={ref as React.Ref<HTMLSpanElement>} className={`font-mono text-xs leading-baseline uppercase tracking-wider ${className}`}>
          [{children}]
        </span>
      );
    }
    return (
      <Component
        {...props}
        ref={ref as React.Ref<HTMLButtonElement & HTMLSpanElement>}
        onClick={onClick}
        aria-pressed={isInteractive ? ariaPressed : undefined}
        className={`
          inline-flex items-center gap-1.5
          font-medium rounded-full
          transition-[color,background-color,border-color,scale] duration-200
          ${isInteractive ? `active:scale-95 motion-reduce:active:scale-100 ${canHover ? 'hover:scale-105 motion-reduce:hover:scale-100' : ''}` : ''}
          ${tagVariantStyles[variant]}
          ${tagSizeStyles[size]}
          ${isInteractive ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2' : ''}
          ${className}
        `}
      >
        {children}
        {removable && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove?.();
            }}
            className="ml-1 p-1 -mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-accent-primary transition-colors"
            aria-label="Remove"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        )}
      </Component>
    );
  },
);
Tag.displayName = 'Tag';
