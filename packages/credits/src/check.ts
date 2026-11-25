import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { CreditsConfig } from './types.js';

export type DependencyKind = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';

export interface CheckOptions {
  /** Directory that `where` paths and package.json paths are relative to. */
  root?: string;
  /** package.json files whose packages must be credited. Default: `package.json`. */
  packageJson?: string[];
  /** Which dependency lists count. Default: dependencies and devDependencies. */
  include?: DependencyKind[];
  /** Packages to leave out entirely: exact names, or patterns. Workspace
   *  links (`workspace:`, `link:`, `file:`) are always left out. */
  ignore?: (string | RegExp)[];
  /** Check that `where` paths exist. Default true. */
  checkPaths?: boolean;
}

export type ProblemCode =
  | 'uncredited-package'
  | 'stale-credit'
  | 'stale-reason'
  | 'credited-and-uncredited'
  | 'empty-reason'
  | 'duplicate-field'
  | 'bad-field-id'
  | 'empty-field'
  | 'duplicate-row'
  | 'insecure-link'
  | 'missing-path'
  | 'unreadable-package-json';

export interface CreditProblem {
  code: ProblemCode;
  message: string;
  package?: string;
  field?: string;
}

const LOCAL_SPEC = /^(workspace|link|file|portal):/;

interface Installed {
  name: string;
  from: string;
}

function readInstalled(root: string, files: string[], include: DependencyKind[], ignore: (string | RegExp)[], problems: CreditProblem[]): Installed[] {
  const seen = new Map<string, Installed>();
  const ignored = (name: string) => ignore.some((rule) => (typeof rule === 'string' ? rule === name : rule.test(name)));
  for (const file of files) {
    const path = isAbsolute(file) ? file : resolve(root, file);
    let pkg: Partial<Record<DependencyKind, Record<string, string>>> & { name?: string };
    try {
      pkg = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      problems.push({ code: 'unreadable-package-json', message: `${file} couldn’t be read as JSON` });
      continue;
    }
    for (const kind of include) {
      for (const [name, spec] of Object.entries(pkg[kind] ?? {})) {
        if (LOCAL_SPEC.test(String(spec)) || ignored(name) || seen.has(name)) continue;
        seen.set(name, { name, from: file });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Every problem with a set of credits, in plain sentences. An empty array
 * means the credits are honest: every installed package is credited or has a
 * reason, nothing credited is gone, and every link and path holds up.
 */
export function checkCredits(config: CreditsConfig, options: CheckOptions = {}): CreditProblem[] {
  const root = resolve(options.root ?? process.cwd());
  const include = options.include ?? ['dependencies', 'devDependencies'];
  const problems: CreditProblem[] = [];
  const fields = config.fields ?? [];
  const uncredited = config.uncredited ?? {};

  // The fields themselves.
  const ids = new Set<string>();
  for (const field of fields) {
    if (ids.has(field.id)) problems.push({ code: 'duplicate-field', field: field.id, message: `The field id “${field.id}” is used twice` });
    ids.add(field.id);
    if (!/^[a-z][a-z0-9-]*$/.test(field.id)) problems.push({ code: 'bad-field-id', field: field.id, message: `“${field.id}” isn’t a kebab-case id` });
    if (!field.credits?.length) problems.push({ code: 'empty-field', field: field.id, message: `${field.title} has no credits` });
    const rows = new Set<string>();
    for (const credit of field.credits ?? []) {
      const row = `${credit.role}|${credit.name}`;
      if (rows.has(row)) problems.push({ code: 'duplicate-row', field: field.id, message: `${field.title}: “${credit.role} · ${credit.name}” is listed twice` });
      rows.add(row);
      if (credit.href && !/^https:\/\//.test(credit.href)) {
        problems.push({ code: 'insecure-link', field: field.id, message: `${credit.name}: the link should be https (${credit.href})` });
      }
      if (options.checkPaths !== false && credit.where) {
        for (const path of credit.where.split(' · ').map((part) => part.trim()).filter(Boolean)) {
          if (!existsSync(resolve(root, path))) problems.push({ code: 'missing-path', field: field.id, message: `${credit.name}: ${path} isn’t in the repo` });
        }
      }
    }
  }

  // The packages.
  const installed = readInstalled(root, options.packageJson ?? ['package.json'], include, options.ignore ?? [], problems);
  const installedNames = new Set(installed.map((entry) => entry.name));
  const credited = new Map<string, string>();
  for (const field of fields) for (const credit of field.credits ?? []) for (const name of credit.packages ?? []) credited.set(name, credit.name);

  for (const { name, from } of installed) {
    if (!credited.has(name) && !(name in uncredited)) {
      problems.push({ code: 'uncredited-package', package: name, message: `${name} (in ${from}) needs a credit, or a reason in uncredited` });
    }
  }
  for (const [name, by] of credited) {
    if (!installedNames.has(name)) problems.push({ code: 'stale-credit', package: name, message: `${name} is credited (under ${by}) but isn’t installed any more` });
    if (name in uncredited) problems.push({ code: 'credited-and-uncredited', package: name, message: `${name} is both credited and listed as uncredited` });
  }
  for (const [name, reason] of Object.entries(uncredited)) {
    if (!installedNames.has(name)) problems.push({ code: 'stale-reason', package: name, message: `${name} has a reason in uncredited but isn’t installed any more` });
    if (!String(reason ?? '').trim()) problems.push({ code: 'empty-reason', package: name, message: `${name} is uncredited without a reason` });
  }
  return problems;
}

/** Throws one error listing every problem, for use inside any test runner. */
export function assertCredits(config: CreditsConfig, options?: CheckOptions): void {
  const problems = checkCredits(config, options);
  if (problems.length) throw new Error(formatProblems(problems));
}

export function formatProblems(problems: CreditProblem[]): string {
  if (!problems.length) return 'Credits check passed.';
  const noun = problems.length === 1 ? 'problem' : 'problems';
  return [`Credits check found ${problems.length} ${noun}:`, ...problems.map((problem) => `  ✗ ${problem.message}`)].join('\n');
}

/** For a config path given relative to a file. */
export const relativeTo = (file: string, path: string) => resolve(dirname(file), path);
