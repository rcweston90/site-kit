import { createContext, useContext, type ReactNode } from 'react';
import type { MediaResolveOptions } from '@rcweston/story-core';
import type { BlockRegistry } from './editor.js';

/** How a host draws a link: its router's link component, or a plain anchor. */
export type RenderLink = (props: {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  'aria-current'?: 'page';
}) => ReactNode;

export const defaultRenderLink: RenderLink = ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>;

export interface StoryEnvironment {
  /** Components for `custom` blocks, by the name a block stores in `component`. */
  blocks: BlockRegistry;
  renderLink: RenderLink;
  /** Where uploaded media loads from (see resolveMedia in story-core). */
  media: MediaResolveOptions;
  /** Show unfilled shot slots (what footage a frame is waiting for). Off for
   *  readers; turn it on in development. */
  showShots: boolean;
}

const DEFAULT_ENVIRONMENT: StoryEnvironment = { blocks: {}, renderLink: defaultRenderLink, media: {}, showShots: false };

const StoryEnvironmentContext = createContext<StoryEnvironment>(DEFAULT_ENVIRONMENT);

/** The host's choices for every story component below it. StoryPage sets
 *  this from its props; an editor that renders parts of a story sets it too. */
export function StoryProvider({ children, ...value }: Partial<StoryEnvironment> & { children: ReactNode }) {
  const parent = useContext(StoryEnvironmentContext);
  return <StoryEnvironmentContext.Provider value={{ ...parent, ...stripUndefined(value) }}>{children}</StoryEnvironmentContext.Provider>;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export function useStoryEnvironment(): StoryEnvironment {
  return useContext(StoryEnvironmentContext);
}
