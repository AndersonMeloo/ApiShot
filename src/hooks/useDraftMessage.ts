import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../core/errors';
import { invoke } from '../lib/api';
import { useNotify } from './useNotifications';

const SAVE_DELAY_MS = 500;

/** Local, instantly-updating message text that is saved to disk shortly after typing stops. */
export function useDraftMessage(savedMessage: string) {
  const notify = useNotify();
  const [message, setMessageState] = useState(savedMessage);
  const latest = useRef(savedMessage);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await invoke('app:save-message', { message: latest.current });
  }, []);

  const setMessage = useCallback(
    (value: string) => {
      latest.current = value;
      setMessageState(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        flush().catch((error: unknown) => notify.error(errorMessage(error)));
      }, SAVE_DELAY_MS);
    },
    [flush, notify],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { message, setMessage, flush };
}
