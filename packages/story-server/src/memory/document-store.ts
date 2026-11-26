/**
 * The document store, in memory. Same behaviour as the Postgres store
 * (append-only versions, parent-pointer conflicts, a separate publication
 * pointer, renames that continue the story under the new address), for
 * demos, tests and local prototypes. Nothing survives a restart.
 */

import {
  DraftConflictError,
  PublicationConflictError,
  STORY_SCHEMA_VERSION,
  StoryMovedError,
  contentSha256,
  isLatestDocumentParent,
  storyDocumentId,
  type DocumentStore,
  type PublishedLookup,
  type RenameInput,
  type RenameResult,
  type SlugAliases,
  type SlugRedirect,
  type Story,
  type StoryDocument,
  type StoryPublication,
  type StorySummary,
} from '@rcweston/story-core';
import { withCover } from '../cover.js';
import { InvalidStoryError, StoryNotFoundError, contractRenameError } from '../errors.js';
import { planStoryRename, validateStory, validateStoryDraft } from '../validation.js';

export interface MemoryDocumentStoreOptions {
  /** Versions to start with, e.g. a demo's sample stories. Oldest first per story. */
  documents?: StoryDocument[];
  publications?: StoryPublication[];
  redirects?: SlugRedirect[];
  /** The clock, for tests. */
  now?: () => Date;
  /**
   * Runs before every read. Await a delay in it to feel what a slow server
   * is like in a demo, or throw from it to see how a failed read looks.
   */
  beforeRead?: (operation: 'list' | 'versions' | 'latest' | 'version' | 'published' | 'publications' | 'redirects' | 'aliases') => void | Promise<void>;
}

interface RedirectRow {
  to: string;
  createdAt: number;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryDocumentStore(options: MemoryDocumentStoreOptions = {}): DocumentStore {
  const now = options.now ?? (() => new Date());
  const beforeRead = options.beforeRead ?? (() => undefined);
  const documents = new Map<string, StoryDocument[]>();
  const publications = new Map<string, StoryPublication>();
  const redirects = new Map<string, RedirectRow>();
  let redirectClock = 0;

  for (const document of options.documents ?? []) {
    const list = documents.get(document.slug) ?? [];
    list.push(clone({ ...document, published: false }));
    list.sort((a, b) => a.version - b.version);
    documents.set(document.slug, list);
  }
  for (const publication of options.publications ?? []) publications.set(publication.slug, clone(publication));
  for (const redirect of options.redirects ?? []) redirects.set(redirect.from, { to: redirect.to, createdAt: redirectClock++ });

  // Writers take turns, like the Postgres store's per-story locks.
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => T | Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };

  const withPublished = (document: StoryDocument): StoryDocument => ({
    ...clone(document),
    published: publications.get(document.slug)?.documentId === document.id,
  });
  const versionsOf = (slug: string) => documents.get(slug) ?? [];
  const latestOf = (slug: string) => versionsOf(slug).at(-1) ?? null;
  const redirectList = (): SlugRedirect[] =>
    [...redirects.entries()]
      .sort((a, b) => b[1].createdAt - a[1].createdAt || a[0].localeCompare(b[0]))
      .map(([from, row]) => ({ from, to: row.to }));

  const insert = (slug: string, input: {
    version: number;
    content: Story;
    contentSha256: string;
    parentDocumentId: string | null;
    sourceKind: string;
    sourceRef: string;
    sourceCommit: string;
  }): StoryDocument => {
    const at = now().toISOString();
    const document: StoryDocument = {
      id: storyDocumentId(slug, input.version),
      slug,
      version: input.version,
      schemaVersion: STORY_SCHEMA_VERSION,
      workflowStatus: 'draft',
      content: clone(input.content),
      contentSha256: input.contentSha256,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      sourceCommit: input.sourceCommit,
      parentDocumentId: input.parentDocumentId,
      createdAt: at,
      updatedAt: at,
      published: false,
    };
    documents.set(slug, [...versionsOf(slug), document]);
    return document;
  };

  return {
    async list(): Promise<StorySummary[]> {
      await beforeRead('list');
      const summaries: StorySummary[] = [];
      for (const [slug, list] of documents) {
        if (redirects.has(slug)) continue;
        const latest = list.at(-1);
        if (!latest) continue;
        summaries.push({
          slug,
          title: latest.content.title,
          company: latest.content.company,
          ...(latest.content.projectYear ? { projectYear: latest.content.projectYear } : {}),
          ...withCover(latest.content),
          latestVersion: latest.version,
          latestDocumentId: latest.id,
          publishedDocumentId: publications.get(slug)?.documentId ?? null,
          updatedAt: latest.updatedAt,
        });
      }
      return summaries.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.slug.localeCompare(b.slug));
    },

    async versions(slug) {
      await beforeRead('versions');
      return versionsOf(slug).map(withPublished).reverse();
    },

    async latest(slug) {
      await beforeRead('latest');
      const latest = latestOf(slug);
      return latest ? withPublished(latest) : null;
    },

    async version(slug, version) {
      await beforeRead('version');
      const found = versionsOf(slug).find((document) => document.version === version);
      return found ? withPublished(found) : null;
    },

    saveDraft({ slug, content, parentDocumentId, source }) {
      return exclusive(() => {
        const problems = validateStoryDraft(content, slug);
        if (problems.length > 0) throw new InvalidStoryError(problems);
        const movedTo = redirects.get(slug)?.to;
        if (movedTo) throw new StoryMovedError(movedTo);
        const latest = latestOf(slug);
        if (!isLatestDocumentParent(parentDocumentId, latest?.id ?? null)) throw new DraftConflictError();
        const document = insert(slug, {
          version: (latest?.version ?? 0) + 1,
          content,
          contentSha256: contentSha256(content),
          parentDocumentId,
          sourceKind: source.kind,
          sourceRef: source.ref,
          sourceCommit: source.commit ?? '',
        });
        return withPublished(document);
      });
    },

    publish({ slug, documentId, expectedPublishedDocumentId, publishedBy = null }) {
      return exclusive(() => {
        const movedTo = redirects.get(slug)?.to;
        if (movedTo) throw new StoryMovedError(movedTo);
        const current = publications.get(slug) ?? null;
        if (expectedPublishedDocumentId !== undefined && (current?.documentId ?? null) !== expectedPublishedDocumentId) {
          throw new PublicationConflictError();
        }
        const candidate = versionsOf(slug).find((document) => document.id === documentId);
        if (!candidate) throw new StoryNotFoundError('That version isn’t saved under this story.');
        const problems = validateStory(candidate.content, slug);
        if (problems.length > 0) throw new InvalidStoryError(problems, 'This version can’t be published until its problems are fixed.');
        if (contentSha256(candidate.content) !== candidate.contentSha256) {
          throw new Error('The stored document checksum does not match its content.');
        }
        let publication = current;
        if (current?.documentId !== documentId) {
          publication = { slug, documentId, publishedAt: now().toISOString(), publishedBy };
          publications.set(slug, publication);
        }
        return { document: withPublished(candidate), publication: clone(publication!) };
      });
    },

    unpublish(slug) {
      return exclusive(() => {
        publications.delete(slug);
      });
    },

    delete(slug) {
      return exclusive(() => {
        publications.delete(slug);
        documents.delete(slug);
        for (const [from, row] of redirects) if (row.to === slug) redirects.delete(from);
      });
    },

    async published(slug): Promise<PublishedLookup> {
      try {
        await beforeRead('published');
        const publication = publications.get(slug);
        if (!publication) return { status: 'none' };
        const document = versionsOf(slug).find((entry) => entry.id === publication.documentId);
        if (!document) return { status: 'none' };
        return { status: 'published', document: withPublished(document) };
      } catch (error) {
        return { status: 'failed', error };
      }
    },

    async publications() {
      await beforeRead('publications');
      return [...publications.values()].map(clone).sort((a, b) => a.slug.localeCompare(b.slug));
    },

    rename(input: RenameInput): Promise<RenameResult> {
      return exclusive(() => {
        const { from, to } = input;
        try {
          const latest = latestOf(from);
          const publication = publications.get(from) ?? null;
          const published = publication ? versionsOf(from).find((document) => document.id === publication.documentId) ?? null : null;
          const plan = planStoryRename({
            from,
            to,
            expectedLatestDocumentId: input.expectedLatestDocumentId,
            latestDocument: latest ? { id: latest.id, content: latest.content } : null,
            publishedDocument: published ? { id: published.id, content: published.content } : null,
            authoredStory: null,
            fromRedirectsTo: redirects.get(from)?.to ?? null,
            fromHasHostRecord: false,
            target: {
              maxVersion: latestOf(to)?.version ?? 0,
              hasHostRecord: false,
              hasPublication: publications.has(to),
              hasAuthoredStory: false,
              redirectsTo: redirects.get(to)?.to ?? null,
            },
          }, { checksum: contentSha256, sourceCommit: input.source.commit ?? '' });

          for (const planned of plan.documents) {
            const problems = validateStoryDraft(planned.content, to);
            if (problems.length > 0) throw new InvalidStoryError(problems, 'The story can’t move until its problems are fixed.');
          }
          const inserted = plan.documents.map((planned) => insert(to, {
            ...planned,
            sourceKind: input.source.kind,
            sourceRef: input.source.ref || from,
            sourceCommit: input.source.commit ?? '',
          }));

          if (plan.publishDocumentId) {
            publications.set(to, { slug: to, documentId: plan.publishDocumentId, publishedAt: now().toISOString(), publishedBy: input.publishedBy ?? null });
          }
          if (plan.removeOldPublication) publications.delete(from);
          if (plan.redirects.retire) redirects.delete(plan.redirects.retire);
          for (const row of redirects.values()) if (row.to === plan.redirects.repointFrom) row.to = to;
          redirects.set(plan.redirects.add.from, { to: plan.redirects.add.to, createdAt: redirectClock++ });

          return {
            from,
            to,
            documents: inserted.map(withPublished).reverse(),
            publishedDocumentId: plan.publishDocumentId,
          };
        } catch (error) {
          throw contractRenameError(error);
        }
      });
    },

    async redirects() {
      await beforeRead('redirects');
      return redirectList();
    },

    async aliases(slug): Promise<SlugAliases> {
      await beforeRead('aliases');
      const list = redirectList();
      return {
        movedTo: redirects.get(slug)?.to ?? null,
        formerSlugs: list.filter((redirect) => redirect.to === slug).map((redirect) => redirect.from),
      };
    },
  };
}
