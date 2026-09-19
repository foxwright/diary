import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-stone-900 text-white border border-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:border-stone-300',
  outline:
    'bg-white text-stone-800 border border-stone-300 hover:border-stone-400 hover:bg-stone-50 disabled:text-stone-400',
  ghost: 'bg-transparent text-stone-600 border border-transparent hover:bg-stone-100',
  danger:
    'bg-white text-red-700 border border-red-300 hover:bg-red-50 disabled:text-stone-400 disabled:border-stone-200',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

export function Button({ variant = 'outline', size = 'md', className = '', ...rest }: ButtonProps) {
  const sizing = size === 'sm' ? 'text-xs px-2.5 py-1 rounded-md' : 'text-sm px-3.5 py-2 rounded-lg';
  return (
    <button
      className={`${sizing} ${VARIANTS[variant]} font-medium transition-colors disabled:cursor-not-allowed ${className}`}
      {...rest}
    />
  );
}

export function Card({
  children,
  className = '',
  title,
  subtitle,
  action,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <div>
            {title && <h3 className="text-sm font-medium text-stone-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-600 border-stone-200',
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
  } as const;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-stone-500">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
      {label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-xs text-stone-400">
      {children}
    </div>
  );
}

export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'warn' | 'bad' | 'good';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-stone-200 bg-stone-50 text-stone-600',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    bad: 'border-red-200 bg-red-50 text-red-800',
  } as const;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-sm font-medium text-stone-800">{children}</span>;
}
