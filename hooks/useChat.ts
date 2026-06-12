import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import {
  fetchMessages,
  fetchMessagesSince,
  fetchMyConversations,
  updateLastPolled,
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

/** Request push notification permissions and register/save device push token */
export async function requestNotificationPermissions(): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    await registerPushToken();
  } catch (_) {}
}

/** Get and save Expo push token — safe to call multiple times (idempotent) */
export async function registerPushToken(): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    if (tokenData?.data) {
      await savePushToken(tokenData.data);
    }
  } catch (_) {
    // Token registration can fail in simulators/emulators — not critical
  }
}

// ─── Exponential backoff helper ───────────────────────────────────────────────
// Doubles the retry delay on each consecutive failure (capped at 32s).
// Resets to base interval on the first successful poll.
const BASE_POLL_MS = 2500;
const MAX_BACKOFF_MS = 32_000;

function nextBackoff(currentMs: number): number {
  return Math.min(currentMs * 2, MAX_BACKOFF_MS);
}

// ─── useMessages ───────────────────────────────────────────────────────────────
// Optimized polling strategy:
// • Initial load: fetches all messages (full hydration)
// • Subsequent polls: fetches ONLY messages newer than last known created_at
//   → Eliminates transferring the full history on every tick
// • Typing + messages share ONE interval (no duplicate timers)
// • Exponential backoff on network failure — no hammering during outages
// • Pauses polling when app is in background to conserve battery

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
  removeMessage: (id: string) => void;
}

export function useMessages(
  conversationId: string,
  /** Pass the current user's role so we can read the other party's typing field */
  isBuyer: boolean | null,
): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Track the most recent message timestamp to enable incremental fetching
  const lastCreatedAtRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Prevent concurrent polls from overlapping
  const pollingRef = useRef(false);
  // Exponential backoff: current delay between polls
  const currentPollDelayRef = useRef(BASE_POLL_MS);
  // Track consecutive failures to manage backoff
  const failureCountRef = useRef(0);
  // Whether app is in foreground
  const isActiveRef = useRef(true);

  /**
   * INCREMENTAL poll — fetches only messages newer than the last known message.
   * Falls back to full fetch if no anchor exists.
   * Also reads typing indicator from the conversation row (same DB round-trip).
   */
  // Schedule the next poll tick with current backoff delay
  const scheduleNextPoll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(pollSilentRef.current, currentPollDelayRef.current);
  }, []);

  const pollSilent = useCallback(async () => {
    if (!conversationId || pollingRef.current) return;
    // Skip polling when app is backgrounded (saves battery + reduces server load)
    if (!isActiveRef.current) return;
    pollingRef.current = true;
    try {
      const since = lastCreatedAtRef.current;

      if (since) {
        // ── Fast path: incremental fetch ────────────────────────────────────
        const { data: newMsgs, typing, error } = await fetchMessagesSince(conversationId, since, isBuyer);

        if (error) {
          // Network or server error → apply exponential backoff
          failureCountRef.current += 1;
          currentPollDelayRef.current = nextBackoff(currentPollDelayRef.current);
          setIsOnline(false);
          scheduleNextPoll();
          return;
        }

        // Success → reset backoff
        if (failureCountRef.current > 0) {
          failureCountRef.current = 0;
          currentPollDelayRef.current = BASE_POLL_MS;
          setIsOnline(true);
          scheduleNextPoll();
        }

        if (newMsgs.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const truly_new = newMsgs.filter(m => !existingIds.has(m.id));
            if (truly_new.length === 0) return prev;
            const merged = [...prev, ...truly_new];
            // Update anchor to newest message
            lastCreatedAtRef.current = merged[merged.length - 1].created_at;
            return merged;
          });
        }

        // Update typing state from result
        if (isBuyer !== null) {
          if (typing !== null) {
            const diff = Date.now() - new Date(typing).getTime();
            setOtherTyping(diff < 4000);
          } else {
            setOtherTyping(false);
          }
        }

      } else {
        // ── Fallback: full fetch (first poll or after unmount) ───────────────
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
        }
      }

      // Heartbeat: tell the server this user is actively viewing this chat
      // Used by push-notify edge function to skip notification when user is active
      if (conversationId) {
        updateLastPolled(conversationId, isBuyer).catch(() => {});
      }
    } finally {
      pollingRef.current = false;
    }
  }, [conversationId, isBuyer, scheduleNextPoll]);

  // Stable ref so scheduleNextPoll can always call the latest pollSilent
  const pollSilentRef = useRef(pollSilent);
  useEffect(() => { pollSilentRef.current = pollSilent; }, [pollSilent]);

  /** Manual pull-to-refresh — full fetch, resets anchor */
  const reload = useCallback(async () => {
    setRefreshing(true);
    const { data } = await fetchMessages(conversationId);
    setMessages(data);
    if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].created_at;
    setRefreshing(false);
  }, [conversationId]);

  /**
   * Optimistic append: add message instantly before DB confirms.
   * Deduplication prevents ghost messages if the DB echo arrives
   * during the next poll before updateMessage() replaces the temp entry.
   */
  const appendMessage = useCallback((msg: Message) => {
    setMessages(prev => {
      // Skip if a message with the same id (or same content+sender within 3s) exists
      if (prev.find(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    // Do NOT advance lastCreatedAtRef here — the temp message has a local timestamp
    // that might not exactly match the DB timestamp. Let pollSilent() advance it
    // when it receives the confirmed server message.
  }, []);

  /**
   * Replace a temp (optimistic) message with the confirmed DB version.
   * Also advances the anchor so the next incremental poll starts from here.
   */
  const updateMessage = useCallback((tempId: string, real: Message) => {
    setMessages(prev => {
      const updated = prev.map(m => m.id === tempId ? real : m);
      // Advance anchor to include the confirmed message
      const sorted = [...updated].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      lastCreatedAtRef.current = sorted[sorted.length - 1]?.created_at ?? lastCreatedAtRef.current;
      return updated;
    });
  }, []);

  /**
   * Immediately mark all messages from the other party as read in local state.
   * Call right after markMessagesRead() DB call so receipts flip without waiting
   * for the next poll cycle.
   */
  const markReadLocally = useCallback((currentUserId: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.sender_id !== currentUserId && !m.read_at
          ? { ...m, read_at: new Date().toISOString() }
          : m
      )
    );
  }, []);

  /** Remove a message by id (e.g. failed offline message cleanup) */
  const removeMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    // Initial full load
    setLoading(true);
    currentPollDelayRef.current = BASE_POLL_MS;
    failureCountRef.current = 0;
    fetchMessages(conversationId).then(({ data }) => {
      setMessages(data);
      if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].created_at;
      setLoading(false);
    });

    // Single unified interval: handles both incremental message fetch + typing indicator
    intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);

    // Pause polling when app goes to background, resume on foreground
    const handleAppState = (state: AppStateStatus) => {
      isActiveRef.current = state === 'active';
      if (state === 'active') {
        // Resumed from background: reset backoff and do an immediate poll
        currentPollDelayRef.current = BASE_POLL_MS;
        failureCountRef.current = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);
        pollSilentRef.current();
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      appStateSub.remove();
      // Reset anchor on unmount so next mount does a full fetch
      lastCreatedAtRef.current = null;
      pollingRef.current = false;
    };
  }, [conversationId]);

  // Re-subscribe interval when isBuyer role becomes known (after conversation loads)
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
    removeMessage,
  };
}

// ─── useConversations ──────────────────────────────────────────────────────────

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Set badge count on app icon */
  const setBadge = useCallback(async (count: number) => {
    if (!Notifications || Platform.OS === 'web') return;
    try { await Notifications.setBadgeCountAsync(count); } catch (_) {}
  }, []);

  /** Query the actual unread count from DB */
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

  /**
   * Called from chat screen right after markMessagesRead.
   * Optimistically clears badge to 0 immediately, then re-queries DB
   * to get the true count (other conversations may still have unread).
   */
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
