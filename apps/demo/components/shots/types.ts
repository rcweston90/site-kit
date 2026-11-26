/**
 * Photo Collage Component Types
 */

import type { Photo } from '@rcweston/site-data/client';

export type { Photo };

export interface PhotoCollageProps {
  /**
   * Array of photos to display
   */
  photos: Photo[];

  /**
   * Callback when a photo is clicked
   */
  onPhotoClick?: (index: number) => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

export interface ImageModalProps {
  /**
   * Array of photos
   */
  photos: Photo[];

  /**
   * Currently selected photo index
   */
  currentIndex: number;

  /**
   * Whether the modal is open
   */
  isOpen: boolean;

  /** Defaults to true. Set false only when the caller owns the page scroll lock. */
  lockBodyScroll?: boolean;

  /**
   * Callback to close the modal
   */
  onClose: () => void;

  /**
   * Callback to navigate to next photo
   */
  onNext: () => void;

  /**
   * Callback to navigate to previous photo
   */
  onPrevious: () => void;
}
