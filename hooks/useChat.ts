import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
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
  getCachedConversations,
  cacheConversations,
  clearConversationsCache,
  getCachedMessages,
  cacheMessages,
  clearConversationCache,
  archiveConversation,
  unarchiveConversation,
  markAllMessagesRead,
  getUnreadCount,
  deleteMessageForEveryone,
  deleteMessageForUser,
  forwardMessage as forwardMessageService,
  sendTypingIndicator,
  trackChatEvent,
  markConversationAsRead,
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

const EAS_PROJECT_ID = 'c102ae5b-583e-4af3-9643-7f32b9e5f1b1';
const PUSH_TOKEN_CACHE_KEY = 'push_token_registered_v1';

// ─── دالة مساعدة لتنقية الرسائل من أي خصائص غريبة ──────────────────────────
function sanitizeMessage(msg: any): Message {
  if (!msg) return msg;
  // القائمة المسموح بها فقط
  const allowedKeys = [
    'id', 'conversation_id', 'sender_id', 'content',
    'image_url', 'message_type', 'read_at', 'delivered_at',
    'created_at', 'deleted_by', '_pending', '_failed', 'reactions'
  ];
  const sanitized: any = {};
  for (const key of allowedKeys) {
    if (key in msg) {
      sanitized[key] = msg[key];
    }
  }
  return sanitized as Message;
}

function sanitizeMessages(messages: any[]): Message[] {
  if (!messages || !Array.isArray(messages)) return [];
  return messages.map((m: any) => sanitizeMessage(m));
}

// ─── دالة مساعدة لتنقية المحادثات ────────────────────────────────────────────
function sanitizeConversation(conv: any): Conversation {
  if (!conv) return conv;
  const allowedKeys = [
    'id', 'ad_id', 'buyer_id', 'seller_id', 'last_message',
    'last_message_at', 'created_at', 'archived_at', 'unread_count',
    'buyer_typing_at', 'seller_typing_at', 'buyer_last_polled_at',
    'seller_last_polled_at', 'ads', 'buyer', 'seller',
    'buyer_name', 'seller_name', 'buyer_avatar', 'seller_avatar'
  ];
  const sanitized: any = {};
  for (const key of allowedKeys) {
    if (key in conv) {
      sanitized[key] = conv[key];
    }
  }
  return sanitized as Conversation;
}

// ─── باقي الكود ──────────────────────────────────────────────────────────────

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
  deleteMessage: (messageId: string, forEveryone?: boolean) => Promise<void>;
  forwardMessage: (messageId: string, targetConversationId: string) => Promise<Message | null>;
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
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  const lastCreatedAtRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false);
  const currentPollDelayRef = useRef(BASE_POLL_MS);
  const failureCountRef = useRef(0);
  const isAppActiveRef = useRef(true);
  const isScreenFocusedRef = useRef(true);
  const isMountedRef = useRef(true);
  const hasMarkedReadRef = useRef(false);

  // ─── دوال أساسية (مع تنقية البيانات) ──────────────────────────────────────

  const appendMessage = useCallback((msg: Message) => {
    const clean = sanitizeMessage(msg);
    setMessages(prev => {
      const exists = prev.some(m => m.id === clean.id);
      if (exists) return prev;
      const updated = [...prev, clean];
      cacheMessages(conversationId, updated).catch(() => {});
      return updated;
    });
  }, [conversationId]);

  const updateMessage = useCallback((tempId: string, real: Message) => {
    const clean = sanitizeMessage(real);
    setMessages(prev => {
      const index = prev.findIndex(m => m.id === tempId);
      if (index === -1) {
        return [...prev, clean];
      }
      const updated = [...prev];
      updated[index] = clean;
      cacheMessages(conversationId, updated).catch(() => {});
      return updated;
    });
  }, [conversationId]);

  const markReadLocally = useCallback((userId: string) => {
    setMessages(prev => {
      const now = new Date().toISOString();
      const updated = prev.map(msg => {
        if (msg.sender_id !== userId && !msg.read_at) {
          return { ...msg, read_at: now };
        }
        return msg;
      });
      cacheMessages(conversationId, updated).catch(() => {});
      return updated;
    });
  }, [conversationId]);

  const markDeliveredLocally = useCallback((userId: string) => {
    setMessages(prev => {
      const now = new Date().toISOString();
      const updated = prev.map(msg => {
        if (msg.sender_id !== userId && !msg.delivered_at) {
          return { ...msg, delivered_at: now };
        }
        return msg;
      });
      cacheMessages(conversationId, updated).catch(() => {});
      return updated;
    });
  }, [conversationId]);

  const removeMessage = useCallback((id: string) => {
    setMessages(prev => {
      const updated = prev.filter(m => m.id !== id);
      cacheMessages(conversationId, updated).catch(() => {});
      return updated;
    });
  }, [conversationId]);

  // ─── markConversationRead ──────────────────────────────────────────────────

  const markConversationRead = useCallback(async () => {
    if (!conversationId || !currentUserId || isMarkingRead) return;
    setIsMarkingRead(true);
    try {
      const result = await markConversationAsRead(conversationId, currentUserId);
      if (!result.error) {
        markReadLocally(currentUserId);
        await clearConversationsCache();
        if (typeof triggerUnreadRefresh === 'function') {
          triggerUnreadRefresh();
        }
        hasMarkedReadRef.current = true;
      } else {
        console.warn('[useMessages] markConversationAsRead error:', result.error);
      }
    } catch (err) {
      console.warn('[useMessages] markConversationRead exception:', err);
    } finally {
      setIsMarkingRead(false);
    }
  }, [conversationId, currentUserId, isMarkingRead, markReadLocally]);

  // ─── مراقبة الاتصال ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsub;
  }, []);

  // ─── Realtime disabled ──────────────────────────────────────────────────────
  const setupRealtimeSubscription = useCallback(() => {
    return () => {};
  }, []);

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

        // ✅ تنقية البيانات الواردة من الخادم
        const cleanNewMsgs = sanitizeMessages(newMsgs);

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const trulyNew = cleanNewMsgs.filter(m => !existingIds.has(m.id));
          const updated = prev.map(m => {
            const fresh = cleanNewMsgs.find(nm => nm.id === m.id);
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
          cacheMessages(conversationId, merged).catch(() => {});

          const hasNewFromOther = trulyNew.some(m => m.sender_id !== currentUserId);
          if (hasNewFromOther && !hasMarkedReadRef.current) {
            setTimeout(() => markConversationRead(), 300);
          }

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
        if (data && data.length > 0) {
          // ✅ تنقية البيانات الواردة من الخادم
          const cleanData = sanitizeMessages(data);
          setMessages(cleanData);
          lastCreatedAtRef.current = cleanData[cleanData.length - 1].created_at;
          if (currentUserId) {
            markMessagesDelivered(conversationId, currentUserId).catch(() => {});
          }
          cacheMessages(conversationId, cleanData).catch(() => {});
          if (!hasMarkedReadRef.current) {
            setTimeout(() => markConversationRead(), 500);
          }
        }
      }

      if (conversationId) {
        updateLastPolled(conversationId, isBuyer).catch(() => {});
      }
    } finally {
      pollingRef.current = false;
    }
  }, [conversationId, isBuyer, currentUserId, scheduleNextPoll, markConversationRead]);

  const pollSilentRef = useRef(pollSilent);
  useEffect(() => { pollSilentRef.current = pollSilent; }, [pollSilent]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    const { data } = await fetchMessages(conversationId);
    if (data) {
      const cleanData = sanitizeMessages(data);
      setMessages(cleanData);
      if (cleanData.length > 0) lastCreatedAtRef.current = cleanData[cleanData.length - 1].created_at;
      cacheMessages(conversationId, cleanData).catch(() => {});
    }
    setRefreshing(false);
    if (!hasMarkedReadRef.current) {
      setTimeout(() => markConversationRead(), 500);
    }
  }, [conversationId, markConversationRead]);

  // ── تحميل أولي مع الكاش ──
  const loadInitial = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    // عرض الكاش أولاً
    const cached = await getCachedMessages(conversationId);
    if (cached && cached.length > 0 && isMountedRef.current) {
      const cleanCached = sanitizeMessages(cached);
      setMessages(cleanCached);
      lastCreatedAtRef.current = cleanCached[cleanCached.length - 1]?.created_at ?? null;
      setLoading(false);
    }
    // جلب من الخادم
    const { data, error } = await fetchMessages(conversationId);
    if (error) {
      console.warn('fetchMessages error:', error);
      setLoading(false);
      return;
    }
    if (data && data.length > 0) {
      const cleanData = sanitizeMessages(data);
      setMessages(cleanData);
      lastCreatedAtRef.current = cleanData[cleanData.length - 1].created_at;
      cacheMessages(conversationId, cleanData).catch(() => {});
      if (currentUserId) {
        markMessagesDelivered(conversationId, currentUserId).catch(() => {});
      }
      if (!hasMarkedReadRef.current) {
        setTimeout(() => markConversationRead(), 400);
      }
    }
    setLoading(false);
  }, [conversationId, currentUserId, markConversationRead]);

  // ── إضافة دوال حذف وإعادة توجيه ──
  const deleteMessage = useCallback(async (messageId: string, forEveryone: boolean = false) => {
    if (!conversationId || !currentUserId) return;
    if (forEveryone) {
      const { error } = await deleteMessageForEveryone(messageId, conversationId);
      if (!error) {
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== messageId);
          cacheMessages(conversationId, updated).catch(() => {});
          return updated;
        });
      }
    } else {
      await deleteMessageForUser(messageId, currentUserId);
      setMessages(prev => {
        const updated = prev.map(m => m.id === messageId ? { ...m, deleted_by: currentUserId } : m);
        cacheMessages(conversationId, updated).catch(() => {});
        return updated;
      });
    }
  }, [conversationId, currentUserId]);

  const forwardMessage = useCallback(async (messageId: string, targetConversationId: string) => {
    const result = await forwardMessageService(messageId, targetConversationId);
    if (result.data) {
      const clean = sanitizeMessage(result.data);
      if (targetConversationId === conversationId) {
        setMessages(prev => {
          const updated = [...prev, clean];
          cacheMessages(conversationId, updated).catch(() => {});
          return updated;
        });
      }
      return clean;
    }
    return null;
  }, [conversationId]);

  // ─── تأثير للتحقق من الرسائل غير المقروءة ──────────────────────────────────
  useEffect(() => {
    if (!conversationId || !currentUserId || isMarkingRead || hasMarkedReadRef.current) return;
    const hasUnread = messages.some(m => m.sender_id !== currentUserId && !m.read_at);
    if (hasUnread) {
      const timer = setTimeout(() => markConversationRead(), 600);
      return () => clearTimeout(timer);
    }
  }, [messages, conversationId, currentUserId, isMarkingRead, markConversationRead]);

  // ─── Main effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    hasMarkedReadRef.current = false;
    if (!conversationId) {
      setLoading(false);
      return;
    }

    loadInitial();

    currentPollDelayRef.current = BASE_POLL_MS;
    failureCountRef.current = 0;

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
        if (!hasMarkedReadRef.current) {
          setTimeout(() => markConversationRead(), 500);
        }
      } else if (state !== 'active') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => pollSilentRef.current(), INACTIVE_POLL_MS);
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      appStateSub.remove();
      cleanupRealtime();
      lastCreatedAtRef.current = null;
      pollingRef.current = false;
      hasMarkedReadRef.current = false;
    };
  }, [conversationId, currentUserId, loadInitial, setupRealtimeSubscription, markConversationRead]);

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
    deleteMessage,
    forwardMessage,
  };
}

// ─── Global unread refresh bridge ─────────────────────────────────────────────
let _globalRefreshUnread: (() => Promise<void>) | null = null;
let _globalRefreshInstance = 0;

export function triggerUnreadRefresh(): void {
  _globalRefreshUnread?.().catch(() => {});
}

// ─── Helper to enrich conversations with user names ──────────────────────────
async function enrichConversationsWithNames(
  conversations: Conversation[]
): Promise<Conversation[]> {
  if (!conversations.length) return conversations;

  const userIds = new Set<string>();
  conversations.forEach(c => {
    if (c.buyer_id) userIds.add(c.buyer_id);
    if (c.seller_id) userIds.add(c.seller_id);
  });

  if (userIds.size === 0) return conversations;

  try {
    const supabase = getSupabaseClient();
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, username, email, avatar_url')
      .in('id', Array.from(userIds));

    if (error) {
      console.warn('Failed to fetch user profiles for conversations:', error);
      return conversations;
    }

    const profileMap = new Map<string, any>();
    profiles?.forEach(p => profileMap.set(p.id, p));

    return conversations.map(conv => {
      const buyerProfile = conv.buyer_id ? profileMap.get(conv.buyer_id) : null;
      const sellerProfile = conv.seller_id ? profileMap.get(conv.seller_id) : null;
      return {
        ...conv,
        buyer_name: buyerProfile?.username || buyerProfile?.email?.split('@')[0] || 'مستخدم',
        seller_name: sellerProfile?.username || sellerProfile?.email?.split('@')[0] || 'مستخدم',
        buyer_avatar: buyerProfile?.avatar_url || null,
        seller_avatar: sellerProfile?.avatar_url || null,
      };
    });
  } catch (err) {
    console.warn('Error enriching conversations:', err);
    return conversations;
  }
}

// ─── useConversations ─────────────────────────────────────────────────────────
export interface UseConversationsResult {
  conversations: Conversation[];
  loading: boolean;
  unreadCount: number;
  isOnline: boolean;
  reload: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  markAllRead: () => Promise<void>;
  archive: (conversationId: string) => Promise<void>;
  unarchive: (conversationId: string) => Promise<void>;
}

export function useConversations(options?: { enabled?: boolean }): UseConversationsResult {
  const { enabled = true } = options || {};
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const prevUnreadRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const _storeVersion = useChatReadStore();
  const isMountedRef = useRef(true);

  // مراقبة الاتصال
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsub;
  }, []);

  const setBadge = useCallback(async (count: number) => {
    if (!Notifications || Platform.OS === 'web') return;
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (_) {}
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!enabled) return;
    try {
      const convResult = await fetchMyConversations();
      if (!isMountedRef.current) return;
      const enriched = await enrichConversationsWithNames(convResult.data);
      const merged = mergeWithLocalReadState(enriched);
      setConversations(merged);
      const real = computeUnreadCount(merged);
      if (real !== prevUnreadRef.current) {
        setUnreadCount(real);
        prevUnreadRef.current = real;
        await setBadge(real);
      } else {
        setUnreadCount(real);
      }
      cacheConversations(merged).catch(() => {});
    } catch (_) {}
  }, [enabled, setBadge]);

  const load = useCallback(async (showSpinner = false) => {
    if (!enabled) {
      if (isMountedRef.current) {
        setConversations([]);
        setUnreadCount(0);
        prevUnreadRef.current = 0;
        if (showSpinner) setLoading(false);
        await setBadge(0);
      }
      return;
    }

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
        prevUnreadRef.current = 0;
        if (showSpinner) setLoading(false);
        await setBadge(0);
      }
      return;
    }

    if (showSpinner) setLoading(true);

    const cached = await getCachedConversations();
    if (cached && cached.length > 0 && isMountedRef.current) {
      const mergedCached = mergeWithLocalReadState(cached);
      setConversations(mergedCached);
      const cachedUnread = computeUnreadCount(mergedCached);
      setUnreadCount(cachedUnread);
      prevUnreadRef.current = cachedUnread;
      await setBadge(cachedUnread);
    }

    try {
      const [convResult] = await Promise.all([fetchMyConversations()]);
      if (!isMountedRef.current) return;
      const enriched = await enrichConversationsWithNames(convResult.data);
      const merged = mergeWithLocalReadState(enriched);
      setConversations(merged);
      if (showSpinner) setLoading(false);

      const newCount = computeUnreadCount(merged);
      if (newCount !== prevUnreadRef.current) {
        setUnreadCount(newCount);
        prevUnreadRef.current = newCount;
        await setBadge(newCount);
      } else {
        setUnreadCount(newCount);
      }
      cacheConversations(merged).catch(() => {});
    } catch (err) {
      if (isMountedRef.current && showSpinner) setLoading(false);
      console.warn('useConversations load error:', err);
    }
  }, [enabled, setBadge]);

  const markAllRead = useCallback(async () => {
    if (!enabled) return;
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await markAllMessagesRead(user.id);
      if (!error) {
        setConversations(prev =>
          prev.map(c => ({ ...c, unread_count: 0 }))
        );
        setUnreadCount(0);
        prevUnreadRef.current = 0;
        await setBadge(0);
        cacheConversations(conversations.map(c => ({ ...c, unread_count: 0 }))).catch(() => {});
      }
    } catch (err) {
      console.warn('markAllRead error:', err);
    }
  }, [enabled, setBadge, conversations]);

  const archive = useCallback(async (conversationId: string) => {
    if (!enabled) return;
    const { error } = await archiveConversation(conversationId);
    if (!error) {
      const removed = conversations.find(c => c.id === conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      const newUnread = unreadCount - (removed?.unread_count ?? 0);
      setUnreadCount(Math.max(0, newUnread));
      prevUnreadRef.current = Math.max(0, newUnread);
      await setBadge(Math.max(0, newUnread));
      cacheConversations(conversations.filter(c => c.id !== conversationId)).catch(() => {});
    }
  }, [enabled, conversations, unreadCount, setBadge]);

  const unarchive = useCallback(async (conversationId: string) => {
    if (!enabled) return;
    await unarchiveConversation(conversationId);
    await load(false);
  }, [enabled, load]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const myInstance = ++_globalRefreshInstance;
    _globalRefreshUnread = refreshUnread;
    return () => {
      if (_globalRefreshInstance === myInstance) {
        _globalRefreshUnread = null;
      }
    };
  }, [refreshUnread]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setConversations([]);
      setUnreadCount(0);
      prevUnreadRef.current = 0;
      setLoading(false);
      setBadge(0);
      return;
    }

    load(true);
    intervalRef.current = setInterval(() => load(false), CHAT_POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, load, setBadge]);

  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

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
    unreadCount,
    isOnline,
    reload: () => load(true),
    refreshUnread,
    markAllRead,
    archive,
    unarchive,
  };
}