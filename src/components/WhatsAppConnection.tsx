import { useAction } from '../hooks/useAction';
import { useAppState } from '../hooks/useAppState';
import { invoke } from '../lib/api';
import { WHATSAPP_STATUS } from '../lib/labels';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';

export function WhatsAppConnection() {
  const { whatsapp, campaign } = useAppState();
  const { run, pending } = useAction();
  const isOpen = whatsapp.status !== 'CLOSED' && whatsapp.status !== 'ERROR';
  const campaignRunning = campaign?.status === 'RUNNING';

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          WhatsApp Web <StatusBadge status={WHATSAPP_STATUS[whatsapp.status]} />
        </div>
        {whatsapp.detail && <p className="max-w-md text-xs text-slate-500">{whatsapp.detail}</p>}
      </div>
      {isOpen ? (
        <>
          <Button size="sm" onClick={() => run('connect', () => invoke('app:whatsapp-connect'))} loading={pending === 'connect'}>
            Mostrar navegador
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={campaignRunning}
            title={campaignRunning ? 'Pause a campanha antes de desconectar' : undefined}
            onClick={() => run('disconnect', () => invoke('app:whatsapp-disconnect'))}
            loading={pending === 'disconnect'}
          >
            Fechar navegador
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={() => run('connect', () => invoke('app:whatsapp-connect'))} loading={pending === 'connect'}>
          Conectar WhatsApp
        </Button>
      )}
    </div>
  );
}
