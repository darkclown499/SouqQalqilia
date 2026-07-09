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

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchMyFavoriteIds();
    setIds(new Set(data));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const toggle = useCallback(async (adId: string) => {
    // Prevent concurrent double-tap on the same ad
    if (togglingRef.current.has(adId)) return;
    togglingRef.current.add(adId);

    // Read the CURRENT state inside the functional updater to avoid stale closures
    // on rapid multi-ad toggling (W2 fix)
    let wasFav = false;
    setIds(prev => {
      wasFav = prev.has(adId);
      const next = new Set(prev);
      if (wasFav) next.delete(adId);
      else next.add(adId);
      return next;
    });

    // Yield to the event loop so the state update above is flushed before the
    // async network call, ensuring wasFav reflects the freshest snapshot.
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
  }, []);  // no dependency on `ids` — always reads latest via functional updater

  return { ids, loading, toggle, reload: load };
}

/** Provides the list of favorited ads with full details */
export function useFavoriteAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await fetchMyFavoriteAds();
    setAds(data);
    setError(error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  return { ads, loading, error, load };
}
