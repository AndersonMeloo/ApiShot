import { describe, expect, it } from 'vitest';
import { AppError } from '../core/errors';
import {
  DEFAULT_SETTINGS,
  evaluateEligibility,
  settingsSchema,
  validateCampaignDraft,
  validateImage,
  validateMessage,
  type CampaignDraft,
} from '../core/validation';
import { contactListFrom } from './helpers/fixtures';

const WITH_OPT_IN = 'nome,telefone,optIn\nJoão,11999999991,true\nMaria,11999999992,false\nAna,11999999993,';
const WITHOUT_OPT_IN = 'nome,telefone\nJoão,11999999991\nMaria,11999999992';

describe('opt-in', () => {
  it('por padrão só envia para optIn=true', () => {
    const result = evaluateEligibility(contactListFrom(WITH_OPT_IN), { onlyOptIn: true, consentConfirmed: false });
    expect(result.eligible.map((c) => c.name)).toEqual(['João']);
    expect(result.excluded.map((e) => [e.contact.name, e.status])).toEqual([
      ['Maria', 'SKIPPED'],
      ['Ana', 'SKIPPED'],
    ]);
    expect(result.requiresConsentConfirmation).toBe(false);
  });

  it('nunca envia para optIn=false, mesmo com a opção desmarcada', () => {
    const result = evaluateEligibility(contactListFrom(WITH_OPT_IN), { onlyOptIn: false, consentConfirmed: true });
    expect(result.eligible.map((c) => c.name)).toEqual(['João', 'Ana']);
    expect(result.excluded.map((e) => e.contact.name)).toEqual(['Maria']);
  });

  it('sem coluna optIn exige confirmação explícita e não inventa consentimento', () => {
    const list = contactListFrom(WITHOUT_OPT_IN);
    const unconfirmed = evaluateEligibility(list, { onlyOptIn: true, consentConfirmed: false });
    expect(unconfirmed.eligible).toHaveLength(0);
    expect(unconfirmed.awaitingConsent).toHaveLength(2);
    expect(unconfirmed.requiresConsentConfirmation).toBe(true);

    const confirmed = evaluateEligibility(list, { onlyOptIn: true, consentConfirmed: true });
    expect(confirmed.eligible).toHaveLength(2);
  });
});

describe('bloqueados e inválidos', () => {
  it('exclui bloqueados como ignorados e inválidos como inválidos', () => {
    const list = contactListFrom('nome,telefone,optIn\nA,11999999991,true\nB,999,true\nC,11999999993,true', (p) => p === '5511999999993');
    const result = evaluateEligibility(list, { onlyOptIn: true, consentConfirmed: false });
    expect(result.eligible.map((c) => c.name)).toEqual(['A']);
    expect(result.excluded).toEqual([
      expect.objectContaining({ status: 'INVALID' }),
      expect.objectContaining({ status: 'SKIPPED', reason: 'Número na lista de bloqueio' }),
    ]);
  });
});

describe('validateCampaignDraft', () => {
  const draft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
    contacts: contactListFrom(WITH_OPT_IN),
    message: 'Olá, {nome}!',
    image: null,
    settings: DEFAULT_SETTINGS,
    consentConfirmed: false,
    ...overrides,
  });

  it('aceita um rascunho válido', () => {
    expect(validateCampaignDraft(draft()).errors).toEqual([]);
  });

  it('exige contatos e mensagem', () => {
    expect(validateCampaignDraft(draft({ contacts: null })).errors).toContain('Importe uma lista de contatos.');
    expect(validateCampaignDraft(draft({ message: '  ' })).errors).toContain('Escreva a mensagem da campanha.');
  });

  it('respeita maxContactsPerCampaign', () => {
    const settings = { ...DEFAULT_SETTINGS, maxContactsPerCampaign: 1 };
    const csv = 'nome,telefone,optIn\nA,11999999991,true\nB,11999999992,true';
    const { errors } = validateCampaignDraft(draft({ contacts: contactListFrom(csv), settings }));
    expect(errors.join()).toMatch(/acima do limite de 1/);
  });

  it('bloqueia quando falta confirmação de consentimento', () => {
    const { errors } = validateCampaignDraft(draft({ contacts: contactListFrom(WITHOUT_OPT_IN) }));
    expect(errors.join()).toMatch(/Confirme/);
  });

  it('rejeita variáveis desconhecidas', () => {
    expect(validateMessage('Oi {name}').join()).toMatch(/\{name\}/);
  });
});

describe('validateImage', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');

  it('aceita PNG, JPEG e WEBP pelo conteúdo', () => {
    expect(validateImage('a.png', png, 1000)).toBe('image/png');
    expect(validateImage('a.JPG', jpeg, 1000)).toBe('image/jpeg');
    expect(validateImage('a.jpeg', jpeg, 1000)).toBe('image/jpeg');
    expect(validateImage('a.webp', webp, 1000)).toBe('image/webp');
  });

  it('rejeita extensão, tamanho e conteúdo inválidos', () => {
    expect(() => validateImage('a.gif', png, 1000)).toThrow(AppError);
    expect(() => validateImage('a.png', png, 4)).toThrow(/tamanho máximo/);
    expect(() => validateImage('a.png', new Uint8Array([1, 2, 3, 4]), 1000)).toThrow(/não é uma imagem/);
    expect(() => validateImage('a.png', new Uint8Array(), 1000)).toThrow(/vazio/);
  });
});

describe('settingsSchema', () => {
  it('tem valores iniciais conservadores', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ onlyOptIn: true, maxContactsPerCampaign: 50 });
    expect(DEFAULT_SETTINGS.delayBetweenMessagesSeconds).toBeGreaterThanOrEqual(10);
  });

  it('rejeita valores fora dos limites', () => {
    expect(settingsSchema.safeParse({ delayBetweenMessagesSeconds: 1 }).success).toBe(false);
    expect(settingsSchema.safeParse({ maxRetries: 10 }).success).toBe(false);
    expect(settingsSchema.safeParse({ maxContactsPerCampaign: 5000 }).success).toBe(false);
  });
});
