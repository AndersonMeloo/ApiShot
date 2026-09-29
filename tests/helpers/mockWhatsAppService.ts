import type { SendErrorCode, SendResult } from '../../core/types';
import type { SendTarget, WhatsAppService } from '../../core/whatsapp';

export interface SentMessage {
  phone: string;
  name: string | null;
  message: string;
  imagePath?: string;
}

/** In-memory WhatsAppService: records calls and returns scripted results. Never touches a browser. */
export class MockWhatsAppService implements WhatsAppService {
  readonly sent: SentMessage[] = [];
  connected = true;
  private readonly scripted: SendResult[] = [];
  onSend: ((callNumber: number, target: SendTarget) => void) | null = null;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async isConnected(): Promise<boolean> {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async sendMessage(target: SendTarget, message: string, imagePath?: string): Promise<SendResult> {
    this.sent.push({ phone: target.phone, name: target.name, message, imagePath });
    this.onSend?.(this.sent.length, target);
    return this.scripted.shift() ?? { ok: true, durationMs: 5 };
  }

  thenSucceed(): this {
    this.scripted.push({ ok: true, durationMs: 5 });
    return this;
  }

  thenFail(code: SendErrorCode, options: { messageMayHaveBeenSent?: boolean } = {}): this {
    this.scripted.push({
      ok: false,
      code,
      detail: `falha simulada ${code}`,
      durationMs: 5,
      messageMayHaveBeenSent: options.messageMayHaveBeenSent ?? false,
    });
    return this;
  }
}
