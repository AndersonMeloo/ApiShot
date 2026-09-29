import Papa from 'papaparse';
import { stripBom } from './bom';
import { AppError } from './errors';
import { normalizePhone } from './phone';
import { cleanName } from './template';
import type { Contact, ContactInput, ContactList, ContactSummary } from './types';

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

type Column = 'name' | 'phone' | 'optIn';

const HEADER_ALIASES: Record<Column, readonly string[]> = {
  name: ['nome', 'name', 'cliente', 'contato'],
  phone: ['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'fone', 'tel'],
  optIn: ['optin', 'consentimento', 'autorizado', 'autorizacao'],
};

const OPT_IN_TRUE = new Set(['true', 'sim', 's', 'yes', 'y', '1', 'x', 'ok']);
const OPT_IN_FALSE = new Set(['false', 'nao', 'n', 'no', '0']);

type ColumnMap = Partial<Record<Column, number>>;

export interface ParsedCsv {
  entries: ContactInput[];
  hasNameColumn: boolean;
  hasOptInColumn: boolean;
  warnings: string[];
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function mapColumns(headerRow: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const column of Object.keys(HEADER_ALIASES) as Column[]) {
      if (map[column] === undefined && HEADER_ALIASES[column].includes(normalized)) map[column] = index;
    }
  });
  return map;
}

function parseOptIn(value: string): boolean | null | 'unknown' {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  if (OPT_IN_TRUE.has(normalized)) return true;
  if (OPT_IN_FALSE.has(normalized)) return false;
  return 'unknown';
}

function readRows(content: string): { rows: string[][]; warnings: string[] } {
  const result = Papa.parse<string[]>(stripBom(content), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  });
  const warnings = result.errors
    .filter((error) => error.code !== 'UndetectableDelimiter')
    .map((error) => `Linha ${(error.row ?? 0) + 1}: ${error.message}`);
  return { rows: result.data, warnings };
}

function isHeaderlessPhoneList(rows: string[][]): boolean {
  const first = rows[0];
  return first?.length === 1 && normalizePhone(first[0] ?? '').ok;
}

function toEntry(row: string[], rowNumber: number, columns: ColumnMap, warnings: string[]): ContactInput {
  const cell = (column: Column) => {
    const index = columns[column];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };
  const optIn = parseOptIn(cell('optIn'));
  if (optIn === 'unknown') {
    warnings.push(`Linha ${rowNumber}: valor de optIn "${cell('optIn')}" não reconhecido (tratado como sem autorização)`);
  }
  return {
    row: rowNumber,
    name: cleanName(cell('name')),
    rawPhone: cell('phone'),
    optIn: optIn === 'unknown' ? false : optIn,
  };
}

export function parseContactsCsv(content: string): ParsedCsv {
  if (content.length > MAX_CSV_BYTES) throw new AppError('Arquivo CSV muito grande (máximo 5 MB).');
  const { rows, warnings } = readRows(content);
  if (rows.length === 0) throw new AppError('O arquivo CSV está vazio.');

  const headerless = isHeaderlessPhoneList(rows);
  const columns: ColumnMap = headerless ? { phone: 0 } : mapColumns(rows[0] ?? []);
  if (columns.phone === undefined) {
    throw new AppError('Coluna "telefone" não encontrada. Use o cabeçalho: nome,telefone (optIn é opcional).');
  }

  const dataRows = headerless ? rows : rows.slice(1);
  if (dataRows.length === 0) throw new AppError('O CSV não possui linhas de contato.');
  if (dataRows.length > MAX_CSV_ROWS) throw new AppError(`O CSV possui mais de ${MAX_CSV_ROWS} linhas.`);

  const firstDataRow = headerless ? 1 : 2;
  const entries = dataRows.map((row, index) => toEntry(row, index + firstDataRow, columns, warnings));
  return {
    entries,
    hasNameColumn: columns.name !== undefined,
    hasOptInColumn: columns.optIn !== undefined,
    warnings,
  };
}

function classify(entry: ContactInput, seen: Map<string, number>, isBlocked: (phone: string) => boolean): Contact {
  const base = { ...entry, id: `row-${entry.row}` };
  const normalized = normalizePhone(entry.rawPhone);
  if (!normalized.ok) return { ...base, phone: null, status: 'INVALID', issue: normalized.reason };

  const { phone } = normalized;
  const firstRow = seen.get(phone);
  if (firstRow !== undefined) {
    return { ...base, phone, status: 'DUPLICATE', issue: `Duplicado da linha ${firstRow}` };
  }
  seen.set(phone, entry.row);

  if (isBlocked(phone)) return { ...base, phone, status: 'BLOCKED', issue: 'Número na lista de bloqueio' };
  if (entry.optIn === false) return { ...base, phone, status: 'NO_OPT_IN', issue: 'Contato não autorizou mensagens' };
  return { ...base, phone, status: 'VALID', issue: null };
}

export function classifyContacts(entries: readonly ContactInput[], isBlocked: (phone: string) => boolean): Contact[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => classify(entry, seen, isBlocked));
}

export function buildContactList(
  content: string,
  fileName: string,
  isBlocked: (phone: string) => boolean,
  now: Date = new Date(),
): ContactList {
  const parsed = parseContactsCsv(content);
  return {
    fileName,
    importedAt: now.toISOString(),
    hasNameColumn: parsed.hasNameColumn,
    hasOptInColumn: parsed.hasOptInColumn,
    contacts: classifyContacts(parsed.entries, isBlocked),
    warnings: parsed.warnings,
  };
}

export function reclassifyContactList(list: ContactList, isBlocked: (phone: string) => boolean): ContactList {
  return { ...list, contacts: classifyContacts(list.contacts, isBlocked) };
}

export function removeInvalidContacts(list: ContactList): ContactList {
  const contacts = list.contacts.filter((c) => c.status !== 'INVALID' && c.status !== 'DUPLICATE');
  return { ...list, contacts };
}

export function summarizeContacts(contacts: readonly Contact[]): ContactSummary {
  const count = (status: Contact['status']) => contacts.filter((c) => c.status === status).length;
  return {
    total: contacts.length,
    valid: count('VALID'),
    invalid: count('INVALID'),
    duplicate: count('DUPLICATE'),
    blocked: count('BLOCKED'),
    noOptIn: count('NO_OPT_IN'),
  };
}

export function toCleanCsv(list: ContactList): string {
  const rows = list.contacts
    .filter((c): c is Contact & { phone: string } => c.status === 'VALID' && c.phone !== null)
    .map((c) => ({ nome: c.name ?? '', telefone: c.phone, optIn: c.optIn === null ? '' : String(c.optIn) }));
  const fields = list.hasOptInColumn ? ['nome', 'telefone', 'optIn'] : ['nome', 'telefone'];
  return Papa.unparse({ fields, data: rows.map((r) => fields.map((f) => r[f as keyof typeof r])) });
}
