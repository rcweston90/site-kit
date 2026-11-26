import { checkStoryUpload } from '@rcweston/story-editor';

/** Why a file can't be uploaded as an image, or null when it can. */
export function validateImageFile(file: File, maxBytes?: number): string | null {
  const check = checkStoryUpload(file, maxBytes);
  if (!check.ok) return check.error;
  return check.kind === 'image' ? null : 'Use a PNG, JPEG, WebP or GIF image.';
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';
