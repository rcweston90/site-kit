'use client';

import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import {
  ArrowLeftRight,
  Camera,
  ChevronDown,
  Columns3,
  Copy,
  Crosshair,
  DraftingCompass,
  Keyboard,
  Palette as PaletteIcon,
  RefreshCw,
  Rows3,
  Ruler,
  ScanSearch,
  SquareDashed,
  SunDim,
} from 'lucide-react';
import { styles } from './classes.js';
import { paletteStyle, useXRayConfig } from './config.js';
import { formatPx, rhythmFit, rhythmUnit, unitsLabel } from './measure.js';
import { SIDES, type Inspection, type Side, type Sides } from './inspect.js';
import { offRhythm } from './spec.js';
import { classFor, type NudgeProp } from './nudge.js';
import type { IssueKind } from './audit.js';
import type { BreakpointRow } from './responsive.js';
import type { MeasureMode } from './spacing.js';

export type Tab = 'spacing' | 'type' | 'colour' | 'audit' | 'a11y';
export const TABS: Tab[] = ['spacing', 'type', 'colour', 'audit', 'a11y'];

export interface DockOptions {
  /** Measure from layout boxes, or from the letters of text. */
  mode: MeasureMode;
  outlines: boolean;
  guides: boolean;
  rulers: boolean;
  frame: boolean;
  dim: boolean;
  /** The token-coverage overlay. */
  tokens: boolean;
  side: 'left' | 'right';
  collapsed: boolean;
  tab: Tab;
  auditView: 'rhythm' | 'tokens';
  /** Where the dock was dragged to (desktop); null sits it in its corner. */
  pos: { x: number; y: number } | null;
}

export const DOCK_DEFAULTS: DockOptions = {
  mode: 'box',
  outlines: true,
  guides: false,
  rulers: false,
  frame: false,
  dim: false,
  tokens: false,
  side: 'left',
  collapsed: false,
  tab: 'spacing',
  auditView: 'rhythm',
  pos: null,
};

export interface AuditView {
  count: number;
  truncated: boolean;
  tally: Record<IssueKind, number>;
  groups: { label: string; kind: string; values: number[]; items: { index: number; where: string }[] }[];
}

export interface CoverageView {
  total: number;
  intentional: number;
  literals: number;
  groups: { status: 'intentional' | 'literal'; source?: string; misses: string[]; items: { index: number; where: string }[] }[];
}

export interface A11yView {
  running: boolean;
  error?: boolean;
  /** No axe loader was passed to <XRay>. */
  unavailable?: boolean;
  rules: { id: string; impact: string; help: string; helpUrl: string; nodes: { where: string; summary: string }[] }[];
}

/** The redlines' summary: which spacing values the component uses, how often. */
export interface RedlineView {
  name: string;
  count: number;
  vertical: [number, number][];
  horizontal: [number, number][];
}

export interface NudgeView {
  prop: NudgeProp | null;
  changes: { name: string; property: string; from: number; to: number }[];
}

interface DockProps {
  ref: Ref<HTMLDivElement>;
  probeRef: RefObject<HTMLSpanElement | null>;
  opts: DockOptions;
  set: (patch: Partial<DockOptions>) => void;
  inspection: Inspection | null;
  audit: AuditView | null;
  coverage: CoverageView | null;
  a11y: A11yView | null;
  activeIssue: number;
  breakpoints: { rows: BreakpointRow[]; running: boolean; name: string } | null;
  nudge: NudgeView;
  redline: RedlineView | null;
  /** The last pointer was a finger: hints speak in taps. */
  touch: boolean;
  viewport: { width: number; breakpoint: string };
  grid: boolean;
  help: boolean;
  toast: string | null;
  onExit: () => void;
  onCopy: () => void;
  onSnapshot: () => void;
  onPinCrumb: (index: number) => void;
  onSelectIssue: (index: number) => void;
  onSelectA11y: (rule: number, node: number) => void;
  onSelectCoverage: (index: number) => void;
  onRescan: () => void;
  onRescanA11y: () => void;
  onRescanTokens: () => void;
  onCompare: () => void;
  onNudgeReset: () => void;
  onNudgeCopy: () => void;
  onRedline: () => void;
  onToggleHelp: () => void;
  onToggleGrid: () => void;
}

const TAB_LABEL: Record<Tab, string> = { spacing: 'Spacing', type: 'Type', colour: 'Colour', audit: 'Audit', a11y: 'A11y' };

/** A spacing value, flagged when it's vertical and off the rhythm. */
function Value({ px, vertical, named }: { px: number | null | undefined; vertical?: boolean; named?: boolean }) {
  if (px === null || px === undefined) return <span className={styles.zero}>–</span>;
  const fit = vertical ? rhythmFit(px) : null;
  if (fit?.fit === 'off') {
    return (
      <mark className={styles.off} title={`Off the ${rhythmUnit()}px rhythm`}>
        {formatPx(px)}
        <span className={styles.srOnly}> (off rhythm)</span>
      </mark>
    );
  }
  const name = fit?.fit === 'token' && fit.name !== '0' ? fit.name : fit?.fit === 'grid' ? unitsLabel(fit.units) : null;
  return (
    <span className={styles.value} title={name ?? undefined}>
      {formatPx(px)}
      {named && name && <span className={styles.token}> {name}</span>}
    </span>
  );
}

function Toggle({ pressed, onClick, label, shortcut, wide, children }: { pressed?: boolean; onClick: () => void; label: string; shortcut: string; wide?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label} (${shortcut})`}
      title={`${label} · ${shortcut}`}
      className={`${styles.tool} ${wide ? styles.wideOnly : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** Equal gaps once, with a count. */
function Gaps({ values, vertical, flag }: { values: number[]; vertical: boolean; flag: boolean }) {
  const counts = new Map<number, number>();
  values.forEach((v) => {
    const k = Math.round(v * 10) / 10;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  return (
    <>
      {[...counts].map(([v, n], idx) => (
        <span key={v}>
          {idx > 0 && ' · '}
          <Value px={v} vertical={vertical && flag} named={vertical && flag} />
          {n > 1 && <span className={styles.token}> ×{n}</span>}
        </span>
      ))}
    </>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.segmented}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={styles.segment} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

// ── Spacing ─────────────────────────────────────────────────────────────────

/** The spacing table: CSS padding and margin, then what the eye measures. */
function SpacingTable({ i, mode }: { i: Inspection; mode: MeasureMode }) {
  const s = i.spacing;
  if (!s) return null;
  const flag = mode === 'box';
  const row = (label: ReactNode, sides: Partial<Sides> | null, opts: { swatch: string; optical?: boolean; title: string }) =>
    sides && (
      <tr title={opts.title}>
        <th scope="row">
          <span className={`${styles.swatch} ${opts.swatch}`} aria-hidden="true" />
          {label}
        </th>
        {SIDES.map((k: Side) => (
          <td key={k}>
            <Value px={sides[k]} vertical={(k === 'top' || k === 'bottom') && !opts.optical} />
          </td>
        ))}
      </tr>
    );
  return (
    <table className={styles.sides}>
      <thead>
        <tr>
          <td />
          <th scope="col">top</th>
          <th scope="col">right</th>
          <th scope="col">bottom</th>
          <th scope="col">left</th>
        </tr>
      </thead>
      <tbody>
        {row('padding', s.padding, { swatch: styles.swatchPadding, title: 'CSS padding' })}
        {row('margin', s.margin, { swatch: styles.swatchMargin, title: 'CSS margin' })}
        {row('inside', s.inside, { swatch: styles.swatchInside, optical: !flag, title: 'From its edges in to what it holds' })}
        {row('around', s.around, { swatch: styles.swatchAround, optical: !flag, title: 'To the nearest thing outside it, each side' })}
        {row('to box', s.toBox, { swatch: styles.swatchBox, optical: true, title: s.boxRole ? `From the text to ${s.boxRole}` : 'From the text to its box' })}
      </tbody>
    </table>
  );
}

function BreakpointTable({ rows, current }: { rows: BreakpointRow[]; current: string }) {
  return (
    <table className={styles.bp}>
      <thead>
        <tr>
          <th scope="col">at</th>
          <th scope="col" title="padding top · bottom">pad</th>
          <th scope="col" title="margin top · bottom">margin</th>
          <th scope="col" title="row gap">gap</th>
          <th scope="col" title="space above · below">around</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} aria-current={r.label === current || undefined}>
            <th scope="row">{r.label}</th>
            {r.values ? (
              <>
                <td>
                  <Value px={r.values.padding[0]} vertical />·<Value px={r.values.padding[2]} vertical />
                </td>
                <td>
                  <Value px={r.values.margin[0]} vertical />·<Value px={r.values.margin[2]} vertical />
                </td>
                <td>{r.values.gap ? <Value px={r.values.gap[0]} vertical /> : <span className={styles.zero}>–</span>}</td>
                <td>
                  <Value px={r.values.above} vertical />·<Value px={r.values.below} vertical />
                </td>
              </>
            ) : (
              <td colSpan={4} className={styles.token}>
                not on the page at this width
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The answer in one line: how far it sits from what's around it, and its
 * padding — read before the table, and all a folded phone sheet shows.
 */
function Sentence({ i, mode }: { i: Inspection; mode: MeasureMode }) {
  const s = i.spacing;
  if (!s) return null;
  const flag = mode === 'box';
  const chips: ReactNode[] = [];
  const words: [keyof Sides, string][] = [
    ['top', 'above'],
    ['bottom', 'below'],
    ['left', 'left'],
    ['right', 'right'],
  ];
  for (const [side, word] of words) {
    const v = s.around[side];
    if (v === undefined) continue;
    chips.push(
      <span key={side} className={styles.fact}>
        <Value px={v} vertical={(side === 'top' || side === 'bottom') && flag} /> {word}
      </span>,
    );
  }
  const p = s.padding;
  if (SIDES.some((k) => p[k] >= 0.5)) {
    const pad = p.top === p.bottom && p.left === p.right ? (
      p.top === p.left ? (
        <Value px={p.top} vertical />
      ) : (
        <>
          <Value px={p.top} vertical /> / <Value px={p.left} />
        </>
      )
    ) : (
      <>
        <Value px={p.top} vertical /> <Value px={p.right} /> <Value px={p.bottom} vertical /> <Value px={p.left} />
      </>
    );
    chips.push(
      <span key="pad" className={styles.fact}>
        padding {pad}
      </span>,
    );
  }
  if (s.toBox) {
    chips.push(
      <span key="box" className={styles.fact}>
        text to box <Value px={s.toBox.top} /> · <Value px={s.toBox.bottom} />
      </span>,
    );
  }
  if (s.compare?.length) {
    chips.push(
      <span key="cmp" className={`${styles.fact} ${styles.factStrong}`}>
        to other{' '}
        {s.compare.map((m, idx) => (
          <span key={idx}>
            {idx > 0 && ' · '}
            <Value px={m.value} vertical={m.axis === 'y' && flag} />
          </span>
        ))}
      </span>,
    );
  }
  if (!chips.length) return null;
  return <p className={styles.sentence}>{chips}</p>;
}

/** The redline spec's summary: the spacing scale this component actually uses. */
function RedlineSection({ redline, mode, onRedline, pinned }: { redline: RedlineView | null; mode: MeasureMode; onRedline: () => void; pinned: boolean }) {
  const flag = mode === 'box';
  return (
    <section className={styles.section} aria-label="Redlines">
      <div className={styles.sectionHead}>
        <span>Redlines</span>
        <button type="button" className={styles.textButton} aria-pressed={!!redline} onClick={onRedline}>
          <DraftingCompass aria-hidden="true" size={14} /> {redline ? 'Hide' : 'Show all spacing'} <kbd className={styles.kbd}>R</kbd>
        </button>
      </div>
      {redline ? (
        <>
          <p className={styles.caption}>
            {redline.count} measurements in {redline.name}
          </p>
          <dl className={styles.facts}>
            {redline.vertical.length > 0 && (
              <Row label="↕ uses">
                {redline.vertical.map(([v, n], idx) => (
                  <span key={v}>
                    {idx > 0 && ' · '}
                    <Value px={v} vertical={flag} />
                    {n > 1 && <span className={styles.token}> ×{n}</span>}
                  </span>
                ))}
              </Row>
            )}
            {redline.horizontal.length > 0 && (
              <Row label="↔ uses">
                {redline.horizontal.map(([v, n], idx) => (
                  <span key={v}>
                    {idx > 0 && ' · '}
                    <Value px={v} />
                    {n > 1 && <span className={styles.token}> ×{n}</span>}
                  </span>
                ))}
              </Row>
            )}
          </dl>
        </>
      ) : (
        <p className={styles.caption}>{pinned ? 'Every padding and gap inside it, at once.' : 'Pin a card or section to see every padding and gap inside it.'}</p>
      )}
    </section>
  );
}

/** What each colour on the page means — the canvas stays free of labels. */
function Legend({ touch }: { touch: boolean }) {
  const items: [string, string, string][] = [
    [styles.swatchPadding, 'padding', 'CSS padding, tinted'],
    [styles.swatchMargin, 'margin', 'CSS margin, tinted'],
    [styles.swatchInside, 'inside', 'edges in to what it holds'],
    [styles.swatchAround, 'around', 'to the nearest thing outside'],
    [styles.swatchBox, 'to box', 'text out to its card or button'],
    [styles.swatchLetters, 'letters', 'cap height to baseline'],
  ];
  return (
    <>
      <dl className={styles.legend}>
        {items.map(([swatch, term, def]) => (
          <Row
            key={term}
            label={
              <>
                <span className={`${styles.swatch} ${swatch}`} aria-hidden="true" />
                {term}
              </>
            }
          >
            {def}
          </Row>
        ))}
      </dl>
      <p className={styles.caption}>
        {touch ? (
          'Tap anything to pin it, then tap another to measure between them. Tap it again to let go.'
        ) : (
          <>
            Hold <kbd className={styles.kbd}>⌥</kbd> for rays to the nearest edges · shift-drag to measure an area · <kbd className={styles.kbd}>?</kbd> for every key
          </>
        )}
      </p>
    </>
  );
}

function SpacingTab(props: DockProps) {
  const { inspection: i, opts, set, breakpoints, nudge, viewport } = props;
  const { rhythm } = useXRayConfig();
  if (!i?.spacing) return <Legend touch={props.touch} />;
  const s = i.spacing;
  const flag = opts.mode === 'box';
  const ys = s.between.filter((c) => c.axis === 'y').map((c) => c.value);
  const xs = s.between.filter((c) => c.axis === 'x').map((c) => c.value);
  return (
    <>
      <div className={styles.modeRow}>
        <span className={styles.token}>measure to</span>
        <Segmented
          label="Measure to"
          value={opts.mode}
          options={[
            ['box', 'Box edges'],
            ['text', 'Letters'],
          ]}
          onChange={(mode) => set({ mode })}
        />
        <kbd className={styles.kbd}>T</kbd>
      </div>
      {props.redline && <RedlineSection redline={props.redline} mode={opts.mode} onRedline={props.onRedline} pinned={s.pinned} />}
      <SpacingTable i={i} mode={opts.mode} />
      <dl className={styles.facts}>
        {s.flow && (
          <Row label="layout">
            {s.flow.kind} · gap{' '}
            {s.flow.kind === 'horizontal' ? (
              <Value px={s.flow.column} />
            ) : s.flow.kind === 'vertical' ? (
              <Value px={s.flow.row} vertical named />
            ) : (
              <>
                <Value px={s.flow.row} vertical named /> <span className={styles.token}>rows</span> · <Value px={s.flow.column} />{' '}
                <span className={styles.token}>cols</span>
              </>
            )}
          </Row>
        )}
        {(ys.length > 0 || xs.length > 0) && (
          <Row label="between">
            {ys.length > 0 && (
              <>
                <span className={styles.token}>↕ </span>
                <Gaps values={ys} vertical flag={flag} />
              </>
            )}
            {ys.length > 0 && xs.length > 0 && ' · '}
            {xs.length > 0 && (
              <>
                <span className={styles.token}>↔ </span>
                <Gaps values={xs} vertical={false} flag={flag} />
              </>
            )}
          </Row>
        )}
        {s.text && (
          <Row
            label={
              <>
                <span className={`${styles.swatch} ${styles.swatchLetters}`} aria-hidden="true" />
                text
              </>
            }
          >
            {formatPx(s.text.size)} / {s.text.leading === null ? <mark className={styles.off}>normal</mark> : <Value px={s.text.leading} vertical named />}
            <span className={styles.token}>
              {' '}
              · {s.text.lines} line{s.text.lines === 1 ? '' : 's'} · cap {formatPx(s.text.cap)} · x {formatPx(s.text.xHeight)}
            </span>
          </Row>
        )}
        {s.toBox && s.boxRole && <Row label="in">{s.boxRole}</Row>}
        {s.compare && (
          <Row label="to other">
            {s.compare.map((m, idx) => (
              <span key={idx}>
                {idx > 0 && ' · '}
                <span className={styles.token}>{m.axis === 'y' ? '↕ ' : '↔ '}</span>
                <Value px={m.value} vertical={m.axis === 'y' && flag} named />
              </span>
            ))}
          </Row>
        )}
      </dl>

      {!props.redline && <RedlineSection redline={null} mode={opts.mode} onRedline={props.onRedline} pinned={s.pinned} />}

      <section className={styles.section} aria-label="Breakpoints">
        <div className={styles.sectionHead}>
          <span>Breakpoints</span>
          <button type="button" className={styles.textButton} onClick={props.onCompare} disabled={!s.pinned || breakpoints?.running}>
            {breakpoints?.running ? 'Measuring…' : 'Compare'} <kbd className={styles.kbd}>B</kbd>
          </button>
        </div>
        {breakpoints && breakpoints.rows.length > 0 ? (
          <>
            <p className={styles.caption}>{breakpoints.name}</p>
            <BreakpointTable rows={breakpoints.rows} current={viewport.breakpoint} />
          </>
        ) : (
          <p className={styles.caption}>{s.pinned ? 'Reads this element at every breakpoint.' : 'Pin an element, then compare its spacing across breakpoints.'}</p>
        )}
      </section>

      <section className={styles.section} aria-label="Nudge">
        <div className={styles.sectionHead}>
          <span>Nudge</span>
          {nudge.prop ? (
            <span className={styles.caption}>
              <kbd className={styles.kbd}>P</kbd> <kbd className={styles.kbd}>M</kbd> <kbd className={styles.kbd}>G</kbd> · now {nudge.prop}
            </span>
          ) : (
            <span className={styles.caption}>
              pin, then <kbd className={styles.kbd}>E</kbd>
            </span>
          )}
        </div>
        {nudge.prop && (
          <p className={styles.caption}>
            arrows push {nudge.prop}: +{rhythm.unit} down · +{rhythm.horizontal} across · ⇧ 1px · ⌥ takes away
          </p>
        )}
        {nudge.changes.length > 0 && (
          <>
            <ul className={styles.changes}>
              {nudge.changes.map((c) => (
                <li key={`${c.name}${c.property}`}>
                  <span className={styles.token}>{c.property}</span> {formatPx(c.from)} → <Value px={c.to} vertical={/top|bottom|row/.test(c.property)} />{' '}
                  <code className={styles.code}>{classFor(c.property, c.to)}</code>
                </li>
              ))}
            </ul>
            <div className={styles.buttons}>
              <button type="button" className={styles.textButton} onClick={props.onNudgeReset}>
                Reset
              </button>
              <button type="button" className={styles.textButton} onClick={props.onNudgeCopy}>
                Copy classes
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}

// ── Context tabs ────────────────────────────────────────────────────────────

function TypeTab({ i }: { i: Inspection }) {
  const t = i.type;
  const s = i.spacing?.text;
  if (!t) return <p className={styles.empty}>No text of its own. Pin the element that sets the words (↓ walks in).</p>;
  return (
    <>
      <div className={styles.specimen}>
        <span className={styles.specimenGlyph} style={{ fontFamily: t.stack, fontWeight: t.weight }}>
          Ag
        </span>
        <span>
          {t.family}
          <span className={styles.token}> · {t.weight}</span>
        </span>
      </div>
      <dl className={styles.facts}>
        <Row label="size">
          {formatPx(t.size)} / {t.leading === null ? <mark className={styles.off}>normal</mark> : <Value px={t.leading} vertical named />}
        </Row>
        {s && (
          <Row label="metrics">
            cap {formatPx(s.cap)} · x {formatPx(s.xHeight)}
            {s.step !== null && <span className={styles.token}> · baseline step {formatPx(s.step)}</span>}
          </Row>
        )}
        <Row label="tracking">
          {t.tracking}em{t.trackingToken ? <span className={styles.token}> {t.trackingToken}</span> : <mark className={styles.warn}> no token</mark>}
        </Row>
        {t.transform !== 'none' && <Row label="case">{t.transform}</Row>}
      </dl>
    </>
  );
}

function SwatchRow({ label, s, note }: { label: string; s: { hex: string; alpha: number; tokens: string[] }; note?: string }) {
  return (
    <li className={styles.swatchRow}>
      <span className={styles.chip} style={{ background: s.hex, opacity: s.alpha }} aria-hidden="true" />
      <span className={styles.swatchLabel}>{label}</span>
      <span className={styles.swatchToken} title={s.tokens.join(', ')}>
        {s.tokens[0] ? s.tokens[0] : <mark className={styles.warn}>no token</mark>}
        {s.tokens.length > 1 && <span className={styles.token}> +{s.tokens.length - 1}</span>}
      </span>
      <span className={styles.token}>
        {s.hex}
        {s.alpha < 1 && ` ${Math.round(s.alpha * 100)}%`}
        {note && ` · ${note}`}
      </span>
    </li>
  );
}

function ColourTab({ i }: { i: Inspection }) {
  const c = i.colour;
  return (
    <>
      <ul className={styles.swatches}>
        <SwatchRow label="text" s={c.text} />
        <SwatchRow label="surface" s={c.background} note={c.background.overImage ? 'over an image' : undefined} />
        {c.border && <SwatchRow label="border" s={c.border} />}
      </ul>
      {c.contrast ? (
        <div className={styles.contrast}>
          <span className={styles.ratio}>{c.contrast.ratio.toFixed(2)}:1</span>
          <span className={c.contrast.aa ? styles.pass : styles.fail}>AA {c.contrast.aa ? '✓' : '✗'}</span>
          <span className={c.contrast.aaa ? styles.pass : styles.fail}>AAA {c.contrast.aaa ? '✓' : '✗'}</span>
          <span className={styles.token}>{c.contrast.large ? 'large text' : 'body text'}</span>
        </div>
      ) : (
        <p className={styles.empty}>Contrast is checked on elements that set text.</p>
      )}
    </>
  );
}

function AuditTab(props: DockProps) {
  const { audit, coverage, opts, set, activeIssue } = props;
  const grid = `${useXRayConfig().rhythm.unit}px grid`;
  return (
    <>
      <div className={styles.modeRow}>
        <Segmented
          label="Audit"
          value={opts.auditView}
          options={[
            ['rhythm', 'Rhythm'],
            ['tokens', 'Tokens'],
          ]}
          onChange={(auditView) => set({ auditView, tokens: auditView === 'tokens' ? true : opts.tokens })}
        />
        <span className={styles.spacer} />
        <button type="button" className={styles.textButton} onClick={opts.auditView === 'rhythm' ? props.onRescan : props.onRescanTokens}>
          <RefreshCw aria-hidden="true" size={14} /> Rescan
        </button>
      </div>
      {opts.auditView === 'rhythm' ? (
        !audit ? (
          <p className={styles.empty}>Scanning the page…</p>
        ) : (
          <>
            <p className={styles.auditHead}>
              {audit.count === 0 ? (
                `Every gap and line on the ${grid} ✓`
              ) : (
                <span>
                  <mark className={styles.off}>{audit.count}</mark> off the {grid} ·{' '}
                  <span className={styles.token}>
                    {(Object.entries(audit.tally) as [IssueKind, number][])
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => `${n} ${k}`)
                      .join(' · ')}
                    {audit.truncated ? ' · scan limit reached' : ''}
                  </span>
                </span>
              )}
            </p>
            <div className={styles.issues}>
              {audit.groups.map((group) => (
                <details key={`${group.kind}-${group.label}-${group.values.join('-')}`} open={group.items.length === 1}>
                  <summary className={styles.issue}>
                    <span className={styles.issueNo}>{group.items.length}×</span>
                    <span className={styles.issueKind}>{group.kind}</span>
                    <span className={styles.issueValue}>{group.values.map((v) => (Number.isNaN(v) ? 'normal' : formatPx(v))).join(' / ')}</span>
                    <span className={styles.issueWhere}>{group.label}</span>
                  </summary>
                  <ol>
                    {group.items.map((item) => (
                      <li key={item.index}>
                        <button type="button" className={styles.issue} aria-current={item.index === activeIssue || undefined} onClick={() => props.onSelectIssue(item.index)}>
                          <span className={styles.issueNo}>{item.index + 1}</span>
                          <span className={styles.issueWhere}>{item.where}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </>
        )
      ) : !coverage ? (
        <p className={styles.empty}>Checking every layer against the tokens…</p>
      ) : (
        <>
          <p className={styles.auditHead}>
            <span>
              {coverage.total - coverage.intentional - coverage.literals} of {coverage.total} layers on-system
              {coverage.intentional > 0 && <> · <span className={styles.token}>{coverage.intentional} intentional responsive/token values</span></>}
              {coverage.literals > 0 && (
                <>
                  {' · '}
                  <mark className={styles.off}>{coverage.literals}</mark> with literals
                </>
              )}
            </span>
          </p>
          <div className={styles.issues}>
            {coverage.groups.map((group) => (
              <details key={`${group.status}-${group.source}-${group.misses.join('-')}`} open={group.items.length === 1}>
                <summary className={styles.issueWide}>
                  <span className={styles.issueWhere}>{group.items.length}× {group.status}{group.source ? ` · ${group.source}` : ''}</span>
                  <span className={styles.token}>{group.misses.join(' · ')}</span>
                </summary>
                <ol>
                  {group.items.map((item) => <li key={item.index}><button type="button" className={styles.issueWide} onClick={() => props.onSelectCoverage(item.index)}><span className={styles.issueWhere}>{item.where}</span></button></li>)}
                </ol>
              </details>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const IMPACT: Record<string, string> = {
  critical: styles.impact_critical,
  serious: styles.impact_serious,
  moderate: styles.impact_moderate,
  minor: styles.impact_minor,
};

function A11yTab(props: DockProps) {
  const { a11y } = props;
  if (a11y?.unavailable) {
    return (
      <p className={styles.empty}>
        The accessibility check runs axe-core, which X-ray doesn’t bundle. Pass <code className={styles.code}>{'axe={() => import(\'axe-core\')}'}</code> to{' '}
        <code className={styles.code}>{'<XRay>'}</code> to turn it on.
      </p>
    );
  }
  if (!a11y || (a11y.running && !a11y.rules.length)) return <p className={styles.empty}>Running axe-core on this page…</p>;
  if (a11y.error) return <p className={styles.empty}>The accessibility check couldn’t run here.</p>;
  const total = a11y.rules.reduce((n, r) => n + r.nodes.length, 0);
  return (
    <>
      <div className={styles.modeRow}>
        <span>{a11y.rules.length === 0 ? 'No axe-core violations ✓' : `${a11y.rules.length} rules · ${total} elements`}</span>
        <span className={styles.spacer} />
        <button type="button" className={styles.textButton} onClick={props.onRescanA11y}>
          <RefreshCw aria-hidden="true" size={14} /> Rescan
        </button>
      </div>
      <ol className={styles.rules}>
        {a11y.rules.map((r, ri) => (
          <li key={r.id}>
            <p className={styles.rule}>
              <span className={styles.ruleNo}>{ri + 1}</span>
              <span className={`${styles.impact} ${IMPACT[r.impact] ?? styles.impact_minor}`}>{r.impact}</span>
              <a href={r.helpUrl} target="_blank" rel="noreferrer" className={styles.ruleHelp}>
                {r.help}
              </a>
            </p>
            <ul className={styles.ruleNodes}>
              {r.nodes.slice(0, 8).map((n, ni) => (
                <li key={ni}>
                  <button type="button" className={styles.issueWide} title={n.summary} onClick={() => props.onSelectA11y(ri, ni)}>
                    <span className={styles.issueWhere}>{n.where}</span>
                  </button>
                </li>
              ))}
              {r.nodes.length > 8 && <li className={styles.caption}>+{r.nodes.length - 8} more</li>}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['hover · click', 'inspect · pin'],
  ['hover another', 'measure to the pinned one'],
  ['tap · tap', 'on touch: pin, then measure to another'],
  ['R', 'redlines: every spacing inside it'],
  ['hold ⌥', 'rays to the nearest edges'],
  ['shift drag', 'measure an area'],
  ['T', 'measure to box edges or letters'],
  ['E', 'nudge: P M G, arrows, ⇧ 1px, ⌥ less'],
  ['B', 'compare across breakpoints'],
  ['↑ ↓ ← →', 'parent · child · siblings'],
  ['1 – 5', 'spacing · type · colour · audit · a11y'],
  ['n / N', 'next / previous rhythm finding'],
  ['o l u f g k d', 'outlines guides rulers frame grid tokens dim'],
  ['c · s', 'copy spec · snapshot'],
  ['esc · ⌥X', 'step back · X-ray off'],
];

/**
 * Dock — X-ray's panel. Spacing leads: the table of padding, margin and the
 * space in and around the element; type, colour, audits and accessibility
 * sit behind it as context.
 */
export function Dock(props: DockProps) {
  const { ref, probeRef, opts, set, inspection: i, audit, a11y, viewport, grid, help, toast } = props;
  const config = useXRayConfig();
  const off = i ? offRhythm(i).length : 0;
  const a11yCount = a11y?.rules.reduce((n, r) => n + r.nodes.length, 0) ?? 0;
  const phone = viewport.width > 0 && viewport.width < 640;

  // Drag the dock by its header with a mouse or pen; double-click puts it
  // back in its corner. (Keyboard users move it with the side switch.)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const pos = phone ? null : (dragPos ?? opts.pos);
  const headRef = useRef<HTMLDivElement>(null);
  const setRef = useRef(set);
  useEffect(() => {
    setRef.current = set;
  }, [set]);
  useEffect(() => {
    const head = headRef.current;
    if (!head || phone) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return;
      const dock = head.parentElement;
      if (!dock) return;
      const r = dock.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      let last = { x: r.left, y: r.top };
      const move = (ev: PointerEvent) => {
        last = {
          x: Math.round(Math.min(Math.max(ev.clientX - dx, 8), window.innerWidth - r.width - 8)),
          y: Math.round(Math.min(Math.max(ev.clientY - dy, 8), window.innerHeight - 56)),
        };
        setDragPos(last);
      };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        setRef.current({ pos: last });
        setDragPos(null);
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    };
    const onDouble = () => setRef.current({ pos: null });
    head.addEventListener('pointerdown', onDown);
    head.addEventListener('dblclick', onDouble);
    return () => {
      head.removeEventListener('pointerdown', onDown);
      head.removeEventListener('dblclick', onDouble);
    };
  }, [phone]);

  return (
    <div
      ref={ref}
      popover="manual"
      role="region"
      aria-label="X-ray inspector"
      data-side={opts.side}
      data-moved={pos ? '' : undefined}
      className={styles.dock}
      style={{ ...paletteStyle(config.palette), ...(pos ? { left: pos.x, top: pos.y } : null) }}
    >
      <span ref={probeRef} className={styles.probe} aria-hidden="true" />
      <div className={styles.toast} role="status" aria-live="polite" data-shown={toast ? '' : undefined}>
        {toast}
      </div>

      <div ref={headRef} className={styles.head} title={phone ? undefined : 'Drag to move · double-click to dock'}>
        <ScanSearch aria-hidden="true" size={16} className={styles.mark} />
        <span className={styles.chip2} title="Breakpoint · viewport width">
          {viewport.breakpoint} · {viewport.width}
        </span>
        <span className={styles.spacer} />
        <button type="button" className={`${styles.iconButton} ${styles.wideOnly}`} aria-pressed={help} aria-label="Shortcuts (?)" title="Shortcuts · ?" onClick={props.onToggleHelp}>
          <Keyboard aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.wideOnly}`}
          aria-label={`Move to the ${opts.side === 'left' ? 'right' : 'left'}`}
          title="Move"
          onClick={() => set({ side: opts.side === 'left' ? 'right' : 'left', pos: null })}
        >
          <ArrowLeftRight aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-expanded={!opts.collapsed}
          aria-label={opts.collapsed ? 'Show details' : 'Hide details'}
          title={opts.collapsed ? 'Show details' : 'Hide details'}
          onClick={() => set({ collapsed: !opts.collapsed })}
        >
          <ChevronDown aria-hidden="true" size={16} className={opts.collapsed ? styles.flipped : undefined} />
        </button>
      </div>

      {!help && (
        <div className={styles.identity}>
          {i ? (
            <>
              {!opts.collapsed && (
                <nav aria-label="Ancestors" className={styles.crumbs}>
                  {i.crumbs.map((c, idx) => (
                    <span key={idx} className={styles.crumb}>
                      {idx > 0 && <span className={styles.sep}>›</span>}
                      <button type="button" aria-current={idx === i.crumbs.length - 1 || undefined} onClick={() => props.onPinCrumb(idx)}>
                        {c}
                      </button>
                    </span>
                  ))}
                </nav>
              )}
              <p className={styles.name}>
                <span className={styles.role}>{i.spacing?.role ?? 'Element'}</span>
                <span className={styles.nameText} title={`${i.selector}${i.component ? ` · ${i.component}` : ''}`}>
                  {i.name}
                </span>
                <span className={styles.size}>
                  {formatPx(i.width)} × <Value px={i.height} vertical />
                </span>
              </p>
              <Sentence i={i} mode={opts.mode} />
            </>
          ) : (
            <p className={styles.empty}>
              {props.touch ? 'Tap anything to see the space around it.' : 'Hover any text, image or box. Click to pin; hover another to measure between them.'}
            </p>
          )}
        </div>
      )}

      {!opts.collapsed && (
        <>
          {help ? (
            <div className={styles.body}>
              <dl className={styles.keys}>
                {SHORTCUTS.map(([k, v]) => (
                  <Row key={k} label={k}>
                    {v}
                  </Row>
                ))}
              </dl>
              <button type="button" className={styles.textButton} onClick={props.onExit}>
                Close X-ray
              </button>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Inspector" className={styles.tabs}>
                {TABS.map((tab, idx) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`xray-tab-${tab}`}
                    aria-selected={opts.tab === tab}
                    aria-controls="xray-panel"
                    tabIndex={opts.tab === tab ? 0 : -1}
                    className={styles.tab}
                    onClick={() => set({ tab })}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                      e.preventDefault();
                      const next = TABS[(idx + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                      set({ tab: next });
                      (e.currentTarget.parentElement?.querySelector(`#xray-tab-${next}`) as HTMLElement | null)?.focus();
                    }}
                  >
                    <span>{TAB_LABEL[tab]}</span>
                    {tab === 'spacing' && off > 0 && <span className={styles.badge}>{off}</span>}
                    {tab === 'audit' && audit && audit.count > 0 && <span className={styles.badge}>{audit.count}</span>}
                    {tab === 'a11y' && a11yCount > 0 && <span className={`${styles.badge} ${styles.badgeWarn}`}>{a11yCount}</span>}
                  </button>
                ))}
              </div>

              <div role="tabpanel" id="xray-panel" aria-labelledby={`xray-tab-${opts.tab}`} className={styles.body}>
                {opts.tab === 'spacing' ? (
                  <SpacingTab {...props} />
                ) : opts.tab === 'audit' ? (
                  <AuditTab {...props} />
                ) : opts.tab === 'a11y' ? (
                  <A11yTab {...props} />
                ) : !i ? (
                  <p className={styles.empty}>Nothing under inspection yet.</p>
                ) : opts.tab === 'type' ? (
                  <TypeTab i={i} />
                ) : (
                  <ColourTab i={i} />
                )}
              </div>
            </>
          )}

          <div className={styles.toolbar}>
            <Toggle pressed={opts.outlines} onClick={() => set({ outlines: !opts.outlines })} label="Outlines" shortcut="O">
              <SquareDashed aria-hidden="true" size={16} />
            </Toggle>
            <Toggle pressed={opts.guides} onClick={() => set({ guides: !opts.guides })} label="Guides" shortcut="L">
              <Crosshair aria-hidden="true" size={16} />
            </Toggle>
            <Toggle pressed={opts.rulers} onClick={() => set({ rulers: !opts.rulers })} label="Rulers" shortcut="U" wide>
              <Ruler aria-hidden="true" size={16} />
            </Toggle>
            <Toggle pressed={opts.frame} onClick={() => set({ frame: !opts.frame })} label="Page frame" shortcut="F" wide>
              <Columns3 aria-hidden="true" size={16} />
            </Toggle>
            <Toggle pressed={grid} onClick={props.onToggleGrid} label="Baseline grid" shortcut="G">
              <Rows3 aria-hidden="true" size={16} />
            </Toggle>
            <Toggle pressed={opts.tokens} onClick={() => set({ tokens: !opts.tokens })} label="Token coverage" shortcut="K">
              <PaletteIcon aria-hidden="true" size={16} />
            </Toggle>
            <Toggle pressed={opts.dim} onClick={() => set({ dim: !opts.dim })} label="Dim page" shortcut="D">
              <SunDim aria-hidden="true" size={16} />
            </Toggle>
            <span className={styles.spacer} />
            <Toggle onClick={props.onSnapshot} label="Snapshot" shortcut="S" wide>
              <Camera aria-hidden="true" size={16} />
            </Toggle>
            <Toggle onClick={props.onCopy} label="Copy spec" shortcut="C">
              <Copy aria-hidden="true" size={16} />
            </Toggle>
          </div>
        </>
      )}
    </div>
  );
}
