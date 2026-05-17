import { useCallback, useEffect, useState } from 'react';

export function useApiData(request, initialData = null) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await request();
      setData(response?.data ?? response ?? initialData);
    } catch (err) {
      setError(err?.message || 'Unable to load data.');
    } finally {
      setLoading(false);
    }
  }, [request, initialData]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, setData, loading, error, refresh };
}
