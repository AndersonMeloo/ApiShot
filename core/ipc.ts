import type { AppSnapshot, Campaign, CampaignLogEntry, Settings, TestSendOutcome } from './types';

/** All channels share this prefix; the preload script only forwards channels that use it. */
export const IPC_PREFIX = 'app:';

export const STATE_CHANGED_EVENT = 'app:state-changed';

export interface IpcContract {
  'app:get-state': { input: void; output: AppSnapshot };
  'app:import-contacts': { input: { fileName: string; content: string }; output: void };
  'app:remove-invalid': { input: void; output: void };
  'app:clear-contacts': { input: void; output: void };
  'app:export-clean': { input: void; output: string | null };
  'app:block-contact': { input: { phone: string }; output: void };
  'app:save-message': { input: { message: string }; output: void };
  'app:set-image': { input: { fileName: string; bytes: Uint8Array }; output: void };
  'app:remove-image': { input: void; output: void };
  'app:get-image-preview': { input: void; output: string | null };
  'app:update-settings': { input: Partial<Settings>; output: void };
  'app:whatsapp-connect': { input: void; output: void };
  'app:whatsapp-disconnect': { input: void; output: void };
  'app:send-test': { input: { phone: string; name: string }; output: TestSendOutcome };
  'app:prepare-campaign': { input: { consentConfirmed: boolean }; output: Campaign };
  'app:start-campaign': { input: { campaignId: string; confirmedCount: number }; output: void };
  'app:pause-campaign': { input: void; output: void };
  'app:resume-campaign': { input: void; output: void };
  'app:cancel-campaign': { input: void; output: void };
  'app:discard-campaign': { input: void; output: void };
  'app:get-logs': { input: { campaignId: string }; output: CampaignLogEntry[] };
  'app:export-report': { input: { campaignId: string }; output: string | null };
  'app:open-data-folder': { input: void; output: void };
}

export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = IpcContract[C]['input'];
export type IpcOutput<C extends IpcChannel> = IpcContract[C]['output'];

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface CampaignBridge {
  invoke(channel: string, payload?: unknown): Promise<IpcResult<unknown>>;
  on(channel: string, listener: (data: unknown) => void): () => void;
}
