import { createCampaign, createCampaignId, recoverInterruptedCampaign, TEST_LOG_ID } from '../core/campaign';
import { CampaignRunner } from '../core/campaignRunner';
import { AppError, describeSendError } from '../core/errors';
import { normalizePhone } from '../core/phone';
import { abortableSleep } from '../core/sleep';
import { isTerminal, transition } from '../core/stateMachine';
import { renderMessage } from '../core/template';
import type { Campaign, CampaignStatus, Recipient, TestSendOutcome } from '../core/types';
import { validateCampaignDraft, validateMessage } from '../core/validation';
import type { WhatsAppService } from '../core/whatsapp';
import type { BlocklistStore } from './blocklistStore';
import type { CampaignStore } from './campaignStore';
import type { ContactsStore } from './contactsStore';
import type { DraftStore } from './draftStore';
import { toLogEntry, type AppLogger, type CampaignLogger } from './logger';
import type { MediaStore } from './mediaStore';
import type { SettingsStore } from './settingsStore';

const SHUTDOWN_WAIT_MS = 20_000;

export interface CampaignServiceDeps {
  whatsapp: WhatsAppService;
  contacts: ContactsStore;
  draft: DraftStore;
  settings: SettingsStore;
  blocklist: BlocklistStore;
  media: MediaStore;
  campaigns: CampaignStore;
  campaignLogger: CampaignLogger;
  logger: AppLogger;
  onChange: () => void;
  now?: () => Date;
}

/** Owns the single active campaign and guards every action against unsafe or concurrent use. */
export class CampaignService {
  private runner: CampaignRunner | null = null;
  private busyAction: string | null = null;
  private validating = false;
  private testing = false;
  private readonly now: () => Date;

  constructor(private readonly deps: CampaignServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get campaign(): Campaign | null {
    return this.runner?.campaign ?? null;
  }

  get phase(): CampaignStatus {
    if (this.validating) return 'VALIDATING';
    return this.campaign?.status ?? 'IDLE';
  }

  get testInProgress(): boolean {
    return this.testing;
  }

  async recover(): Promise<void> {
    const latest = await this.deps.campaigns.loadLatest();
    if (!latest || latest.status === 'READY') return;
    const campaign = recoverInterruptedCampaign(latest, this.now());
    if (campaign.status !== latest.status) {
      this.deps.logger.warn(`Campanha ${campaign.id} recuperada após encerramento inesperado (agora ${campaign.status})`);
    }
    await this.persist(campaign);
    this.runner = this.createRunner(campaign);
  }

  prepare(consentConfirmed: boolean): Promise<Campaign> {
    return this.exclusive('preparar campanha', async () => {
      this.assertCanPrepare();
      this.validating = true;
      this.deps.onChange();
      try {
        return await this.buildReadyCampaign(consentConfirmed);
      } finally {
        this.validating = false;
      }
    });
  }

  start(campaignId: string, confirmedCount: number): Promise<void> {
    return this.exclusive('iniciar campanha', async () => {
      const runner = this.requireRunner();
      if (runner.campaign.id !== campaignId) throw new AppError('A campanha mudou. Revise e confirme novamente.');
      if (runner.campaign.targetCount !== confirmedCount) {
        throw new AppError('A quantidade confirmada não corresponde à campanha. Revise e confirme novamente.');
      }
      await this.assertReadyToSend();
      await runner.start();
      this.deps.logger.info(`Campanha ${campaignId} iniciada para ${confirmedCount} contatos`);
    });
  }

  pause(): Promise<void> {
    return this.exclusive('pausar campanha', () => this.requireRunner().pause());
  }

  resume(): Promise<void> {
    return this.exclusive('continuar campanha', async () => {
      const runner = this.requireRunner();
      await this.assertReadyToSend();
      await runner.resume();
    });
  }

  cancel(): Promise<void> {
    return this.exclusive('cancelar campanha', () => this.requireRunner().cancel());
  }

  discard(): Promise<void> {
    return this.exclusive('descartar campanha', async () => {
      const campaign = this.campaign;
      if (!campaign) return;
      if (campaign.status === 'READY') await this.deps.campaigns.remove(campaign.id);
      else if (!isTerminal(campaign.status)) {
        throw new AppError('Cancele a campanha atual antes de descartá-la.');
      }
      this.runner = null;
    });
  }

  sendTest(rawPhone: string, name: string): Promise<TestSendOutcome> {
    return this.exclusive('enviar teste', async () => {
      if (this.runner?.isActive) throw new AppError('Pause a campanha antes de enviar um teste.');
      const phone = normalizePhone(rawPhone);
      if (!phone.ok) throw new AppError(`Número de teste inválido: ${phone.reason}`);
      this.deps.blocklist.assertHealthy();
      if (this.deps.blocklist.has(phone.phone)) throw new AppError('Este número está na lista de bloqueio.');

      const { message, image } = this.deps.draft.get();
      const errors = validateMessage(message);
      if (image && !(await this.deps.media.exists(image))) errors.push('A imagem selecionada não foi encontrada.');
      if (errors.length) throw new AppError(errors.join('\n'));
      await this.assertWhatsAppConnected();

      return this.runTestSend(phone.phone, name, renderMessage(message, name), image?.storedPath);
    });
  }

  async shutdown(): Promise<void> {
    const runner = this.runner;
    if (!runner?.isActive) return;
    if (runner.campaign.status === 'RUNNING') await runner.pause().catch(() => undefined);
    await Promise.race([runner.waitUntilIdle(), new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS))]);
  }

  private async runTestSend(phone: string, name: string, message: string, imagePath?: string): Promise<TestSendOutcome> {
    this.testing = true;
    this.deps.onChange();
    try {
      const result = await this.deps.whatsapp.sendMessage({ name: name || null, phone }, message, imagePath);
      const recipient: Recipient = {
        id: 'teste',
        name: name || null,
        phone,
        status: result.ok ? 'SUCCESS' : 'FAILED',
        error: result.ok ? null : describeSendError(result.code, result.detail),
        attempts: 1,
        durationMs: result.durationMs,
        processedAt: this.now().toISOString(),
      };
      await this.deps.campaignLogger.append(toLogEntry(TEST_LOG_ID, recipient, this.now()));
      if (!result.ok) throw new AppError(recipient.error ?? 'Falha no envio de teste.');
      return { ok: true, phone, message };
    } finally {
      this.testing = false;
    }
  }

  private async buildReadyCampaign(consentConfirmed: boolean): Promise<Campaign> {
    this.deps.blocklist.assertHealthy();
    const contacts = await this.deps.contacts.reclassify((phone) => this.deps.blocklist.has(phone));
    const { message, image } = this.deps.draft.get();
    const settings = this.deps.settings.get();
    const { errors, eligibility } = validateCampaignDraft({ contacts, message, image, settings, consentConfirmed });
    if (image && !(await this.deps.media.exists(image))) {
      errors.push('A imagem selecionada não foi encontrada. Selecione-a novamente.');
    }
    if (errors.length || !eligibility || !contacts) throw new AppError(errors.join('\n'));

    const now = this.now();
    const campaign = createCampaign({
      id: createCampaignId(now),
      now,
      message,
      image,
      sourceFile: contacts.fileName,
      settings,
      consentConfirmed,
      eligibility,
    });
    transition(campaign, 'READY');
    await this.replaceCampaign(campaign);
    return campaign;
  }

  private async replaceCampaign(campaign: Campaign): Promise<void> {
    const previous = this.campaign;
    if (previous?.status === 'READY') await this.deps.campaigns.remove(previous.id);
    await this.deps.campaigns.save(campaign);
    this.runner = this.createRunner(campaign);
  }

  private createRunner(campaign: Campaign): CampaignRunner {
    return new CampaignRunner(campaign, {
      whatsapp: this.deps.whatsapp,
      isBlocked: (phone) => this.deps.blocklist.has(phone),
      sleep: abortableSleep,
      now: this.now,
      onChange: (c) => this.persist(c),
      onRecipientFinished: (c, r) => this.deps.campaignLogger.append(toLogEntry(c.id, r, this.now())),
    });
  }

  private async persist(campaign: Campaign): Promise<void> {
    await this.deps.campaigns.save(campaign);
    await this.deps.campaignLogger.writeSummary(campaign);
    this.deps.onChange();
  }

  private assertCanPrepare(): void {
    const status = this.campaign?.status;
    if (status === 'RUNNING' || status === 'PAUSED' || status === 'ERROR') {
      throw new AppError('Já existe uma campanha em andamento. Conclua ou cancele antes de preparar outra.');
    }
  }

  private async assertReadyToSend(): Promise<void> {
    if (this.testing) throw new AppError('Aguarde o envio de teste terminar.');
    this.deps.blocklist.assertHealthy();
    const image = this.campaign?.image;
    if (image && !(await this.deps.media.exists(image))) {
      throw new AppError('A imagem da campanha não foi encontrada no disco.');
    }
    await this.assertWhatsAppConnected();
  }

  private async assertWhatsAppConnected(): Promise<void> {
    if (!(await this.deps.whatsapp.isConnected())) {
      throw new AppError('WhatsApp Web não está conectado. Clique em "Conectar WhatsApp" e faça login.');
    }
  }

  private requireRunner(): CampaignRunner {
    if (!this.runner) throw new AppError('Nenhuma campanha preparada.');
    return this.runner;
  }

  /** Rejects overlapping actions (e.g. a double click) instead of queueing them. */
  private async exclusive<T>(action: string, run: () => Promise<T>): Promise<T> {
    if (this.busyAction) throw new AppError(`Aguarde: "${this.busyAction}" ainda está em andamento.`);
    this.busyAction = action;
    try {
      return await run();
    } finally {
      this.busyAction = null;
      this.deps.onChange();
    }
  }
}
