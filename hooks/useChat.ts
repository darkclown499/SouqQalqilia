import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import {
  fetchMessages,
  fetchMessagesSince,
  fetchMyConversations,
  updateLastPolled,
  markMessagesDelivered,
  Message,
  Conversation,
  savePushToken,
  getOfflineQueue,
  saveOfflineQueue,
} from '@/services/chatService';
import {
  mergeWithLocalReadState,
  computeUnreadCount,
  useChatReadStore,
} from '@/stores/chatReadStore';
import { getSupabaseClient } from '@/template';
import { CHAT_POLL_INTERVAL, READ_RECEIPT_INTERVAL } from '@/constants/config';

// Lazy-import expo-notifications to avoid crashing on web
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (_) {}

// EAS project ID from app.json extra.eas.projectId
const EAS_PROJECT_ID = 'c102ae5b-583e-4af3-9643-7f32b9e5f1b1';

// AsyncStorage key for caching the last registered token (avoids redundant DB writes)
const PUSH_TOKEN_CACHE_KEY = 'push_token_registered_v1';

export async function requestNotificationPermissions(): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[PushToken] Current permission status:', existingStatus);
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[PushToken] After requesting permission:', finalStatus);
    }
    if (finalStatus !== 'granted') {
      console.warn('[PushToken] Permission denied — notifications will not work.');
      return;
    }
    await registerPushToken();
  } catch (e: any) {
    console.error('[PushToken] requestNotificationPermissions error:', e?.message ?? e);
  }
}

export async function registerPushToken(): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    const newToken: string | undefined = tokenData?.data;
    if (!newToken) {
      console.warn('[PushToken] getExpoPushTokenAsync returned empty token.');
      return;
    }
    console.log('[PushToken] ✅ Expo Push Token:', newToken);

    let cached: string | null = null;
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      cached = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
    } catch { /* optional cache */ }

    if (cached === newToken) {
      console.log('[PushToken] Token unchanged — skipping DB write.');
      return;
    }

    await savePushToken(newToken);
    console.log('[PushToken] ✅ Token saved to database.');

    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(PUSH_TOKEN_CACHE_KEY, newToken);
    } catch { /* cache write failure is non-critical */ }
  } catch (e: any) {
    console.error('[PushToken] registerPushToken error:', e?.message ?? e);
  }
}

// ─── Adaptive polling intervals ───────────────────────────────────────────────
// Active (screen focused + app foreground): 2500ms  → fast, responsive
// Inactive (app backgrounded OR screen unfocused):  8000ms → saves ~60% battery
const BASE_POLL_MS     = 2500;
const INACTIVE_POLL_MS = 8000;
const MAX_BACKOFF_MS   = 32_000;

function nextBackoff(currentMs: number): number {
  return Math.min(currentMs * 2, MAX_BACKOFF_MS);
}

// ─── useMessages ──────────────────────────────────────────────────────────────
// Visibility-based adaptive polling:
// • App active + screen focused  → 2500ms  (full responsiveness)
// • App backgrounded             → 8000ms  (battery saving mode)
// • Network failure              → exponential backoff up to 32s
// Incremental fetch: only messages newer than last known timestamp

export interface UseMessagesResult {
  messages: Message[];
  loading: boolean;
  refreshing: boolean;
  otherTyping: boolean;
  isOnline: boolean;
  reload: () => Promise<void>;
  pollSilent: () => Promise<void>;
  appendMessage: (msg: Message) => void;
  updateMessage: (tempId: string, real: Message) => void;
  markReadLocally: (currentUserId: string) => void;
  markDeliveredLocally: (currentUserId: string) => void;
  removeMessage: (id: string) => void;
}

export function useMessages(
  conversationId: string,
  isBuyer: boolean | null,
  /** Current user ID — used to auto-mark messages as delivered on first poll */
  currentUserId?: string,
): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const lastCreatedAtRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false);
  const currentPollDelayRef = useRef(BASE_POLL_MS);
  const failureCountRef = useRef(0);
  // Visibility tracking — both must be true for fast polling
  const isAppActiveRef = useRef(true);    // AppState === 'active'
  const isScreenFocusedRef = useRef(true); // screen is in foreground (always true for now, extendable)

  // ─── Realtime subscription for read receipts ──────────────────────────────
  const realtimeChannelRef = useRef<any>(null);

  const setupRealtimeSubscription = useCallback(() => {
    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }

    if (!conversationId || !currentUserId) return;

    const supabase = getSupabaseClient();

    // Create a channel for this conversation
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const updated = payload.new as Message;
          // Only react to changes in read_at or delivered_at fields
          const old = payload.old as Message;
          const readChanged = updated.read_at !== old.read_at;
          const deliveredChanged = updated.delivered_at !== old.delivered_at;

          if (!readChanged && !deliveredChanged) return;

          // Update the local messages state
          setMessages(prev => {
            const existing = prev.find(m => m.id === updated.id);
            if (!existing) return prev;

            // Only update if the timestamp actually changed
            const needsUpdate =
              (readChanged && updated.read_at !== existing.read_at) ||
              (deliveredChanged && updated.delivered_at !== existing.delivered_at);

            if (!needsUpdate) return prev;

            return prev.map(m =>
              m.id === updated.id
                ? {
                    ...m,
                    read_at: updated.read_at ?? m.read_at,
                    delivered_at: updated.delivered_at ?? m.delivered_at,
                  }
                : m
            );
          });
        }
      )
      .subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to messages:${conversationId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Error subscribing to messages:${conversationId}`);
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
    };
  }, [conversationId, currentUserId]);

  /** Effective poll interval based on current visibility */
  const getEffectivePollMs = useCallback((): number => {
    const isVisible = isAppActiveRef.current && isScreenFocusedRef.current;
    if (!isVisible) return INACTIVE_POLL_MS;
    if (currentPollDelayRef.current > BASE_POLL_MS) return currentPollDelayRef.current; // backoff active
    return BASE_POLL_MS;
  }, []);

  const scheduleNextPoll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = getEffectivePollMs();
    intervalRef.current = setInterval(() => pollSilentRef.current(), ms);
  }, [getEffectivePollMs]);

  const pollSilent = useCallback(async () => {
    if (!conversationId || pollingRef.current) return;
    if (!isAppActiveRef.current) return; // never poll when backgrounded
    pollingRef.current = true;
    try {
      const since = lastCreatedAtRef.current;

      if (since) {
        // ── Incremental fetch ──────────────────────────────────────────────
        const { data: newMsgs, typing, error } = await fetchMessagesSince(
          conversationId, since, isBuyer, currentUserId,
        );

        if (error) {
          failureCountRef.current += 1;
          currentPollDelayRef.current = nextBackoff(currentPollDelayRef.current);
          setIsOnline(false);
          scheduleNextPoll();
          return;
        }

        if (failureCountRef.current > 0) {
          failureCountRef.current = 0;
          currentPollDelayRef.current = BASE_POLL_MS;
          setIsOnline(true);
          scheduleNextPoll();
        }

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const trulyNew = newMsgs.filter(m => !existingIds.has(m.id));

          // ── Sync delivered_at + read_at on MY sent messages ───────────────
          // When the other side marks a message as delivered/read, the next
          // incremental poll by the sender sees the updated row via newMsgs.
          // We also re-fetch existing message rows to catch status changes.
          const updated = prev.map(m => {
            const fresh = newMsgs.find(nm => nm.id === m.id);
            if (!fresh) return m;
            // Only update status fields — never downgrade
            return {
              ...m,
              delivered_at: fresh.delivered_at ?? m.delivered_at,
              read_at:      fresh.read_at      ?? m.read_at,
            };
          });

          if (trulyNew.length === 0) return updated;
          const merged = [...updated, ...trulyNew];
          lastCreatedAtRef.current = merged[merged.length - 1].created_at;
          return merged;
        });

        if (isBuyer !== null) {
          if (typing !== null) {
            setOtherTyping(Date.now() - new Date(typing).getTime() < 4000);
          } else {
            setOtherTyping(false);
          }
        }

      } else {
        // ── Full fetch (first poll / after unmount) ────────────────────────
        const { data, error } = await fetchMessages(conversationId);
        if (error) {
          failureCountRef.current += 1;
          currentPollDelayRef.current = nextBackoff(currentPollDelayRef.current);
          setIsOnline(false);
          scheduleNextPoll();
          return;
        }
        if (failureCountRef.current > 0) {
          failureCountRef.current = 0;
          currentPollDelayRef.current = BASE_POLL_MS;
          setIsOnline(true);
          scheduleNextPoll();
        }
        if (data.length > 0) {
          setMessages(data);
          lastCreatedAtRef.current = data[data.length - 1].created_at;
          // Auto-mark incoming messages as delivered on first load
          if (currentUserId) {
            markMessagesDelivered(conversationId, currentUserId).catch(() => {});
          }
        }
      }

      if (conversationId) {
        updateLastPolled(conversationId, isBuyer).catch(() => {});
      }
    } finally {
      pollingRef.current = false;
    }
  }, [conversationId, isBuyer, currentUserId, scheduleNextPoll]);

  const pollSilentRef = useRef(pollSilent);
  useEffect(() => { pollSilentRef.current = pollSilent; }, [pollSilent]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const { data } = await fetchMessages(conversationId);
    setMessages(data);
    if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].created_at;
    setRefreshing(false);
  }, [conversationId]);

  const appendMessage = useCallback((msg: Message) => {
    setMessages(prev => {
      if (prev.find(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const updateMessage = useCallback((tempId: string, real: Message) => {
    setMessages(prev => {
      const updated = prev.map(m => m.id === tempId ? real : m);
      const sorted = [...updated].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      lastCreatedAtRef.current = sorted[sorted.length - 1]?.created_at ?? lastCreatedAtRef.current;
      return updated;
    });
  }, []);

  /**
   * Immediately mark all messages from the other party as delivered in local state.
   * Provides instant UI feedback before the DB response.
   */
  const markDeliveredLocally = useCallback((uid: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.sender_id !== uid && !m.delivered_at
          ? { ...m, delivered_at: new Date().toISOString() }
          : m
      )
    );
  }, []);

  /**
   * Immediately mark all messages from the other party as read in local state.
   */
  const markReadLocally = useCallback((uid: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.sender_id !== uid && !m.read_at
          ? { ...m, read_at: new Date().toISOString() }
          : m
      )
    );
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  // ─── Main effect: fetch initial messages + polling + realtime ─────────────
  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    currentPollDelayRef.current = BASE_POLL_MS;
    failureCountRef.current = 0;

    // 1. Initial fetch
    fetchMessages(conversationId).then(({ data }) => {
      setMessages(data);
      if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].created_at;
      setLoading(false);
      if (currentUserId && data.length > 0) {
        markMessagesDelivered(conversationId, currentUserId).catch(() => {});
      }
    });

    // 2. Polling interval
    intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);

    // 3. Realtime subscription for read receipts
    const cleanupRealtime = setupRealtimeSubscription();

    // 4. App state listener for adaptive polling
    const handleAppState = (state: AppStateStatus) => {
      const wasActive = isAppActiveRef.current;
      isAppActiveRef.current = state === 'active';

      if (state === 'active' && !wasActive) {
        currentPollDelayRef.current = BASE_POLL_MS;
        failureCountRef.current = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);
        pollSilentRef.current(); // immediate poll on resume
      } else if (state !== 'active') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), INACTIVE_POLL_MS);
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    // ─── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      appStateSub.remove();
      if (cleanupRealtime) cleanupRealtime();
      lastCreatedAtRef.current = null;
      pollingRef.current = false;
    };
  }, [conversationId, currentUserId, setupRealtimeSubscription]);

  useEffect(() => {
    if (isBuyer === null) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => pollSilentRef.current(), currentPollDelayRef.current);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isBuyer]);

  return {
    messages,
    loading,
    refreshing,
    otherTyping,
    isOnline,
    reload,
    pollSilent,
    appendMessage,
    updateMessage,
    markReadLocally,
    markDeliveredLocally,
    removeMessage,
  };
}

// ─── Global unread refresh bridge ─────────────────────────────────────────────
// Module-level reference — only one instance should own it at a time.
// _layout.tsx mounts first and registers its refreshUnread. When messages.tsx
// also mounts (tab activated), it overrides the reference. On unmount, only
// clear if the current reference still belongs to this instance.
let _globalRefreshUnread: (() => Promise<void>) | null = null;
let _globalRefreshInstance = 0; // monotonic counter prevents stale teardown

export function triggerUnreadRefresh(): void {
  _globalRefreshUnread?.().catch(() => {});
}

// ─── useConversations ─────────────────────────────────────────────────────────

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Subscribe to the chat read store — re-compute badge when user marks a conv read
  const _storeVersion = useChatReadStore();

  const setBadge = useCallback(async (count: number) => {
    if (!Notifications || Platform.OS === 'web') return;
    try { await Notifications.setBadgeCountAsync(count); } catch (_) {}
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      // Re-fetch conversations so mergeWithLocalReadState can protect local marks
      const convResult = await fetchMyConversations();
      const merged = mergeWithLocalReadState(convResult.data);
      setConversations(merged);
      const real = computeUnreadCount(merged);
      setUnreadCount(real);
      prevUnreadRef.current = real;
      await setBadge(real);
    } catch (_) {}
  }, [setBadge]);

  const load = useCallback(async (showSpinner = false) => {
    const supabaseCheck = getSupabaseClient();
    const { data: { user: currentUser } } = await supabaseCheck.auth.getUser();
    if (!currentUser) {
      setConversations([]);
      setUnreadCount(0);
      if (showSpinner) setLoading(false);
      return;
    }

    if (showSpinner) setLoading(true);

    try {
      const [convResult] = await Promise.all([fetchMyConversations()]);

      // ── Local-First merge: protect optimistic read marks ───────────────
      // mergeWithLocalReadState() forces unread_count to 0 for any conversation
      // the user has already swiped-to-read, UNLESS a new message arrived after
      // the mark (server count grew → the store entry is evicted automatically).
      const merged = mergeWithLocalReadState(convResult.data);
      setConversations(merged);
      if (showSpinner) setLoading(false);

      // Compute badge from the merged list (locally-read convs already have count=0)
      const newCount = computeUnreadCount(merged);
      setUnreadCount(newCount);
      prevUnreadRef.current = newCount;
      await setBadge(newCount);
    } catch {
      if (showSpinner) setLoading(false);
    }
  }, [setBadge]);

  useEffect(() => {
    const myInstance = ++_globalRefreshInstance;
    _globalRefreshUnread = refreshUnread;
    return () => {
      // Only clear the reference if this instance is still the active owner.
      // Prevents _layout.tsx unmounting from nullifying messages.tsx registration.
      if (_globalRefreshInstance === myInstance) {
        _globalRefreshUnread = null;
      }
    };
  }, [refreshUnread]);

  useEffect(() => {
    load(true);
    intervalRef.current = setInterval(() => load(false), CHAT_POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  // ── Stable ref to latest conversations ──────────────────────────────────────
  // Allows the store-version effect to read the current list without
  // adding `conversations` to its deps (which would create an infinite loop).
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // ── Re-compute badge whenever the store version changes ──────────────────
  // Fires synchronously after markConversationRead() or rollbackConversationRead().
  //
  // ⚠️  DO NOT call setConversations(merged) here and do NOT include
  //     `conversations` in this effect's deps — both would create an infinite
  //     loop: setConversations → new array ref → effect re-runs → ∞.
  //
  //     MessagePreview reads the store directly via shouldOverrideServerCount(),
  //     so row-level UI (badge, unread bar) already updates on its own.
  //     This effect only needs to sync the numeric badge counter.
  useEffect(() => {
    const current = conversationsRef.current;
    if (current.length === 0) return;
    const merged = mergeWithLocalReadState(current);
    const newCount = computeUnreadCount(merged);
    if (newCount !== prevUnreadRef.current) {
      setUnreadCount(newCount);
      prevUnreadRef.current = newCount;
      setBadge(newCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_storeVersion, setBadge]); // ← intentionally omits `conversations`

  return {
    conversations,
    loading,
    reload: () => load(true),
    unreadCount,
    refreshUnread,
    // Legacy alias — kept for backward compat with messages.tsx
    markConversationReadLocally: (_id: string) => { /* now handled via store */ },
  };
}