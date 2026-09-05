/**
 * orderHistoryStore — Local-only "My Orders" history
 *
 * Orders in this app are confirmed by sending a WhatsApp message directly to
 * the store owner — there is no backend `orders` table, so nothing is
 * recorded server-side. To give users a "طلباتي" (My Orders) screen without
 * a backend change, we log a copy of each confirmed order to on-device
 * storage only. This is per-device (not synced across a user's devices),
 * but zero-cost and immediately available.
 *
 * Same useSyncExternalStore + AsyncStorage pattern as chatReadStore.ts.
 */

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export interface OrderHistoryItem {
  name: string;
  qty: number;
  price: number;
}

export interface OrderHistoryEntry {
  id: string;
  storeId: string;
  storeName: string;
  storeLogo?: string | null;
  items: OrderHistoryItem[];
  total: number;
  orderType: 'delivery' | 'pickup';
  createdAt: number;
}

const STORAGE_KEY = 'order_history_store_v1';
const MAX_ENTRIES = 100;

let _orders: OrderHistoryEntry[] = [];
let _loaded = false;
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

async function _saveToStorage(): Promise<void> {
  const AsyncStorage = _getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_orders));
  } catch { /* non-critical */ }
}

async function _loadFromStorage(): Promise<void> {
  const AsyncStorage = _getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    _loaded = true;
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      _orders = parsed;
      _notify();
    }
  } catch {
    _loaded = true;
  }
}

_loadFromStorage();

// ─── Public API ───────────────────────────────────────────────────────────────

export function saveOrder(entry: Omit<OrderHistoryEntry, 'id' | 'createdAt'>): void {
  const record: OrderHistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  _orders = [record, ..._orders].slice(0, MAX_ENTRIES);
  _notify();
  _saveToStorage();
}

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function _getSnapshot(): number {
  return _version;
}

export function useOrderHistory(): OrderHistoryEntry[] {
  useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
  return _orders;
}
