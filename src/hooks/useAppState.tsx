import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { errorMessage } from '../../core/errors';
import type { AppSnapshot } from '../../core/types';
import { invoke, isBridgeAvailable, onStateChanged } from '../lib/api';

const AppStateContext = createContext<AppSnapshot | null>(null);

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; snapshot: AppSnapshot };

/** Keeps the latest snapshot pushed by the main process, which is the single source of truth. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>(() =>
    isBridgeAvailable() ? { status: 'loading' } : { status: 'error', message: 'Abra este aplicativo pelo Electron (npm run dev).' },
  );

  useEffect(() => {
    if (!isBridgeAvailable()) return;
    let active = true;
    const unsubscribe = onStateChanged((snapshot) => setState({ status: 'ready', snapshot }));
    invoke('app:get-state')
      .then((snapshot) => active && setState({ status: 'ready', snapshot }))
      .catch((error: unknown) => active && setState({ status: 'error', message: errorMessage(error) }));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (state.status === 'loading') {
    return <div className="grid h-screen place-items-center text-slate-500">Carregando…</div>;
  }
  if (state.status === 'error') {
    return <div className="grid h-screen place-items-center p-8 text-center text-red-700">{state.message}</div>;
  }
  return <AppStateContext.Provider value={state.snapshot}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppSnapshot {
  const snapshot = useContext(AppStateContext);
  if (!snapshot) throw new Error('useAppState deve ser usado dentro de AppStateProvider');
  return snapshot;
}
