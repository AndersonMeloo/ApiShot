import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Sandboxed preloads cannot import project modules, so the prefix mirrors IPC_PREFIX in core/ipc.ts.
const IPC_PREFIX = 'app:';

function assertAllowed(channel: unknown): asserts channel is string {
  if (typeof channel !== 'string' || !channel.startsWith(IPC_PREFIX)) {
    throw new Error(`Canal IPC não permitido: ${String(channel)}`);
  }
}

contextBridge.exposeInMainWorld('campaignApp', {
  invoke(channel: string, payload?: unknown) {
    assertAllowed(channel);
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel: string, listener: (data: unknown) => void) {
    assertAllowed(channel);
    const handler = (_event: IpcRendererEvent, data: unknown) => listener(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
});
