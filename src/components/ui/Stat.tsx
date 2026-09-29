import type { Tone } from '../../lib/labels';

const VALUE_COLORS: Record<Tone, string> = {
  green: 'text-emerald-700',
  red: 'text-red-700',
  yellow: 'text-amber-700',
  gray: 'text-slate-700',
  blue: 'text-sky-700',
};

export function Stat({ label, value, tone = 'gray' }: { label: string; value: number | string; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${VALUE_COLORS[tone]}`}>{value}</p>
    </div>
  );
}
