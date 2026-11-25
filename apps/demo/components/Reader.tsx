'use client';

import { StoryPage } from '@rcweston/story-react';
import type { Story, StoryTeaser } from '@rcweston/story-core';
import { blocks } from './SignupFunnel';
import { mediaUrl, renderLink } from './links';

export function Reader({ story, next }: { story: Story; next?: StoryTeaser }) {
  return (
    <StoryPage
      story={story}
      next={next}
      blocks={blocks}
      renderLink={renderLink}
      media={{ mediaUrl }}
      backLink={{ href: '/', label: 'Stories' }}
      hrefFor={(slug) => `/stories/${slug}`}
    />
  );
}
