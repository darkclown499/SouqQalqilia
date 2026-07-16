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
const BASE_POLL_MS     = 2500;
const INACTIVE_POLL_MS = 8000;
const MAX_BACKOFF_MS   = 32_000;

function nextBackoff(currentMs: number): number {
  return Math.min(currentMs * 2, MAX_BACKOFF_MS);
}

// ─── useMessages ──────────────────────────────────────────────────────────────
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
  const isAppActiveRef = useRef(true);
  const isScreenFocusedRef = useRef(true);

  // ─── Realtime subscription for read receipts ──────────────────────────────
  const realtimeChannelRef = useRef<any>(null);

  const setupRealtimeSubscription = useCallback(() => {
    if (realtimeChannelRef.current) {
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }

    if (!conversationId || !currentUserId) return;

    const supabase = getSupabaseClient();
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
          const old = payload.old as Message;
          const readChanged = updated.read_at !== old.read_at;
          const deliveredChanged = updated.delivered_at !== old.delivered_at;

          if (!readChanged && !deliveredChanged) return;

          setMessages(prev => {
            const existing = prev.find(m => m.id === updated.id);
            if (!existing) return prev;
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

  const getEffectivePollMs = useCallback((): number => {
    const isVisible = isAppActiveRef.current && isScreenFocusedRef.current;
    if (!isVisible) return INACTIVE_POLL_MS;
    if (currentPollDelayRef.current > BASE_POLL_MS) return currentPollDelayRef.current;
    return BASE_POLL_MS;
  }, []);

  const scheduleNextPoll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = getEffectivePollMs();
    intervalRef.current = setInterval(() => pollSilentRef.current(), ms);
  }, [getEffectivePollMs]);

  const pollSilent = useCallback(async () => {
    if (!conversationId || pollingRef.current) return;
    if (!isAppActiveRef.current) return;
    pollingRef.current = true;
    try {
      const since = lastCreatedAtRef.current;

      if (since) {
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
          const updated = prev.map(m => {
            const fresh = newMsgs.find(nm => nm.id === m.id);
            if (!fresh) return m;
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

  const markDeliveredLocally = useCallback((uid: string) => {
    setMessages(prev =>
      prev.map(m =>
        m.sender_id !== uid && !m.delivered_at
          ? { ...m, delivered_at: new Date().toISOString() }
          : m
      )
    );
  }, []);

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

  // ─── Main effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    setLoading(true);
    currentPollDelayRef.current = BASE_POLL_MS;
    failureCountRef.current = 0;

    fetchMessages(conversationId).then(({ data }) => {
      setMessages(data);
      if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].created_at;
      setLoading(false);
      if (currentUserId && data.length > 0) {
        markMessagesDelivered(conversationId, currentUserId).catch(() => {});
      }
    });

    intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);
    const cleanupRealtime = setupRealtimeSubscription();

    const handleAppState = (state: AppStateStatus) => {
      const wasActive = isAppActiveRef.current;
      isAppActiveRef.current = state === 'active';

      if (state === 'active' && !wasActive) {
        currentPollDelayRef.current = BASE_POLL_MS;
        failureCountRef.current = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), BASE_POLL_MS);
        pollSilentRef.current();
      } else if (state !== 'active') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), INACTIVE_POLL_MS);
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

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
    scheduleNextPoll();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isBuyer, scheduleNextPoll]);

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
let _globalRefreshInstance = 0;

export function triggerUnreadRefresh(): void {
  _globalRefreshUnread?.().catch(() => {});
}

// ─── useConversations ─────────────────────────────────────────────────────────
export function useConversations(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {};
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const _storeVersion = useChatReadStore();

  const setBadge = useCallback(async (count: number) => {
    if (!Notifications || Platform.OS === 'web') return;
    try { await Notifications.setBadgeCountAsync(count); } catch (_) {}
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!enabled) return;
    try {
      const convResult = await fetchMyConversations();
      if (!isMountedRef.current) return;
      const merged = mergeWithLocalReadState(convResult.data);
      setConversations(merged);
      const real = computeUnreadCount(merged);
      setUnreadCount(real);
      prevUnreadRef.current = real;
      await setBadge(real);
    } catch (_) {}
  }, [enabled, setBadge]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = useCallback(async (showSpinner = false) => {
    if (!enabled) {
      if (isMountedRef.current) {
        setConversations([]);
        setUnreadCount(0);
        if (showSpinner) setLoading(false);
      }
      return;
    }

    // Safely check auth without crashing on session errors
    let currentUser: any = null;
    try {
      const supabaseCheck = getSupabaseClient();
      const { data: { user } } = await supabaseCheck.auth.getUser();
      currentUser = user;
    } catch {
      // Not authenticated or session error — treat as unauthenticated
    }
    if (!currentUser) {
      if (isMountedRef.current) {
        setConversations([]);
        setUnreadCount(0);
        if (showSpinner) setLoading(false);
      }
      return;
    }

    if (showSpinner) setLoading(true);

    try {
      const [convResult] = await Promise.all([fetchMyConversations()]);
      if (!isMountedRef.current) return;
      const merged = mergeWithLocalReadState(convResult.data);
      setConversations(merged);
      if (showSpinner) setLoading(false);

      const newCount = computeUnreadCount(merged);
      setUnreadCount(newCount);
      prevUnreadRef.current = newCount;
      await setBadge(newCount);
    } catch {
      if (isMountedRef.current && showSpinner) setLoading(false);
    }
  }, [enabled, setBadge]);

  useEffect(() => {
    const myInstance = ++_globalRefreshInstance;
    _globalRefreshUnread = refreshUnread;
    return () => {
      if (_globalRefreshInstance === myInstance) {
        _globalRefreshUnread = null;
      }
    };
  }, [refreshUnread]);

  // Polling effect - only run if enabled
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Also clear conversations and counts when disabled
      setConversations([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    load(true);
    intervalRef.current = setInterval(() => load(false), CHAT_POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, load]);

  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Update unread count when store version changes, but only if enabled
  useEffect(() => {
    if (!enabled) return;
    const current = conversationsRef.current;
    if (current.length === 0) return;
    const merged = mergeWithLocalReadState(current);
    const newCount = computeUnreadCount(merged);
    if (newCount !== prevUnreadRef.current) {
      setUnreadCount(newCount);
      prevUnreadRef.current = newCount;
      setBadge(newCount);
    }
  }, [_storeVersion, enabled, setBadge]);

  return {
    conversations,
    loading,
    reload: () => load(true),
    unreadCount,
    refreshUnread,
  };
}