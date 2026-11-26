'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../primitives/Button.js';
import { useReducedMotion } from '../primitives/reduced-motion.js';

export interface PasscodeFormProps {
  /** Resolve `true` to grant access, `false` for a wrong code; throw an Error to show its message instead. */
  authenticate: (passcode: string) => Promise<boolean>;
  /** Called once `authenticate` resolves `true`, after the wells show Unlocked. */
  onSuccess: () => void;
  align?: 'center' | 'start';
  /** Whether the form can take focus yet (false inside an `inert` wrapper). */
  ready?: boolean;
  disabled?: boolean;
  label?: string;
  fieldPlaceholder?: string;
  labelledBy?: string;
  /** Six wells that submit on the sixth character, or one masked field with an Unlock button. */
  presentation?: 'wells' | 'field';
}

const LENGTH = 6;
type Status = 'idle' | 'checking' | 'rejected' | 'granted';

/**
 * Six recessed wells; each keystroke is punched into the next one and the
 * sixth submits. One real input sits over the wells (transparent) so paste,
 * IME, autofill and screen readers all see an ordinary text field.
 */
export function PasscodeForm({
  authenticate,
  onSuccess,
  align = 'center',
  ready = true,
  disabled = false,
  label = 'Passcode',
  labelledBy,
  fieldPlaceholder,
  presentation = 'wells',
}: PasscodeFormProps) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [focused, setFocused] = useState(false);
  const [strokes, setStrokes] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSubmitting = useRef(false);
  const reduceMotion = useReducedMotion();
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  useEffect(() => {
    const input = inputRef.current;
    if (!ready || !input) return;
    input.focus();
    // A window without focus moves activeElement but never fires `focus`.
    const id = setTimeout(() => {
      if (document.activeElement === input) setFocused(true);
    });
    return () => clearTimeout(id);
  }, [ready]);

  const submit = async (value: string) => {
    if (disabled || isSubmitting.current) return;
    isSubmitting.current = true;
    setStatus('checking');
    setError('');
    let failure = 'Incorrect passcode';
    try {
      if (await authenticate(value)) {
        setStatus('granted');
        onSuccess();
        return;
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : 'Authentication failed';
    }
    setStatus('rejected');
    setError(failure);
    // Hold the red row through the shake, then eject the characters.
    setTimeout(() => {
      isSubmitting.current = false;
      setPasscode('');
      setStatus('idle');
      inputRef.current?.focus();
    }, reduceMotion ? 0 : 420);
  };

  const unified = presentation === 'field';

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || status === 'checking' || status === 'granted') return;
    const value = event.target.value.replace(/\s/g, '').slice(0, LENGTH);
    setPasscode(value);
    setStrokes((n) => n + 1);
    if (status === 'rejected') setStatus('idle');
    if (value.length > 0) setError('');
    if (!unified && value.length === LENGTH) void submit(value);
  };

  const unlockFromButton = () => {
    if (disabled || isSubmitting.current || status !== 'idle') return;
    if (passcode.length === LENGTH) {
      void submit(passcode);
    } else {
      setError(`Enter all ${LENGTH} characters.`);
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!unified && passcode.length === LENGTH && status === 'idle') void submit(passcode);
  };

  const rejected = status === 'rejected';
  const checking = status === 'checking';
  const activeIndex = focused && status === 'idle' ? Math.min(passcode.length, LENGTH - 1) : -1;
  const hint = error ? error : checking ? 'Checking…' : status === 'granted' ? 'Unlocked' : '';

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={checking}
      aria-labelledby={labelledBy}
      className={`enter-rise [--enter-y:10px] flex w-full max-w-[396px] flex-col ${align === 'center' ? 'mx-auto items-center' : 'items-start'}`}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>

      <div
        className={`${unified ? 'relative flex w-full items-start gap-half' : 'relative w-full'} ${rejected ? 'sa-shake' : ''}`}
      >
        {status === 'granted' ? (
            <div
              key="granted"
              className="sa-granted flex h-18 w-full items-center justify-center gap-half rounded-lg bg-accent-primary text-on-accent shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)]"
            >
              <Check size={20} strokeWidth={2.5} aria-hidden="true" />
              <span className="font-mono text-base leading-baseline font-bold uppercase tracking-widest">Unlocked</span>
            </div>
          ) : unified ? null : (
            <div key="wells" className="grid w-full grid-cols-6 gap-half" aria-hidden="true">
              {Array.from({ length: LENGTH }, (_, i) => {
                const char = passcode[i];
                const isLatest = i === passcode.length - 1;
                return (
                  <div
                    key={i}
                    className={`relative flex h-18 items-center justify-center overflow-hidden rounded-lg transition-colors duration-150 ${
                      rejected
                        ? 'border border-red-500/30 bg-red-500/10 shadow-[inset_0_2px_4px_rgba(196,39,27,0.10)]'
                        : char
                          ? 'surface-well'
                          : i === activeIndex
                            ? 'surface-well outline-2 outline-offset-2 outline-foreground'
                            : 'surface-well'
                    }`}
                  >
                    {char && isLatest && !reduceMotion && status === 'idle' && (
                      <span
                        key={strokes}
                        className="sa-press-flash pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_4px_8px_rgba(0,0,0,0.14),inset_0_1px_2px_rgba(0,0,0,0.10)]"
                      />
                    )}
                    {char ? (
                        <span
                          key={`${i}-${char}`}
                          className={`sa-pop absolute font-mono text-[32px] leading-9 font-bold [text-shadow:0_1px_0_rgba(255,255,255,0.6)] in-data-[theme=dark]:[text-shadow:none] ${
                            rejected ? 'text-status-error-text' : checking ? 'text-accent-primary' : 'text-foreground'
                          }`}
                        >
                          {char}
                        </span>
                      ) : i === activeIndex ? (
                        <span className="h-8 w-0.5 animate-pulse rounded-full bg-foreground-muted" />
                      ) : (
                        <span className="h-0.5 w-4 rounded-full bg-foreground/15" />
                      )}
                  </div>
                );
              })}
            </div>
          )}

        <input
          ref={inputRef}
          id={inputId}
          type={unified ? 'password' : 'text'}
          placeholder={unified ? fieldPlaceholder ?? label : undefined}
          hidden={unified && status === 'granted'}
          inputMode="text"
          value={passcode}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={LENGTH}
          readOnly={disabled || checking || status === 'granted'}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          data-1p-ignore
          aria-invalid={Boolean(error)}
          aria-describedby={hintId}
          className={unified
            ? 'h-12 w-full min-w-0 flex-1 rounded-lg border border-default bg-background px-half font-sans text-base text-foreground outline-offset-2 placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-foreground aria-invalid:border-status-error-text'
            : 'absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent'}
        />
        {unified && status !== 'granted' && (
          <Button type="button" onClick={unlockFromButton} variant="primary" size="sm" className="h-12 shrink-0 whitespace-nowrap" disabled={disabled || checking || rejected}>
            Unlock
          </Button>
        )}
      </div>

      <p
        id={hintId}
        role={error ? 'alert' : undefined}
        aria-live="polite"
        className={`mt-half mb-0 font-mono text-xs leading-baseline tracking-wide ${
          error ? 'text-status-error-text font-semibold' : checking || status === 'granted' ? 'text-accent-primary' : 'text-foreground-muted'
        }`}
      >
        {hint}
      </p>
    </form>
  );
}
