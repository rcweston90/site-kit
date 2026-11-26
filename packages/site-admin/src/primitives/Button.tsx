'use client';

import { forwardRef } from 'react';
import type { ButtonProps } from './Button.types.js';

// One interaction for every variant: a key stands on an edge, lifts off it on
// hover and presses into it on click, so the top always travels to the base.
const variantStyles = {
  raised: `bg-card-bg text-foreground border border-hover shadow-[0_2px_0_var(--border-hover),var(--shadow-key)]
    enabled:hover:bg-background enabled:hover:-translate-y-px enabled:hover:shadow-[0_3px_0_var(--border-hover),var(--shadow-key-hover)]
    enabled:active:translate-y-0.5 enabled:active:shadow-[0_0_0_var(--border-hover)]`,
  primary: `bg-foreground text-background border border-foreground shadow-[0_2px_0_var(--button-primary-edge),var(--shadow-key)]
    [--button-primary-edge:color-mix(in_srgb,var(--foreground)_55%,var(--color-neutral-900))]
    enabled:hover:bg-foreground/90 enabled:hover:-translate-y-px enabled:hover:shadow-[0_3px_0_var(--button-primary-edge),var(--shadow-key-hover)]
    enabled:active:translate-y-0.5 enabled:active:shadow-[0_0_0_var(--button-primary-edge)]`,
  secondary: `bg-card-bg text-foreground border border-default shadow-[0_2px_0_var(--border-hover)]
    enabled:hover:bg-background enabled:hover:border-hover enabled:hover:-translate-y-px enabled:hover:shadow-[0_3px_0_var(--border-hover)]
    enabled:active:translate-y-0.5 enabled:active:shadow-[0_0_0_var(--border-hover)]`,
  ghost: `bg-transparent text-foreground-muted border border-transparent
    enabled:hover:bg-card-bg enabled:hover:text-foreground enabled:hover:border-default enabled:hover:shadow-[0_2px_0_var(--border-hover)]
    enabled:active:translate-y-0.5 enabled:active:shadow-[0_0_0_var(--border-hover)]`,
  link: `bg-transparent text-accent-primary p-0 underline-offset-4
    enabled:hover:underline enabled:active:translate-y-px`,
};

// Every size is 12 + 24px line + 12 = 48px tall; sizes differ in type size and padding only.
const sizeStyles = {
  sm: 'px-3 py-half text-sm leading-baseline',
  md: 'px-5 py-half text-base leading-baseline',
  lg: 'px-6 py-half text-lg leading-baseline',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'raised', size = 'md', children, leftIcon, rightIcon, isLoading = false, fullWidth = false, disabled = false, type = 'button', className = '', ...props },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        aria-busy={isLoading || undefined}
        className={`
          inline-flex items-center justify-center gap-2
          font-medium rounded-lg
          transition-[color,background-color,border-color,box-shadow,opacity,filter,translate] duration-150
          enabled:active:duration-75 enabled:cursor-pointer
          motion-reduce:enabled:hover:translate-y-0 motion-reduce:enabled:active:translate-y-0
          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
          disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale
          ${variantStyles[variant]}
          ${variant !== 'link' ? sizeStyles[size] : ''}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        disabled={isDisabled}
      >
        {isLoading ? (
          <>
            <span
              aria-hidden="true"
              className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-none"
            />
            <span>Loading...</span>
          </>
        ) : (
          <>
            {leftIcon && <span aria-hidden="true" className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span aria-hidden="true" className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
