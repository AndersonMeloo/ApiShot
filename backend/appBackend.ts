import { writeFile } from 'node:fs/promises';
import Papa from 'papaparse';
import { UTF8_BOM } from '../core/bom';
import { AppError } from '../core/errors';
import { normalizePhone } from '../core/phone';
import type { AppSnapshot, CampaignLogEntry, Settings } from '../core/types';
import { MAX_MESSAGE_LENGTH } from '../core/validation';
import { BlocklistStore } from './blocklistStore';
import { CampaignService } from './campaignService';
import { CampaignStore } from './campaignStore';
import type { AppConfig } from './config';
import { ContactsStore } from './contactsStore';
import { ensureDataDirs, resolveDataPaths, type DataPaths } from './dataPaths';
import { DraftStore } from './draftStore';
import { AppLogger, CampaignLogger } from './logger';
import { MediaStore } from './mediaStore';
import { SettingsStore } from './settingsStore';
import { PlaywrightWhatsAppService } from './whatsapp/playwrightWhatsAppService';

type Listener = () => void;

/** Composition root of the local backend: builds every store/service and exposes app actions. */
export class AppBackend {
  readonly paths: DataPaths;
  readonly logger: AppLogger;
  readonly settings: SettingsStore;
  readonly blocklist: BlocklistStore;
  readonly contacts: ContactsStore;
  readonly draft: DraftStore;
  readonly media: MediaStore;
  readonly campaignLogger: CampaignLogger;
  readonly whatsapp: PlaywrightWhatsAppService;
  readonly campaigns: CampaignService;
  private readonly listeners = new Set<Listener>();

  constructor(config: AppConfig) {
    this.paths = resolveDataPaths(config.dataDir);
    this.logger = new AppLogger(this.paths.appLogFile);
    this.settings = new SettingsStore(this.paths.settingsFile, this.logger);
    this.blocklist = new BlocklistStore(this.paths.blockedFile, this.logger);
    this.contacts = new ContactsStore(this.paths.contactsDir, this.paths.contactsFile, this.logger);
    this.draft = new DraftStore(this.paths.draftFile, this.logger);
    this.media = new MediaStore(this.paths.mediaDir, config.maxImageBytes);
    this.campaignLogger = new CampaignLogger(this.paths.logsDir);
    this.whatsapp = new PlaywrightWhatsAppService({
      profileDir: this.paths.browserProfileDir,
      browserChannel: config.browserChannel,
      sendTimeoutMs: () => this.settings.get().sendTimeoutSeconds * 1000,
      logger: this.logger,
    });
    this.campaigns = new CampaignService({
      whatsapp: this.whatsapp,
      contacts: this.contacts,
      draft: this.draft,
      settings: this.settings,
      blocklist: this.blocklist,
      media: this.media,
      campaigns: new CampaignStore(this.paths.campaignsDir, this.logger),
      campaignLogger: this.campaignLogger,
      logger: this.logger,
      onChange: () => this.notify(),
    });
    this.whatsapp.onStateChange(() => this.notify());
  }

  async init(): Promise<void> {
    await ensureDataDirs(this.paths);
    await Promise.all([this.settings.load(), this.draft.load(), this.blocklist.load()]);
    if (this.blocklist.error) this.logger.error(this.blocklist.error);
    await this.contacts.load((phone) => this.blocklist.has(phone));
    await this.campaigns.recover();
    this.logger.info(`Aplicação iniciada. Dados em ${this.paths.root}`);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): AppSnapshot {
    const draft = this.draft.get();
    return {
      contacts: this.contacts.get(),
      message: draft.message,
      image: draft.image,
      settings: this.settings.get(),
      campaign: this.campaigns.campaign,
      campaignPhase: this.campaigns.phase,
      whatsapp: this.whatsapp.getState(),
      blockedCount: this.blocklist.count,
      testInProgress: this.campaigns.testInProgress,
      blocklistError: this.blocklist.error,
      dataDir: this.paths.root,
      limits: { maxImageBytes: this.media.maxImageBytes, maxMessageLength: MAX_MESSAGE_LENGTH },
    };
  }

  async importContacts(fileName: string, content: string): Promise<void> {
    this.blocklist.assertHealthy();
    const list = await this.contacts.import(fileName, content, (phone) => this.blocklist.has(phone));
    this.logger.info(`CSV importado: ${list.contacts.length} linhas de ${fileName}`);
  }

  async blockContact(rawPhone: string): Promise<void> {
    const normalized = normalizePhone(rawPhone);
    if (!normalized.ok) throw new AppError(`Número inválido: ${normalized.reason}`);
    await this.blocklist.add(normalized.phone, 'Marcado como "não enviar novamente"');
    await this.contacts.reclassify((phone) => this.blocklist.has(phone));
  }

  async setImage(fileName: string, bytes: Uint8Array): Promise<void> {
    const media = await this.media.saveImage(fileName, bytes);
    await this.draft.setImage(media);
  }

  async imagePreview(): Promise<string | null> {
    const image = this.draft.get().image;
    return image ? this.media.toDataUrl(image) : null;
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const active = this.campaigns.phase;
    if (active === 'RUNNING' || active === 'VALIDATING') {
      throw new AppError('Não é possível alterar configurações durante a campanha.');
    }
    await this.settings.update(patch);
  }

  readLogs(campaignId: string): Promise<CampaignLogEntry[]> {
    return this.campaignLogger.read(campaignId);
  }

  async writeReport(campaignId: string, targetFile: string): Promise<void> {
    const entries = await this.readLogs(campaignId);
    if (entries.length === 0) throw new AppError('Ainda não há registros para esta campanha.');
    await writeFile(targetFile, `${UTF8_BOM}${Papa.unparse(entries)}`, 'utf8');
  }

  async disconnectWhatsApp(): Promise<void> {
    if (this.campaigns.campaign?.status === 'RUNNING') {
      throw new AppError('Pause ou cancele a campanha antes de desconectar o WhatsApp.');
    }
    await this.whatsapp.disconnect();
  }

  async writeCleanContacts(targetFile: string): Promise<void> {
    await writeFile(targetFile, this.contacts.cleanCsv(), 'utf8');
  }

  async shutdown(): Promise<void> {
    await this.campaigns.shutdown();
    await this.whatsapp.disconnect();
    this.logger.info('Aplicação encerrada.');
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
