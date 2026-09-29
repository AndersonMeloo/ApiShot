import { useState } from 'react';
import type { Settings } from '../../core/types';
import { useAction } from '../hooks/useAction';
import { invoke } from '../lib/api';
import { Button } from './ui/Button';

type NumericSetting = Exclude<keyof Settings, 'onlyOptIn'>;

const FIELDS: ReadonlyArray<{ key: NumericSetting; label: string; min: number; max: number; hint: string }> = [
  { key: 'maxContactsPerCampaign', label: 'Máximo de contatos por campanha', min: 1, max: 1000, hint: 'Limite de segurança contra disparos acidentais.' },
  { key: 'delayBetweenMessagesSeconds', label: 'Intervalo entre mensagens (s)', min: 10, max: 600, hint: 'Tempo mínimo entre um envio e o próximo.' },
  { key: 'maxRetries', label: 'Novas tentativas em falha temporária', min: 0, max: 3, hint: 'Só para erros antes do envio (ex.: página lenta).' },
  { key: 'retryBaseDelaySeconds', label: 'Espera antes de nova tentativa (s)', min: 5, max: 300, hint: 'Dobra a cada tentativa (backoff).' },
  { key: 'sendTimeoutSeconds', label: 'Tempo limite por envio (s)', min: 15, max: 180, hint: 'Após isso, o envio é marcado como falho.' },
];

export function SettingsPanel({ settings, locked }: { settings: Settings; locked: boolean }) {
  const [values, setValues] = useState<Record<NumericSetting, string>>(() => toStrings(settings));
  const { run, pending } = useAction();
  const dirty = FIELDS.some(({ key }) => values[key] !== String(settings[key]));

  const save = () =>
    run(
      'save',
      () => invoke('app:update-settings', Object.fromEntries(FIELDS.map(({ key }) => [key, Number(values[key])]))),
      'Configurações salvas.',
    );

  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label, min, max, hint }) => (
        <label key={key} className="block text-sm text-slate-700">
          <span className="flex items-center justify-between gap-2">
            {label}
            <input
              type="number"
              min={min}
              max={max}
              step={1}
              disabled={locked}
              value={values[key]}
              onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-100"
            />
          </span>
          <span className="text-xs text-slate-500">
            {hint} ({min}–{max})
          </span>
        </label>
      ))}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty || locked} loading={pending === 'save'}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setValues(toStrings(settings))} disabled={!dirty}>
          Desfazer
        </Button>
      </div>
      {locked && <p className="text-xs text-slate-500">As configurações ficam bloqueadas durante o envio.</p>}
      <p className="text-xs text-slate-500">
        Estes limites protegem você e seus contatos. O aplicativo nunca os aumenta automaticamente nem tenta contornar restrições do
        WhatsApp.
      </p>
    </div>
  );
}

function toStrings(settings: Settings): Record<NumericSetting, string> {
  return Object.fromEntries(FIELDS.map(({ key }) => [key, String(settings[key])])) as Record<NumericSetting, string>;
}
