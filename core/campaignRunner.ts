import { AppError, describeSendError, isFatal, isRetryable, shortErrorMessage } from './errors';
import { isTerminal, transition } from './stateMachine';
import { renderMessage } from './template';
import type { Campaign, CampaignStatus, LogStatus, Recipient, SendResult } from './types';
import type { WhatsAppService } from './whatsapp';

export interface RunnerDeps {
  whatsapp: Pick<WhatsAppService, 'sendMessage'>;
  isBlocked(phone: string): boolean;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  now(): Date;
  onChange(campaign: Campaign): Promise<void> | void;
  onRecipientFinished(campaign: Campaign, recipient: Recipient): Promise<void> | void;
}

type StepOutcome = 'continue' | 'stop';
type FailedSend = Extract<SendResult, { ok: false }>;

/**
 * Processes a campaign one recipient at a time. Pause/cancel are cooperative:
 * the current send always finishes before the loop stops.
 */
export class CampaignRunner {
  private loop: Promise<void> | null = null;
  private waitAbort = new AbortController();
  private lastAttemptAt: number | null = null;

  constructor(
    readonly campaign: Campaign,
    private readonly deps: RunnerDeps,
  ) {}

  get isActive(): boolean {
    return this.loop !== null;
  }

  async start(): Promise<void> {
    this.ensureNotActive();
    await this.changeStatus('RUNNING');
    this.campaign.startedAt = this.timestamp();
    await this.logExcludedRecipients();
    this.launch();
  }

  async resume(): Promise<void> {
    this.ensureNotActive();
    if (this.campaign.status !== 'PAUSED' && this.campaign.status !== 'ERROR') {
      throw new AppError('Só é possível continuar uma campanha pausada ou interrompida por erro.');
    }
    this.campaign.lastError = null;
    await this.changeStatus('RUNNING');
    this.launch();
  }

  async pause(): Promise<void> {
    if (this.campaign.status !== 'RUNNING') throw new AppError('Só é possível pausar uma campanha em andamento.');
    if (this.campaign.requestedAction === 'CANCEL') return;
    await this.requestStop('PAUSE');
  }

  async cancel(): Promise<void> {
    const { status } = this.campaign;
    if (status === 'RUNNING' && this.isActive) return this.requestStop('CANCEL');
    if (status === 'RUNNING' || status === 'PAUSED' || status === 'ERROR') return this.finishCancelled();
    throw new AppError('Esta campanha não pode ser cancelada no estado atual.');
  }

  waitUntilIdle(): Promise<void> {
    return this.loop ?? Promise.resolve();
  }

  private ensureNotActive(): void {
    if (this.isActive) throw new AppError('A campanha já está em execução.');
  }

  private launch(): void {
    this.waitAbort = new AbortController();
    this.loop = this.runLoop().finally(() => {
      this.loop = null;
    });
  }

  private async requestStop(action: 'PAUSE' | 'CANCEL'): Promise<void> {
    this.campaign.requestedAction = action;
    this.waitAbort.abort();
    await this.notify();
  }

  private async runLoop(): Promise<void> {
    try {
      while ((await this.step()) === 'continue');
    } catch (error) {
      // Last resort: if even recording the error fails, the loop must still end cleanly.
      await this.stopWithError(`Erro inesperado: ${shortErrorMessage(error)}`).catch(() => undefined);
    }
  }

  private async step(): Promise<StepOutcome> {
    const action = this.campaign.requestedAction;
    if (action === 'CANCEL') return this.finishCancelled().then(() => 'stop');
    if (action === 'PAUSE') return this.changeStatus('PAUSED').then(() => 'stop');

    const next = this.campaign.recipients.find((r) => r.status === 'PENDING');
    if (!next) return this.changeStatus('COMPLETED').then(() => 'stop');

    await this.waitForRateLimit();
    if (this.campaign.requestedAction) return 'continue';
    return this.process(next);
  }

  private async process(recipient: Recipient): Promise<StepOutcome> {
    if (this.deps.isBlocked(recipient.phone)) {
      await this.finish(recipient, 'SKIPPED', 'Número na lista de bloqueio', null);
      return 'continue';
    }
    const message = renderMessage(this.campaign.message, recipient.name);
    recipient.status = 'SENDING';
    recipient.error = null;
    await this.notify();
    return this.deliver(recipient, message);
  }

  private async deliver(recipient: Recipient, message: string): Promise<StepOutcome> {
    const { maxRetries, retryBaseDelayMs } = this.campaign.sendOptions;
    for (let attempt = 1; ; attempt++) {
      recipient.attempts = attempt;
      const result = await this.send(recipient, message);
      if (result.ok) {
        await this.finish(recipient, 'SUCCESS', null, result.durationMs);
        return 'continue';
      }
      const outcome = await this.handleFailure(recipient, result, attempt < maxRetries + 1);
      if (outcome !== 'retry') return outcome;

      await this.wait(retryBaseDelayMs * 2 ** (attempt - 1));
      if (this.campaign.requestedAction) {
        recipient.status = 'PENDING';
        await this.notify();
        return 'continue';
      }
    }
  }

  private async handleFailure(
    recipient: Recipient,
    result: FailedSend,
    hasAttemptsLeft: boolean,
  ): Promise<StepOutcome | 'retry'> {
    const error = describeSendError(result.code, result.detail);
    if (result.code === 'NOT_ON_WHATSAPP') {
      await this.finish(recipient, 'INVALID', error, result.durationMs);
      return 'continue';
    }
    if (isFatal(result.code)) return this.stopOnFatal(recipient, result, error);

    const canRetry = isRetryable(result.code) && !result.messageMayHaveBeenSent && hasAttemptsLeft;
    if (canRetry) return 'retry';

    const suffix = result.messageMayHaveBeenSent ? ' Verifique manualmente se a mensagem chegou.' : '';
    await this.finish(recipient, 'FAILED', error + suffix, result.durationMs);
    return 'continue';
  }

  private async stopOnFatal(recipient: Recipient, result: FailedSend, error: string): Promise<StepOutcome> {
    if (result.messageMayHaveBeenSent) {
      await this.finish(recipient, 'FAILED', `${error} Verifique manualmente se a mensagem chegou.`, result.durationMs);
    } else {
      recipient.status = 'PENDING';
    }
    await this.stopWithError(error);
    return 'stop';
  }

  private async send(recipient: Recipient, message: string): Promise<SendResult> {
    const startedAt = this.deps.now().getTime();
    try {
      const target = { name: recipient.name, phone: recipient.phone };
      return await this.deps.whatsapp.sendMessage(target, message, this.campaign.image?.storedPath);
    } catch (error) {
      const durationMs = this.deps.now().getTime() - startedAt;
      return { ok: false, code: 'UNKNOWN', detail: shortErrorMessage(error), durationMs, messageMayHaveBeenSent: true };
    } finally {
      this.lastAttemptAt = this.deps.now().getTime();
    }
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.lastAttemptAt === null) return;
    const elapsed = this.deps.now().getTime() - this.lastAttemptAt;
    const remaining = this.campaign.sendOptions.delayBetweenMessagesMs - elapsed;
    if (remaining > 0) await this.wait(remaining);
  }

  private wait(ms: number): Promise<void> {
    return this.deps.sleep(ms, this.waitAbort.signal);
  }

  private async finish(recipient: Recipient, status: LogStatus, error: string | null, durationMs: number | null) {
    recipient.status = status;
    recipient.error = error;
    recipient.durationMs = durationMs;
    recipient.processedAt = this.timestamp();
    await this.deps.onRecipientFinished(this.campaign, recipient);
    await this.notify();
  }

  private async finishCancelled(): Promise<void> {
    const processedAt = this.timestamp();
    for (const recipient of this.campaign.recipients) {
      if (recipient.status !== 'PENDING' && recipient.status !== 'SENDING') continue;
      recipient.status = 'CANCELLED';
      recipient.error = 'Campanha cancelada antes do envio';
      recipient.processedAt = processedAt;
      await this.deps.onRecipientFinished(this.campaign, recipient);
    }
    await this.changeStatus('CANCELLED');
  }

  private async logExcludedRecipients(): Promise<void> {
    const processedAt = this.timestamp();
    for (const recipient of this.campaign.recipients) {
      if (recipient.status !== 'INVALID' && recipient.status !== 'SKIPPED') continue;
      recipient.processedAt = processedAt;
      await this.deps.onRecipientFinished(this.campaign, recipient);
    }
  }

  private async stopWithError(message: string): Promise<void> {
    this.campaign.lastError = message;
    if (this.campaign.status === 'RUNNING') await this.changeStatus('ERROR');
    else await this.notify();
  }

  private async changeStatus(to: CampaignStatus): Promise<void> {
    transition(this.campaign, to);
    if (to !== 'RUNNING') this.campaign.requestedAction = null;
    if (isTerminal(to)) this.campaign.finishedAt = this.timestamp();
    await this.notify();
  }

  private async notify(): Promise<void> {
    this.campaign.updatedAt = this.timestamp();
    await this.deps.onChange(this.campaign);
  }

  private timestamp(): string {
    return this.deps.now().toISOString();
  }
}
