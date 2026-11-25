'use client';

import Link from 'next/link';
import type { RenderLink } from '@rcweston/story-react';

export const renderLink: RenderLink = ({ href, ...props }) => <Link href={href} {...props} />;

export const mediaUrl = (key: string) => `/api/story/media/${key.split('/').map(encodeURIComponent).join('/')}`;
