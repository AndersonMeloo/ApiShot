import type { ReactNode } from 'react';
import type { StatusLabel, Tone } from '../../lib/labels';

export const TONE_STYLES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ${TONE_STYLES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: StatusLabel }) {
  return (
    <Badge tone={status.tone}>
      {status.emoji && <span aria-hidden>{status.emoji}</span>}
      {status.label}
    </Badge>
  );
}
