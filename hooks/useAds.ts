import { useState, useCallback, useRef } from 'react';
import { fetchAds, fetchMyAds, Ad } from '@/services/adsService';

const PAGE_SIZE = 20;

export function useAds(params?: { categoryId?: string; search?: string; maxPrice?: number; condition?: 'new' | 'used' | null }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track the actual count of loaded ads to compute correct offset for next page
  const loadedCountRef = useRef(0);

  const load = useCallback(async (overrideParams?: typeof params) => {
    setLoading(true);
    setError(null);
    loadedCountRef.current = 0;
    const p = overrideParams ?? params;
    const { data, error } = await fetchAds({
      ...p,
      condition: p?.condition ?? undefined,
      limit: PAGE_SIZE,
      offset: 0,
    });
    setAds(data);
    loadedCountRef.current = data.length;
    setHasMore(data.length === PAGE_SIZE);
    setError(error);
    setLoading(false);
  }, [params?.categoryId, params?.search, params?.maxPrice, params?.condition]);

  const loadMore = useCallback(async (currentParams?: typeof params) => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const p = currentParams ?? params;
    const { data } = await fetchAds({
      ...p,
      condition: p?.condition ?? undefined,
      limit: PAGE_SIZE,
      offset: loadedCountRef.current,
    });
    setAds(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      const newItems = data.filter(a => !existingIds.has(a.id));
      loadedCountRef.current += newItems.length;
      return [...prev, ...newItems];
    });
    setHasMore(data.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [loadingMore, hasMore, params?.categoryId, params?.search, params?.maxPrice, params?.condition]);

  return { ads, loading, loadingMore, hasMore, error, load, loadMore, setAds };
}

export function useMyAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchMyAds();
    setAds(data);
    setError(error);
    setLoading(false);
  }, []);

  return { ads, loading, error, load };
}
