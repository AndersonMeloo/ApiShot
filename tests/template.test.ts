import { describe, expect, it } from 'vitest';
import { findUnknownVariables, renderMessage } from '../core/template';

const TEMPLATE = 'Olá, {nome}! 👋\n\nTemos uma novidade para você.';

describe('renderMessage', () => {
  it('substitui {nome} pelo nome do contato', () => {
    expect(renderMessage(TEMPLATE, 'João')).toBe('Olá, João! 👋\n\nTemos uma novidade para você.');
  });

  it('usa "Olá! 👋" quando o contato não tem nome', () => {
    expect(renderMessage(TEMPLATE, null)).toBe('Olá! 👋\n\nTemos uma novidade para você.');
    expect(renderMessage(TEMPLATE, '   ')).toBe('Olá! 👋\n\nTemos uma novidade para você.');
  });

  it('remove o separador corretamente em outras posições', () => {
    expect(renderMessage('Oi {nome}, tudo bem?', null)).toBe('Oi, tudo bem?');
    expect(renderMessage('{nome}, temos novidades', null)).toBe('temos novidades');
  });

  it('não deixa linhas vazias no início quando {nome} está sozinho na primeira linha', () => {
    expect(renderMessage('{nome}\n\n🏠 CONSÓRCIO', null)).toBe('🏠 CONSÓRCIO');
    expect(renderMessage('{nome}\n\n🏠 CONSÓRCIO', 'Ana')).toBe('Ana\n\n🏠 CONSÓRCIO');
  });

  it('substitui todas as ocorrências e aceita variações de espaço/caixa', () => {
    expect(renderMessage('{nome} e { NOME }', 'Ana')).toBe('Ana e Ana');
  });

  it('normaliza espaços no nome', () => {
    expect(renderMessage('Oi {nome}', '  Maria   Silva ')).toBe('Oi Maria Silva');
  });

  it('não altera mensagens sem variáveis', () => {
    expect(renderMessage('Promoção!', 'João')).toBe('Promoção!');
  });
});

describe('findUnknownVariables', () => {
  it('aponta variáveis não suportadas', () => {
    expect(findUnknownVariables('Oi {nome}, seu {cupom} e {name}')).toEqual(['{cupom}', '{name}']);
    expect(findUnknownVariables('Oi {nome}')).toEqual([]);
  });
});
