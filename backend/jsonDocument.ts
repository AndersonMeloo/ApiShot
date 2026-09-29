import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { z } from 'zod';
import { stripBom } from '../core/bom';
import { AppError } from '../core/errors';
import { formatZodError } from '../core/validation';
import type { AppLogger } from './logger';

const RENAME_RETRIES = 3;

/** Writes to a temp file then renames it, so a crash never leaves a half-written JSON file. */
export async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');
  try {
    await renameWithRetry(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!transient || attempt >= RENAME_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

export type ReadResult<T> = { status: 'ok'; value: T } | { status: 'missing' } | { status: 'invalid'; reason: string };

export async function readJsonFile<T>(file: string, schema: z.ZodType<T>): Promise<ReadResult<T>> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(stripBom(raw));
  } catch (error) {
    return { status: 'invalid', reason: `JSON malformado (${(error as Error).message})` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { status: 'ok', value: parsed.data } : { status: 'invalid', reason: formatZodError(parsed.error) };
}

export type CorruptPolicy = 'reset' | 'fail';

/**
 * A single JSON file kept in memory. With the "reset" policy a corrupt file is moved aside
 * and the fallback is used; with "fail" the error is surfaced (used where losing data is unsafe).
 */
export class JsonDocument<T> {
  private value: T;

  constructor(
    private readonly file: string,
    private readonly schema: z.ZodType<T>,
    private readonly fallback: T,
    private readonly logger: AppLogger,
    private readonly corruptPolicy: CorruptPolicy = 'reset',
  ) {
    this.value = fallback;
  }

  async load(): Promise<T> {
    const result = await readJsonFile(this.file, this.schema);
    if (result.status === 'ok') this.value = result.value;
    else if (result.status === 'missing') this.value = this.fallback;
    else await this.handleCorrupt(result.reason);
    return this.value;
  }

  get(): T {
    return this.value;
  }

  async set(value: T): Promise<void> {
    await writeJsonFile(this.file, value);
    this.value = value;
  }

  private async handleCorrupt(reason: string): Promise<void> {
    if (this.corruptPolicy === 'fail') {
      throw new AppError(`O arquivo ${this.file} está inválido e precisa ser corrigido manualmente: ${reason}`);
    }
    const backup = `${this.file}.corrupt-${Date.now()}`;
    await rename(this.file, backup);
    this.logger.warn(`Arquivo inválido movido para ${backup}: ${reason}`);
    this.value = this.fallback;
  }
}
