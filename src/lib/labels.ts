import type { CampaignStatus, ContactStatus, LogStatus, RecipientStatus, WhatsAppStatus } from '../../core/types';

export type Tone = 'green' | 'red' | 'yellow' | 'gray' | 'blue';

export interface StatusLabel {
  label: string;
  tone: Tone;
  emoji?: string;
}

export const CONTACT_STATUS: Record<ContactStatus, StatusLabel> = {
  VALID: { label: 'Válido', tone: 'green' },
  INVALID: { label: 'Inválido', tone: 'red' },
  DUPLICATE: { label: 'Duplicado', tone: 'yellow' },
  BLOCKED: { label: 'Bloqueado', tone: 'gray' },
  NO_OPT_IN: { label: 'Sem autorização', tone: 'gray' },
};

export const RECIPIENT_STATUS: Record<RecipientStatus, Required<StatusLabel>> = {
  PENDING: { label: 'Pendente', tone: 'yellow', emoji: '🟡' },
  SENDING: { label: 'Enviando…', tone: 'yellow', emoji: '🟡' },
  SUCCESS: { label: 'Enviado', tone: 'green', emoji: '🟢' },
  FAILED: { label: 'Falhou', tone: 'red', emoji: '🔴' },
  INVALID: { label: 'Inválido', tone: 'gray', emoji: '⚪' },
  SKIPPED: { label: 'Ignorado', tone: 'gray', emoji: '⚪' },
  CANCELLED: { label: 'Cancelado', tone: 'gray', emoji: '⚪' },
};

export const LOG_STATUS: Record<LogStatus, Required<StatusLabel>> = RECIPIENT_STATUS;

export const CAMPAIGN_STATUS: Record<CampaignStatus, StatusLabel> = {
  IDLE: { label: 'Nenhuma campanha', tone: 'gray' },
  VALIDATING: { label: 'Validando…', tone: 'blue' },
  READY: { label: 'Pronta para iniciar', tone: 'blue' },
  RUNNING: { label: 'Em andamento', tone: 'green' },
  PAUSED: { label: 'Pausada', tone: 'yellow' },
  CANCELLED: { label: 'Cancelada', tone: 'gray' },
  COMPLETED: { label: 'Concluída', tone: 'green' },
  ERROR: { label: 'Interrompida por erro', tone: 'red' },
};

export const WHATSAPP_STATUS: Record<WhatsAppStatus, Required<StatusLabel>> = {
  CLOSED: { label: 'Desconectado', tone: 'gray', emoji: '⚪' },
  OPENING: { label: 'Abrindo…', tone: 'yellow', emoji: '🟡' },
  WAITING_LOGIN: { label: 'Aguardando login', tone: 'yellow', emoji: '🟡' },
  CONNECTED: { label: 'Conectado', tone: 'green', emoji: '🟢' },
  ERROR: { label: 'Erro', tone: 'red', emoji: '🔴' },
};

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}
