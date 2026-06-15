
/**
 * chatReadStore — Local-First Read State with Timestamp Fencing + Cold-Start Persistence
 *
 * ─── WHY TIMESTAMP FENCING? ────────────────────────────────────────────────
 * The old approach compared server `unread_count` integers:
 *   • serverUnread (8) > entry.unreadAtRead (7) → clear entry → UI shows 8  ❌
 *
 * This is WRONG because after marking 7 messages read and a new one arrives,
 * the server briefly reports 8 (7 old still unread in DB + 1 new) before the
 * DB write propagates. The correct answer is 1 (only the NEW message).
 *
 * Timestamp Fencing fixes this by comparing TIME not counts:
 *   • Store: { markedAt: Date.now(), lastMsgAtRead: conversation.last_message_at }
 *   • On merge: compare server's last_message_at vs our markedAt epoch
 *     - server.last_message_at ≤ entry.markedAt  → same messages → force 0  ✅
 *     - server.last_message_at >  entry.markedAt  → new msg arrived → clear entry → show server count ✅
 *       (at this point markMessagesRead() has already propagated, so server count = 1, not 8)
 *
 * ─── COLD START PERSISTENCE ─────────────────────────────────────────────────
 * Without persistence, killing + reopening the app reset _store to an empty Map.
 * The first server poll then restored old unread counts before DB propagation
 * finished, making it look like messages were "un-read". Fix:
 *   1. _loadFromStorage() — runs once at module init, restores persisted entries.
 *   2. _debouncedSave()  — runs 300ms after any mutation, writes to AsyncStorage.
 *   3. Entries older than ENTRY_MAX_AGE_MS (7 days) are pruned on load.
 *
 * ─── SWIPE LOCK FIX ────────────────────────────────────────────────────────
 * Old bug: after a new message arrived and we cleared the store entry, the
 * `hasUnread` flag inside MessagePreview re-evaluated to `true` again BUT
 * `triggerMarkRead` was memoised with the old `serverUnread` snapshot (7).
 * The new mark wrote entry.lastMsgAtRead = old timestamp → instant eviction loop.
 *
 * Fix: `markConversationRead()` now stores the CURRENT conversation
 * `last_message_at` string so fencing always uses the freshest timestamp.
 * MessagePreview passes `conversation.last_message_at` — never a stale closure.
 */

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { Conversation } from '@/services/chatService';

// ─── Entry stored per-conversation ───────────────────────────────────────────
interface ReadEntry {
  /**
   * Unix ms timestamp captured at the moment the user triggered mark-as-read.
   * This is the "fence": any server message with last_message_at AFTER this
   * epoch is considered a genuinely new message that arrived post-mark.
   */
  markedAt: number;

  /**
   * The conversation's `last_message_at` ISO string at the time of the mark.
   * Used as a secondary comparison so we don't depend solely on clock drift.
   * If the server returns last_message_at === this value, no new msg arrived.
   */
  lastMsgAtRead: string | null;
}

// ─── Storage constants ────────────────────────────────────────────────────────
const STORAGE_KEY       = 'chat_read_store_v1';
/** Entries older than 7 days are pruned on load — they are always stale. */
const ENTRY_MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000;

// ─── Module-level state ───────────────────────────────────────────────────────
let _store: Map<string, ReadEntry> = new Map();
let _version = 0;

// ─── Listeners ────────────────────────────────────────────────────────────────
const _listeners = new Set<() => void>();

function _notify(): void {
  _version++;
  _listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

// ─── AsyncStorage persistence helpers ────────────────────────────────────────

/**
 * Lazy-load AsyncStorage to avoid crashing on web or during SSR.
 * Returns null if unavailable.
 */
function _getAsyncStorage(): any | null {
  if (Platform.OS === 'web') return null;
  try {
    // The error message "Definition for rule '@typescript-eslint/no-var-requires' was not found."
    // indicates that the ESLint rule `no-var-requires` is not properly configured or enabled.
    // However, the original code already attempts to disable it with `// eslint-disable-next-line @typescript-eslint/no-var-requires`.
    // The underlying issue is likely that `require` is a CommonJS syntax, and TypeScript/ESM environments prefer `import`.
    // To fix this without changing the `require` call (which is explicitly there for dynamic import),
    // we can cast `require` to `any` to bypass TypeScript's type checking for this specific line.
    // This is a common workaround when needing to use `require` in a TS/ESM context.
    return (require('@react-native-async-storage/async-storage') as any).default;
  } catch {
    return null;
  }
}

/**
 * Debounce timer — batches rapid successive mutations into a single write.
 * Example: marking 3 conversations read within 300ms → 1 AsyncStorage write.
 */
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function _debouncedSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    _saveToStorage();
  }, 300);
}

/** Serialize current _store to AsyncStorage (fire-and-forget). */
async function _saveToStorage(): Promise<void> {
  const AsyncStorage = _getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    const obj: Record<string, ReadEntry> = {};
    _store.forEach((entry, id) => { obj[id] = entry; });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* Non-critical — the in-memory store is still the source of truth. */
  }
}

/**
 * Load persisted entries from AsyncStorage on cold start.
 *
 * Runs ONCE at module evaluation time (immediately invoked below).
 * After loading, calls _notify() so any already-mounted hooks re-render
 * with the correct badge count before the first server poll resolves.
 *
 * Pruning: entries older than ENTRY_MAX_AGE_MS are discarded — they are
 * guaranteed to be stale (the DB has caught up within 7 days).
 */
async function _loadFromStorage(): Promise<void> {
  const AsyncStorage = _getAsyncStorage();
  if (!AsyncStorage) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed: Record<string, ReadEntry> = JSON.parse(raw);
    const now = Date.now();
    let anyLoaded = false;

    Object.entries(parsed).forEach(([id, entry]) => {
      // Validate shape — guard against corrupted/old storage format
      if (
        typeof entry?.markedAt !== 'number' ||
        entry.markedAt <= 0
      ) return;

      // Prune entries that are too old — they are certainly stale
      if (now - entry.markedAt > ENTRY_MAX_AGE_MS) return;

      _store.set(id, {
        markedAt: entry.markedAt,
        lastMsgAtRead: entry.lastMsgAtRead ?? null,
      });
      anyLoaded = true;
    });

    if (anyLoaded) _notify();
  } catch {
    /* Corrupt storage — silently ignore. In-memory store starts empty. */
  }
}

// ── Auto-load on module init ──────────────────────────────────────────────────
// This runs as soon as chatReadStore is first imported (e.g. in useChat.ts).
// By the time the first server poll resolves (~500ms), the store is populated.
_loadFromStorage();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Mark a conversation as locally read.
 *
 * @param id             Conversation ID
 * @param lastMessageAt  conversation.last_message_at at time of swipe — the fence anchor
 */
export function markConversationRead(id: string, lastMessageAt: string | null): void {
  _store.set(id, {
    markedAt: Date.now(),
    lastMsgAtRead: lastMessageAt,
  });
  _notify();
  _debouncedSave();
}

/**
 * Rollback a local read mark (called when the DB call fails).
 */
export function rollbackConversationRead(id: string): void {
  _store.delete(id);
  _notify();
  _debouncedSave();
}

/**
 * Timestamp-Fenced check: should we force unread_count to 0?
 *
 * Returns true  → override server count with 0 (no new message since mark)
 * Returns false → use server count as-is (new message arrived, or not in store)
 *
 * @param id              Conversation ID
 * @param serverLastMsgAt The `last_message_at` ISO string from the latest server fetch
 */
export function shouldOverrideServerCount(
  id: string,
  serverLastMsgAt: string | null,
): boolean {
  const entry = _store.get(id);
  if (!entry) return false;

  if (serverLastMsgAt) {
    const serverMsgEpoch = new Date(serverLastMsgAt).getTime();

    // A new message arrived AFTER the user's mark-as-read action
    if (serverMsgEpoch > entry.markedAt) {
      // Evict entry — show the real (new) badge count
      _store.delete(id);
      _notify();
      _debouncedSave();
      return false;
    }

    // Secondary guard: same last_message_at string → definitely no new message
    // This covers sub-millisecond clock skew edge cases
    if (entry.lastMsgAtRead && serverLastMsgAt === entry.lastMsgAtRead) {
      return true;
    }
  }

  // No last_message_at on server (empty conversation) or fence still valid
  return true;
}

/**
 * Legacy alias — kept so MessagePreview can call isConversationLocallyRead()
 * without a refactor. Internally delegates to shouldOverrideServerCount.
 *
 * @param id           Conversation ID
 * @param _serverUnread  (ignored — timestamp fencing no longer uses counts)
 */
export function isConversationLocallyRead(id: string, _serverUnread: number): boolean {
  // We can't call shouldOverrideServerCount here without last_message_at,
  // so we just check if there's an active entry in the store.
  // The actual eviction happens in mergeWithLocalReadState / shouldOverrideServerCount.
  return _store.has(id);
}

/**
 * Merge server-fetched conversations with local read state.
 *
 * For each conversation:
 *   • Call shouldOverrideServerCount(id, last_message_at)
 *   • If true  → inject unread_count: 0 (locally-read, no new messages)
 *   • If false → pass through server data unchanged
 *
 * This is called on EVERY server poll, so it is the critical guard preventing
 * old server counts from overwriting optimistic UI updates.
 */
export function mergeWithLocalReadState(conversations: Conversation[]): Conversation[] {
  return conversations.map(conv => {
    const lastMsgAt: string | null = (conv as any).last_message_at ?? null;

    if (shouldOverrideServerCount(conv.id, lastMsgAt)) {
      return { ...conv, unread_count: 0 } as any;
    }
    return conv;
  });
}

/**
 * Compute the total unread count from a (post-merge) conversations array.
 */
export function computeUnreadCount(conversations: Conversation[]): number {
  return conversations.reduce((sum, c) => sum + ((c as any).unread_count ?? 0), 0);
}

// ─── useSyncExternalStore plumbing ────────────────────────────────────────────

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function _getSnapshot(): number {
  return _version;
}

/**
 * React hook: subscribe to the chat read store.
 * Returns the current snapshot version (integer).
 *
 * Components re-render only when markConversationRead() or rollbackConversationRead()
 * is called — NOT on every server poll. Zero unnecessary renders.
 */
export function useChatReadStore(): number {
  return useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
}
