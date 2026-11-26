import { appIcon } from '@/lib/share-images';

/** Browsers still ask for /favicon.ico; answer with the drawn icon (a PNG, which they all accept). */
export const GET = () => appIcon(48);
