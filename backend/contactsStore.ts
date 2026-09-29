import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildContactList, reclassifyContactList, removeInvalidContacts, toCleanCsv } from '../core/csvService';
import { AppError } from '../core/errors';
import type { ContactList } from '../core/types';
import { fileTimestamp, safeFileName } from './dataPaths';
import { JsonDocument } from './jsonDocument';
import type { AppLogger } from './logger';
import { contactListSchema } from './schemas';

type IsBlocked = (phone: string) => boolean;

export class ContactsStore {
  private readonly document: JsonDocument<ContactList | null>;

  constructor(
    private readonly contactsDir: string,
    file: string,
    logger: AppLogger,
  ) {
    this.document = new JsonDocument<ContactList | null>(file, contactListSchema.nullable(), null, logger);
  }

  async load(isBlocked: IsBlocked): Promise<void> {
    const list = await this.document.load();
    if (list) await this.document.set(reclassifyContactList(list, isBlocked));
  }

  get(): ContactList | null {
    return this.document.get();
  }

  require(): ContactList {
    const list = this.get();
    if (!list) throw new AppError('Importe uma lista de contatos primeiro.');
    return list;
  }

  async import(fileName: string, content: string, isBlocked: IsBlocked, now: Date = new Date()): Promise<ContactList> {
    const list = buildContactList(content, fileName, isBlocked, now);
    const copy = path.join(this.contactsDir, `${fileTimestamp(now)}-${safeFileName(fileName)}`);
    await writeFile(copy, content, 'utf8');
    await this.document.set(list);
    return list;
  }

  async reclassify(isBlocked: IsBlocked): Promise<ContactList | null> {
    const list = this.get();
    if (!list) return null;
    const updated = reclassifyContactList(list, isBlocked);
    await this.document.set(updated);
    return updated;
  }

  async removeInvalid(): Promise<void> {
    await this.document.set(removeInvalidContacts(this.require()));
  }

  async clear(): Promise<void> {
    await this.document.set(null);
  }

  cleanCsv(): string {
    return toCleanCsv(this.require());
  }
}
