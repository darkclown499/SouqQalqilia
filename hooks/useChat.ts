import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  fetchMessages,
  fetchMessagesSince,        // ← corrected name
  sendMessage,
  markMessagesRead,
  updateTypingIndicator,     // ← corrected name
  uploadChatImage,           // ← corrected name
  Message,
  Conversation,
  cacheMessages,
  getCachedMessages,
  clearConversationsCache,
} from '@/services/chatService';
import { useAuth, getSupabaseClient } from '@/template';

const POLL_INTERVAL = 3000;
const PUSH_TOKEN_CACHE_KEY = 'cached_expo_push_token';

// ── Notification permissions ────────────────────────────────────────────────
// Asks the OS for notification permission (no-op if already granted/denied).
// Must run before registerPushToken() can obtain a token on iOS.
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Notifications = require('expo-notifications');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch {
    return false;
  }
}

// ── Push token registration ─────────────────────────────────────────────────
// Obtains this device's Expo push token and saves it to user_profiles so the
// `push-notify` edge function has somewhere to send new-message notifications.
// Safe to call repeatedly (on every SIGNED_IN / app-foreground) — it skips the
// DB write when the token hasn't changed since the last successful save.
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = require('expo-notifications');
    const Constants = require('expo-constants').default;
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
    if (!projectId) return;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    const token: string | undefined = data;
    if (!token) return;

    const AsyncStorage = (require('@react-native-async-storage/async-storage') as any).default;
    const cached = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY).catch(() => null);
    if (cached === token) return;

    const { error } = await supabase
      .from('user_profiles')
      .update({ push_token: token })
      .eq('id', user.id);
    if (error) return;

    await AsyncStorage.setItem(PUSH_TOKEN_CACHE_KEY, token).catch(() => {});
  } catch {
    /* non-critical — next foreground/sign-in retries */
  }
}

export function useChat(conversationId: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastCreatedAtRef = useRef<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ─── تحميل الرسائل الأولية ──────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!conversationId || !isMounted.current) return;
    setLoading(true);
    setError(null);

    // الكاش أولاً
    const cached = await getCachedMessages(conversationId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      lastCreatedAtRef.current = cached[cached.length - 1]?.created_at || null;
      setLoading(false);
    }

    // من الخادم
    try {
      const { data, error } = await fetchMessages(conversationId);
      if (error) throw new Error(error);
      if (isMounted.current && data) {
        setMessages(data);
        if (data.length > 0) {
          lastCreatedAtRef.current = data[data.length - 1].created_at;
        }
        if (user?.id) {
          await markMessagesRead(conversationId, user.id);
          await clearConversationsCache();
        }
        setLoading(false);
      }
    } catch (e) {
      console.error('[useChat] loadMessages error:', e);
      if (isMounted.current) {
        setError('فشل تحميل الرسائل');
        setLoading(false);
      }
    }
  }, [conversationId, user?.id]);

  // ─── جلب الرسائل الجديدة (Polling) ─────────────────────────────────────────
  const pollNewMessages = useCallback(async () => {
    if (!conversationId || !lastCreatedAtRef.current || !isMounted.current) return;

    try {
      const { messages: newMsgs, typing, error } = await fetchMessagesSince(
        conversationId,
        lastCreatedAtRef.current
      );
      if (error) throw new Error(error);

      if (!isMounted.current) return;

      if (newMsgs && newMsgs.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNew = newMsgs.filter(m => !existingIds.has(m.id));
          if (uniqueNew.length === 0) return prev;
          const updated = [...prev, ...uniqueNew];
          lastCreatedAtRef.current = updated[updated.length - 1].created_at;
          cacheMessages(conversationId, updated);
          return updated;
        });

        if (user?.id) {
          await markMessagesRead(conversationId, user.id);
          await clearConversationsCache();
        }
      }

      // تحديث حالة الكتابة
      setOtherTyping(typing === 'buyer' || typing === 'seller');
    } catch (e) {
      console.warn('[useChat] pollNewMessages error:', e);
    }
  }, [conversationId, user?.id]);

  // ─── إرسال رسالة ────────────────────────────────────────────────────────────
  const sendMessageHandler = useCallback(async (content: string, imageUrl?: string) => {
    if (!conversationId || !user?.id || sending) return false;
    setSending(true);
    setError(null);

    const tempId = `temp_${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content || (imageUrl ? '📷 صورة' : ''),
      image_url: imageUrl || null,
      message_type: imageUrl ? 'image' : 'text',
      read_at: null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const result = await sendMessage(conversationId, content, imageUrl);
      // خدمة sendMessage تعيد { data: Message, error: string | null }
      if (result.error) throw new Error(result.error);
      const sentMessage = result.data;
      if (!sentMessage) throw new Error('لم يتم استلام الرسالة');

      setMessages(prev => {
        const updated = prev.map(m =>
          m.id === tempId ? { ...sentMessage, _pending: false } : m
        );
        cacheMessages(conversationId, updated);
        const last = updated[updated.length - 1];
        if (last) lastCreatedAtRef.current = last.created_at;
        return updated;
      });

      setSending(false);
      return true;
    } catch (e: any) {
      console.error('[useChat] sendMessage error:', e);
      setError(e.message || 'فشل الإرسال');
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, _failed: true } : m)
      );
      setSending(false);
      return false;
    }
  }, [conversationId, user?.id, sending]);

  // ─── رفع صورة ──────────────────────────────────────────────────────────────
  const uploadImageHandler = useCallback(async (fileUri: string, fileName: string) => {
    try {
      const url = await uploadChatImage(fileUri, fileName);
      if (url) {
        await sendMessageHandler('', url);
      }
      return url;
    } catch (e) {
      console.error('[useChat] uploadImage error:', e);
      return null;
    }
  }, [sendMessageHandler]);

  // ─── تحديث مؤشر الكتابة ─────────────────────────────────────────────────────
  const sendTyping = useCallback((isTyping: boolean) => {
    if (!conversationId || !user) return;
    const isBuyer = true; // يمكن تعديله حسب الحالة
    updateTypingIndicator(conversationId, isBuyer, isTyping);
  }, [conversationId, user]);

  // ─── إعادة المحاولة للرسائل الفاشلة ────────────────────────────────────────
  const retryMessage = useCallback(async (msgId: string) => {
    const failedMsg = messages.find(m => m.id === msgId);
    if (!failedMsg || !failedMsg._failed) return;
    await sendMessageHandler(failedMsg.content, failedMsg.image_url || undefined);
  }, [messages, sendMessageHandler]);

  // ─── مراقبة الاتصال ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsub;
  }, []);

  // ─── التحميل الأولي والـ Polling ───────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    loadMessages();

    intervalRef.current = setInterval(() => {
      pollNewMessages();
    }, POLL_INTERVAL);

    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        pollNewMessages();
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      isMounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      appStateSub.remove();
    };
  }, [conversationId]);

  return {
    messages,
    loading,
    sending,
    otherTyping,
    isOnline,
    error,
    sendMessage: sendMessageHandler,
    uploadImage: uploadImageHandler,
    sendTyping,
    refresh: loadMessages,
    markRead: () => {
      if (user?.id) markMessagesRead(conversationId, user.id);
    },
    retryMessage,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// useConversations - يبقى كما هو (لا يحتاج تعديل)
// ──────────────────────────────────────────────────────────────────────────────
export function useConversations(options?: { enabled?: boolean }) {
  const { enabled = true } = options || {};
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return unsub;
  }, []);

  const reload = useCallback(async () => {
    console.log('🔄 [useConversations] جاري تحميل المحادثات...');

    if (!enabled || !user) {
      console.log('⛔ [useConversations] غير مفعل أو لا يوجد مستخدم');
      setConversations([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          ad_id,
          buyer_id,
          seller_id,
          last_message,
          last_message_at,
          created_at,
          buyer:buyer_id (username, email, avatar_url),
          seller:seller_id (username, email, avatar_url)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .is('archived_at', null)
        .order('last_message_at', { ascending: false });

      if (error) {
        console.error('❌ [useConversations] خطأ في جلب المحادثات:', error);
        throw error;
      }

      console.log(`📊 [useConversations] تم جلب ${data?.length || 0} محادثة`);

      const convIds = data?.map(c => c.id) || [];
      let unreadMap: Record<string, number> = {};
      if (convIds.length > 0) {
        const { data: unread } = await supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', convIds)
          .is('read_at', null)
          .neq('sender_id', user.id);
        unread?.forEach(row => {
          unreadMap[row.conversation_id] = (unreadMap[row.conversation_id] || 0) + 1;
        });
      }

      const enriched = (data || []).map(conv => {
        const buyer = conv.buyer || {};
        const seller = conv.seller || {};
        return {
          ...conv,
          buyer_name: buyer.username || buyer.email?.split('@')[0] || 'مستخدم',
          seller_name: seller.username || seller.email?.split('@')[0] || 'مستخدم',
          buyer_avatar: buyer.avatar_url || null,
          seller_avatar: seller.avatar_url || null,
          unread_count: unreadMap[conv.id] || 0,
        };
      });

      setConversations(enriched);
      const totalUnread = enriched.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      setUnreadCount(totalUnread);
      console.log(`🔔 [useConversations] عدد الرسائل غير المقروءة: ${totalUnread}`);
    } catch (err) {
      console.warn('[useConversations] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  const refreshUnread = useCallback(async () => {
    await reload();
  }, [reload]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .neq('sender_id', user.id)
        .is('read_at', null);
      await reload();
    } catch (err) {
      console.warn('[useConversations] markAllRead error:', err);
    }
  }, [user, reload]);

  const archive = useCallback(async (conversationId: string) => {
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('conversations')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', conversationId);
      await reload();
    } catch (err) {
      console.warn('[useConversations] archive error:', err);
    }
  }, [reload]);

  const unarchive = useCallback(async (conversationId: string) => {
    try {
      const supabase = getSupabaseClient();
      await supabase
        .from('conversations')
        .update({ archived_at: null })
        .eq('id', conversationId);
      await reload();
    } catch (err) {
      console.warn('[useConversations] unarchive error:', err);
    }
  }, [reload]);

  useEffect(() => {
    reload();
  }, [enabled, user]);

  return {
    conversations,
    loading,
    unreadCount,
    isOnline,
    reload,
    refreshUnread,
    markAllRead,
    archive,
    unarchive,
  };
}