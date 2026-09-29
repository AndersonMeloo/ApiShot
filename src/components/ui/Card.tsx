import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  step?: number;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, step, description, actions, children, className = '' }: CardProps) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-start gap-3">
          {step !== undefined && (
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
              {step}
            </span>
          )}
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
