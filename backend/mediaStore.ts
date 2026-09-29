import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaInfo } from '../core/types';
import { validateImage } from '../core/validation';
import { fileTimestamp, safeFileName } from './dataPaths';

export class MediaStore {
  constructor(
    private readonly mediaDir: string,
    readonly maxImageBytes: number,
  ) {}

  async saveImage(fileName: string, bytes: Uint8Array, now: Date = new Date()): Promise<MediaInfo> {
    const mimeType = validateImage(fileName, bytes, this.maxImageBytes);
    const base = safeFileName(fileName);
    const storedName = `${fileTimestamp(now)}-${base}`;
    const storedPath = path.join(this.mediaDir, storedName);
    await writeFile(storedPath, bytes);
    return { fileName, storedPath, mimeType, sizeBytes: bytes.byteLength };
  }

  async exists(media: MediaInfo): Promise<boolean> {
    try {
      await access(media.storedPath);
      return true;
    } catch {
      return false;
    }
  }

  async toDataUrl(media: MediaInfo): Promise<string | null> {
    if (!(await this.exists(media))) return null;
    const bytes = await readFile(media.storedPath);
    return `data:${media.mimeType};base64,${bytes.toString('base64')}`;
  }
}
