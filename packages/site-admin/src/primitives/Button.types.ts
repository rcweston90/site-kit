/**
 * Button Component Types
 */

import { ReactNode, ButtonHTMLAttributes } from 'react';

/** Every variant, in display order. Stories and controls read this list. */
export const BUTTON_VARIANTS = ['raised', 'primary', 'secondary', 'ghost', 'link'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button visual style variant. Every variant moves like the keycap Lock
   * uses on /work: it lifts on hover and presses down on click. `raised`, the
   * default, is the full key on a 2px edge with a drop shadow; `primary`
   * the same key inked in the text colour, for the one action a form exists
   * for (Unlock on /work); `secondary` the same key and edge with a lighter
   * outline and no shadow; `ghost`
   * shows that key only on hover; `link` is an inline text action that
   * presses down 1px.
   * @default 'raised'
   */
  variant?: ButtonVariant;

  /**
   * Button size
   * @default 'md'
   */
  size?: ButtonSize;

  /**
   * Button content
   */
  children: ReactNode;

  /**
   * Optional icon to display before text
   */
  leftIcon?: ReactNode;

  /**
   * Optional icon to display after text
   */
  rightIcon?: ReactNode;

  /**
   * Whether the button is in a loading state
   * @default false
   */
  isLoading?: boolean;

  /**
   * Whether the button takes full width
   * @default false
   */
  fullWidth?: boolean;
}
