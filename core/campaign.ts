import type { Eligibility } from './validation';
import type { Campaign, CampaignSummary, MediaInfo, Recipient, RecipientStatus, Settings } from './types';

export interface NewCampaignInput {
  id: string;
  now: Date;
  message: string;
  image: MediaInfo | null;
  sourceFile: string;
  settings: Settings;
  consentConfirmed: boolean;
  eligibility: Eligibility;
}

/** Log id used for single test sends, which do not belong to a campaign. */
export const TEST_LOG_ID = 'testes';

const pad = (value: number) => String(value).padStart(2, '0');

export function createCampaignId(now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `campaign-${date}-${time}`;
}

function recipient(id: string, name: string | null, phone: string, status: RecipientStatus, error: string | null): Recipient {
  return { id, name, phone, status, error, attempts: 0, durationMs: null, processedAt: null };
}

export function createCampaign(input: NewCampaignInput): Campaign {
  const timestamp = input.now.toISOString();
  const pending = input.eligibility.eligible.map((c) => recipient(c.id, c.name, c.phone ?? '', 'PENDING', null));
  const excluded = input.eligibility.excluded.map(({ contact, status, reason }) =>
    recipient(contact.id, contact.name, contact.phone ?? contact.rawPhone, status, reason),
  );
  return {
    id: input.id,
    createdAt: timestamp,
    startedAt: null,
    finishedAt: null,
    updatedAt: timestamp,
    status: 'VALIDATING',
    requestedAction: null,
    message: input.message,
    image: input.image,
    sourceFile: input.sourceFile,
    onlyOptIn: input.settings.onlyOptIn,
    consentConfirmed: input.consentConfirmed,
    sendOptions: {
      delayBetweenMessagesMs: input.settings.delayBetweenMessagesSeconds * 1000,
      maxRetries: input.settings.maxRetries,
      retryBaseDelayMs: input.settings.retryBaseDelaySeconds * 1000,
    },
    targetCount: pending.length,
    recipients: [...pending, ...excluded],
    lastError: null,
  };
}

export function summarizeCampaign(campaign: Campaign): CampaignSummary {
  const count = (...statuses: RecipientStatus[]) =>
    campaign.recipients.filter((r) => statuses.includes(r.status)).length;
  const pending = count('PENDING', 'SENDING');
  const target = campaign.targetCount;
  const processed = Math.max(0, target - pending);
  return {
    total: campaign.recipients.length,
    target,
    sent: count('SUCCESS'),
    failed: count('FAILED'),
    invalid: count('INVALID'),
    skipped: count('SKIPPED'),
    cancelled: count('CANCELLED'),
    pending,
    processed,
    percent: target === 0 ? 0 : Math.round((processed / target) * 100),
  };
}

/**
 * Makes a campaign loaded after an unexpected shutdown safe to continue:
 * a running campaign becomes PAUSED and a contact caught mid-send is marked FAILED
 * (never re-sent automatically, since the message may already have been delivered).
 */
export function recoverInterruptedCampaign(campaign: Campaign, now: Date): Campaign {
  const recovered: Campaign = { ...campaign, requestedAction: null, recipients: campaign.recipients.map((r) => ({ ...r })) };
  for (const r of recovered.recipients) {
    if (r.status !== 'SENDING') continue;
    r.status = 'FAILED';
    r.error = 'A aplicação foi encerrada durante este envio. Verifique manualmente no WhatsApp se a mensagem chegou.';
    r.processedAt = now.toISOString();
  }
  if (recovered.status === 'RUNNING') {
    recovered.status = 'PAUSED';
    recovered.lastError = 'A aplicação foi encerrada durante a campanha. Revise o progresso e clique em Continuar.';
  }
  return recovered;
}
