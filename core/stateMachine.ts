import type { CampaignStatus } from './types';

const TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  IDLE: ['VALIDATING'],
  VALIDATING: ['READY', 'IDLE', 'ERROR'],
  READY: ['RUNNING', 'IDLE', 'VALIDATING'],
  RUNNING: ['PAUSED', 'CANCELLED', 'COMPLETED', 'ERROR'],
  PAUSED: ['RUNNING', 'CANCELLED'],
  ERROR: ['RUNNING', 'CANCELLED'],
  CANCELLED: ['IDLE'],
  COMPLETED: ['IDLE'],
};

export const TERMINAL_STATUSES: readonly CampaignStatus[] = ['CANCELLED', 'COMPLETED'];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: CampaignStatus,
    readonly to: CampaignStatus,
  ) {
    super(`Transição de estado inválida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function isTerminal(status: CampaignStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function transition<T extends { status: CampaignStatus }>(target: T, to: CampaignStatus): T {
  assertTransition(target.status, to);
  target.status = to;
  return target;
}
