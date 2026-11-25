import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkCredits, formatProblems, type CheckOptions } from './check.js';
import type { CreditsConfig } from './types.js';

const HELP = `credits-check: fail the build when a dependency isn't credited.

Usage: credits-check [--config <file>] [--root <dir>] [--package <package.json>]... [--json]

  --config   Credits file (default: the first of credits.config.mjs, .js, .json).
             A .ts file works when run through tsx.
  --root     Directory that paths are relative to (default: the config's folder).
  --package  A package.json to check; repeat for workspaces (default: package.json).
  --json     Print problems as JSON.

Exit codes: 0 credits are honest · 1 problems found · 2 the config couldn't be loaded.`;

export type CreditsFile = CreditsConfig & { check?: CheckOptions };

export function parseArgs(argv: string[]) {
  const args: { config?: string; root?: string; packages: string[]; json: boolean; help: boolean } = { packages: [], json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--config' || arg === '-c') args.config = value();
    else if (arg === '--root') args.root = value();
    else if (arg === '--package' || arg === '-p') args.packages.push(value());
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  return args;
}

export async function loadCreditsFile(path: string): Promise<CreditsFile> {
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8')) as CreditsFile;
  const mod = (await import(pathToFileURL(path).href)) as { default?: CreditsFile } & Partial<CreditsFile>;
  const file = mod.default ?? (mod as CreditsFile);
  if (!file || !Array.isArray(file.fields)) throw new Error(`${path} should export { fields, uncredited }`);
  return file;
}

export async function run(argv: string[], cwd = process.cwd(), log = console.log, error = console.error): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (reason) {
    error(String((reason as Error).message));
    error(HELP);
    return 2;
  }
  if (args.help) {
    log(HELP);
    return 0;
  }
  const candidates = args.config ? [args.config] : ['credits.config.mjs', 'credits.config.js', 'credits.config.json'];
  const configPath = candidates.map((file) => resolve(cwd, file)).find((file) => existsSync(file));
  if (!configPath) {
    error(args.config ? `Couldn’t find ${args.config}` : 'No credits.config.mjs, .js or .json here. Pass --config.');
    return 2;
  }
  let file: CreditsFile;
  try {
    file = await loadCreditsFile(configPath);
  } catch (reason) {
    error(`Couldn’t load ${configPath}: ${(reason as Error).message}`);
    return 2;
  }
  const options: CheckOptions = { ...file.check };
  options.root = resolve(cwd, args.root ?? options.root ?? dirname(configPath));
  if (args.packages.length) options.packageJson = args.packages;
  const problems = checkCredits(file, options);
  if (args.json) log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
  else (problems.length ? error : log)(formatProblems(problems));
  return problems.length ? 1 : 0;
}
