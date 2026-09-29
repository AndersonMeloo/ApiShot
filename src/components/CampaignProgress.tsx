import { useMemo, useState } from 'react';
import { summarizeCampaign } from '../../core/campaign';
import { formatPhone } from '../../core/phone';
import type { Campaign, RecipientStatus } from '../../core/types';
import { useAction } from '../hooks/useAction';
import { invoke } from '../lib/api';
import { CAMPAIGN_STATUS, formatDuration, formatTime, RECIPIENT_STATUS } from '../lib/labels';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { Pagination, usePagination } from './ui/Pagination';
import { ProgressBar } from './ui/ProgressBar';
import { Stat } from './ui/Stat';

const PAGE_SIZE = 25;

type Group = 'ALL' | 'SENT' | 'FAILED' | 'PENDING' | 'IGNORED';

const GROUPS: Record<Group, { label: string; statuses: readonly RecipientStatus[] | null }> = {
  ALL: { label: 'Todos', statuses: null },
  SENT: { label: '🟢 Enviados', statuses: ['SUCCESS'] },
  FAILED: { label: '🔴 Falharam', statuses: ['FAILED'] },
  PENDING: { label: '🟡 Pendentes', statuses: ['PENDING', 'SENDING'] },
  IGNORED: { label: '⚪ Ignorados', statuses: ['INVALID', 'SKIPPED', 'CANCELLED'] },
};

function headline(campaign: Campaign): string {
  if (campaign.status === 'RUNNING') return 'Campanha em andamento';
  return `Campanha ${CAMPAIGN_STATUS[campaign.status].label.toLowerCase()}`;
}

export function CampaignProgress({ campaign }: { campaign: Campaign }) {
  const summary = summarizeCampaign(campaign);
  const tone = campaign.status === 'ERROR' ? 'red' : campaign.status === 'PAUSED' ? 'yellow' : 'green';
  const { run, pending } = useAction();

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-medium text-slate-800">{headline(campaign)}</p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{summary.percent}%</p>
        </div>
        <ProgressBar percent={summary.percent} tone={tone} />
        <p className="mt-1 text-sm text-slate-500 tabular-nums">
          {summary.processed} / {summary.target}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="🟢 Enviados" value={summary.sent} tone="green" />
        <Stat label="🔴 Falharam" value={summary.failed} tone="red" />
        <Stat label="🟡 Pendentes" value={summary.pending} tone="yellow" />
        <Stat label="⚪ Inválidos" value={summary.invalid} />
        <Stat label="⚪ Ignorados" value={summary.skipped} />
        <Stat label="⚪ Cancelados" value={summary.cancelled} />
      </div>
      <RecipientList campaign={campaign} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {campaign.id} · criada em {formatTime(campaign.createdAt)}
        </span>
        {(campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') && (
          <Button size="sm" variant="ghost" onClick={() => run('close', () => invoke('app:discard-campaign'))} loading={pending === 'close'}>
            Fechar resultado
          </Button>
        )}
      </div>
    </div>
  );
}

function RecipientList({ campaign }: { campaign: Campaign }) {
  const [group, setGroup] = useState<Group>('ALL');
  const recipients = useMemo(() => {
    const statuses = GROUPS[group].statuses;
    return statuses ? campaign.recipients.filter((r) => statuses.includes(r.status)) : campaign.recipients;
  }, [campaign.recipients, group]);
  const { page, pageCount, pageItems, setPage } = usePagination(recipients, PAGE_SIZE);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(GROUPS) as Group[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setGroup(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${group === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {GROUPS[key].label}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {pageItems.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate text-slate-800">{r.name ?? 'Sem nome'}</p>
              <p className="font-mono text-xs text-slate-500">{/^\d+$/.test(r.phone) ? formatPhone(r.phone) : r.phone || '(vazio)'}</p>
              {r.error && <p className="mt-0.5 text-xs text-red-600">{r.error}</p>}
            </div>
            <div className="shrink-0 text-right">
              <StatusBadge status={RECIPIENT_STATUS[r.status]} />
              {r.durationMs !== null && <p className="mt-0.5 text-xs text-slate-400">{formatDuration(r.durationMs)}</p>}
            </div>
          </li>
        ))}
        {pageItems.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">Nenhum contato neste filtro.</li>}
      </ul>
      <Pagination page={page} pageCount={pageCount} total={recipients.length} onChange={setPage} />
    </div>
  );
}
