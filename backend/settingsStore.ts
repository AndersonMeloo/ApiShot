import type { Settings } from '../core/types';
import { DEFAULT_SETTINGS, parseOrThrow, settingsSchema, settingsUpdateSchema } from '../core/validation';
import { JsonDocument } from './jsonDocument';
import type { AppLogger } from './logger';

export class SettingsStore {
  private readonly document: JsonDocument<Settings>;

  constructor(file: string, logger: AppLogger) {
    this.document = new JsonDocument<Settings>(file, settingsSchema, DEFAULT_SETTINGS, logger);
  }

  async load(): Promise<void> {
    await this.document.load();
  }

  get(): Settings {
    return this.document.get();
  }

  async update(patch: unknown): Promise<void> {
    const changes = parseOrThrow(settingsUpdateSchema, patch);
    const next = parseOrThrow(settingsSchema, { ...this.get(), ...changes });
    await this.document.set(next);
  }
}
