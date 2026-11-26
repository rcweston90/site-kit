'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, X } from 'lucide-react';

/**
 * The dashboard's first-run card: four steps around the demo after signing
 * in. It shows while the site still holds only the sample content, until
 * it's dismissed; dismissal and the steps already opened are kept in this
 * browser only.
 */

const KEY = 'site-kit-start-here';
const EVENT = 'site-kit-start-here';

interface StartHereState {
  dismissed: boolean;
  opened: string[];
}

const EMPTY: StartHereState = { dismissed: false, opened: [] };
// Before the browser's choice is read (and on the server) the card stays away, so it never flashes in and out.
const UNREAD = JSON.stringify({ dismissed: true, opened: [] });

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? JSON.stringify(EMPTY);
  } catch {
    return JSON.stringify(EMPTY);
  }
}

function parse(raw: string): StartHereState {
  try {
    const value = JSON.parse(raw) as Partial<StartHereState>;
    return { dismissed: value.dismissed === true, opened: Array.isArray(value.opened) ? value.opened.filter((id) => typeof id === 'string') : [] };
  } catch {
    return EMPTY;
  }
}

function write(next: StartHereState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private windows can refuse storage; the card still closes for this visit.
  }
  memory = JSON.stringify(next);
  window.dispatchEvent(new Event(EVENT));
}

let memory: string | null = null;
const subscribe = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
};

export interface StartHereStep {
  id: string;
  label: string;
  hint: string;
  href: string;
  /** Opens the public site rather than an admin page. */
  external?: boolean;
}

export function StartHere({ steps }: { steps: StartHereStep[] }) {
  const raw = useSyncExternalStore(subscribe, () => memory ?? readRaw(), () => UNREAD);
  const state = parse(raw);
  const open = useCallback((id: string) => {
    const current = parse(memory ?? readRaw());
    if (!current.opened.includes(id)) write({ ...current, opened: [...current.opened, id] });
  }, []);

  if (state.dismissed) return null;
  const done = 1 + steps.filter((step) => state.opened.includes(step.id)).length;
  const total = steps.length + 1;

  return (
    <section aria-labelledby="start-here-title" className="enter-rise [--enter-y:10px] [animation-duration:0.3s] mb-12 rounded-md border border-foreground-muted/20 bg-card-bg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="start-here-title" className="font-mono text-lg font-bold text-foreground uppercase tracking-wide">Start here</h2>
          <p className="mt-1 font-mono text-xs text-foreground-muted">
            A short tour of the demo. {done} of {total} done.
          </p>
        </div>
        <button
          type="button"
          onClick={() => write({ ...state, dismissed: true })}
          className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground"
          aria-label="Dismiss Start here"
          title="Dismiss"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        <Step label="Sign in" hint="Done. Set SITE_KIT_ADMIN_PASSCODE to choose your own passcode." done />
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              onClick={() => open(step.id)}
              {...(step.external ? { target: '_blank', rel: 'noopener' } : {})}
              className="group flex items-center gap-3 rounded-md border border-foreground-muted/20 bg-background px-3 py-2.5 transition-colors hover:border-foreground-muted/40"
            >
              <StepBody label={step.label} hint={step.hint} done={state.opened.includes(step.id)} />
              <ArrowUpRight size={16} aria-hidden="true" className={`ml-auto shrink-0 text-foreground-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none ${step.external ? '' : 'rotate-45'}`} />
              {step.external && <span className="sr-only"> (opens in a new tab)</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Step({ label, hint, done }: { label: string; hint: string; done: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-foreground-muted/20 bg-background px-3 py-2.5">
      <StepBody label={label} hint={hint} done={done} />
    </li>
  );
}

function StepBody({ label, hint, done }: { label: string; hint: string; done: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${done ? 'border-accent-primary bg-accent-primary text-on-accent' : 'border-foreground-muted/40'}`}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
          {label}
          {done && <span className="sr-only"> (done)</span>}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-foreground-muted">{hint}</span>
      </span>
    </>
  );
}
