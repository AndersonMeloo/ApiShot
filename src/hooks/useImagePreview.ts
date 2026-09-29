import { useEffect, useState } from 'react';
import type { MediaInfo } from '../../core/types';
import { invoke } from '../lib/api';

/** Loads the stored image as a data URL (the renderer has no direct file access). */
export function useImagePreview(image: MediaInfo | null): string | null {
  const key = image?.storedPath ?? null;
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    invoke('app:get-image-preview')
      .then((url) => active && setLoaded({ key, url }))
      .catch(() => active && setLoaded({ key, url: null }));
    return () => {
      active = false;
    };
  }, [key]);

  return key && loaded?.key === key ? loaded.url : null;
}
