import { z } from 'zod';
import { AppError } from './errors';
import { findUnknownVariables } from './template';
import type { Contact, ContactList, ImageMimeType, MediaInfo, Settings } from './types';

export const MAX_MESSAGE_LENGTH = 4096;
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const settingsSchema = z.object({
  onlyOptIn: z.boolean().default(true),
  maxContactsPerCampaign: z.number().int().min(1).max(1000).default(50),
  delayBetweenMessagesSeconds: z.number().int().min(10).max(600).default(20),
  maxRetries: z.number().int().min(0).max(3).default(2),
  retryBaseDelaySeconds: z.number().int().min(5).max(300).default(15),
  sendTimeoutSeconds: z.number().int().min(15).max(180).default(45),
});

export const settingsUpdateSchema = settingsSchema.partial();

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const messageSchema = z
  .string()
  .max(MAX_MESSAGE_LENGTH, `A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`);

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(`Dados inválidos: ${formatZodError(result.error)}`);
  return result.data;
}

// ---------- Image ----------

const IMAGE_SIGNATURES: ReadonlyArray<{ mime: ImageMimeType; matches: (b: Uint8Array) => boolean }> = [
  { mime: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', matches: (b) => [0x89, 0x50, 0x4e, 0x47].every((byte, i) => b[i] === byte) },
  {
    mime: 'image/webp',
    matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  },
];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function validateImage(fileName: string, bytes: Uint8Array, maxBytes: number): ImageMimeType {
  const extension = fileExtension(fileName);
  if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new AppError('Formato de imagem não suportado. Use JPG, JPEG, PNG ou WEBP.');
  }
  if (bytes.byteLength === 0) throw new AppError('O arquivo de imagem está vazio.');
  if (bytes.byteLength > maxBytes) {
    throw new AppError(`A imagem excede o tamanho máximo de ${formatBytes(maxBytes)}.`);
  }
  const signature = IMAGE_SIGNATURES.find((s) => s.matches(bytes));
  if (!signature) throw new AppError('O conteúdo do arquivo não é uma imagem JPG, PNG ou WEBP válida.');
  return signature.mime;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Eligibility ----------

export interface Exclusion {
  contact: Contact;
  status: 'INVALID' | 'SKIPPED';
  reason: string;
}

export interface Eligibility {
  eligible: Contact[];
  excluded: Exclusion[];
  awaitingConsent: Contact[];
  requiresConsentConfirmation: boolean;
}

export interface EligibilityOptions {
  onlyOptIn: boolean;
  consentConfirmed: boolean;
}

type Decision = { kind: 'eligible' } | { kind: 'needsConsent' } | { kind: 'excluded'; exclusion: Exclusion };

function decide(contact: Contact, list: ContactList, onlyOptIn: boolean): Decision {
  const exclude = (status: Exclusion['status'], reason: string): Decision => ({
    kind: 'excluded',
    exclusion: { contact, status, reason },
  });

  switch (contact.status) {
    case 'INVALID':
    case 'DUPLICATE':
      return exclude('INVALID', contact.issue ?? 'Número inválido');
    case 'BLOCKED':
    case 'NO_OPT_IN':
      return exclude('SKIPPED', contact.issue ?? 'Contato não elegível');
    case 'VALID':
      break;
  }
  if (contact.optIn === true) return { kind: 'eligible' };
  if (onlyOptIn && list.hasOptInColumn) return exclude('SKIPPED', 'Sem autorização registrada (optIn vazio)');
  return { kind: 'needsConsent' };
}

export function evaluateEligibility(list: ContactList, options: EligibilityOptions): Eligibility {
  const result: Eligibility = { eligible: [], excluded: [], awaitingConsent: [], requiresConsentConfirmation: false };
  for (const contact of list.contacts) {
    const decision = decide(contact, list, options.onlyOptIn);
    if (decision.kind === 'excluded') result.excluded.push(decision.exclusion);
    else if (decision.kind === 'eligible') result.eligible.push(contact);
    else {
      result.requiresConsentConfirmation = true;
      (options.consentConfirmed ? result.eligible : result.awaitingConsent).push(contact);
    }
  }
  return result;
}

// ---------- Campaign draft ----------

export interface CampaignDraft {
  contacts: ContactList | null;
  message: string;
  image: MediaInfo | null;
  settings: Settings;
  consentConfirmed: boolean;
}

export interface DraftValidation {
  errors: string[];
  eligibility: Eligibility | null;
}

export function validateMessage(message: string): string[] {
  const errors: string[] = [];
  if (!message.trim()) errors.push('Escreva a mensagem da campanha.');
  const lengthCheck = messageSchema.safeParse(message);
  if (!lengthCheck.success) errors.push(formatZodError(lengthCheck.error));
  const unknown = findUnknownVariables(message);
  if (unknown.length) errors.push(`Variáveis não suportadas: ${unknown.join(', ')}. Use apenas {nome}.`);
  return errors;
}

export function validateCampaignDraft(draft: CampaignDraft): DraftValidation {
  const errors = validateMessage(draft.message);
  if (!draft.contacts) return { errors: ['Importe uma lista de contatos.', ...errors], eligibility: null };

  const eligibility = evaluateEligibility(draft.contacts, {
    onlyOptIn: draft.settings.onlyOptIn,
    consentConfirmed: draft.consentConfirmed,
  });
  if (eligibility.awaitingConsent.length > 0) {
    errors.push('Confirme que todos os contatos sem optIn autorizaram receber mensagens.');
  }
  if (eligibility.eligible.length === 0 && eligibility.awaitingConsent.length === 0) {
    errors.push('Nenhum contato elegível para envio.');
  }
  const limit = draft.settings.maxContactsPerCampaign;
  if (eligibility.eligible.length > limit) {
    errors.push(
      `A campanha tem ${eligibility.eligible.length} contatos elegíveis, acima do limite de ${limit} por campanha. Divida a lista ou ajuste o limite nas configurações.`,
    );
  }
  return { errors, eligibility };
}
