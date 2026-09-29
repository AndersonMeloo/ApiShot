import { describe, expect, it } from 'vitest';
import { UTF8_BOM } from '../core/bom';
import { parseContactsCsv, reclassifyContactList, removeInvalidContacts, summarizeContacts, toCleanCsv } from '../core/csvService';
import { AppError } from '../core/errors';
import { contactListFrom } from './helpers/fixtures';

describe('parseContactsCsv', () => {
  it('lê CSV com nome e telefone', () => {
    const parsed = parseContactsCsv('nome,telefone\nJoão,5511999999999\nMaria,5511988888888\nCarlos,5511977777777');
    expect(parsed.hasNameColumn).toBe(true);
    expect(parsed.hasOptInColumn).toBe(false);
    expect(parsed.entries).toEqual([
      { row: 2, name: 'João', rawPhone: '5511999999999', optIn: null },
      { row: 3, name: 'Maria', rawPhone: '5511988888888', optIn: null },
      { row: 4, name: 'Carlos', rawPhone: '5511977777777', optIn: null },
    ]);
  });

  it('lê CSV somente com telefone', () => {
    const parsed = parseContactsCsv('telefone\n5511999999999\n5511988888888');
    expect(parsed.hasNameColumn).toBe(false);
    expect(parsed.entries.map((e) => e.name)).toEqual([null, null]);
  });

  it('aceita lista de números sem cabeçalho', () => {
    const parsed = parseContactsCsv('5511999999999\n5511988888888');
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]?.row).toBe(1);
  });

  it('aceita ponto e vírgula, BOM, acentos e maiúsculas no cabeçalho', () => {
    const parsed = parseContactsCsv(`${UTF8_BOM}Nome;Telefone;Opt-In\nAna;(11) 99999-9999;sim`);
    expect(parsed.entries).toEqual([{ row: 2, name: 'Ana', rawPhone: '(11) 99999-9999', optIn: true }]);
  });

  it('interpreta valores de optIn', () => {
    const parsed = parseContactsCsv('nome,telefone,optIn\nA,11999999991,true\nB,11999999992,false\nC,11999999993,\nD,11999999994,talvez');
    expect(parsed.entries.map((e) => e.optIn)).toEqual([true, false, null, false]);
    expect(parsed.warnings.some((w) => w.includes('talvez'))).toBe(true);
  });

  it('ignora linhas em branco', () => {
    expect(parseContactsCsv('telefone\n\n11999999999\n\n').entries).toHaveLength(1);
  });

  it('falha com mensagem clara quando não há coluna de telefone', () => {
    expect(() => parseContactsCsv('nome,email\nJoão,j@x.com')).toThrow(AppError);
    expect(() => parseContactsCsv('nome,email\nJoão,j@x.com')).toThrow(/telefone/);
  });

  it('falha para arquivo vazio ou só com cabeçalho', () => {
    expect(() => parseContactsCsv('')).toThrow(/vazio/);
    expect(() => parseContactsCsv('nome,telefone\n')).toThrow(/não possui linhas/);
  });
});

describe('classificação de contatos', () => {
  const csv = [
    'nome,telefone,optIn',
    'João,11999999999,true',
    'Maria,,true',
    'Carlos,123,true',
    'João repetido,+55 (11) 99999-9999,true',
    'Paula,11988888888,false',
    'Rita,11977777777,true',
  ].join('\n');

  it('detecta válidos, vazios, inválidos, duplicados e sem autorização', () => {
    const list = contactListFrom(csv);
    expect(list.contacts.map((c) => c.status)).toEqual(['VALID', 'INVALID', 'INVALID', 'DUPLICATE', 'NO_OPT_IN', 'VALID']);
    expect(list.contacts[1]?.issue).toBe('Telefone vazio');
    expect(list.contacts[3]?.issue).toBe('Duplicado da linha 2');
    expect(list.contacts[0]?.phone).toBe('5511999999999');
  });

  it('marca números da lista de bloqueio', () => {
    const list = contactListFrom(csv, (phone) => phone === '5511977777777');
    expect(list.contacts[5]?.status).toBe('BLOCKED');
  });

  it('resume as quantidades', () => {
    expect(summarizeContacts(contactListFrom(csv).contacts)).toEqual({
      total: 6,
      valid: 2,
      invalid: 2,
      duplicate: 1,
      blocked: 0,
      noOptIn: 1,
    });
  });

  it('remove inválidos e duplicados, mantendo os demais', () => {
    const cleaned = removeInvalidContacts(contactListFrom(csv));
    expect(cleaned.contacts.map((c) => c.name)).toEqual(['João', 'Paula', 'Rita']);
  });

  it('reclassifica após bloquear um número', () => {
    const list = contactListFrom(csv);
    const updated = reclassifyContactList(list, (phone) => phone === '5511999999999');
    expect(updated.contacts[0]?.status).toBe('BLOCKED');
    expect(updated.contacts[3]?.status).toBe('DUPLICATE');
  });

  it('exporta a lista limpa somente com contatos válidos', () => {
    expect(toCleanCsv(contactListFrom(csv))).toBe('nome,telefone,optIn\r\nJoão,5511999999999,true\r\nRita,5511977777777,true');
  });
});
