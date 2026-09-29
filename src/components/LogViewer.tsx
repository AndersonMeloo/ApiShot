import { useEffect, useState } from 'react';
import { TEST_LOG_ID } from '../../core/campaign';
import { errorMessage } from '../../core/errors';
import { formatPhone } from '../../core/phone';
import type { CampaignLogEntry } from '../../core/types';
import { useAction } from '../hooks/useAction';
import { useNotify } from '../hooks/useNotifications';
import { invoke } from '../lib/api';
import { formatDuration, formatTime, LOG_STATUS } from '../lib/labels';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { Pagination, usePagination } from './ui/Pagination';

const PAGE_SIZE = 20;

interface LogViewerProps {
  campaignId: string | null;
  /** Changes whenever the campaign is updated, to trigger a reload. */
  version: string | null;
}

function useLogEntries(logId: string | null, version: string | null) {
  const notify = useNotify();
  const [loaded, setLoaded] = useState<{ logId: string; entries: CampaignLogEntry[] } | null>(null);

  useEffect(() => {
    if (!logId) return;
    let active = true;
    invoke('app:get-logs', { campaignId: logId })
      .then((entries) => active && setLoaded({ logId, entries: [...entries].reverse() }))
      .catch((error: unknown) => active && notify.error(errorMessage(error)));
    return () => {
      active = false;
    };
  }, [logId, version, notify]);

  // While a refresh is in flight the previous entries of the same log stay visible.
  return logId && loaded?.logId === logId ? loaded.entries : [];
}

export function LogViewer({ campaignId, version }: LogViewerProps) {
  const [showTests, setShowTests] = useState(false);
  const logId = showTests ? TEST_LOG_ID : campaignId;
  const entries = useLogEntries(logId, version);
  const { page, pageCount, pageItems, setPage } = usePagination(entries, PAGE_SIZE);
  const { run, pending } = useAction();
  const notify = useNotify();

  const exportReport = () =>
    run('export', async () => {
      if (!campaignId) return;
      const file = await invoke('app:export-report', { campaignId });
      if (file) notify.success(`Relatório salvo em ${file}`);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <TabButton active={!showTests} onClick={() => setShowTests(false)}>
            Campanha atual
          </TabButton>
          <TabButton active={showTests} onClick={() => setShowTests(true)}>
            Envios de teste
          </TabButton>
        </div>
        <div className="flex-1" />
        {!showTests && campaignId && (
          <Button size="sm" onClick={() => void exportReport()} loading={pending === 'export'} disabled={entries.length === 0}>
            Exportar relatório CSV
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => run('folder', () => invoke('app:open-data-folder'))}>
          Abrir pasta de dados
        </Button>
      </div>

      {!logId ? (
        <p className="py-4 text-center text-sm text-slate-400">Os registros aparecerão aqui quando uma campanha for iniciada.</p>
      ) : (
        <LogTable entries={pageItems} />
      )}
      <Pagination page={page} pageCount={pageCount} total={entries.length} onChange={setPage} />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-md px-3 py-1 ${active ? 'bg-white font-medium shadow-sm' : 'text-slate-600'}`}>
      {children}
    </button>
  );
}

function LogTable({ entries }: { entries: readonly CampaignLogEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            <th className="px-3 py-2">Horário</th>
            <th className="px-3 py-2">Contato</th>
            <th className="px-3 py-2">Telefone</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Erro</th>
            <th className="px-3 py-2 text-right">Duração</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry, index) => (
            <tr key={`${entry.timestamp}-${entry.phone}-${index}`}>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatTime(entry.timestamp)}</td>
              <td className="px-3 py-2">{entry.contactName ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs">{/^\d+$/.test(entry.phone) ? formatPhone(entry.phone) : entry.phone}</td>
              <td className="px-3 py-2">
                <StatusBadge status={LOG_STATUS[entry.status]} />
              </td>
              <td className="max-w-md px-3 py-2 text-xs text-red-600">{entry.error ?? ''}</td>
              <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{formatDuration(entry.durationMs)}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                Nenhum registro ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
