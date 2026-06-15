/**
 * chatReadStore — Local-First Read State for Conversations
 *
 * A module-level store (no Provider required) that acts as the single source
 * of truth for "which conversations have been marked read locally".
 *
 * Design principles:
 * 1. INSTANT  — UI reacts in the same frame the user swipes (zero async wait)
 * 2. PERSISTENT across re-renders — stored at module level, survives component
 *    unmount/remount and FlatList recycling
 * 3. SMART MERGE — server reloads never overwrite a locally-read conversation
 *    UNLESS a genuinely new message has arrived (higher unread_count)
 * 4. ROLLBACK  — if the DB call fails, the entry is removed and UI reverts
 * 5. SUBSCRIBE — React components use useSyncExternalStore for zero-overhead
 *    subscription with no Provider boilerplate
 */

import { useSyncExternalStore } from 'react';
import { Conversation } from '@/services/chatService';

// ─── Entry stored per-conversation ───────────────────────────────────────────
interface ReadEntry {
  /** Timestamp (ms) when the user triggered mark-as-read */
  markedAt: number;
  /**
   * The server-reported unread_count at the moment the user marked it read.
   * If the server later returns a HIGHER count it means new messages arrived
   * AFTER the mark — so we clear the entry and show the new badge.
   */
  unreadAtRead: number;
}

// ─── Module-level state ───────────────────────────────────────────────────────
let _store: Map<string, ReadEntry> = new Map();
let _version = 0; // Monotonically increasing — drives useSyncExternalStore

// ─── Listeners ────────────────────────────────────────────────────────────────
const _listeners = new Set<() => void>();

function _notify() {
  _version++;
  _listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Mark a conversation as locally read.
 * @param id           Conversation ID
 * @param currentUnread  The server unread_count right now (used to detect new arrivals)
 */
export function markConversationRead(id: string, currentUnread: number): void {
  _store.set(id, { markedAt: Date.now(), unreadAtRead: currentUnread });
  _notify();
}

/**
 * Rollback a local read mark (called when the DB call fails).
 */
export function rollbackConversationRead(id: string): void {
  _store.delete(id);
  _notify();
}

/**
 * Returns true if the conversation has been locally marked as read
 * AND no newer messages have arrived since then.
 *
 * @param id           Conversation ID
 * @param serverUnread Current server unread_count for this conversation
 */
export function isConversationLocallyRead(id: string, serverUnread: number): boolean {
  const entry = _store.get(id);
  if (!entry) return false;
  // If the server now reports MORE unread than when we marked read,
  // a new message has arrived — clear the entry and show the badge
  if (serverUnread > entry.unreadAtRead) {
    _store.delete(id);
    _notify();
    return false;
  }
  return true;
}

/**
 * Merge server-fetched conversations with local read state.
 *
 * Rules:
 * - If a conversation is in the store AND server unread_count has not grown →
 *   force unread_count to 0 in the returned list (protect optimistic update)
 * - If server unread_count is HIGHER than at time of local mark →
 *   a new message arrived; clear the local entry; return real server count
 *
 * This is the key guard that prevents server polling from reverting the UI.
 */
export function mergeWithLocalReadState(conversations: Conversation[]): Conversation[] {
  return conversations.map(conv => {
    const serverUnread: number = (conv as any).unread_count ?? 0;
    const entry = _store.get(conv.id);
    if (!entry) return conv;

    if (serverUnread > entry.unreadAtRead) {
      // New message arrived after we marked read — evict from store
      _store.delete(conv.id);
      _notify();
      return conv; // show real badge
    }

    // Still locally read — force unread_count to 0
    return { ...conv, unread_count: 0 } as any;
  });
}

/**
 * Compute the total unread count from a merged (post-merge) conversations array.
 * Sums unread_count across all conversations (already 0 for locally-read ones).
 */
export function computeUnreadCount(conversations: Conversation[]): number {
  return conversations.reduce((sum, c) => sum + ((c as any).unread_count ?? 0), 0);
}

// ─── useSyncExternalStore plumbing ────────────────────────────────────────────

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/** Returns the current version number — used as snapshot for useSyncExternalStore */
function _getSnapshot(): number {
  return _version;
}

/**
 * React hook: subscribe to the chat read store.
 * Returns the current snapshot version (integer).
 * Use isConversationLocallyRead() or mergeWithLocalReadState() after this.
 *
 * Components re-render only when the store version changes (a mark/rollback happened).
 */
export function useChatReadStore(): number {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}
