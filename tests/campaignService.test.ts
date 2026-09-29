import { describe, expect, it, vi } from 'vitest';
import { recoverInterruptedCampaign, summarizeCampaign } from '../core/campaign';
import { CampaignRunner, type RunnerDeps } from '../core/campaignRunner';
import type { Campaign, Recipient } from '../core/types';
import { campaignFrom, FIXED_NOW, steppingClock } from './helpers/fixtures';
import { MockWhatsAppService } from './helpers/mockWhatsAppService';

const CSV = [
  'nome,telefone,optIn',
  'João,11999999991,true',
  ',11999999992,true',
  'Carlos,11999999993,true',
  'Inválido,123,true',
  'Recusou,11999999995,false',
].join('\n');

function setup(campaign: Campaign = campaignFrom(CSV), options: { blocked?: Set<string> } = {}) {
  const whatsapp = new MockWhatsAppService();
  const finished: Recipient[] = [];
  const sleeps: number[] = [];
  const deps: RunnerDeps = {
    whatsapp,
    isBlocked: (phone) => options.blocked?.has(phone) ?? false,
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
    }),
    now: steppingClock(),
    onChange: vi.fn(),
    onRecipientFinished: (_c, r) => {
      finished.push({ ...r });
    },
  };
  const runner = new CampaignRunner(campaign, deps);
  return { campaign, runner, whatsapp, finished, sleeps, deps };
}

async function runToIdle(runner: CampaignRunner, action: () => Promise<void>) {
  await action();
  await runner.waitUntilIdle();
}

const statuses = (campaign: Campaign) => campaign.recipients.map((r) => r.status);

describe('CampaignRunner – envio', () => {
  it('envia apenas para contatos elegíveis, personalizando a mensagem', async () => {
    const { campaign, runner, whatsapp } = setup();
    await runToIdle(runner, () => runner.start());

    expect(campaign.status).toBe('COMPLETED');
    expect(whatsapp.sent.map((s) => [s.phone, s.message])).toEqual([
      ['5511999999991', 'Olá, João! 👋'],
      ['5511999999992', 'Olá! 👋'],
      ['5511999999993', 'Olá, Carlos! 👋'],
    ]);
    expect(statuses(campaign)).toEqual(['SUCCESS', 'SUCCESS', 'SUCCESS', 'INVALID', 'SKIPPED']);
    expect(campaign.finishedAt).not.toBeNull();
  });

  it('envia a imagem configurada', async () => {
    const { runner, whatsapp } = setup(campaignFrom(CSV, { imagePath: '/tmp/produto.png' }));
    await runToIdle(runner, () => runner.start());
    expect(whatsapp.sent.every((s) => s.imagePath === '/tmp/produto.png')).toBe(true);
  });

  it('respeita o intervalo entre mensagens', async () => {
    const { runner, sleeps } = setup(campaignFrom(CSV, { settings: { delayBetweenMessagesSeconds: 30 } }));
    await runToIdle(runner, () => runner.start());
    expect(sleeps).toHaveLength(2);
    expect(sleeps.every((ms) => ms > 0 && ms <= 30_000)).toBe(true);
  });

  it('registra log de todos os contatos, inclusive inválidos e ignorados', async () => {
    const { runner, finished } = setup();
    await runToIdle(runner, () => runner.start());
    expect(finished.map((r) => r.status).sort()).toEqual(['INVALID', 'SKIPPED', 'SUCCESS', 'SUCCESS', 'SUCCESS']);
  });

  it('não envia para número bloqueado durante a campanha', async () => {
    const { campaign, runner, whatsapp } = setup(campaignFrom(CSV), { blocked: new Set(['5511999999993']) });
    await runToIdle(runner, () => runner.start());
    expect(whatsapp.sent.map((s) => s.phone)).not.toContain('5511999999993');
    expect(campaign.recipients[2]).toMatchObject({ status: 'SKIPPED', error: 'Número na lista de bloqueio' });
  });

  it('impede iniciar duas vezes (duplo clique)', async () => {
    const { runner } = setup();
    await runner.start();
    await expect(runner.start()).rejects.toThrow();
    await runner.waitUntilIdle();
  });

  it('não inicia campanha que não está READY', async () => {
    const campaign = campaignFrom(CSV);
    campaign.status = 'COMPLETED';
    const { runner } = setup(campaign);
    await expect(runner.start()).rejects.toThrow(/COMPLETED → RUNNING/);
  });
});

describe('CampaignRunner – pausa', () => {
  it('termina o envio atual, pausa e continua do próximo pendente', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.onSend = (call) => {
      if (call === 1) void runner.pause();
    };
    await runToIdle(runner, () => runner.start());

    expect(campaign.status).toBe('PAUSED');
    expect(whatsapp.sent).toHaveLength(1);
    expect(statuses(campaign).slice(0, 3)).toEqual(['SUCCESS', 'PENDING', 'PENDING']);

    whatsapp.onSend = null;
    await runToIdle(runner, () => runner.resume());
    expect(campaign.status).toBe('COMPLETED');
    expect(whatsapp.sent.map((s) => s.phone)).toEqual(['5511999999991', '5511999999992', '5511999999993']);
  });

  it('só pausa campanha em andamento', async () => {
    const { runner } = setup();
    await expect(runner.pause()).rejects.toThrow(/pausar/);
  });
});

describe('CampaignRunner – cancelamento', () => {
  it('termina o envio atual e marca os pendentes como cancelados', async () => {
    const { campaign, runner, whatsapp, finished } = setup();
    whatsapp.onSend = (call) => {
      if (call === 1) void runner.cancel();
    };
    await runToIdle(runner, () => runner.start());

    expect(campaign.status).toBe('CANCELLED');
    expect(whatsapp.sent).toHaveLength(1);
    expect(statuses(campaign).slice(0, 3)).toEqual(['SUCCESS', 'CANCELLED', 'CANCELLED']);
    expect(finished.filter((r) => r.status === 'CANCELLED')).toHaveLength(2);
    expect(summarizeCampaign(campaign)).toMatchObject({ sent: 1, cancelled: 2, pending: 0 });
  });

  it('cancela uma campanha pausada sem enviar mais nada', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.onSend = (call) => {
      if (call === 1) void runner.pause();
    };
    await runToIdle(runner, () => runner.start());
    await runner.cancel();

    expect(campaign.status).toBe('CANCELLED');
    expect(whatsapp.sent).toHaveLength(1);
    await expect(runner.resume()).rejects.toThrow();
  });
});

describe('CampaignRunner – erros', () => {
  it('tenta novamente erros temporários com backoff limitado', async () => {
    const campaign = campaignFrom(CSV, { settings: { maxRetries: 2, retryBaseDelaySeconds: 10 } });
    const { runner, whatsapp, sleeps } = setup(campaign);
    whatsapp.thenFail('TIMEOUT').thenFail('PAGE_UNAVAILABLE').thenSucceed();
    await runToIdle(runner, () => runner.start());

    expect(campaign.recipients[0]).toMatchObject({ status: 'SUCCESS', attempts: 3 });
    expect(sleeps.slice(0, 2)).toEqual([10_000, 20_000]);
  });

  it('desiste após o número máximo de tentativas', async () => {
    const campaign = campaignFrom(CSV, { settings: { maxRetries: 1 } });
    const { runner, whatsapp } = setup(campaign);
    whatsapp.thenFail('TIMEOUT').thenFail('TIMEOUT');
    await runToIdle(runner, () => runner.start());

    expect(campaign.recipients[0]).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(campaign.recipients[1]?.status).toBe('SUCCESS');
  });

  it('não repete quando a mensagem pode já ter sido enviada', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.thenFail('TIMEOUT', { messageMayHaveBeenSent: true });
    await runToIdle(runner, () => runner.start());

    expect(campaign.recipients[0]).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(campaign.recipients[0]?.error).toMatch(/Verifique manualmente/);
    expect(whatsapp.sent).toHaveLength(3);
  });

  it('marca como inválido quando o WhatsApp informa que o número não existe', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.thenFail('NOT_ON_WHATSAPP');
    await runToIdle(runner, () => runner.start());
    expect(campaign.recipients[0]?.status).toBe('INVALID');
    expect(campaign.status).toBe('COMPLETED');
  });

  it('interrompe a campanha em ERROR quando o WhatsApp desconecta, sem perder o contato', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.thenSucceed().thenFail('DISCONNECTED');
    await runToIdle(runner, () => runner.start());

    expect(campaign.status).toBe('ERROR');
    expect(campaign.lastError).toMatch(/desconectado/i);
    expect(statuses(campaign).slice(0, 3)).toEqual(['SUCCESS', 'PENDING', 'PENDING']);

    await runToIdle(runner, () => runner.resume());
    expect(campaign.status).toBe('COMPLETED');
    expect(campaign.lastError).toBeNull();
  });

  it('para quando a interface do WhatsApp muda, em vez de insistir', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.thenFail('UI_CHANGED');
    await runToIdle(runner, () => runner.start());
    expect(campaign.status).toBe('ERROR');
    expect(whatsapp.sent).toHaveLength(1);
  });

  it('trata exceções inesperadas do serviço como falha sem repetição', async () => {
    const { campaign, runner, whatsapp } = setup();
    whatsapp.sendMessage = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ ok: true, durationMs: 1 });
    await runToIdle(runner, () => runner.start());
    expect(campaign.recipients[0]).toMatchObject({ status: 'FAILED' });
    expect(campaign.recipients[0]?.error).toMatch(/boom/);
    expect(campaign.status).toBe('COMPLETED');
  });
});

describe('recuperação após fechamento inesperado', () => {
  it('pausa a campanha e não reenvia o contato que estava em envio', () => {
    const campaign = campaignFrom(CSV);
    campaign.status = 'RUNNING';
    campaign.requestedAction = 'PAUSE';
    campaign.recipients[0]!.status = 'SUCCESS';
    campaign.recipients[1]!.status = 'SENDING';

    const recovered = recoverInterruptedCampaign(campaign, FIXED_NOW);
    expect(recovered.status).toBe('PAUSED');
    expect(recovered.requestedAction).toBeNull();
    expect(recovered.recipients[1]).toMatchObject({ status: 'FAILED' });
    expect(recovered.recipients[1]?.error).toMatch(/Verifique manualmente/);
    expect(recovered.recipients[2]?.status).toBe('PENDING');
    expect(campaign.recipients[1]?.status).toBe('SENDING');
  });
});
