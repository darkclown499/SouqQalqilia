import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from '@/utils/errorLogger';
import { AppState, AppStateStatus } from 'react-native';
import { fetchAds, fetchMyAds, Ad, getAdsCache, setAdsCache, subscribeToCacheInvalidation, CACHE_TTL_MS } from '@/services/adsService';

// ─── Module-level AbortController reference ──────────────────────────────────
let _activeController: AbortController | null = null;

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

export function useAds(params?: {
  categoryId?: string;
  search?: string;
  maxPrice?: number;
  minPrice?: number;
  condition?: 'new' | 'used' | null;
  location?: string;
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'boosted';
}) {
  // Extract individual deps to avoid object-reference re-renders
  const categoryId = params?.categoryId;
  const search = params?.search;
  const maxPrice = params?.maxPrice;
  const minPrice = params?.minPrice;
  const condition = params?.condition;
  const location = params?.location;
  const sortBy = params?.sortBy;

  const isDefault =
    !categoryId && !search && !maxPrice && !minPrice && !condition && !location && (!sortBy || sortBy === 'newest');

  const initialAds = isDefault ? (getAdsCache()?.data ?? []) : [];
  const [ads, setAds] = useState<Ad[]>(initialAds);
  const [loading, setLoading] = useState(initialAds.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const regularCountRef = useRef(0);
  const boostCountRef = useRef(0);
  const isMounted = useRef(true);

  // Use a ref to hold the latest params for loadMore and cache invalidation callbacks
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const load = useCallback(async (overrideParams?: typeof params) => {
    if (!isMounted.current) return;
    setError(null);
    const p = overrideParams ?? paramsRef.current;
    const isDefaultLoad = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice && !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');

    // Abort previous request
    if (_activeController) { try { _activeController.abort(); } catch {} }
    _activeController = new AbortController();
    const signal = _activeController.signal;

    regularCountRef.current = 0;
    boostCountRef.current = 0;
    setHasMore(true);

    const cached = isDefaultLoad ? getAdsCache() : null;
    if (cached && isMounted.current) {
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
      if (isDefaultLoad) {
        const staleCache = getAdsCache();
        if (staleCache && staleCache.data.length > 0 && isMounted.current) {
          setAds(staleCache.data);
        }
      }
    }

    if (signal.aborted || !isMounted.current) return;

    if (!fetchError && fetchedData.length > 0) {
      if (isDefaultLoad) setAdsCache(fetchedData);
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
  }, [categoryId, search, maxPrice, minPrice, condition, location, sortBy]);

  // ── Auto-load on mount and when params change ──────────────────────────────
  useEffect(() => {
    load();
  }, [load]);

  // ── Cache invalidation ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToCacheInvalidation(() => {
      const p = paramsRef.current;
      const isDefaultNow = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice && !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');
      if (isDefaultNow && isMounted.current) load();
    });
    return unsub;
  }, [load]);

  // ── App state change – refresh stale cache ──────────────────────────────────
  useEffect(() => {
    const p = paramsRef.current;
    const isDefaultNow = !p?.categoryId && !p?.search && !p?.maxPrice && !p?.minPrice && !p?.condition && !p?.location && (!p?.sortBy || p?.sortBy === 'newest');
    if (!isDefaultNow) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isMounted.current) {
        const cached = getAdsCache();
        const isStale = !cached || (Date.now() - cached.fetchedAt > CACHE_TTL_MS);
        if (isStale) load();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [load]);

  const loadMore = useCallback(async (overrideParams?: typeof params) => {
    if (loadingMore || !hasMore || !isMounted.current) return;
    setLoadingMore(true);
    const p = overrideParams ?? paramsRef.current;
    const sort = p?.sortBy ?? 'newest';

    let data: Ad[] = [];
    try {
      const result = await fetchAds({
        ...p,
        condition: p?.condition ?? undefined,
        sortBy: sort,
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

    if (!isMounted.current) return;

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
  }, [loadingMore, hasMore, categoryId, search, maxPrice, minPrice, condition, location, sortBy]);

  return { ads, loading, loadingMore, hasMore, error, load, loadMore, setAds };
}

// ─── useMyAds with AsyncStorage caching + isMounted guard ─────────────────────
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

  // ── Auto-load on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    load();
  }, [load]);

  return { ads, loading, error, load };
}