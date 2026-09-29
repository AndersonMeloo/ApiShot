import { createCampaign } from '../../core/campaign';
import { buildContactList } from '../../core/csvService';
import type { Campaign, Settings } from '../../core/types';
import { DEFAULT_SETTINGS, evaluateEligibility } from '../../core/validation';

export const FIXED_NOW = new Date('2026-09-28T12:00:00.000Z');

export const notBlocked = () => false;

export function contactListFrom(csv: string, isBlocked: (phone: string) => boolean = notBlocked) {
  return buildContactList(csv, 'contatos.csv', isBlocked, FIXED_NOW);
}

export function campaignFrom(
  csv: string,
  options: { message?: string; settings?: Partial<Settings>; consentConfirmed?: boolean; imagePath?: string } = {},
): Campaign {
  const settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const list = contactListFrom(csv);
  const consentConfirmed = options.consentConfirmed ?? true;
  const campaign = createCampaign({
    id: 'campaign-2026-09-28-120000',
    now: FIXED_NOW,
    message: options.message ?? 'Olá, {nome}! 👋',
    image: options.imagePath
      ? { fileName: 'produto.png', storedPath: options.imagePath, mimeType: 'image/png', sizeBytes: 100 }
      : null,
    sourceFile: list.fileName,
    settings,
    consentConfirmed,
    eligibility: evaluateEligibility(list, { onlyOptIn: settings.onlyOptIn, consentConfirmed }),
  });
  campaign.status = 'READY';
  return campaign;
}

/** Clock that advances 1 second per reading, so durations and delays are deterministic. */
export function steppingClock(start: Date = FIXED_NOW) {
  let current = start.getTime();
  return () => {
    current += 1000;
    return new Date(current);
  };
}
