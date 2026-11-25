'use client';

import type { BlockDefinition, BlockRegistry } from '@rcweston/story-react';
import type { StoryJsonValue } from '@rcweston/story-core';

/** The demo's one custom block: a before-and-after funnel drawn from plain JSON props. */

interface FunnelProps {
  steps: string[];
  before: number[];
  after: number[];
  [key: string]: StoryJsonValue;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map((entry) => Number(entry) || 0) : [];
}

function SignupFunnel({ props, caption }: { props: Partial<FunnelProps>; caption?: string }) {
  const steps = Array.isArray(props.steps) ? props.steps.map(String) : [];
  const before = numbers(props.before);
  const after = numbers(props.after);
  const max = Math.max(1, ...before, ...after);
  return (
    <figure className="demo-funnel">
      <div className="demo-funnel__legend" aria-hidden="true">
        <span className="demo-funnel__key demo-funnel__key--before">Before</span>
        <span className="demo-funnel__key demo-funnel__key--after">After</span>
      </div>
      <ol className="demo-funnel__rows">
        {steps.map((step, index) => (
          <li key={step} className="demo-funnel__row">
            <span className="demo-funnel__step">{step}</span>
            <span className="demo-funnel__bars">
              <span className="demo-funnel__bar demo-funnel__bar--before" style={{ width: `${((before[index] ?? 0) / max) * 100}%` }}>
                {before[index] ?? 0}%
              </span>
              <span className="demo-funnel__bar demo-funnel__bar--after" style={{ width: `${((after[index] ?? 0) / max) * 100}%` }}>
                {after[index] ?? 0}%
              </span>
            </span>
          </li>
        ))}
      </ol>
      {caption ? <p className="demo-funnel__caption">{caption}</p> : null}
    </figure>
  );
}

const signupFunnel: BlockDefinition<Partial<FunnelProps>> = {
  label: 'Signup funnel',
  Render: SignupFunnel,
  defaultProps: { steps: ['Sign up', 'First use', 'Came back'], before: [100, 50, 25], after: [100, 70, 40] },
  Inspector: ({ props, onChange }) => (
    <label className="demo-funnel__inspector">
      Steps, one per line
      <textarea
        rows={4}
        value={(props.steps ?? []).join('\n')}
        onChange={(event) => onChange({ ...props, steps: event.target.value.split('\n') })}
      />
    </label>
  ),
};

/** The registry the reader and the editor share. Keep its names in step with content/blocks-registry.ts. */
export const blocks: BlockRegistry = { 'signup-funnel': signupFunnel };
