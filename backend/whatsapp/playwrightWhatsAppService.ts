import { chromium, type BrowserContext, type Locator, type Page } from 'playwright-core';
import { AppError, shortErrorMessage } from '../../core/errors';
import type { SendResult, WhatsAppState } from '../../core/types';
import type { SendTarget, WhatsAppService } from '../../core/whatsapp';
import type { AppLogger } from '../logger';
import {
  classifyError,
  closeImagePreview,
  confirmSent,
  describeLastMessages,
  describeTextFields,
  findCaptionBox,
  isAnyVisible,
  readOutgoingState,
  SendError,
  fillAndVerify,
  waitForChat,
  waitForElement,
} from './pageActions';
import { SELECTORS, WHATSAPP_URL } from './selectors';

const MONITOR_INTERVAL_MS = 3000;
const NAVIGATION_TIMEOUT_MS = 60_000;
const ELEMENT_TIMEOUT_MS = 15_000;
const CAPTION_TIMEOUT_MS = 5_000;

export interface PlaywrightWhatsAppOptions {
  profileDir: string;
  browserChannel: 'chrome' | 'msedge' | undefined;
  sendTimeoutMs: () => number;
  logger: AppLogger;
}

interface SendProgress {
  messageMayHaveBeenSent: boolean;
}

/**
 * WhatsApp Web automation through a persistent, visible browser profile stored locally.
 * Login is always done by the user; this class never reads or stores credentials.
 */
export class PlaywrightWhatsAppService implements WhatsAppService {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private connecting: Promise<void> | null = null;
  private sending = false;
  private monitor: NodeJS.Timeout | null = null;
  private state: WhatsAppState = { status: 'CLOSED', detail: null };
  private readonly listeners = new Set<(state: WhatsAppState) => void>();

  constructor(private readonly options: PlaywrightWhatsAppOptions) {}

  getState(): WhatsAppState {
    return this.state;
  }

  onStateChange(listener: (state: WhatsAppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): Promise<void> {
    this.connecting ??= this.openBrowser().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async isConnected(): Promise<boolean> {
    const page = this.livePage();
    return page ? isAnyVisible(page, SELECTORS.loggedIn) : false;
  }

  async disconnect(): Promise<void> {
    this.stopMonitor();
    const context = this.context;
    this.context = null;
    this.page = null;
    await context?.close().catch(() => undefined);
    this.setState({ status: 'CLOSED', detail: null });
  }

  async sendMessage(target: SendTarget, message: string, imagePath?: string): Promise<SendResult> {
    const startedAt = Date.now();
    const progress: SendProgress = { messageMayHaveBeenSent: false };
    const page = this.livePage();
    if (!page) return this.failure(new SendError('BROWSER_CLOSED', 'navegador não está aberto'), startedAt, progress);
    if (this.sending) return this.failure(new SendError('BUSY', 'aguarde o envio atual'), startedAt, progress);

    this.sending = true;
    try {
      if (imagePath) {
        await this.openChat(page, target.phone);
        await this.sendImageWithCaption(page, message, imagePath, progress);
      } else {
        await this.openChat(page, target.phone, message);
        await this.sendText(page, message, progress);
      }
      return { ok: true, durationMs: Date.now() - startedAt };
    } catch (error) {
      return this.failure(await this.refine(classifyError(error)), startedAt, progress);
    } finally {
      this.sending = false;
    }
  }

  private async openBrowser(): Promise<void> {
    const existing = this.livePage();
    if (existing) {
      await existing.bringToFront();
      return this.refreshState();
    }
    this.setState({ status: 'OPENING', detail: 'Abrindo navegador…' });
    try {
      this.context = await chromium.launchPersistentContext(this.options.profileDir, {
        headless: false,
        channel: this.options.browserChannel,
        viewport: null,
      });
      this.context.on('close', () => this.handleBrowserClosed());
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
      await this.page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    } catch (error) {
      await this.disconnect();
      const message = launchErrorMessage(error);
      this.setState({ status: 'ERROR', detail: message });
      this.options.logger.error('Falha ao abrir o WhatsApp Web', error);
      throw new AppError(message);
    }
    this.startMonitor();
    await this.refreshState();
  }

  /** Opens the chat through WhatsApp's official link; `prefill` is placed in the message box by WhatsApp itself. */
  private async openChat(page: Page, phone: string, prefill?: string): Promise<void> {
    const timeoutMs = this.options.sendTimeoutMs();
    const text = prefill ? `&text=${encodeURIComponent(prefill)}` : '';
    try {
      await page.goto(`${WHATSAPP_URL}send?phone=${encodeURIComponent(phone)}${text}`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    } catch (error) {
      const classified = classifyError(error);
      throw classified.code === 'BROWSER_CLOSED' ? classified : new SendError('PAGE_UNAVAILABLE', classified.detail);
    }
    await waitForChat(page, timeoutMs);
  }

  private async sendText(page: Page, message: string, progress: SendProgress): Promise<void> {
    const composer = await waitForElement(page, SELECTORS.composer, 'caixa de mensagem', ELEMENT_TIMEOUT_MS);
    await fillAndVerify(page, composer, message, { acceptCurrent: true, onMismatch: this.logTypingMismatch });

    const before = await readOutgoingState(page);
    progress.messageMayHaveBeenSent = true;
    await page.keyboard.press('Enter');
    await this.confirm(page, before);
  }

  /**
   * Sends the image with the message as its caption (one message). If the caption box cannot be found,
   * the preview is closed without sending and the text and image go as two messages instead.
   */
  private async sendImageWithCaption(page: Page, caption: string, imagePath: string, progress: SendProgress): Promise<void> {
    const sendButton = await this.openImagePreview(page, imagePath);
    if (!caption.trim()) return this.sendPreview(page, sendButton, progress);

    const box = await findCaptionBox(page, sendButton, CAPTION_TIMEOUT_MS);
    if (box) {
      await fillAndVerify(page, box, caption, { onMismatch: this.logTypingMismatch });
      return this.sendPreview(page, sendButton, progress);
    }

    const fields = await describeTextFields(page).catch(() => 'indisponível');
    this.options.logger.warn(`Campo de legenda não encontrado; enviando texto e imagem separadamente. Campos na página: ${fields}`);
    await closeImagePreview(page, sendButton);
    await this.sendText(page, caption, progress);
    await this.sendImageAfterText(page, imagePath, progress);
  }

  /** The image goes as a separate message (no caption), so a failure here is reported as a partial send. */
  private async sendImageAfterText(page: Page, imagePath: string, progress: SendProgress): Promise<void> {
    try {
      await this.sendPreview(page, await this.openImagePreview(page, imagePath), progress);
    } catch (error) {
      const classified = classifyError(error);
      throw new SendError(classified.code, `texto enviado, mas a imagem falhou: ${classified.detail}`);
    }
  }

  private async openImagePreview(page: Page, imagePath: string): Promise<Locator> {
    const attach = await waitForElement(page, SELECTORS.attachButton, 'botão de anexar', ELEMENT_TIMEOUT_MS);
    await attach.click();
    const input = await waitForElement(page, SELECTORS.imageInput, 'campo de upload de imagem', ELEMENT_TIMEOUT_MS, {
      visible: false,
    });
    try {
      await input.setInputFiles(imagePath);
    } catch (error) {
      throw new SendError('UPLOAD_FAILED', shortErrorMessage(error));
    }
    return waitForElement(page, SELECTORS.mediaSendButton, 'pré-visualização da imagem', this.options.sendTimeoutMs(), {
      errorCode: 'UPLOAD_FAILED',
    });
  }

  private async sendPreview(page: Page, sendButton: Locator, progress: SendProgress): Promise<void> {
    const before = await readOutgoingState(page);
    progress.messageMayHaveBeenSent = true;
    await sendButton.click();
    await this.confirm(page, before);
  }

  private readonly logTypingMismatch = (description: string): void => {
    this.options.logger.warn(`Texto incompleto no WhatsApp Web — ${description}`);
  };

  private async confirm(page: Page, before: Awaited<ReturnType<typeof readOutgoingState>>): Promise<void> {
    try {
      await confirmSent(page, before, this.options.sendTimeoutMs());
    } catch (error) {
      const rows = await describeLastMessages(page).catch(() => 'indisponível');
      this.options.logger.warn(`Envio não confirmado. Últimas mensagens na conversa (sem texto): ${rows}`);
      throw error;
    }
  }

  /** Re-checks the page so a generic failure caused by a logout or closed browser is reported as such. */
  private async refine(error: SendError): Promise<SendError> {
    const page = this.livePage();
    if (!page) return new SendError('BROWSER_CLOSED', error.detail);
    if (error.code === 'DISCONNECTED' || error.code === 'BROWSER_CLOSED') return error;
    if (await isAnyVisible(page, SELECTORS.loginQr)) return new SendError('DISCONNECTED', 'login necessário (QR code)');
    return error;
  }

  private failure(error: SendError, startedAt: number, progress: SendProgress): SendResult {
    this.options.logger.warn(`Falha no envio [${error.code}]: ${error.detail}`);
    return {
      ok: false,
      code: error.code,
      detail: error.detail,
      durationMs: Date.now() - startedAt,
      messageMayHaveBeenSent: progress.messageMayHaveBeenSent,
    };
  }

  private livePage(): Page | null {
    return this.page && !this.page.isClosed() ? this.page : null;
  }

  private handleBrowserClosed(): void {
    this.stopMonitor();
    this.context = null;
    this.page = null;
    this.setState({ status: 'CLOSED', detail: 'O navegador foi fechado.' });
  }

  private startMonitor(): void {
    this.stopMonitor();
    this.monitor = setInterval(() => {
      if (!this.sending) void this.refreshState();
    }, MONITOR_INTERVAL_MS);
  }

  private stopMonitor(): void {
    if (this.monitor) clearInterval(this.monitor);
    this.monitor = null;
  }

  private async refreshState(): Promise<void> {
    const page = this.livePage();
    if (!page) return;
    if (await isAnyVisible(page, SELECTORS.loggedIn)) return this.setState({ status: 'CONNECTED', detail: null });
    if (await isAnyVisible(page, SELECTORS.loginQr)) {
      return this.setState({
        status: 'WAITING_LOGIN',
        detail: 'Faça login no WhatsApp Web escaneando o QR code na janela do navegador.',
      });
    }
    this.setState({ status: 'OPENING', detail: 'Carregando WhatsApp Web…' });
  }

  private setState(state: WhatsAppState): void {
    if (state.status === this.state.status && state.detail === this.state.detail) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function launchErrorMessage(error: unknown): string {
  const message = shortErrorMessage(error);
  if (/Executable doesn't exist|executable.*not found|browserType.launch.*install/i.test(message)) {
    return 'Navegador não encontrado. Execute "npm run setup:browser" ou defina BROWSER_CHANNEL=chrome (ou msedge) no arquivo .env.';
  }
  if (/ProcessSingleton|user data directory is already in use|profile.*in use/i.test(message)) {
    return 'O perfil do navegador já está em uso. Feche outras janelas abertas por este aplicativo e tente novamente.';
  }
  if (/net::ERR_/i.test(message)) return `Não foi possível carregar o WhatsApp Web. Verifique sua internet. (${message})`;
  return `Não foi possível abrir o navegador: ${message}`;
}
