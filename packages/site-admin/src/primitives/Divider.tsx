'use client';

export function Divider({ variant = 'line', className = '' }: { variant?: 'line' | 'dot' | 'gradient'; className?: string }) {
  if (variant === 'dot') {
    return (
      <div
        className={`enter-fade flex items-center justify-center gap-3 h-minor ${className}`}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-1 h-1 rounded-full bg-foreground-muted opacity-40" />
        ))}
      </div>
    );
  }
  if (variant === 'gradient') {
    return (
      <div className={`sa-grow-x flex items-center w-full h-minor ${className}`}>
        <span className="block w-full h-px bg-gradient-to-r from-transparent via-foreground-muted/20 to-transparent" />
      </div>
    );
  }
  return (
    <div className={`sa-grow-x flex items-center h-minor origin-left ${className}`}>
      <span className="block w-16 h-px bg-foreground-muted opacity-20" />
    </div>
  );
}
