import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from '../core/phone';

describe('normalizePhone', () => {
  it.each([
    ['11999999999', '5511999999999'],
    ['5511999999999', '5511999999999'],
    ['+5511999999999', '5511999999999'],
    ['(11) 99999-9999', '5511999999999'],
    ['+55 (11) 99999-9999', '5511999999999'],
    ['011 99999-9999', '5511999999999'],
    ['0055 11 99999 9999', '5511999999999'],
    ['  21 98888.7777 ', '5521988887777'],
    ['1133334444', '551133334444'],
  ])('converte %s para %s', (raw, expected) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, phone: expected });
  });

  it('aceita números internacionais com +', () => {
    expect(normalizePhone('+1 415 555 2671')).toEqual({ ok: true, phone: '14155552671' });
  });

  it.each([
    ['', 'Telefone vazio'],
    ['   ', 'Telefone vazio'],
    ['abc', 'caracteres inválidos'],
    ['5,511E+12', 'caracteres inválidos'],
    ['12345', 'Formato não reconhecido'],
    ['1099999999', 'DDD 10 inexistente'],
    ['2099999999', 'DDD 20 inexistente'],
    ['11899999999', 'deve começar com 9'],
    ['1188888888', 'nono dígito'],
    ['+55119999', 'DDD + 8 ou 9 dígitos'],
    ['+123', 'tamanho inválido'],
  ])('rejeita %j', (raw, reason) => {
    const result = normalizePhone(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });
});

describe('formatPhone', () => {
  it('formata celulares e fixos brasileiros', () => {
    expect(formatPhone('5511999999999')).toBe('+55 (11) 99999-9999');
    expect(formatPhone('551133334444')).toBe('+55 (11) 3333-4444');
  });

  it('formata números internacionais com +', () => {
    expect(formatPhone('14155552671')).toBe('+14155552671');
  });
});
