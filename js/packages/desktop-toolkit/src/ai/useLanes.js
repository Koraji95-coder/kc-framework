import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Hook to fetch the list of lanes the current API key is allowed to invoke.
 * Wraps the `ai_list_lanes` Tauri command.
 */
export function useLanes() {
  const [identity, setIdentity] = useState(null);
  const [lanes, setLanes] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke('ai_list_lanes');
      setIdentity(result.identity);
      setLanes(result.lanes ?? []);
    } catch (err) {
      setError(typeof err === 'string' ? err : err?.message ?? String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { identity, lanes, error, isLoading, refresh };
}