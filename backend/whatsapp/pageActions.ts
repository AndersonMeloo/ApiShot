import type { Locator, Page } from 'playwright-core';
import { shortErrorMessage } from '../../core/errors';
import type { SendErrorCode } from '../../core/types';
import { INVALID_NUMBER_TEXT, OTHER_SESSION_TEXT, SELECTORS } from './selectors';

const POLL_INTERVAL_MS = 400;
const COMPOSER_SETTLE_MS = 1500;

export class SendError extends Error {
  constructor(
    readonly code: SendErrorCode,
    readonly detail: string,
  ) {
    super(detail);
    this.name = 'SendError';
  }
}

async function firstPresent(page: Page, selectors: readonly string[], visible: boolean): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const present = visible ? await locator.isVisible().catch(() => false) : (await locator.count().catch(() => 0)) > 0;
    if (present) return locator;
  }
  return null;
}

export function isAnyVisible(page: Page, selectors: readonly string[]): Promise<boolean> {
  return firstPresent(page, selectors, true).then((locator) => locator !== null);
}

/** Polls the selectors in priority order; throws UI_CHANGED naming the element when none appears. */
export async function waitForElement(
  page: Page,
  selectors: readonly string[],
  description: string,
  timeoutMs: number,
  options: { visible?: boolean; errorCode?: SendErrorCode } = {},
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  do {
    const locator = await firstPresent(page, selectors, options.visible ?? true);
    if (locator) return locator;
    await page.waitForTimeout(POLL_INTERVAL_MS);
  } while (Date.now() < deadline);
  throw new SendError(options.errorCode ?? 'UI_CHANGED', `elemento não encontrado: ${description}`);
}

export async function typeMultiline(page: Page, text: string): Promise<void> {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line) await page.keyboard.insertText(line);
    if (index < lines.length - 1) await page.keyboard.press('Shift+Enter');
  }
}

const CAPTION_MARK = 'data-wcm-caption';

/** Marks the text field closest to the preview send button (or the focused one) as the caption box. */
function markCaptionNearButton(sendButton: Locator): Promise<boolean> {
  return sendButton.evaluate(
    (button, { mark, fields, exclusions }) => {
      const isCandidate = (el: Element | null): el is HTMLElement =>
        el instanceof HTMLElement &&
        el.matches(fields) &&
        el.getClientRects().length > 0 &&
        !exclusions.some((selector) => el.closest(selector));
      document.querySelectorAll(`[${mark}]`).forEach((el) => el.removeAttribute(mark));
      for (let node = button.parentElement; node; node = node.parentElement) {
        const found = Array.from(node.querySelectorAll(fields)).find(isCandidate);
        if (found) {
          found.setAttribute(mark, '1');
          return true;
        }
      }
      const active = document.activeElement;
      if (!isCandidate(active)) return false;
      active.setAttribute(mark, '1');
      return true;
    },
    { mark: CAPTION_MARK, fields: SELECTORS.textField, exclusions: [...SELECTORS.captionExclusions] },
  );
}

/** Caption box of the image preview, or null when none can be found within the timeout. */
export async function findCaptionBox(page: Page, sendButton: Locator, timeoutMs: number): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    const labeled = await firstPresent(page, SELECTORS.captionBox, true);
    if (labeled) return labeled;
    if (await markCaptionNearButton(sendButton).catch(() => false)) return page.locator(`[${CAPTION_MARK}]`).first();
    await page.waitForTimeout(POLL_INTERVAL_MS);
  } while (Date.now() < deadline);
  return null;
}

export function readFieldText(field: Locator): Promise<string> {
  return field.evaluate((el) =>
    el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el as HTMLElement).innerText,
  );
}

/** Attributes (never text content) of the page's text fields, logged to help update the selectors. */
export function describeTextFields(page: Page): Promise<string> {
  return page.evaluate(
    (fields) =>
      JSON.stringify(
        Array.from(document.querySelectorAll(fields)).map((el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          contenteditable: el.getAttribute('contenteditable'),
          ariaLabel: el.getAttribute('aria-label'),
          placeholder: el.getAttribute('aria-placeholder') ?? el.getAttribute('placeholder'),
          inFooter: Boolean(el.closest('footer')),
          inMain: Boolean(el.closest('#main')),
          visible: el.getClientRects().length > 0,
        })),
      ),
    SELECTORS.textField,
  );
}

/** Closes the image preview without sending (Escape, confirming "discard" if WhatsApp asks). */
export async function closeImagePreview(page: Page, sendButton: Locator): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press('Escape');
    const discard = page.getByRole('button', { name: /descartar|discard/i }).first();
    if (await discard.isVisible().catch(() => false)) await discard.click();
    const closed = await sendButton
      .waitFor({ state: 'hidden', timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (closed) return;
  }
  throw new SendError('UI_CHANGED', 'não foi possível fechar a pré-visualização da imagem sem enviar');
}

const EMOJI_JOINERS = String.fromCharCode(0xfe0f, 0x200d);
const EMOJI = new RegExp(`[\\p{Extended_Pictographic}${EMOJI_JOINERS}]`, 'gu');

/** Emoji may be rendered as images inside WhatsApp's editor, so they and whitespace are ignored when comparing. */
export function comparableText(text: string): string {
  return text.normalize('NFC').replace(EMOJI, '').replace(/\s+/g, '');
}

interface FillMethod {
  name: string;
  fill(page: Page, field: Locator, text: string): Promise<void>;
}

/** Inserts the whole text in one paste event, as Ctrl+V would; the editor keeps every line. */
const PASTE: FillMethod = {
  name: 'colar',
  async fill(page, field, text) {
    await field.click();
    await clearFocusedField(page);
    await field.evaluate((element, value) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', value);
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    }, text);
  },
};

const KEYBOARD: FillMethod = {
  name: 'digitar',
  async fill(page, field, text) {
    await field.click();
    await clearFocusedField(page);
    await typeMultiline(page, text);
  },
};

const SET_VALUE: FillMethod = {
  name: 'preencher',
  fill: (_page, field, text) => field.fill(text),
};

export interface FillOptions {
  /** The field may already hold the text (e.g. prefilled by WhatsApp from the chat link). */
  acceptCurrent?: boolean;
  onMismatch?: (description: string) => void;
}

/**
 * Puts the text in the field and checks it holds all of it, trying one method after another.
 * A partial text (e.g. a lost first line) is never sent.
 */
export async function fillAndVerify(page: Page, field: Locator, text: string, options: FillOptions = {}): Promise<void> {
  const expected = comparableText(text);
  const matches = async () => comparableText(await readFieldText(field)) === expected;
  if (options.acceptCurrent && (await matches())) return;

  const isPlainField = await field.evaluate((el) => el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement);
  for (const method of isPlainField ? [SET_VALUE, KEYBOARD] : [PASTE, KEYBOARD]) {
    await method.fill(page, field, text);
    await page.waitForTimeout(400);
    if (await matches()) return;
    const typed = await readFieldText(field);
    options.onMismatch?.(`${method.name}: ${describeDifference(expected, comparableText(typed))} | campo: ${JSON.stringify(typed.slice(0, 200))}`);
  }
  throw new SendError('UI_CHANGED', 'o texto ficou incompleto no campo do WhatsApp Web; nada foi enviado');
}

function describeDifference(expected: string, typed: string): string {
  let index = 0;
  while (index < expected.length && expected[index] === typed[index]) index++;
  const around = (s: string) => JSON.stringify(s.slice(Math.max(0, index - 15), index + 25));
  return `esperado ${expected.length} caracteres, no campo ${typed.length}; diferença na posição ${index}: esperado ${around(expected)}, no campo ${around(typed)}`;
}

export async function clearFocusedField(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
}

async function readBlockingDialog(page: Page): Promise<string | null> {
  const dialog = await firstPresent(page, SELECTORS.modal, true);
  if (!dialog) return null;
  const hasButton = (await dialog.locator(SELECTORS.modalButton).count().catch(() => 0)) > 0;
  if (!hasButton) return null;
  return (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
}

/** Only dialogs that clearly explain a failure stop the wait; others (e.g. "Iniciando conversa") are loading states. */
function errorFromDialog(text: string): SendError | null {
  if (OTHER_SESSION_TEXT.test(text)) return new SendError('DISCONNECTED', `WhatsApp aberto em outra janela: ${text}`);
  if (INVALID_NUMBER_TEXT.test(text)) return new SendError('NOT_ON_WHATSAPP', text);
  return null;
}

/** Waits until the chat composer is ready, or the page shows why the chat cannot be opened. */
export async function waitForChat(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastDialog: string | null = null;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new SendError('BROWSER_CLOSED', 'página fechada');
    if (await isAnyVisible(page, SELECTORS.composer)) {
      // Give WhatsApp Web time to finish initializing the editor before anything is typed.
      await page.waitForTimeout(COMPOSER_SETTLE_MS);
      return;
    }
    if (await isAnyVisible(page, SELECTORS.loginQr)) throw new SendError('DISCONNECTED', 'login necessário (QR code)');
    lastDialog = (await readBlockingDialog(page)) ?? lastDialog;
    const dialogError = lastDialog ? errorFromDialog(lastDialog) : null;
    if (dialogError) throw dialogError;
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
  const shown = lastDialog ? ` (aviso exibido: ${lastDialog})` : '';
  throw new SendError('TIMEOUT', `a conversa não abriu em ${Math.round(timeoutMs / 1000)}s${shown}`);
}

interface OutgoingState {
  count: number;
  lastId: string | null;
  lastPending: boolean;
}

/**
 * Snapshot of the message rows at the end of the open chat. A send is confirmed when a new row
 * appears at the bottom right after it; WhatsApp Web ids and classes no longer tell sent from received.
 */
export function readOutgoingState(page: Page): Promise<OutgoingState> {
  return page.evaluate(
    ({ rows, pending }) => {
      const messages = Array.from(document.querySelectorAll(rows));
      const last = messages[messages.length - 1];
      return {
        count: new Set(messages.map((m) => m.getAttribute('data-id'))).size,
        lastId: last?.getAttribute('data-id') ?? null,
        lastPending: Boolean(last?.querySelector(pending)),
      };
    },
    { rows: SELECTORS.messageRow, pending: SELECTORS.pendingIcon },
  );
}

/** Attributes of the last message rows (no text; ids truncated to their prefix), logged when confirmation fails. */
export function describeLastMessages(page: Page): Promise<string> {
  return page.evaluate((rows) =>
    JSON.stringify(
      Array.from(document.querySelectorAll(rows))
        .slice(-4)
        .map((el) => ({
          dataIdPrefix: (el.getAttribute('data-id') ?? '').split('_')[0],
          classes: el.className && typeof el.className === 'string' ? el.className.slice(0, 120) : '',
          icons: Array.from(el.querySelectorAll('[data-icon]')).map((i) => i.getAttribute('data-icon')),
        })),
    ),
    SELECTORS.messageRow,
  );
}

/** Confirms a new outgoing message appeared and left the "pending" (clock) state. */
export async function confirmSent(page: Page, before: OutgoingState, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let appeared = false;
  while (Date.now() < deadline) {
    const now = await readOutgoingState(page);
    appeared ||= now.count > before.count || now.lastId !== before.lastId;
    if (appeared && !now.lastPending) return;
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
  throw new SendError(
    'TIMEOUT',
    appeared ? 'a mensagem ficou pendente (ícone de relógio)' : 'a mensagem enviada não apareceu na conversa',
  );
}

export function classifyError(error: unknown): SendError {
  if (error instanceof SendError) return error;
  const message = shortErrorMessage(error);
  if (/Target .*closed|has been closed|browser.*closed|context.*closed/i.test(message)) {
    return new SendError('BROWSER_CLOSED', message);
  }
  if (/net::ERR_|ERR_INTERNET|ERR_NAME_NOT_RESOLVED/i.test(message)) return new SendError('PAGE_UNAVAILABLE', message);
  if ((error as Error)?.name === 'TimeoutError') return new SendError('TIMEOUT', message);
  return new SendError('UNKNOWN', message);
}
