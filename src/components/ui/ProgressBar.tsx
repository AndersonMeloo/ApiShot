export function ProgressBar({ percent, tone = 'green' }: { percent: number; tone?: 'green' | 'yellow' | 'red' | 'gray' }) {
  const color = { green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-red-500', gray: 'bg-slate-400' }[tone];
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
