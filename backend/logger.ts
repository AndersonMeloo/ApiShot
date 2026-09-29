import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { summarizeCampaign } from '../core/campaign';
import { shortErrorMessage } from '../core/errors';
import type { Campaign, CampaignLogEntry, LogStatus, Recipient } from '../core/types';

type Level = 'INFO' | 'WARN' | 'ERROR';

/** Application log. Only operational messages are written: never session data or credentials. */
export class AppLogger {
  constructor(private readonly file: string) {}

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string, error?: unknown): void {
    this.write('WARN', this.withError(message, error));
  }

  error(message: string, error?: unknown): void {
    this.write('ERROR', this.withError(message, error));
  }

  private withError(message: string, error?: unknown): string {
    return error === undefined ? message : `${message}: ${shortErrorMessage(error)}`;
  }

  private write(level: Level, message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${message}`;
    (level === 'ERROR' ? console.error : console.log)(line);
    appendFile(this.file, `${line}\n`).catch(() => undefined);
  }
}

const LOG_STATUSES: readonly LogStatus[] = ['SUCCESS', 'FAILED', 'SKIPPED', 'INVALID', 'CANCELLED'];

export function toLogEntry(campaignId: string, recipient: Recipient, now: Date): CampaignLogEntry {
  if (!LOG_STATUSES.includes(recipient.status as LogStatus)) {
    throw new Error(`Status ${recipient.status} não é um resultado final`);
  }
  return {
    timestamp: now.toISOString(),
    campaignId,
    contactName: recipient.name,
    phone: recipient.phone,
    status: recipient.status as LogStatus,
    error: recipient.error,
    durationMs: recipient.durationMs,
    attempts: recipient.attempts,
  };
}

/** Per-campaign result log (JSON Lines) plus a summary file, both under data/logs. */
export class CampaignLogger {
  constructor(private readonly logsDir: string) {}

  async append(entry: CampaignLogEntry): Promise<void> {
    await appendFile(this.logFile(entry.campaignId), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async read(campaignId: string): Promise<CampaignLogEntry[]> {
    let content: string;
    try {
      content = await readFile(this.logFile(campaignId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return content.split('\n').flatMap((line) => parseLine(line));
  }

  async writeSummary(campaign: Campaign): Promise<void> {
    const summary = summarizeCampaign(campaign);
    const content = {
      campaignId: campaign.id,
      status: campaign.status,
      updatedAt: campaign.updatedAt,
      total: summary.total,
      enviados: summary.sent,
      falharam: summary.failed,
      invalidos: summary.invalid,
      ignorados: summary.skipped,
      cancelados: summary.cancelled,
      pendentes: summary.pending,
    };
    await writeFile(this.summaryFile(campaign.id), JSON.stringify(content, null, 2), 'utf8');
  }

  private logFile(campaignId: string): string {
    return path.join(this.logsDir, `${safeId(campaignId)}.jsonl`);
  }

  private summaryFile(campaignId: string): string {
    return path.join(this.logsDir, `${safeId(campaignId)}.summary.json`);
  }
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseLine(line: string): CampaignLogEntry[] {
  if (!line.trim()) return [];
  try {
    return [JSON.parse(line) as CampaignLogEntry];
  } catch {
    return [];
  }
}
