/**
 * cartStore — Global cross-store cart mirror
 *
 * Each store page (app/store/[id].tsx) still owns its own cart state locally
 * (for instant UI responsiveness), but write-throughs its cart into this
 * module-level store on every change. This lets other screens (e.g. the
 * "سلتي" tab) see a live summary of every store the user currently has
 * items in, without lifting all the per-store cart logic into a shared
 * reducer.
 *
 * Follows the same useSyncExternalStore + AsyncStorage pattern as
 * chatReadStore.ts for consistency with the rest of the codebase.
 */

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export interface CartProductLike {
  id: string;
  name: string;
  name_ar?: string;
  price: number;
  image_url?: string | null;
}

export interface StoreCartEntry {
  storeId: string;
  storeName: string;
  storeLogo?: string | null;
  items: Record<string, { product: CartProductLike; qty: number }>;
  updatedAt: number;
}

const STORAGE_KEY = 'global_cart_store_v1';

let _carts: Map<string, StoreCartEntry> = new Map();
let _version = 0;
const _listeners = new Set<() => void>();

function _notify(): void {
  _version++;
  _listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

function _getAsyncStorage(): any | null {
  if (Platform.OS === 'web') return null;
  try {
    return (require('@react-native-async-storage/async-storage') as any).default;
  } catch {
    return null;
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function _debouncedSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    _saveToStorage();
  }, 300);
}

async function _saveToStorage(): Promise<void> {
  const AsyncStorage = _getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    const obj: Record<string, StoreCartEntry> = {};
    _carts.forEach((entry, id) => { obj[id] = entry; });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* non-critical */ }
}

async function _loadFromStorage(): Promise<void> {
  const AsyncStorage = _getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: Record<string, StoreCartEntry> = JSON.parse(raw);
    let any = false;
    Object.entries(parsed).forEach(([id, entry]) => {
      if (!entry || typeof entry !== 'object' || !entry.items) return;
      if (Object.keys(entry.items).length === 0) return;
      _carts.set(id, entry);
      any = true;
    });
    if (any) _notify();
  } catch { /* corrupt storage — start empty */ }
}

_loadFromStorage();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Overwrite the full item map for one store's cart (called on local cart change). */
export function setStoreCart(
  storeId: string,
  meta: { storeName: string; storeLogo?: string | null },
  items: Record<string, { product: CartProductLike; qty: number }>,
): void {
  const hasItems = Object.keys(items).length > 0;
  if (!hasItems) {
    if (_carts.has(storeId)) {
      _carts.delete(storeId);
      _notify();
      _debouncedSave();
    }
    return;
  }
  _carts.set(storeId, {
    storeId,
    storeName: meta.storeName,
    storeLogo: meta.storeLogo ?? null,
    items,
    updatedAt: Date.now(),
  });
  _notify();
  _debouncedSave();
}

/** Remove a store's cart entirely (e.g. after checkout is confirmed). */
export function clearStoreCart(storeId: string): void {
  if (_carts.has(storeId)) {
    _carts.delete(storeId);
    _notify();
    _debouncedSave();
  }
}

export function getStoreCart(storeId: string): StoreCartEntry | undefined {
  return _carts.get(storeId);
}

function _allCarts(): StoreCartEntry[] {
  return Array.from(_carts.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function _totalItemCount(): number {
  let sum = 0;
  _carts.forEach(entry => {
    Object.values(entry.items).forEach(({ qty }) => { sum += qty; });
  });
  return sum;
}

// ─── useSyncExternalStore plumbing ────────────────────────────────────────────

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function _getSnapshot(): number {
  return _version;
}

/** Live view of every store the user currently has items in, plus a total badge count. */
export function useCartSummary(): { carts: StoreCartEntry[]; totalCount: number } {
  useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
  return { carts: _allCarts(), totalCount: _totalItemCount() };
}
