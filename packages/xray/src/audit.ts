/**
 * The rhythm audit: one pass over the whole page for what the configured
 * rhythm rules out — vertical gaps, paddings and margins off the grid, line
 * heights that aren't multiples of the unit — plus anything pushing the page
 * wider than the window (Polypane flags those in red too). Positions are kept
 * in document coordinates so markers stay put as the page scrolls.
 *
 * Components can opt in to more context: `data-xray-audit-group="Name"`
 * collapses repeated findings under one label, `data-xray-spacing-scale="micro"`
 * accepts 2px steps inside dense controls, and `data-xray-type-scale` skips
 * the line-height check for type that is deliberately off the grid.
 */
import { childGapPairs, rhythmFit, type Measure } from './measure.js';
import { hasOwnText, num } from './inspect.js';

export type IssueKind = 'gap' | 'leading' | 'padding' | 'margin' | 'overflow';

export interface Issue {
  kind: IssueKind;
  /** The element to pin when the issue is picked. */
  el: Element;
  /** For a gap: the element on the far side, measured against. */
  other?: Element;
  /** The offending values, px (NaN for `normal` line height). */
  values: number[];
  /** Where the marker sits, in document coordinates. */
  x: number;
  y: number;
  /** For a gap: the line itself, in document coordinates. */
  measure?: Measure;
  /** Optional component-owned label used to collapse repeated instances. */
  group?: string;
}

export interface AuditResult {
  /** Every finding, so the summary never mistakes a display cap for a total. */
  issues: Issue[];
  /** True only when the defensive scan ceiling was reached. */
  truncated: boolean;
}

export interface IssueGroup {
  key: string;
  label: string;
  kind: IssueKind;
  values: number[];
  issues: Issue[];
}

export const KIND_LABEL: Record<IssueKind, string> = {
  gap: 'gap',
  leading: 'leading',
  padding: 'padding',
  margin: 'margin',
  overflow: 'overflow',
};

const MAX_ISSUES = 5_000;
const MAX_CHILDREN = 200;

const offGrid = (px: number) => Math.abs(px) >= 0.5 && rhythmFit(px).fit === 'off';

/** A 1px rule plus 23px padding is a 24px visual inset. Keep this deliberately
 * strict: only the adjacent border may complete a value on the grid. */
export const paddingOffGrid = (padding: number, border: number) =>
  offGrid(padding) && !(border > 0 && rhythmFit(Math.abs(padding) + Math.abs(border)).fit !== 'off');

const auditGroup = (el: Element) => el.closest<HTMLElement>('[data-xray-audit-group]')?.dataset.xrayAuditGroup;
const spacingScale = (el: Element) => el.closest<HTMLElement>('[data-xray-spacing-scale]')?.dataset.xraySpacingScale;
const typeScale = (el: Element) => !!el.closest('[data-xray-type-scale]');
const offComponentScale = (el: Element, px: number) => {
  if (!offGrid(px)) return false;
  // Dense controls and data grids opt into a 2px micro scale with
  // data-xray-spacing-scale="micro". It's component-owned, never page-wide.
  return spacingScale(el) !== 'micro' || Math.abs(px / 2 - Math.round(px / 2)) >= 0.01;
};

export function runAudit(isUi: (el: Element) => boolean): AuditResult {
  const issues: Issue[] = [];
  let truncated = false;
  const sx = window.scrollX;
  const sy = window.scrollY;
  const viewportWidth = document.documentElement.clientWidth;
  const pageOverflows = document.documentElement.scrollWidth > viewportWidth + 1;
  const style = new Map<Element, CSSStyleDeclaration>();
  const cs = (el: Element) => {
    let s = style.get(el);
    if (!s) style.set(el, (s = getComputedStyle(el)));
    return s;
  };

  for (const el of Array.from(document.body.getElementsByTagName('*'))) {
    if (issues.length >= MAX_ISSUES) {
      truncated = true;
      break;
    }
    if (el instanceof SVGElement || isUi(el)) continue;
    const r = el.getBoundingClientRect();
    // ≤ 1px boxes are visually hidden (sr-only) — their −1px margins are the technique.
    if (r.width <= 1 || r.height <= 1) continue;
    const s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'contents') continue;
    const inline = s.display === 'inline';

    if (!inline) {
      const pad = [
        [num(s.paddingTop), num(s.borderTopWidth)],
        [num(s.paddingBottom), num(s.borderBottomWidth)],
      ].filter(([padding, border]) => paddingOffGrid(padding, border) && offComponentScale(el, padding)).map(([padding]) => padding);
      if (pad.length) issues.push({ kind: 'padding', el, values: pad, x: r.left + sx, y: r.top + sy, group: auditGroup(el) });
      const mar = [num(s.marginTop), num(s.marginBottom)].filter((value) => offComponentScale(el, value));
      if (mar.length) issues.push({ kind: 'margin', el, values: mar, x: r.left + sx, y: r.top + sy, group: auditGroup(el) });
      if (hasOwnText(el) && !typeScale(el)) {
        const lh = s.lineHeight === 'normal' ? NaN : num(s.lineHeight);
        if (Number.isNaN(lh) || offGrid(lh)) issues.push({ kind: 'leading', el, values: [lh], x: r.left + sx, y: r.top + r.height / 2 + sy, group: auditGroup(el) });
      }
    }

    // Overflow: the outermost element sticking out past the window's right edge.
    if (pageOverflows && r.right > viewportWidth + 1) {
      const parent = el.parentElement;
      const parentOverflows = parent && parent !== document.body && parent.getBoundingClientRect().right > viewportWidth + 1;
      if (!parentOverflows) issues.push({ kind: 'overflow', el, values: [r.right - viewportWidth], x: viewportWidth + sx, y: r.top + sy });
    }

    // Gaps between in-flow children, stacked vertically.
    if (el.childElementCount < 2) continue;
    const kids: Element[] = [];
    const boxes: DOMRect[] = [];
    for (const child of Array.from(el.children).slice(0, MAX_CHILDREN)) {
      if (child instanceof SVGElement || isUi(child)) continue;
      const cr = child.getBoundingClientRect();
      if (cr.width <= 0 || cr.height <= 0) continue;
      const pos = cs(child).position;
      if (pos === 'absolute' || pos === 'fixed') continue;
      kids.push(child);
      boxes.push(cr);
    }
    for (const { from, to, measure } of childGapPairs(boxes)) {
      if (measure.axis !== 'y' || !offGrid(measure.value)) continue;
      const doc: Measure = { ...measure, from: measure.from + sy, to: measure.to + sy, at: measure.at + sx, span: undefined, guide: undefined };
      if (!offComponentScale(el, measure.value)) continue;
      issues.push({ kind: 'gap', el: kids[from], other: kids[to], values: [measure.value], x: doc.at, y: (doc.from + doc.to) / 2, measure: doc, group: auditGroup(el) });
    }
  }

  return { issues: issues.sort((a, b) => a.y - b.y || a.x - b.x), truncated };
}

export function groupIssues(issues: readonly Issue[], fallback: (issue: Issue) => string): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  issues.forEach((issue) => {
    const values = issue.values.map((value) => Number.isNaN(value) ? 'normal' : Math.round(value * 10) / 10).join('/');
    const label = issue.group ?? fallback(issue);
    const key = `${issue.kind}|${values}|${label}`;
    const existing = groups.get(key);
    if (existing) existing.issues.push(issue);
    else groups.set(key, { key, label, kind: issue.kind, values: issue.values, issues: [issue] });
  });
  return [...groups.values()].sort((a, b) => b.issues.length - a.issues.length);
}

/** Counts per kind, for the Audit tab's summary line. */
export function tally(issues: readonly Issue[]): Record<IssueKind, number> {
  const t: Record<IssueKind, number> = { gap: 0, leading: 0, padding: 0, margin: 0, overflow: 0 };
  issues.forEach((i) => t[i.kind]++);
  return t;
}
