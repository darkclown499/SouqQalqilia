import { useState, useCallback, useRef } from 'react';
import { fetchAds, fetchMyAds, Ad, getAdsCache, setAdsCache } from '@/services/adsService';

const PAGE_SIZE = 20;

export function useAds(params?: { categoryId?: string; search?: string; maxPrice?: number; condition?: 'new' | 'used' | null }) {
  // Seed from module-level cache on first mount (no-filter only) for instant display
  const initialAds = !params?.categoryId && !params?.search && !params?.maxPrice && !params?.condition
    ? (getAdsCache()?.data ?? [])
    : [];
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [loading, setLoading] = useState(initialAds.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track the actual count of loaded ads to compute correct offset for next page
  const loadedCountRef = useRef(0);

  const load = useCallback(async (overrideParams?: typeof params) => {
    setError(null);
    const p = overrideParams ?? params;
    const isDefault = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.condition;

    // Show cached data immediately, then refresh in background
    const cached = isDefault ? getAdsCache() : null;
    if (cached) {
      setAds(cached.data);
      loadedCountRef.current = cached.data.length;
      setHasMore(cached.data.length === PAGE_SIZE);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadedCountRef.current = 0;
    const { data, error } = await fetchAds({
      ...p,
      condition: p?.condition ?? undefined,
      limit: PAGE_SIZE,
      offset: 0,
    });
    if (isDefault && data.length > 0) setAdsCache(data);
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
