'use client';

import { StoryPage, type StoryCompany } from '@rcweston/story-react';
import type { Story, StoryTeaser } from '@rcweston/story-core';
import { blocks } from './SignupFunnel';
import { mediaUrl, renderLink } from './links';

export function Reader({ story, next, company }: { story: Story; next?: StoryTeaser; company?: StoryCompany | null }) {
  return (
    <StoryPage
      story={story}
      company={company}
      next={next}
      blocks={blocks}
      renderLink={renderLink}
      media={{ mediaUrl }}
      backLink={{ href: '/work', label: 'Work' }}
      hrefFor={(slug) => `/stories/${slug}`}
    />
  );
}
