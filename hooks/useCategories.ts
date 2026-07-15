import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCategories, Category } from '@/services/categoriesService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'categories_cache_v1';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    // Load from cache first for instant display
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, fetchedAt } = JSON.parse(raw);
        if (Date.now() - fetchedAt < CACHE_TTL_MS && data?.length > 0) {
          if (isMounted.current) {
            setCategories(data);
            setLoading(false);
          }
        }
      }
    } catch { /* ignore cache errors */ }

    // Fetch fresh data
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const { data, error } = await fetchCategories();
      clearTimeout(timeout);
      if (isMounted.current) {
        if (!error && data.length > 0) {
          setCategories(data);
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() })).catch(() => {});
        }
        setError(error);
        setLoading(false);
      }
    } catch (e: any) {
      if (isMounted.current) {
        setError(e?.message ?? 'Failed to load categories');
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, error, reload: load };
}
