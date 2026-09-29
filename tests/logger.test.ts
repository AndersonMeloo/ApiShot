import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CampaignLogger, toLogEntry } from '../backend/logger';
import type { Recipient } from '../core/types';
import { campaignFrom, FIXED_NOW } from './helpers/fixtures';

const recipient = (overrides: Partial<Recipient> = {}): Recipient => ({
  id: 'row-2',
  name: 'João',
  phone: '5511999999999',
  status: 'SUCCESS',
  error: null,
  attempts: 1,
  durationMs: 1234,
  processedAt: FIXED_NOW.toISOString(),
  ...overrides,
});

describe('toLogEntry', () => {
  it('gera os campos exigidos', () => {
    expect(toLogEntry('campaign-x', recipient(), FIXED_NOW)).toEqual({
      timestamp: '2026-09-28T12:00:00.000Z',
      campaignId: 'campaign-x',
      contactName: 'João',
      phone: '5511999999999',
      status: 'SUCCESS',
      error: null,
      durationMs: 1234,
      attempts: 1,
    });
  });

  it('recusa status que não são resultado final', () => {
    expect(() => toLogEntry('campaign-x', recipient({ status: 'PENDING' }), FIXED_NOW)).toThrow();
  });
});

describe('CampaignLogger', () => {
  let dir: string;
  let logger: CampaignLogger;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'wcm-logs-'));
    logger = new CampaignLogger(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('grava e lê registros em JSON Lines', async () => {
    await logger.append(toLogEntry('campaign-a', recipient(), FIXED_NOW));
    await logger.append(toLogEntry('campaign-a', recipient({ status: 'FAILED', error: 'Tempo esgotado' }), FIXED_NOW));

    const entries = await logger.read('campaign-a');
    expect(entries.map((e) => [e.status, e.error])).toEqual([
      ['SUCCESS', null],
      ['FAILED', 'Tempo esgotado'],
    ]);
    const raw = await readFile(path.join(dir, 'campaign-a.jsonl'), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(2);
  });

  it('retorna lista vazia quando não há log e ignora linhas corrompidas', async () => {
    expect(await logger.read('campaign-inexistente')).toEqual([]);
    await logger.append(toLogEntry('campaign-b', recipient(), FIXED_NOW));
    await import('node:fs/promises').then((fs) => fs.appendFile(path.join(dir, 'campaign-b.jsonl'), '{quebrado\n'));
    expect(await logger.read('campaign-b')).toHaveLength(1);
  });

  it('escreve o resumo da campanha', async () => {
    const campaign = campaignFrom('nome,telefone,optIn\nA,11999999991,true\nB,11999999992,true\nC,123,true');
    campaign.recipients[0]!.status = 'SUCCESS';
    campaign.recipients[1]!.status = 'FAILED';
    await logger.writeSummary(campaign);

    const summary = JSON.parse(await readFile(path.join(dir, `${campaign.id}.summary.json`), 'utf8'));
    expect(summary).toMatchObject({ total: 3, enviados: 1, falharam: 1, invalidos: 1, cancelados: 0, pendentes: 0 });
  });

  it('não permite caminhos fora da pasta de logs', async () => {
    await logger.append(toLogEntry('../fora', recipient(), FIXED_NOW));
    expect(await logger.read('../fora')).toHaveLength(1);
    const raw = await readFile(path.join(dir, '___fora.jsonl'), 'utf8');
    expect(raw).toContain('5511999999999');
  });
});
