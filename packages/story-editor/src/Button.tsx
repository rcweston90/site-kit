import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonStyles } from './classes.js';

export interface EditorButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  leftIcon?: ReactNode;
}

/**
 * The editor's one button. It stands on a 2px edge, lifts on hover and
 * presses into the edge on click. Every size is 48px tall (two baselines).
 */
export const Button = forwardRef<HTMLButtonElement, EditorButtonProps>(function Button(
  { variant = 'secondary', size = 'md', leftIcon, type = 'button', className, children, ...props },
  ref,
) {
  const classes = [buttonStyles.button, buttonStyles[variant], buttonStyles[size], className].filter(Boolean).join(' ');
  return <button ref={ref} type={type} className={classes} {...props}>{leftIcon}{children}</button>;
});
