import { STATE_CHANGED_EVENT, type CampaignBridge, type IpcChannel, type IpcInput, type IpcOutput } from '../../core/ipc';
import type { AppSnapshot } from '../../core/types';

declare global {
  interface Window {
    campaignApp?: CampaignBridge;
  }
}

export function isBridgeAvailable(): boolean {
  return window.campaignApp !== undefined;
}

function bridge(): CampaignBridge {
  if (!window.campaignApp) throw new Error('Abra este aplicativo pelo Electron (npm run dev), não pelo navegador.');
  return window.campaignApp;
}

type Args<C extends IpcChannel> = IpcInput<C> extends void ? [] : [IpcInput<C>];

/** Typed call to the main process; rejects with the user-facing error message on failure. */
export async function invoke<C extends IpcChannel>(channel: C, ...args: Args<C>): Promise<IpcOutput<C>> {
  const result = await bridge().invoke(channel, args[0]);
  if (!result.ok) throw new Error(result.error);
  return result.data as IpcOutput<C>;
}

export function onStateChanged(listener: (snapshot: AppSnapshot) => void): () => void {
  return bridge().on(STATE_CHANGED_EVENT, (data) => listener(data as AppSnapshot));
}
