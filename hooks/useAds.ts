import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';

// Module-level AbortController reference — cancels stale fetch when a newer
// one starts (e.g. rapid filter changes).  One slot per hook instance is
// enough because useAds is only mounted once in the home screen at a time.
let _activeController: AbortController | null = null;
import { fetchAds, fetchMyAds, Ad, getAdsCache, setAdsCache, subscribeToCacheInvalidation, CACHE_TTL_MS } from '@/services/adsService';

const PAGE_SIZE = 24; // Load 24 per page (12 rows of 2) — better UX than hard 20 limit

export function useAds(params?: { categoryId?: string; search?: string; maxPrice?: number; minPrice?: number; condition?: 'new' | 'used' | null; location?: string; sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'boosted' }) {
  // Seed from module-level cache on first mount (no-filter only) for instant display
  const initialAds = !params?.categoryId && !params?.search && !params?.maxPrice && !params?.minPrice && !params?.condition && !params?.location && !params?.sortBy
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
    const isDefault = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice && !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');

    // Cancel any in-flight fetch before starting a new one
    if (_activeController) { try { _activeController.abort(); } catch {} }
    _activeController = new AbortController();
    const signal = _activeController.signal;

    // Reset pagination state immediately before fetch
    loadedCountRef.current = 0;
    setHasMore(true);

    // Show cached data immediately for default view
    const cached = isDefault ? getAdsCache() : null;
    if (cached) {
      setAds(cached.data);
      setHasMore(cached.data.length === PAGE_SIZE);
      setLoading(false);
    } else {
      setAds([]);
      setLoading(true);
    }

    const { data, error } = await fetchAds({
      ...p,
      condition: p?.condition ?? undefined,
      sortBy: p?.sortBy ?? 'newest',
      limit: PAGE_SIZE,
      offset: 0,
    });
    // Ignore result if this fetch was cancelled by a newer one
    if (signal.aborted) return;
    if (isDefault && data.length > 0) setAdsCache(data);
    setAds(data);
    loadedCountRef.current = data.length;
    setHasMore(data.length === PAGE_SIZE);
    setError(error);
    setLoading(false);
  }, [params?.categoryId, params?.search, params?.maxPrice, params?.minPrice, params?.condition, params?.location, params?.sortBy]);

  // Re-fetch automatically when another screen invalidates the cache
  // (e.g. after boosting/editing an ad). Only triggers for the default
  // no-filter feed so filtered views are not disrupted.
  useEffect(() => {
    const unsub = subscribeToCacheInvalidation(() => {
      const p = params;
      const isDefault =
        !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice &&
        !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');
      if (isDefault) {
        load();
      }
    });
    return unsub;
  }, [load]);

  // Re-fetch when app returns from background, but only if cache is expired.
  // Prevents redundant API calls when user briefly locks/unlocks the screen.
  useEffect(() => {
    const p = params;
    const isDefault =
      !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice &&
      !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');
    if (!isDefault) return; // Only auto-refresh the unfiltered default feed

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Only re-fetch if cache is stale (expired beyond CACHE_TTL_MS)
        const cached = getAdsCache();
        const isStale = !cached || (Date.now() - cached.fetchedAt > CACHE_TTL_MS);
        if (isStale) {
          load();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [load]);

  const loadMore = useCallback(async (currentParams?: typeof params) => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const p = currentParams ?? params;
    const sortBy = p?.sortBy ?? 'newest';

    // For the two-query (boosted) path, offset only applies to regular ads.
    // We pass loadedCountRef.current as the regular-ads offset so boosted
    // ads are re-fetched fresh on every page (they're few and always pinned).
    const { data } = await fetchAds({
      ...p,
      condition: p?.condition ?? undefined,
      sortBy,
      limit: PAGE_SIZE,
      offset: loadedCountRef.current,
    });

    if (data.length > 0) {
      setAds(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newItems = data.filter(a => !existingIds.has(a.id));
        if (newItems.length > 0) {
          loadedCountRef.current = loadedCountRef.current + newItems.length;
          return [...prev, ...newItems];
        }
        return prev;
      });
    }
    // hasMore = false only when regular page returned less than a full page
    setHasMore(data.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [loadingMore, hasMore, params?.categoryId, params?.search, params?.maxPrice, params?.minPrice, params?.condition, params?.location, params?.sortBy]);

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
