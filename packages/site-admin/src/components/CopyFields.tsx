'use client';

import { useLayoutEffect, useRef } from 'react';

// Text fields shared by the admin's copy editors (/admin/home, /admin/community).

export const labelClass =
  'block font-mono text-xs uppercase tracking-wider text-foreground-muted mb-2';
export const inputClass =
  'w-full px-3 py-2 rounded-md bg-background border border-foreground-muted/30 text-foreground text-sm leading-baseline focus:border-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary transition-colors';

/**
 * A textarea that grows to fit its content. Paragraphs here range from one
 * line to five, and a fixed row count either clips the long ones (badly, on
 * narrow screens) or leaves dead space around the short ones.
 */
export function AutoTextarea({
  value,
  onChange,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    // A narrower window re-wraps the text, so the fitted height goes stale.
    // (A ResizeObserver on the textarea would re-fire on its own resize.)
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={`${inputClass} resize-none overflow-hidden`}
      {...props}
    />
  );
}

/**
 * A reorderable list of textareas — used for both the bio paragraphs and the
 * "What I do" bullets, which differ only in labelling.
 */
export function ListEditor({
  label,
  hint,
  items,
  addLabel,
  onChange,
}: {
  label: string;
  hint?: string;
  items: string[];
  addLabel: string;
  onChange: (next: string[]) => void;
}) {
  const update = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? value : item)));

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div>
      <span className={labelClass}>{label}</span>
      {hint && (
        <p className="font-mono text-xs text-foreground-muted -mt-1 mb-half">{hint}</p>
      )}
      <div className="space-y-half">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-start">
            <AutoTextarea
              value={item}
              onChange={(value) => update(i, value)}
              aria-label={`${label} ${i + 1}`}
            />
            <div className="flex flex-col gap-1 pt-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${label} ${i + 1} up`}
                className="px-2 py-1 rounded border border-foreground-muted/30 font-mono text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted disabled:opacity-30 disabled:hover:text-foreground-muted transition-colors"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                aria-label={`Move ${label} ${i + 1} down`}
                className="px-2 py-1 rounded border border-foreground-muted/30 font-mono text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted disabled:opacity-30 disabled:hover:text-foreground-muted transition-colors"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${label} ${i + 1}`}
                className="px-2 py-1 rounded border border-foreground-muted/30 font-mono text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        className="mt-half inline-flex items-center px-3 py-2 rounded-md border border-foreground-muted/30 font-mono text-xs uppercase tracking-wider text-foreground hover:border-foreground-muted hover:bg-foreground/[0.03] transition-colors"
      >
        {addLabel} +
      </button>
    </div>
  );
}
