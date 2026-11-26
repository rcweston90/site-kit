'use client';

import type { ReactNode } from 'react';
import { AnimatedText } from './AnimatedText.js';
import { tw } from './typography.js';

export function PageHeader({ title, subtitle, description, className = '', animationDelay = 0, children }: {
  title: string;
  subtitle?: string;
  description?: string;
  className?: string;
  animationDelay?: number;
  children?: ReactNode;
}) {
  return (
    <div className={`mb-major pb-[calc(var(--rhythm-minor)_-_1px)] border-b border-default ${className}`}>
      <AnimatedText text={title} as="h1" className={`${tw.h1} text-foreground`} delay={animationDelay} />
      {subtitle && (
        <p
          style={{ animationDelay: '0.3s' }}
          className="enter-rise [--enter-y:20px] mt-minor mb-0 text-base leading-baseline text-foreground-muted max-w-2xl"
        >
          {subtitle}
        </p>
      )}
      {description && (
        <div
          style={{ animationDelay: '0.5s' }}
          className="enter-rise [--enter-y:20px] mt-minor-2 max-w-3xl space-y-minor text-base text-foreground-muted leading-baseline"
        >
          <p>{description}</p>
        </div>
      )}
      {children}
    </div>
  );
}
