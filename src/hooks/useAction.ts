import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '../../core/errors';
import { useNotify } from './useNotifications';

/**
 * Runs one async action at a time per component: repeated clicks while an action is pending
 * are ignored, and failures are shown as notifications.
 */
export function useAction() {
  const notify = useNotify();
  const running = useRef(false);
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async <T>(key: string, action: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
      if (running.current) return undefined;
      running.current = true;
      setPending(key);
      try {
        const result = await action();
        if (successMessage) notify.success(successMessage);
        return result;
      } catch (error) {
        notify.error(errorMessage(error));
        return undefined;
      } finally {
        running.current = false;
        setPending(null);
      }
    },
    [notify],
  );

  return { run, pending, busy: pending !== null };
}
