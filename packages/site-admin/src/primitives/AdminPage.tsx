import type { ReactNode } from 'react';

/** A page of the admin: centred, `standard` (max-w-4xl) or `wide` (max-w-6xl). */
export function AdminPage({ children, width = 'standard', className = '' }: { children: ReactNode; width?: 'standard' | 'wide'; className?: string }) {
  return <div className={`mx-auto ${width === 'wide' ? 'max-w-6xl' : 'max-w-4xl'} ${className}`}>{children}</div>;
}

export function AdminPageHeader({ title, description, action, className = '' }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={`mb-minor-2 border-b border-default pb-[calc(var(--rhythm-minor)_-_1px)] ${className}`}>
      <div className="flex flex-col gap-minor md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="font-mono text-3xl font-bold uppercase leading-9 tracking-wide text-foreground md:text-4xl md:leading-12">{title}</h1>
          {description && <p className="mb-0 mt-half text-sm font-medium leading-baseline text-foreground-muted">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-half">{action}</div>}
      </div>
    </header>
  );
}
