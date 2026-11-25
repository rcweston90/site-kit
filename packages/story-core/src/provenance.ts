/*
 * Source provenance for imported stories: proof that the authored sources an
 * import read are exactly those in a named commit. Git is injected, so this
 * runs anywhere; on Node, pass a runner built on child_process:
 *
 *   const git = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
 */

export const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

/** Whether `value` looks like an abbreviated or full Git commit SHA. */
export function isSourceCommit(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_COMMIT_PATTERN.test(value);
}

export interface GitRunResult {
  /** Exit status; null when the process didn't exit normally. */
  status: number | null;
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: string[]) => GitRunResult;

export interface VerifiedStoryProvenance {
  sourceCommit: string;
  currentHead: string;
  sourceRefs: string[];
  workingTreeClean: true;
  sourceMatchesCommit: true;
}

export interface StoryProvenanceInput {
  requestedCommit: string;
  /** Repository-relative paths of the authored sources the import read. */
  sourceRefs: string[];
  git: GitRunner;
  /** Which paths count as authored story sources. Defaults to any relative
   *  `.ts`, `.json` or `.md` path without `..` segments. */
  isSourceRef?: (path: string) => boolean;
  /** Further paths that must also be clean and unchanged, e.g. an index file. */
  extraPaths?: string[];
}

function defaultIsSourceRef(path: string): boolean {
  return /^(?!\/)[^\\]+\.(?:ts|json|md)$/.test(path) && !path.split('/').some((part) => part === '..' || part === '.' || part === '');
}

function gitOutput(git: GitRunner, args: string[]): string {
  const result = git(args);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0]} failed.`);
  return result.stdout.trim();
}

/**
 * Proves the imported sources are exactly those in `requestedCommit`. It
 * rejects uncommitted source changes and commits whose source tree differs.
 */
export function verifyStorySourceProvenance({
  requestedCommit,
  sourceRefs,
  git,
  isSourceRef = defaultIsSourceRef,
  extraPaths = [],
}: StoryProvenanceInput): VerifiedStoryProvenance {
  if (!isSourceCommit(requestedCommit)) {
    throw new Error('The requested source commit must be a 7 to 40 character hexadecimal Git SHA.');
  }
  if (sourceRefs.length === 0 || sourceRefs.some((path) => !isSourceRef(path))) {
    throw new Error('Every provenance source must be an authored story file.');
  }

  const sourceCommit = gitOutput(git, ['rev-parse', '--verify', `${requestedCommit}^{commit}`]);
  const currentHead = gitOutput(git, ['rev-parse', 'HEAD']);
  const paths = [...new Set([...sourceRefs, ...extraPaths])].sort();

  const status = gitOutput(git, ['status', '--porcelain', '--untracked-files=all', '--', ...paths]);
  if (status) {
    throw new Error('Authored story sources contain uncommitted changes; provenance cannot be verified.');
  }

  const diff = git(['diff', '--quiet', sourceCommit, '--', ...paths]);
  if (diff.status === 1) {
    throw new Error(`Authored story sources do not match source commit ${sourceCommit}.`);
  }
  if (diff.status !== 0) {
    throw new Error(diff.stderr.trim() || 'Unable to compare authored story sources with the source commit.');
  }

  return {
    sourceCommit,
    currentHead,
    sourceRefs: [...sourceRefs].sort(),
    workingTreeClean: true,
    sourceMatchesCommit: true,
  };
}
