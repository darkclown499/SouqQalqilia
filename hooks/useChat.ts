import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  fetchMessages,
  fetchNewMessages,
  sendMessage,
  markMessagesRead,
  updateTyping,
  uploadImage,
  Message,
  Conversation,
  cacheMessages,
  getCachedMessages,
  clearConversationsCache,
} from '@/services/chatService';
import { useAuth } from '@/template';

const POLL_INTERVAL = 3000; // 3 seconds

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
      const data = await fetchMessages(conversationId);
      if (isMounted.current) {
        setMessages(data);
        if (data.length > 0) {
          lastCreatedAtRef.current = data[data.length - 1].created_at;
        }
        // تعليم الرسائل كمقروءة فوراً
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
      const { messages: newMsgs, typing } = await fetchNewMessages(
        conversationId,
        lastCreatedAtRef.current
      );

      if (!isMounted.current) return;

      if (newMsgs.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNew = newMsgs.filter(m => !existingIds.has(m.id));
          if (uniqueNew.length === 0) return prev;
          const updated = [...prev, ...uniqueNew];
          lastCreatedAtRef.current = updated[updated.length - 1].created_at;
          cacheMessages(conversationId, updated);
          return updated;
        });

        // تعليم الرسائل الجديدة كمقروءة
        if (user?.id) {
          await markMessagesRead(conversationId, user.id);
          await clearConversationsCache();
        }
      }

      // تحديث حالة الكتابة
      if (typing === 'buyer' || typing === 'seller') {
        setOtherTyping(true);
      } else {
        setOtherTyping(false);
      }
    } catch (e) {
      console.warn('[useChat] pollNewMessages error:', e);
    }
  }, [conversationId, user?.id]);

  // ─── إرسال رسالة ────────────────────────────────────────────────────────────
  const sendMessageHandler = useCallback(async (content: string, imageUrl?: string) => {
    if (!conversationId || !user?.id || sending) return false;
    setSending(true);
    setError(null);

    try {
      // إضافة رسالة مؤقتة
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

      // إرسال للخادم
      const result = await sendMessage(conversationId, content, imageUrl);

      if (!result.success) {
        throw new Error(result.error || 'فشل الإرسال');
      }

      // تحديث الرسالة المؤقتة بالرسالة الحقيقية
      if (result.message) {
        setMessages(prev =>
          prev.map(m => m.id === tempId ? { ...result.message!, _pending: false } : m)
        );
        lastCreatedAtRef.current = result.message.created_at;
        // تحديث الكاش
        const updated = messages.map(m => m.id === tempId ? { ...result.message!, _pending: false } : m);
        cacheMessages(conversationId, updated);
      }

      setSending(false);
      return true;
    } catch (e: any) {
      console.error('[useChat] sendMessage error:', e);
      setError(e.message || 'فشل الإرسال');
      // إعادة تعيين حالة الرسالة المؤقتة
      setMessages(prev =>
        prev.map(m => m._pending ? { ...m, _failed: true } : m)
      );
      setSending(false);
      return false;
    }
  }, [conversationId, user?.id, messages]);

  // ─── رفع صورة ──────────────────────────────────────────────────────────────
  const uploadImageHandler = useCallback(async (fileUri: string, fileName: string) => {
    try {
      const url = await uploadImage(fileUri, fileName);
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
    // افترض أن المستخدم الحالي هو البائع أو المشتري حسب السياق
    // يمكن تمرير isBuyer كـ prop إذا لزم الأمر
    const isBuyer = true; // سيتم تحديثه حسب الحالة
    updateTyping(conversationId, isBuyer, isTyping);
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