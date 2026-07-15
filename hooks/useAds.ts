import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from '@/utils/errorLogger';
import { AppState, AppStateStatus } from 'react-native';

// Module-level AbortController reference
let _activeController: AbortController | null = null;
import { fetchAds, fetchMyAds, Ad, getAdsCache, setAdsCache, subscribeToCacheInvalidation, CACHE_TTL_MS } from '@/services/adsService';

const PAGE_SIZE = 20;

// ── AsyncStorage cache for My Ads (persists across tab switches) ──────────────
const MY_ADS_CACHE_KEY = 'my_ads_cache_v1';
const MY_ADS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface MyAdsCache { data: Ad[]; fetchedAt: number }

async function loadMyAdsCache(): Promise<MyAdsCache | null> {
  try {
    const raw = await AsyncStorage.getItem(MY_ADS_CACHE_KEY);
    if (!raw) return null;
    const parsed: MyAdsCache = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > MY_ADS_CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

async function saveMyAdsCache(data: Ad[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MY_ADS_CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch { /* non-critical */ }
}

export function useAds(params?: { categoryId?: string; search?: string; maxPrice?: number; minPrice?: number; condition?: 'new' | 'used' | null; location?: string; sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'boosted' }) {
  const initialAds = !params?.categoryId && !params?.search && !params?.maxPrice && !params?.minPrice && !params?.condition && !params?.location && !params?.sortBy
    ? (getAdsCache()?.data ?? [])
    : [];
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [loading, setLoading] = useState(initialAds.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const regularCountRef = useRef(0);
  const boostCountRef = useRef(0);

  const load = useCallback(async (overrideParams?: typeof params) => {
    setError(null);
    const p = overrideParams ?? params;
    const isDefault = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice && !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');

    if (_activeController) { try { _activeController.abort(); } catch {} }
    _activeController = new AbortController();
    const signal = _activeController.signal;

    regularCountRef.current = 0;
    boostCountRef.current = 0;
    setHasMore(true);

    const cached = isDefault ? getAdsCache() : null;
    if (cached) {
      setAds(cached.data);
      setHasMore(cached.data.length === PAGE_SIZE);
      setLoading(false);
    } else {
      setAds([]);
      setLoading(true);
    }

    let fetchedData: Ad[] = [];
    let fetchError: string | null = null;
    try {
      const result = await fetchAds({
        ...p,
        condition: p?.condition ?? undefined,
        sortBy: p?.sortBy ?? 'newest',
        limit: PAGE_SIZE,
        offset: 0,
      });
      fetchedData = result.data;
      fetchError = result.error;
    } catch (e: any) {
      fetchError = e?.message ?? 'Connection error.';
      Logger.error('useAds', 'load() network error', e instanceof Error ? e : new Error(String(e)));
      if (isDefault) {
        const staleCache = getAdsCache();
        if (staleCache && staleCache.data.length > 0) setAds(staleCache.data);
      }
    }

    if (signal.aborted) return;

    if (!fetchError && fetchedData.length > 0) {
      if (isDefault) setAdsCache(fetchedData);
      setAds(fetchedData);
    } else if (fetchedData.length === 0 && !fetchError) {
      setAds([]);
    }

    const now = Date.now();
    const regulars = fetchedData.filter(a => !a.boosted_until || new Date(a.boosted_until).getTime() <= now);
    const boosts = fetchedData.filter(a => a.boosted_until && new Date(a.boosted_until).getTime() > now);
    boostCountRef.current = boosts.length;
    regularCountRef.current = regulars.length;
    setHasMore(regulars.length === PAGE_SIZE);

    if (fetchError) Logger.warn('useAds', 'fetchAds returned error', { error: fetchError });
    setError(fetchError);
    setLoading(false);
  }, [params?.categoryId, params?.search, params?.maxPrice, params?.minPrice, params?.condition, params?.location, params?.sortBy]);

  useEffect(() => {
    const unsub = subscribeToCacheInvalidation(() => {
      const p = params;
      const isDefault =
        !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice &&
        !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');
      if (isDefault) load();
    });
    return unsub;
  }, [load]);

  useEffect(() => {
    const p = params;
    const isDefault =
      !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice &&
      !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');
    if (!isDefault) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const cached = getAdsCache();
        const isStale = !cached || (Date.now() - cached.fetchedAt > CACHE_TTL_MS);
        if (isStale) load();
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

    let data: Ad[] = [];
    try {
      const result = await fetchAds({
        ...p,
        condition: p?.condition ?? undefined,
        sortBy,
        limit: PAGE_SIZE,
        offset: regularCountRef.current,
      });
      data = result.data;
      if (result.error) Logger.warn('useAds', 'loadMore() fetchAds error', { error: result.error });
    } catch (e: any) {
      Logger.error('useAds', 'loadMore() threw', e instanceof Error ? e : new Error(String(e)));
      setLoadingMore(false);
      return;
    }

    if (data.length > 0) {
      setAds(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const newItems = data.filter(a => !existingIds.has(a.id));
        if (newItems.length > 0) {
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
    const now = Date.now();
    const returnedRegulars = data.filter(
      a => !a.boosted_until || new Date(a.boosted_until).getTime() <= now
    );
    setHasMore(returnedRegulars.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [loadingMore, hasMore, params?.categoryId, params?.search, params?.maxPrice, params?.minPrice, params?.condition, params?.location, params?.sortBy]);

  return { ads, loading, loadingMore, hasMore, error, load, loadMore, setAds };
}

// ── useMyAds with AsyncStorage caching + isMounted guard ─────────────────────
export function useMyAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!isMounted.current) return;

    // Show cached data immediately to prevent count-reset-to-0 on tab switch
    const cached = await loadMyAdsCache();
    if (cached && isMounted.current) {
      setAds(cached.data);
      // Don't set loading=true if we have cached data — prevents spinner flash
    }

    if (!isMounted.current) return;
    setLoading(true);

    try {
      const { data, error: fetchError } = await fetchMyAds();
      if (!isMounted.current) return;
      setAds(data);
      setError(fetchError);
      if (!fetchError && data.length >= 0) {
        saveMyAdsCache(data);
      }
    } catch (e: any) {
      if (!isMounted.current) return;
      Logger.error('useMyAds', 'load() threw', e instanceof Error ? e : new Error(String(e)));
      setError(e?.message ?? 'Failed to load your ads');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  return { ads, loading, error, load };
}
