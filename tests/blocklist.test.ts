import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlocklistStore } from '../backend/blocklistStore';
import { AppLogger } from '../backend/logger';

describe('BlocklistStore', () => {
  let dir: string;
  let file: string;
  let logger: AppLogger;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'wcm-block-'));
    file = path.join(dir, 'blocked.json');
    logger = new AppLogger(path.join(dir, 'app.log'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('começa vazia quando o arquivo não existe', async () => {
    const store = new BlocklistStore(file, logger);
    await store.load();
    expect(store.count).toBe(0);
    expect(store.error).toBeNull();
  });

  it('adiciona números normalizados e persiste em disco', async () => {
    const store = new BlocklistStore(file, logger);
    await store.load();
    await store.add('(11) 99999-9999', 'pediu para sair');

    expect(store.has('5511999999999')).toBe(true);
    expect(store.has('+55 11 99999-9999')).toBe(true);

    const reloaded = new BlocklistStore(file, logger);
    await reloaded.load();
    expect(reloaded.has('11999999999')).toBe(true);
  });

  it('nunca duplica nem remove entradas existentes', async () => {
    await writeFile(file, JSON.stringify({ entries: ['11988887777', { phone: '5511977776666', addedAt: '', reason: 'manual' }] }));
    const store = new BlocklistStore(file, logger);
    await store.load();
    await store.add('11988887777', 'de novo');
    await store.add('11911112222', 'novo');

    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.entries).toHaveLength(3);
    expect(store.has('5511977776666')).toBe(true);
    expect(store.has('5511988887777')).toBe(true);
  });

  it('não descarta um arquivo inválido: sinaliza erro e bloqueia alterações', async () => {
    await writeFile(file, '{ isto não é json');
    const store = new BlocklistStore(file, logger);
    await store.load();

    expect(store.error).toMatch(/precisa ser corrigido/);
    expect(() => store.assertHealthy()).toThrow();
    await expect(store.add('11999999999', 'x')).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('{ isto não é json');
  });
});
