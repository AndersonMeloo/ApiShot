export type ContactStatus = 'VALID' | 'INVALID' | 'DUPLICATE' | 'BLOCKED' | 'NO_OPT_IN';

export interface ContactInput {
  row: number;
  name: string | null;
  rawPhone: string;
  optIn: boolean | null;
}

export interface Contact extends ContactInput {
  id: string;
  phone: string | null;
  status: ContactStatus;
  issue: string | null;
}

export interface ContactList {
  fileName: string;
  importedAt: string;
  hasNameColumn: boolean;
  hasOptInColumn: boolean;
  contacts: Contact[];
  warnings: string[];
}

export interface ContactSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  blocked: number;
  noOptIn: number;
}

export type CampaignStatus =
  | 'IDLE'
  | 'VALIDATING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'ERROR';

export type LogStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'INVALID' | 'CANCELLED';

export type RecipientStatus = 'PENDING' | 'SENDING' | LogStatus;

export interface Recipient {
  id: string;
  name: string | null;
  phone: string;
  status: RecipientStatus;
  error: string | null;
  attempts: number;
  durationMs: number | null;
  processedAt: string | null;
}

export interface MediaInfo {
  fileName: string;
  storedPath: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
}

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface Settings {
  onlyOptIn: boolean;
  maxContactsPerCampaign: number;
  delayBetweenMessagesSeconds: number;
  maxRetries: number;
  retryBaseDelaySeconds: number;
  sendTimeoutSeconds: number;
}

export interface SendOptions {
  delayBetweenMessagesMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

export type RequestedAction = 'PAUSE' | 'CANCEL' | null;

export interface Campaign {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  status: CampaignStatus;
  requestedAction: RequestedAction;
  message: string;
  image: MediaInfo | null;
  sourceFile: string;
  onlyOptIn: boolean;
  consentConfirmed: boolean;
  sendOptions: SendOptions;
  targetCount: number;
  recipients: Recipient[];
  lastError: string | null;
}

export interface CampaignSummary {
  total: number;
  target: number;
  sent: number;
  failed: number;
  invalid: number;
  skipped: number;
  cancelled: number;
  pending: number;
  processed: number;
  percent: number;
}

export type SendErrorCode =
  | 'DISCONNECTED'
  | 'BROWSER_CLOSED'
  | 'PAGE_UNAVAILABLE'
  | 'NOT_ON_WHATSAPP'
  | 'TIMEOUT'
  | 'UPLOAD_FAILED'
  | 'UI_CHANGED'
  | 'BUSY'
  | 'UNKNOWN';

export type SendResult =
  | { ok: true; durationMs: number }
  | {
      ok: false;
      durationMs: number;
      code: SendErrorCode;
      detail: string;
      messageMayHaveBeenSent: boolean;
    };

export type WhatsAppStatus = 'CLOSED' | 'OPENING' | 'WAITING_LOGIN' | 'CONNECTED' | 'ERROR';

export interface WhatsAppState {
  status: WhatsAppStatus;
  detail: string | null;
}

export interface CampaignLogEntry {
  timestamp: string;
  campaignId: string;
  contactName: string | null;
  phone: string;
  status: LogStatus;
  error: string | null;
  durationMs: number | null;
  attempts: number;
}

export interface TestSendOutcome {
  ok: boolean;
  phone: string;
  message: string;
}

export interface AppSnapshot {
  contacts: ContactList | null;
  message: string;
  image: MediaInfo | null;
  settings: Settings;
  campaign: Campaign | null;
  campaignPhase: CampaignStatus;
  whatsapp: WhatsAppState;
  blockedCount: number;
  testInProgress: boolean;
  blocklistError: string | null;
  dataDir: string;
  limits: { maxImageBytes: number; maxMessageLength: number };
}
