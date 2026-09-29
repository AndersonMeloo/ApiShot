import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Campaign } from '../core/types';
import { readJsonFile, writeJsonFile } from './jsonDocument';
import type { AppLogger } from './logger';
import { campaignSchema } from './schemas';

const CAMPAIGN_FILE = /^campaign-[\w-]+\.json$/;

/** One JSON file per campaign in data/campaigns (e.g. campaign-2026-09-28-153012.json). */
export class CampaignStore {
  constructor(
    private readonly campaignsDir: string,
    private readonly logger: AppLogger,
  ) {}

  async save(campaign: Campaign): Promise<void> {
    await writeJsonFile(this.fileFor(campaign.id), campaign);
  }

  async remove(campaignId: string): Promise<void> {
    await rm(this.fileFor(campaignId), { force: true });
  }

  async loadLatest(): Promise<Campaign | null> {
    const files = (await readdir(this.campaignsDir)).filter((f) => CAMPAIGN_FILE.test(f)).sort().reverse();
    for (const file of files) {
      const result = await readJsonFile(path.join(this.campaignsDir, file), campaignSchema);
      if (result.status === 'ok') return result.value;
      if (result.status === 'invalid') this.logger.warn(`Campanha ignorada (${file}): ${result.reason}`);
    }
    return null;
  }

  private fileFor(campaignId: string): string {
    return path.join(this.campaignsDir, `${campaignId}.json`);
  }
}
