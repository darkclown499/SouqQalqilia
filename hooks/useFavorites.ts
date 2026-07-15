import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  fetchMyFavoriteIds,
  fetchMyFavoriteAds,
  toggleFavorite,
} from '@/services/favoritesService';
import { Ad } from '@/services/adsService';

/** Provides the set of favorited ad IDs for the current user */
export function useFavoriteIds() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  // Guard against double-tap during async toggle
  const togglingRef = React.useRef(new Set<string>());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const { data } = await fetchMyFavoriteIds();
      if (isMounted.current) setIds(new Set(data));
    } catch (e) {
      // silent — favorites are non-critical
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (adId: string) => {
    // Prevent concurrent double-tap on the same ad
    if (togglingRef.current.has(adId)) return;
    togglingRef.current.add(adId);

    // Read the CURRENT state inside the functional updater to avoid stale closures
    let wasFav = false;
    setIds(prev => {
      wasFav = prev.has(adId);
      const next = new Set(prev);
      if (wasFav) next.delete(adId);
      else next.add(adId);
      return next;
    });

    // Yield to let the state update flush
    await Promise.resolve();

    const { error } = await toggleFavorite(adId, wasFav);
    togglingRef.current.delete(adId);
    if (error) {
      // Revert on failure
      setIds(prev => {
        const next = new Set(prev);
        if (wasFav) next.add(adId);
        else next.delete(adId);
        return next;
      });
    }
  }, []);

  return { ids, loading, toggle, reload: load };
}

/** Provides the list of favorited ads with full details */
export function useFavoriteAds() {
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
    setLoading(true);
    try {
      const { data, error: fetchError } = await fetchMyFavoriteAds();
      if (isMounted.current) {
        setAds(data);
        setError(fetchError);
      }
    } catch (e: any) {
      if (isMounted.current) setError(e?.message ?? 'Failed to load favorites');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ads, loading, error, load };
}
