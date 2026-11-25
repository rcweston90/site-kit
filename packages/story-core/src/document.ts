import type { Story } from './types.js';

export const STORY_SCHEMA_VERSION = 1;

export type StoryDocumentStatus = 'draft' | 'ready' | 'archived';

/** An immutable content revision. Editing creates the next version. */
export interface StoryDocument {
  id: string;
  slug: string;
  version: number;
  schemaVersion: number;
  workflowStatus: StoryDocumentStatus;
  content: Story;
  contentSha256: string;
  sourceKind: string;
  sourceRef: string;
  sourceCommit: string;
  parentDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  published: boolean;
}

/** The insert-only representation used by imports and editor saves. */
export interface StoryDocumentSeed {
  id: string;
  slug: string;
  version: number;
  schemaVersion: number;
  workflowStatus: StoryDocumentStatus;
  content: Story;
  contentSha256: string;
  sourceKind: string;
  sourceRef: string;
  sourceCommit: string;
  parentDocumentId?: string | null;
}

export interface StoryPublication {
  slug: string;
  documentId: string;
  publishedAt: string;
  publishedBy: string | null;
}
