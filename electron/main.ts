import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { AppBackend } from '../backend/appBackend';
import { loadConfig } from '../backend/config';
import { errorMessage } from '../core/errors';
import { registerIpc } from './ipc';

const APP_ROOT = app.getAppPath();
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;
let backend: AppBackend | null = null;
let shutdownComplete = false;
let shuttingDown = false;

function loadEnvFile(): void {
  const envDir = app.isPackaged ? app.getPath('userData') : APP_ROOT;
  try {
    process.loadEnvFile(path.join(envDir, '.env'));
  } catch {
    // .env is optional.
  }
}

function defaultDataDir(): string {
  return app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(APP_ROOT, 'data');
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    title: 'ApiShot',
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('close', (event) => confirmCloseDuringCampaign(window, event));

  if (DEV_SERVER_URL) void window.loadURL(DEV_SERVER_URL);
  else void window.loadFile(path.join(APP_ROOT, 'dist', 'renderer', 'index.html'));
  return window;
}

function confirmCloseDuringCampaign(window: BrowserWindow, event: Electron.Event): void {
  if (backend?.campaigns.campaign?.status !== 'RUNNING' || shuttingDown) return;
  const choice = dialog.showMessageBoxSync(window, {
    type: 'warning',
    buttons: ['Pausar e sair', 'Continuar campanha'],
    defaultId: 1,
    cancelId: 1,
    title: 'Campanha em andamento',
    message: 'Há uma campanha em andamento.',
    detail: 'Ao sair, a campanha será pausada com segurança após o envio atual e poderá ser continuada depois.',
  });
  if (choice === 1) event.preventDefault();
}

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await backend?.shutdown();
  } finally {
    shutdownComplete = true;
    app.quit();
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  loadEnvFile();
  backend = new AppBackend(loadConfig(process.env, defaultDataDir()));
  await backend.init();
  mainWindow = createWindow();
  registerIpc(backend, () => mainWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    void shutdown();
  });
  bootstrap().catch((error: unknown) => {
    dialog.showErrorBox('Falha ao iniciar', errorMessage(error));
    shutdownComplete = true;
    app.quit();
  });
}
