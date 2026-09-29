import type { ReactNode } from 'react';

type NoticeTone = 'info' | 'warning' | 'error' | 'success';

const STYLES: Record<NoticeTone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

const ICONS: Record<NoticeTone, string> = { info: 'ℹ️', warning: '⚠️', error: '⛔', success: '✅' };

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${STYLES[tone]}`} role={tone === 'error' ? 'alert' : undefined}>
      <span aria-hidden>{ICONS[tone]}</span>
      <div className="min-w-0 flex-1 whitespace-pre-line">{children}</div>
    </div>
  );
}
