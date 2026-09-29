import { useState } from 'react';
import { formatPhone } from '../../core/phone';
import { useAction } from '../hooks/useAction';
import { useAppState } from '../hooks/useAppState';
import { invoke } from '../lib/api';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';

interface TestSenderProps {
  /** Saves the message being edited before the test uses it. */
  flushMessage: () => Promise<void>;
}

export function TestSender({ flushMessage }: TestSenderProps) {
  const { whatsapp, campaign, testInProgress } = useAppState();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [lastSent, setLastSent] = useState<string | null>(null);
  const { run, pending } = useAction();

  const connected = whatsapp.status === 'CONNECTED';
  const campaignRunning = campaign?.status === 'RUNNING';
  const disabledReason = !connected
    ? 'Conecte o WhatsApp Web para enviar um teste.'
    : campaignRunning
      ? 'Pause a campanha para enviar um teste.'
      : null;

  const sendTest = () =>
    run('test', async () => {
      await flushMessage();
      const outcome = await invoke('app:send-test', { phone, name: name.trim() });
      setLastSent(formatPhone(outcome.phone));
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Envie a mensagem e a imagem para um único número (de preferência o seu) e confira no celular antes de iniciar a campanha.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-slate-600">
          Número para teste
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-600">
          Nome no teste (opcional)
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="Maria"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      <Button
        variant="primary"
        onClick={() => void sendTest()}
        disabled={!phone.trim() || disabledReason !== null || testInProgress}
        loading={pending === 'test' || testInProgress}
        className="w-full"
      >
        Enviar teste
      </Button>
      {disabledReason && <p className="text-xs text-slate-500">{disabledReason}</p>}
      {lastSent && pending === null && <Notice tone="success">Teste enviado para {lastSent}. Confira no WhatsApp.</Notice>}
    </div>
  );
}
