import type { MediaInfo } from '../core/types';
import { messageSchema, parseOrThrow } from '../core/validation';
import { JsonDocument } from './jsonDocument';
import type { AppLogger } from './logger';
import { draftSchema, type Draft } from './schemas';

/** Message and image being composed, persisted so nothing is lost if the app closes. */
export class DraftStore {
  private readonly document: JsonDocument<Draft>;

  constructor(file: string, logger: AppLogger) {
    this.document = new JsonDocument<Draft>(file, draftSchema, { message: '', image: null }, logger);
  }

  async load(): Promise<void> {
    await this.document.load();
  }

  get(): Draft {
    return this.document.get();
  }

  async setMessage(message: string): Promise<void> {
    const valid = parseOrThrow(messageSchema, message);
    await this.document.set({ ...this.get(), message: valid });
  }

  async setImage(image: MediaInfo | null): Promise<void> {
    await this.document.set({ ...this.get(), image });
  }
}
