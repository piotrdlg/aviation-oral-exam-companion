import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** Run an async fetch with loading/error/data + a refresh(). Re-runs when deps change. */
export function useAsync<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const run = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (mine === generation.current) setData(result);
    } catch (e) {
      if (mine === generation.current) setError(e as Error);
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, [fn]);

  useFocusEffect(useCallback(() => {
    void run();
    return () => { generation.current++; };
  }, [run]));

  return { data, error, loading, refresh: run };
}
