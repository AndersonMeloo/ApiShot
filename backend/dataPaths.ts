import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface DataPaths {
  root: string;
  contactsDir: string;
  campaignsDir: string;
  mediaDir: string;
  logsDir: string;
  browserProfileDir: string;
  contactsFile: string;
  blockedFile: string;
  settingsFile: string;
  draftFile: string;
  appLogFile: string;
}

export function resolveDataPaths(root: string): DataPaths {
  const contactsDir = path.join(root, 'contacts');
  const logsDir = path.join(root, 'logs');
  return {
    root,
    contactsDir,
    campaignsDir: path.join(root, 'campaigns'),
    mediaDir: path.join(root, 'media'),
    logsDir,
    browserProfileDir: path.join(root, 'browser-profile'),
    contactsFile: path.join(contactsDir, 'current.json'),
    blockedFile: path.join(root, 'blocked.json'),
    settingsFile: path.join(root, 'settings.json'),
    draftFile: path.join(root, 'draft.json'),
    appLogFile: path.join(logsDir, 'app.log'),
  };
}

export async function ensureDataDirs(paths: DataPaths): Promise<void> {
  const dirs = [paths.root, paths.contactsDir, paths.campaignsDir, paths.mediaDir, paths.logsDir, paths.browserProfileDir];
  await Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
}

/** Keeps only safe characters so user-provided names can be used in file names. */
export function safeFileName(name: string): string {
  const base = path.basename(name).normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'arquivo';
}

export function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
