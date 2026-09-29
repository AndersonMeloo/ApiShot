import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';

interface Notification {
  id: number;
  kind: Kind;
  message: string;
}

interface Notifier {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

const NotifierContext = createContext<Notifier | null>(null);

const DISMISS_AFTER_MS: Record<Kind, number> = { success: 5000, info: 6000, error: 12000 };

const KIND_STYLES: Record<Kind, string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
};

let nextId = 1;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((n) => n.id !== id)), []);

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId++;
      setItems((current) => [...current.slice(-4), { id, kind, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS[kind]);
    },
    [dismiss],
  );

  const notifier = useMemo<Notifier>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <NotifierContext.Provider value={notifier}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex w-96 flex-col gap-2" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${KIND_STYLES[item.kind]}`}>
            <div className="flex items-start gap-3">
              <p className="flex-1 whitespace-pre-line">{item.message}</p>
              <button type="button" className="opacity-60 hover:opacity-100" onClick={() => dismiss(item.id)} aria-label="Fechar">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotifierContext.Provider>
  );
}

export function useNotify(): Notifier {
  const notifier = useContext(NotifierContext);
  if (!notifier) throw new Error('useNotify deve ser usado dentro de NotificationsProvider');
  return notifier;
}
