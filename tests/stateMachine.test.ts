import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidTransitionError, isTerminal, transition } from '../core/stateMachine';
import type { CampaignStatus } from '../core/types';

describe('máquina de estados da campanha', () => {
  it.each<[CampaignStatus, CampaignStatus]>([
    ['IDLE', 'VALIDATING'],
    ['VALIDATING', 'READY'],
    ['READY', 'RUNNING'],
    ['RUNNING', 'PAUSED'],
    ['RUNNING', 'CANCELLED'],
    ['RUNNING', 'COMPLETED'],
    ['RUNNING', 'ERROR'],
    ['PAUSED', 'RUNNING'],
    ['PAUSED', 'CANCELLED'],
    ['ERROR', 'RUNNING'],
    ['COMPLETED', 'IDLE'],
  ])('permite %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each<[CampaignStatus, CampaignStatus]>([
    ['IDLE', 'RUNNING'],
    ['READY', 'COMPLETED'],
    ['RUNNING', 'RUNNING'],
    ['RUNNING', 'READY'],
    ['PAUSED', 'COMPLETED'],
    ['CANCELLED', 'RUNNING'],
    ['COMPLETED', 'RUNNING'],
  ])('bloqueia %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
  });

  it('transition altera o status somente quando válido', () => {
    const campaign = { status: 'READY' as CampaignStatus };
    transition(campaign, 'RUNNING');
    expect(campaign.status).toBe('RUNNING');
    expect(() => transition(campaign, 'READY')).toThrow(/RUNNING → READY/);
    expect(campaign.status).toBe('RUNNING');
  });

  it('identifica estados finais', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PAUSED')).toBe(false);
  });
});
