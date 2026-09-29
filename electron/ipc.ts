import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { AppBackend } from '../backend/appBackend';
import { MAX_CSV_BYTES } from '../core/csvService';
import { AppError, shortErrorMessage } from '../core/errors';
import { STATE_CHANGED_EVENT, type IpcChannel, type IpcInput, type IpcOutput, type IpcResult } from '../core/ipc';
import { InvalidTransitionError } from '../core/stateMachine';
import { formatZodError, settingsUpdateSchema } from '../core/validation';

type Handler<C extends IpcChannel> = (input: IpcInput<C>, window: BrowserWindow | null) => Promise<IpcOutput<C>> | IpcOutput<C>;
type Handlers = { [C in IpcChannel]: Handler<C> };
type Schemas = { [C in IpcChannel]: z.ZodType<IpcInput<C>> };

const none = z.undefined();
const campaignRef = z.object({ campaignId: z.string().regex(/^campaign-[\w-]+$/) });

const schemas: Schemas = {
  'app:get-state': none,
  'app:import-contacts': z.object({ fileName: z.string().min(1).max(255), content: z.string().max(MAX_CSV_BYTES) }),
  'app:remove-invalid': none,
  'app:clear-contacts': none,
  'app:export-clean': none,
  'app:block-contact': z.object({ phone: z.string().min(1).max(40) }),
  'app:save-message': z.object({ message: z.string() }),
  'app:set-image': z.object({ fileName: z.string().min(1).max(255), bytes: z.instanceof(Uint8Array) }),
  'app:remove-image': none,
  'app:get-image-preview': none,
  'app:update-settings': settingsUpdateSchema,
  'app:whatsapp-connect': none,
  'app:whatsapp-disconnect': none,
  'app:send-test': z.object({ phone: z.string().min(1).max(40), name: z.string().max(100) }),
  'app:prepare-campaign': z.object({ consentConfirmed: z.boolean() }),
  'app:start-campaign': campaignRef.extend({ confirmedCount: z.number().int().positive() }),
  'app:pause-campaign': none,
  'app:resume-campaign': none,
  'app:cancel-campaign': none,
  'app:discard-campaign': none,
  'app:get-logs': campaignRef,
  'app:export-report': campaignRef,
  'app:open-data-folder': none,
};

const READ_ONLY: ReadonlySet<IpcChannel> = new Set(['app:get-state', 'app:get-image-preview', 'app:get-logs']);

async function askSavePath(window: BrowserWindow | null, defaultPath: string): Promise<string | null> {
  const options = { defaultPath, filters: [{ name: 'CSV', extensions: ['csv'] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

function createHandlers(backend: AppBackend): Handlers {
  const { campaigns } = backend;
  return {
    'app:get-state': () => backend.snapshot(),
    'app:import-contacts': ({ fileName, content }) => backend.importContacts(fileName, content),
    'app:remove-invalid': () => backend.contacts.removeInvalid(),
    'app:clear-contacts': () => backend.contacts.clear(),
    'app:export-clean': async (_, window) => {
      const file = await askSavePath(window, 'contatos-limpos.csv');
      if (file) await backend.writeCleanContacts(file);
      return file;
    },
    'app:block-contact': ({ phone }) => backend.blockContact(phone),
    'app:save-message': ({ message }) => backend.draft.setMessage(message),
    'app:set-image': ({ fileName, bytes }) => backend.setImage(fileName, bytes),
    'app:remove-image': () => backend.draft.setImage(null),
    'app:get-image-preview': () => backend.imagePreview(),
    'app:update-settings': (patch) => backend.updateSettings(patch),
    'app:whatsapp-connect': () => backend.whatsapp.connect(),
    'app:whatsapp-disconnect': () => backend.disconnectWhatsApp(),
    'app:send-test': ({ phone, name }) => campaigns.sendTest(phone, name),
    'app:prepare-campaign': ({ consentConfirmed }) => campaigns.prepare(consentConfirmed),
    'app:start-campaign': ({ campaignId, confirmedCount }) => campaigns.start(campaignId, confirmedCount),
    'app:pause-campaign': () => campaigns.pause(),
    'app:resume-campaign': () => campaigns.resume(),
    'app:cancel-campaign': () => campaigns.cancel(),
    'app:discard-campaign': () => campaigns.discard(),
    'app:get-logs': ({ campaignId }) => backend.readLogs(campaignId),
    'app:export-report': async ({ campaignId }, window) => {
      const file = await askSavePath(window, `relatorio-${campaignId}.csv`);
      if (file) await backend.writeReport(campaignId, file);
      return file;
    },
    'app:open-data-folder': async () => {
      const error = await shell.openPath(backend.paths.root);
      if (error) throw new AppError(`Não foi possível abrir a pasta: ${error}`);
    },
  };
}

function toUserMessage(error: unknown, backend: AppBackend): string {
  if (error instanceof AppError || error instanceof InvalidTransitionError) return error.message;
  if (error instanceof z.ZodError) return `Dados inválidos: ${formatZodError(error)}`;
  backend.logger.error('Erro inesperado', error);
  return `Erro inesperado: ${shortErrorMessage(error)}`;
}

export function registerIpc(backend: AppBackend, getWindow: () => BrowserWindow | null): void {
  let pending: NodeJS.Timeout | null = null;
  const broadcast = () => {
    pending ??= setTimeout(() => {
      pending = null;
      const window = getWindow();
      if (window && !window.isDestroyed()) window.webContents.send(STATE_CHANGED_EVENT, backend.snapshot());
    }, 30);
  };
  backend.onChange(broadcast);

  const handlers = createHandlers(backend);
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResult<unknown>> => {
      if (event.sender !== getWindow()?.webContents) return { ok: false, error: 'Origem IPC não autorizada.' };
      try {
        const input = schemas[channel].parse(payload);
        const handler = handlers[channel] as Handler<IpcChannel>;
        const data = await handler(input as never, BrowserWindow.fromWebContents(event.sender));
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: toUserMessage(error, backend) };
      } finally {
        if (!READ_ONLY.has(channel)) broadcast();
      }
    });
  }
}
