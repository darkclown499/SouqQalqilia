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
  // Track regular-ads count separately from boosts for correct page offset.
  // Boosted ads are always re-fetched (no offset), so offset must only count regular ads.
  const regularCountRef = useRef(0);
  const boostCountRef = useRef(0);

  const load = useCallback(async (overrideParams?: typeof params) => {
    setError(null);
    const p = overrideParams ?? params;
    const isDefault = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice && !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');

    // Cancel any in-flight fetch before starting a new one
    if (_activeController) { try { _activeController.abort(); } catch {} }
    _activeController = new AbortController();
    const signal = _activeController.signal;

    // Reset pagination state immediately before fetch
    regularCountRef.current = 0;
    boostCountRef.current = 0;
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
    // Bug fix: track boosts and regulars separately so loadMore offset is correct.
    // Boosts are always pinned at top with no offset — only regular ads need paging.
    const now = Date.now();
    const boosts = data.filter(a => a.boosted_until && new Date(a.boosted_until).getTime() > now);
    const regulars = data.filter(a => !a.boosted_until || new Date(a.boosted_until).getTime() <= now);
    boostCountRef.current = boosts.length;
    regularCountRef.current = regulars.length;
    // hasMore is true only when we received a full page of regular ads
    setHasMore(regulars.length === PAGE_SIZE);
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

    // Offset applies only to regular ads — boosted ads are always re-fetched
    // fresh (no offset) so they stay pinned at top regardless of page number.
    const { data } = await fetchAds({
      ...p,
      condition: p?.condition ?? undefined,
      sortBy,
      limit: PAGE_SIZE,
      offset: regularCountRef.current,
    });

    if (data.length > 0) {
      setAds(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newItems = data.filter(a => !existingIds.has(a.id));
        if (newItems.length > 0) {
          // Only count new regular ads toward pagination offset
          const now = Date.now();
          const newRegulars = newItems.filter(
            a => !a.boosted_until || new Date(a.boosted_until).getTime() <= now
          );
          regularCountRef.current = regularCountRef.current + newRegulars.length;
          return [...prev, ...newItems];
        }
        return prev;
      });
    }
    // hasMore = false when the regular ads page was not full
    const now = Date.now();
    const returnedRegulars = data.filter(
      a => !a.boosted_until || new Date(a.boosted_until).getTime() <= now
    );
    setHasMore(returnedRegulars.length >= PAGE_SIZE);
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
