import { AppError } from '../core/errors';
import { normalizePhone } from '../core/phone';
import { JsonDocument } from './jsonDocument';
import type { AppLogger } from './logger';
import { blocklistSchema, type Blocklist } from './schemas';

/**
 * Opt-out list stored in data/blocked.json. Numbers are only ever added by the app;
 * removal is a manual, deliberate edit of the file.
 */
export class BlocklistStore {
  private readonly document: JsonDocument<Blocklist>;
  private phones = new Set<string>();
  private loadError: string | null = null;

  constructor(file: string, logger: AppLogger) {
    this.document = new JsonDocument<Blocklist>(file, blocklistSchema, { entries: [] }, logger, 'fail');
  }

  async load(): Promise<void> {
    try {
      const list = await this.document.load();
      this.phones = new Set(list.entries.map((entry) => canonical(entry.phone)));
      this.loadError = null;
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
    }
  }

  get error(): string | null {
    return this.loadError;
  }

  get count(): number {
    return this.phones.size;
  }

  assertHealthy(): void {
    if (this.loadError) throw new AppError(`Lista de bloqueio indisponível. ${this.loadError}`);
  }

  has(phone: string): boolean {
    return this.phones.has(canonical(phone));
  }

  async add(phone: string, reason: string, now: Date = new Date()): Promise<void> {
    this.assertHealthy();
    const normalized = canonical(phone);
    if (this.phones.has(normalized)) return;
    const current = this.document.get();
    await this.document.set({
      entries: [...current.entries, { phone: normalized, addedAt: now.toISOString(), reason }],
    });
    this.phones.add(normalized);
  }
}

function canonical(phone: string): string {
  const result = normalizePhone(phone);
  return result.ok ? result.phone : phone.replace(/\D/g, '');
}
