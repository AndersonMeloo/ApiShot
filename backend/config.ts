import path from 'node:path';
import { z } from 'zod';
import { formatZodError } from '../core/validation';

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

const envSchema = z.object({
  DATA_DIR: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  BROWSER_CHANNEL: z.preprocess(emptyToUndefined, z.enum(['chromium', 'chrome', 'msedge']).optional()),
  MAX_IMAGE_SIZE_MB: z.preprocess(emptyToUndefined, z.coerce.number().min(1).max(16).default(5)),
});

export interface AppConfig {
  dataDir: string;
  browserChannel: 'chrome' | 'msedge' | undefined;
  maxImageBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv, defaultDataDir: string): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Configuração inválida no .env: ${formatZodError(parsed.error)}`);
  const { DATA_DIR, BROWSER_CHANNEL, MAX_IMAGE_SIZE_MB } = parsed.data;
  return {
    dataDir: DATA_DIR ? path.resolve(DATA_DIR) : defaultDataDir,
    browserChannel: BROWSER_CHANNEL === 'chromium' ? undefined : BROWSER_CHANNEL,
    maxImageBytes: Math.round(MAX_IMAGE_SIZE_MB * 1024 * 1024),
  };
}
