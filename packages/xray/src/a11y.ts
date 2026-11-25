/**
 * The accessibility check: axe-core (Deque's engine, the one behind most
 * accessibility tooling) run against the live page, X-ray's own UI left out.
 *
 * axe-core is not bundled. The host passes a loader (`axe={() =>
 * import('axe-core')}` on <XRay>), so the engine is its own chunk, fetched
 * the first time the tab opens, and apps that don't want it never ship it.
 */
export interface A11yIssue {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  help: string;
  helpUrl: string;
  /** The elements it found, in page order. */
  nodes: { el: Element; summary: string }[];
}

/** The part of axe-core's API X-ray uses. */
export interface AxeLike {
  run: (
    context: unknown,
    options: unknown,
  ) => Promise<{
    violations: {
      id: string;
      impact?: string | null;
      help: string;
      helpUrl: string;
      nodes: { target: unknown[]; failureSummary?: string }[];
    }[];
  }>;
}

/** What the `axe` prop returns: the module (`import('axe-core')`) or axe itself. */
export type AxeLoader = () => Promise<AxeLike | { default: AxeLike }>;

const ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;

export async function runA11y(load: AxeLoader, exclude: Element[]): Promise<A11yIssue[]> {
  const loaded = await load();
  const axe = 'run' in loaded ? loaded : loaded.default;
  // Mark X-ray's surfaces so axe can skip them by selector.
  exclude.forEach((el) => el.setAttribute('data-xray-skip', ''));
  try {
    const results = await axe.run(
      { include: [['body']], exclude: [['[data-xray-skip]']] },
      {
        resultTypes: ['violations'],
        // Contrast is the slow rule on big pages; it still runs, just without the iframes.
        iframes: false,
      },
    );
    return results.violations
      .map((v) => ({
        id: v.id,
        impact: (v.impact ?? 'minor') as A11yIssue['impact'],
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes
          .map((n) => ({ el: document.querySelector(String(n.target[0])) as Element | null, summary: n.failureSummary?.split('\n')[1]?.trim() ?? '' }))
          .filter((n): n is { el: Element; summary: string } => !!n.el),
      }))
      .filter((v) => v.nodes.length)
      .sort((a, b) => (ORDER[a.impact] ?? 3) - (ORDER[b.impact] ?? 3) || b.nodes.length - a.nodes.length);
  } finally {
    exclude.forEach((el) => el.removeAttribute('data-xray-skip'));
  }
}
