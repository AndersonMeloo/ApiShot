import { useState } from 'react';
import { summarizeCampaign } from '../../core/campaign';
import { renderMessage } from '../../core/template';
import type { AppSnapshot, Campaign, ContactList, Settings } from '../../core/types';
import { evaluateEligibility, type Eligibility } from '../../core/validation';
import { useAction } from '../hooks/useAction';
import { useAppState } from '../hooks/useAppState';
import { invoke } from '../lib/api';
import { CAMPAIGN_STATUS } from '../lib/labels';
import { MessageBubble } from './CampaignPreview';
import { StatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Notice } from './ui/Notice';
import { Stat } from './ui/Stat';

interface CampaignControlsProps {
  flushMessage: () => Promise<void>;
  imageUrl: string | null;
}

const ACTIVE_STATUSES = new Set(['READY', 'RUNNING', 'PAUSED', 'ERROR']);

export function CampaignControls({ flushMessage, imageUrl }: CampaignControlsProps) {
  const state = useAppState();
  const active = state.campaign && ACTIVE_STATUSES.has(state.campaign.status) ? state.campaign : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Status</span>
        <StatusBadge status={CAMPAIGN_STATUS[state.campaignPhase]} />
      </div>
      {active ? (
        <ActiveCampaignControls campaign={active} snapshot={state} imageUrl={imageUrl} />
      ) : (
        <NewCampaignControls snapshot={state} flushMessage={flushMessage} />
      )}
    </div>
  );
}

/** Validates the draft in the main process; on success the campaign becomes READY and the confirmation opens. */
function NewCampaignControls({ snapshot, flushMessage }: { snapshot: AppSnapshot; flushMessage: () => Promise<void> }) {
  const { contacts, settings } = snapshot;
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const { run, pending } = useAction();

  const eligibility = contacts ? evaluateEligibility(contacts, { onlyOptIn: settings.onlyOptIn, consentConfirmed }) : null;
  const blockedReason = startBlockedReason(snapshot, eligibility, consentConfirmed);

  const prepare = () =>
    run('prepare', async () => {
      await flushMessage();
      await invoke('app:prepare-campaign', { consentConfirmed });
    });

  return (
    <>
      <ConsentOptions contacts={contacts} settings={settings} eligibility={eligibility} consentConfirmed={consentConfirmed} onConsentChange={setConsentConfirmed} />
      {eligibility && <EligibilityStats contacts={contacts} eligibility={eligibility} />}
      {eligibility && eligibility.eligible.length > settings.maxContactsPerCampaign && (
        <Notice tone="error">
          {eligibility.eligible.length} contatos prontos excedem o limite de {settings.maxContactsPerCampaign} por campanha. Divida a
          lista ou ajuste o limite nas configurações.
        </Notice>
      )}
      <Button variant="primary" className="w-full" onClick={() => void prepare()} disabled={blockedReason !== null} loading={pending === 'prepare'}>
        Iniciar campanha
      </Button>
      {blockedReason && <p className="text-xs text-slate-500">{blockedReason}</p>}
    </>
  );
}

function startBlockedReason(snapshot: AppSnapshot, eligibility: Eligibility | null, consentConfirmed: boolean): string | null {
  if (snapshot.blocklistError) return 'Corrija o arquivo data/blocked.json para continuar.';
  if (!snapshot.contacts || !eligibility) return 'Importe uma lista de contatos.';
  if (!snapshot.message.trim()) return 'Escreva a mensagem da campanha.';
  if (eligibility.requiresConsentConfirmation && !consentConfirmed) return 'Confirme a autorização dos contatos acima.';
  if (eligibility.eligible.length === 0) return 'Nenhum contato pronto para envio.';
  if (snapshot.whatsapp.status !== 'CONNECTED') return 'Conecte o WhatsApp Web antes de iniciar.';
  if (snapshot.testInProgress) return 'Aguarde o envio de teste terminar.';
  return null;
}

interface ConsentOptionsProps {
  contacts: ContactList | null;
  settings: Settings;
  eligibility: Eligibility | null;
  consentConfirmed: boolean;
  onConsentChange: (value: boolean) => void;
}

function ConsentOptions({ contacts, settings, eligibility, consentConfirmed, onConsentChange }: ConsentOptionsProps) {
  const { run, pending } = useAction();
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <label className="flex items-start gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-emerald-600"
          checked={settings.onlyOptIn}
          disabled={pending !== null}
          onChange={(e) => void run('optin', () => invoke('app:update-settings', { onlyOptIn: e.target.checked }))}
        />
        <span>
          Somente enviar para contatos que autorizaram receber mensagens.
          <span className="block text-xs text-slate-500">
            Contatos com optIn=false nunca recebem mensagens, mesmo com esta opção desmarcada.
          </span>
        </span>
      </label>
      {contacts && !contacts.hasOptInColumn && (
        <Notice tone="warning">Este CSV não tem a coluna optIn. Não é possível saber quem autorizou, então confirme abaixo.</Notice>
      )}
      {eligibility?.requiresConsentConfirmation && (
        <label className="flex items-start gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" className="mt-0.5 size-4 accent-emerald-600" checked={consentConfirmed} onChange={(e) => onConsentChange(e.target.checked)} />
          Confirmo que todos os contatos sem optIn registrado autorizaram receber mensagens.
        </label>
      )}
    </div>
  );
}

function EligibilityStats({ contacts, eligibility }: { contacts: ContactList | null; eligibility: Eligibility }) {
  const invalid = eligibility.excluded.filter((e) => e.status === 'INVALID').length;
  const skipped = eligibility.excluded.length - invalid;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Contatos" value={contacts?.contacts.length ?? 0} />
      <Stat label="Prontos" value={eligibility.eligible.length} tone="green" />
      <Stat label="Inválidos" value={invalid} tone="red" />
      <Stat label="Ignorados" value={skipped + eligibility.awaitingConsent.length} />
    </div>
  );
}

interface StartConfirmDialogProps {
  campaign: Campaign | null;
  imageUrl: string | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function StartConfirmDialog({ campaign, imageUrl, loading, onConfirm, onCancel }: StartConfirmDialogProps) {
  const summary = campaign ? summarizeCampaign(campaign) : null;
  const firstName = campaign?.recipients.find((r) => r.status === 'PENDING')?.name ?? null;
  const delaySeconds = (campaign?.sendOptions.delayBetweenMessagesMs ?? 0) / 1000;
  const estimatedMinutes = campaign ? Math.ceil((campaign.targetCount * delaySeconds) / 60) : 0;

  return (
    <ConfirmDialog
      open={campaign !== null}
      title="Confirmar campanha"
      confirmLabel={`Iniciar envio para ${campaign?.targetCount ?? 0} contatos`}
      cancelLabel="Cancelar"
      acknowledgement="Revisei a mensagem e a imagem, e todos os destinatários autorizaram receber esta comunicação."
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="text-base font-medium text-slate-900">
        Você está prestes a iniciar uma campanha para {campaign?.targetCount} contatos. Confirma?
      </p>
      {summary && (summary.invalid > 0 || summary.skipped > 0) && (
        <p className="text-slate-500">
          {summary.invalid} inválido(s) e {summary.skipped} ignorado(s) não receberão a mensagem.
        </p>
      )}
      <p className="text-slate-500">
        Intervalo de {delaySeconds}s entre mensagens · duração estimada de ~{estimatedMinutes} min.
      </p>
      {campaign && <MessageBubble message={renderMessage(campaign.message, firstName)} imageUrl={imageUrl} hasImage={campaign.image !== null} />}
    </ConfirmDialog>
  );
}

function ActiveCampaignControls({ campaign, snapshot, imageUrl }: { campaign: Campaign; snapshot: AppSnapshot; imageUrl: string | null }) {
  const { run, pending } = useAction();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reviewing, setReviewing] = useState(campaign.status === 'READY');
  const connected = snapshot.whatsapp.status === 'CONNECTED';
  const stopping = campaign.requestedAction;

  const cancel = async () => {
    await run('cancel', () => invoke('app:cancel-campaign'), 'Cancelamento solicitado.');
    setConfirmCancel(false);
  };

  const start = () =>
    run('start', async () => {
      await invoke('app:start-campaign', { campaignId: campaign.id, confirmedCount: campaign.targetCount });
      setReviewing(false);
    });

  const discard = () => run('discard', () => invoke('app:discard-campaign'));

  return (
    <div className="space-y-3">
      {campaign.lastError && <Notice tone="error">{campaign.lastError}</Notice>}
      {stopping && (
        <Notice tone="info">
          {stopping === 'PAUSE' ? 'Pausando' : 'Cancelando'} após concluir o envio atual com segurança…
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {campaign.status === 'READY' && (
          <>
            <Button variant="primary" onClick={() => setReviewing(true)}>
              Revisar e iniciar
            </Button>
            <Button variant="ghost" onClick={() => void discard()} loading={pending === 'discard'}>
              Descartar
            </Button>
          </>
        )}
        {campaign.status === 'RUNNING' && (
          <Button variant="warning" onClick={() => run('pause', () => invoke('app:pause-campaign'))} disabled={stopping !== null} loading={pending === 'pause'}>
            Pausar
          </Button>
        )}
        {(campaign.status === 'PAUSED' || campaign.status === 'ERROR') && (
          <Button
            variant="primary"
            onClick={() => run('resume', () => invoke('app:resume-campaign'))}
            disabled={!connected}
            title={connected ? undefined : 'Conecte o WhatsApp Web para continuar'}
            loading={pending === 'resume'}
          >
            Continuar
          </Button>
        )}
        {campaign.status !== 'READY' && (
          <Button variant="danger" onClick={() => setConfirmCancel(true)} disabled={stopping === 'CANCEL'}>
            Cancelar
          </Button>
        )}
      </div>
      {!connected && campaign.status !== 'RUNNING' && <p className="text-xs text-slate-500">Conecte o WhatsApp Web para continuar a campanha.</p>}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar campanha?"
        confirmLabel="Cancelar campanha"
        cancelLabel="Voltar"
        variant="danger"
        loading={pending === 'cancel'}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirmCancel(false)}
      >
        <p>
          O envio atual será concluído e os {summarizeCampaign(campaign).pending} contatos pendentes não receberão a mensagem. Esta ação não
          pode ser desfeita.
        </p>
      </ConfirmDialog>

      <StartConfirmDialog
        campaign={reviewing && campaign.status === 'READY' ? campaign : null}
        imageUrl={imageUrl}
        loading={pending === 'start' || pending === 'discard'}
        onConfirm={() => void start()}
        onCancel={() => void discard()}
      />
    </div>
  );
}
