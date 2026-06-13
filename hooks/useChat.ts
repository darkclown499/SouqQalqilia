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

  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    currentPollDelayRef.current = BASE_POLL_MS;
    failureCountRef.current = 0;
    fetchMessages(conversationId).then(({ data }) => {
      setMessages(data);
      if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].created_at;
      setLoading(false);
      // Mark as delivered on initial load
      if (currentUserId && data.length > 0) {
        markMessagesDelivered(conversationId, currentUserId).catch(() => {});
      }
    });

    intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);

    // ── Visibility-based adaptive polling ─────────────────────────────────
    const handleAppState = (state: AppStateStatus) => {
      const wasActive = isAppActiveRef.current;
      isAppActiveRef.current = state === 'active';

      if (state === 'active' && !wasActive) {
        // App foregrounded: switch to fast polling immediately
        currentPollDelayRef.current = BASE_POLL_MS;
        failureCountRef.current = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);
        pollSilentRef.current(); // immediate poll on resume
      } else if (state !== 'active') {
        // App backgrounded: switch to slow interval to save battery (~60%)
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), INACTIVE_POLL_MS);
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      appStateSub.remove();
      lastCreatedAtRef.current = null;
      pollingRef.current = false;
    };
  }, [conversationId]);

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
let _globalRefreshUnread: (() => Promise<void>) | null = null;

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

  const setBadge = useCallback(async (count: number) => {
    if (!Notifications || Platform.OS === 'web') return;
    try { await Notifications.setBadgeCountAsync(count); } catch (_) {}
  }, []);

  const fetchUnreadCount = useCallback(async (): Promise<number> => {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    const { data: convRows } = await supabase
      .from('conversations')
      .select('id')
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);
    const convIds = (convRows ?? []).map((c: any) => c.id);
    if (convIds.length === 0) return 0;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .neq('sender_id', user.id)
      .in('conversation_id', convIds);
    return count ?? 0;
  }, []);

  const refreshUnread = useCallback(async () => {
    setUnreadCount(0);
    prevUnreadRef.current = 0;
    await setBadge(0);
    try {
      const real = await fetchUnreadCount();
      setUnreadCount(real);
      prevUnreadRef.current = real;
      await setBadge(real);
    } catch (_) {}
  }, [fetchUnreadCount, setBadge]);

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
      setConversations(convResult.data);
      if (showSpinner) setLoading(false);

      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setUnreadCount(0); return; }

      const convIds = convResult.data.map((c: any) => c.id);
      let newCount = 0;
      if (convIds.length > 0) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null)
          .neq('sender_id', user.id)
          .in('conversation_id', convIds);
        newCount = count ?? 0;
      }

      setUnreadCount(newCount);
      prevUnreadRef.current = newCount;
      await setBadge(newCount);
    } catch {
      if (showSpinner) setLoading(false);
    }
  }, [setBadge]);

  useEffect(() => {
    _globalRefreshUnread = refreshUnread;
    return () => { _globalRefreshUnread = null; };
  }, [refreshUnread]);

  useEffect(() => {
    load(true);
    intervalRef.current = setInterval(() => load(false), CHAT_POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  return {
    conversations,
    loading,
    reload: () => load(true),
    unreadCount,
    refreshUnread,
  };
}
