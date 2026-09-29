import type { SendErrorCode } from './types';

/** Error whose message is safe and meaningful to show to the user. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

interface ErrorInfo {
  message: string;
  retryable: boolean;
  fatal: boolean;
}

const SEND_ERRORS: Record<SendErrorCode, ErrorInfo> = {
  DISCONNECTED: {
    message: 'WhatsApp Web desconectado. Abra o WhatsApp Web e faça login novamente.',
    retryable: false,
    fatal: true,
  },
  BROWSER_CLOSED: {
    message: 'O navegador do WhatsApp Web foi fechado. Clique em "Conectar WhatsApp" para reabrir.',
    retryable: false,
    fatal: true,
  },
  PAGE_UNAVAILABLE: {
    message: 'WhatsApp Web indisponível (verifique sua conexão com a internet).',
    retryable: true,
    fatal: false,
  },
  NOT_ON_WHATSAPP: {
    message: 'O WhatsApp informou que este número é inválido ou não possui conta.',
    retryable: false,
    fatal: false,
  },
  TIMEOUT: {
    message: 'Tempo esgotado aguardando o WhatsApp Web.',
    retryable: true,
    fatal: false,
  },
  UPLOAD_FAILED: {
    message: 'Falha ao anexar a imagem.',
    retryable: true,
    fatal: false,
  },
  UI_CHANGED: {
    message:
      'Um elemento esperado do WhatsApp Web não foi encontrado. A interface pode ter mudado; a automação foi interrompida para evitar envios incorretos.',
    retryable: false,
    fatal: true,
  },
  BUSY: {
    message: 'Já existe um envio em andamento.',
    retryable: false,
    fatal: false,
  },
  UNKNOWN: {
    message: 'Erro inesperado durante o envio.',
    retryable: false,
    fatal: false,
  },
};

export function describeSendError(code: SendErrorCode, detail?: string): string {
  const base = SEND_ERRORS[code].message;
  return detail ? `${base} (${detail})` : base;
}

export function isRetryable(code: SendErrorCode): boolean {
  return SEND_ERRORS[code].retryable;
}

export function isFatal(code: SendErrorCode): boolean {
  return SEND_ERRORS[code].fatal;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** First line of an error message, truncated; strips stack/call logs that may be noisy. */
export function shortErrorMessage(error: unknown, maxLength = 300): string {
  const firstLine = errorMessage(error).split('\n')[0]?.trim() ?? '';
  return firstLine.length > maxLength ? `${firstLine.slice(0, maxLength)}…` : firstLine;
}
