/**
 * The credits schema: who did what, and every project, typeface, tool and
 * service a codebase stands on, grouped into fields the way a film's end
 * credits are.
 */

export interface Credit {
  /** What they did, or what it does, in a few words: the role column. */
  role: string;
  /** Who or what gets the credit. */
  name: string;
  /** What it does in this project, in one line. */
  note?: string;
  /** Where to find them. Must be https. */
  href?: string;
  /** Where it lives in the repo, when there's one place to look. Several
   *  paths are separated by " · ". Each must exist. */
  where?: string;
  /** The npm packages this credit covers. */
  packages?: string[];
}

export interface CreditField {
  /** Anchor id, kebab-case. */
  id: string;
  title: string;
  /** One sentence on what the field covers. */
  summary?: string;
  credits: Credit[];
}

export interface CreditsConfig {
  /** The credits, field by field. */
  fields: CreditField[];
  /** Packages that are installed but deliberately not credited, each with
   *  the reason (a type package, a build shim…). */
  uncredited?: Record<string, string>;
}

/** Identity helper so a config file gets type checking. */
export function defineCredits(config: CreditsConfig): CreditsConfig {
  return config;
}
