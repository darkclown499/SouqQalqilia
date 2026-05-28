import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { fetchMessages, fetchMyConversations, Message, Conversation, savePushToken } from '@/services/chatService';
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
    // Note: setNotificationHandler is called synchronously in _layout.tsx
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

// ─── useMessages ───────────────────────────────────────────────────────────────

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Silent background poll — never shows spinner */
  const pollSilent = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await fetchMessages(conversationId);
    if (data.length > 0) setMessages(data);
  }, [conversationId]);

  /** Manual pull-to-refresh — shows refreshing spinner */
  const reload = useCallback(async () => {
    setRefreshing(true);
    const { data } = await fetchMessages(conversationId);
    setMessages(data);
    setRefreshing(false);
  }, [conversationId]);

  /** Optimistic append: add message instantly before DB confirms */
  const appendMessage = useCallback((msg: Message) => {
    setMessages(prev => {
      if (prev.find(m => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  /** Update a message in-place (e.g. replace temp with real after send) */
  const updateMessage = useCallback((tempId: string, real: Message) => {
    setMessages(prev => prev.map(m => m.id === tempId ? real : m));
  }, []);

  /**
   * Immediately mark all messages from the other party as read in local state.
   * Call this right after markMessagesRead() DB call so receipts update instantly
   * without waiting for the next poll cycle.
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

  useEffect(() => {
    if (!conversationId) return;
    // Initial load
    fetchMessages(conversationId).then(({ data }) => {
      setMessages(data);
      setInitialLoading(false);
    });
    // Fast background polling for read-receipts and new messages
    intervalRef.current = setInterval(pollSilent, READ_RECEIPT_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [conversationId]);

  return { messages, loading: initialLoading, refreshing, reload, pollSilent, appendMessage, updateMessage, markReadLocally };
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
    // First get all conversation IDs the user belongs to
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
    // Optimistic: instant UI clear
    setUnreadCount(0);
    prevUnreadRef.current = 0;
    await setBadge(0);

    // Confirm from DB (might be > 0 if other conversations have unread)
    try {
      const real = await fetchUnreadCount();
      setUnreadCount(real);
      prevUnreadRef.current = real;
      await setBadge(real);
    } catch (_) {}
  }, [fetchUnreadCount, setBadge]);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);

    try {
      const [convResult] = await Promise.all([fetchMyConversations()]);
      setConversations(convResult.data);
      if (showSpinner) setLoading(false);

      // Unread count — derive from already-fetched conversations (no extra round-trip)
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
