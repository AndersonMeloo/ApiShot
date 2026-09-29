import type { SendResult } from './types';

export interface SendTarget {
  name: string | null;
  phone: string;
}

/**
 * Abstraction over the WhatsApp Web automation. Campaign logic depends only on this
 * interface, so it can be tested with a mock and never imports Playwright.
 */
export interface WhatsAppService {
  connect(): Promise<void>;
  isConnected(): Promise<boolean>;
  sendMessage(contact: SendTarget, message: string, imagePath?: string): Promise<SendResult>;
  disconnect(): Promise<void>;
}
