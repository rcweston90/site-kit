import { BLOG_IMAGE_MAX_BYTES, BLOG_IMAGE_TYPES } from '@rcweston/site-data/client';

// This picker offers raster images only. The editor's URL mode still accepts
// existing site graphics; pasted SVG, HTML, and remote URLs are not uploaded.
export { BLOG_IMAGE_TYPES };
export const BLOG_IMAGE_ACCEPT = BLOG_IMAGE_TYPES.join(',');

export function validateBlogBodyImage(file: File): string | null {
  if (!BLOG_IMAGE_TYPES.some(type => file.type === type)) return 'Choose a PNG, JPEG, WebP, GIF, or AVIF image.';
  if (!file.size) return 'This file is empty. Choose another image.';
  if (file.size > BLOG_IMAGE_MAX_BYTES) return 'Choose an image no larger than 4 MB.';
  return null;
}

/** Only capture a pixel/file paste. Rich HTML or text goes through the
 * normal editor clipboard pipeline rather than being replaced by a dialog. */
export function blogClipboardImage(data: Pick<DataTransfer, 'files' | 'items' | 'getData'> | null): File | null {
  if (!data || data.getData('text/plain').trim() || data.getData('text/html').trim()) return null;
  return Array.from(data.files).find(file => file.type.startsWith('image/'))
    ?? Array.from(data.items).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    ?? null;
}
