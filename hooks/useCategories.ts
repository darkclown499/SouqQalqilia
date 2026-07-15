import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchCategories, Category } from '@/services/categoriesService';

const CACHE_KEY = 'categories_cache_v1';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CategoriesCache {
  data: Category[];
  fetchedAt: number;
}

async function loadCache(): Promise<CategoriesCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CategoriesCache = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCache(data: Category[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch { /* non-critical */ }
}

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
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);

    // Show cached data immediately
    const cached = await loadCache();
    if (cached && isMounted.current) {
      setCategories(cached.data);
      setLoading(false);
      // Still refresh in the background
      fetchCategories().then(({ data, error: fetchError }) => {
        if (!isMounted.current) return;
        if (!fetchError && data.length > 0) {
          setCategories(data);
          saveCache(data);
        }
      }).catch(() => {});
      return;
    }

    // No cache, do fresh fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const { data, error: fetchError } = await fetchCategories();
      clearTimeout(timeout);
      if (!isMounted.current) return;
      if (fetchError) {
        setError(fetchError);
      } else {
        setCategories(data);
        setError(null);
        saveCache(data);
      }
    } catch (e: any) {
      clearTimeout(timeout);
      if (!isMounted.current) return;
      if (e.name === 'AbortError') {
        setError('Request timed out. Please check your connection.');
      } else {
        setError(e?.message ?? 'Failed to load categories');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, error, reload: load };
}
