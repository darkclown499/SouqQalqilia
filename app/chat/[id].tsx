import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl, Animated, ScrollView, Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { v4 as uuidv4 } from 'uuid';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useMessages } from '@/hooks/useChat';
import {
  fetchConversationById, sendMessage, updateTypingIndicator,
  notifyRecipient, deleteConversation, uploadChatImage,
  addToOfflineQueue, removeFromOfflineQueue, getOfflineQueue,
  Conversation, Message,
} from '@/services/chatService';
import { blockUser, isUserBlocked, unblockUser } from '@/services/blockService';
import { updateAdStatus } from '@/services/adsService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// ---- Import Notifications safely for web ----
let Notifications: any = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
  } catch (_) {}
}

// ---- TypingDots component (unchanged) ----
function TypingDots({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(dot, { toValue: -5, duration: 250, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 160);
    const a3 = anim(dot3, 320);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 2 }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { backgroundColor: color, transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateGroup(dateStr: string, isAr: boolean) {
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return isAr ? 'اليوم' : 'Today';
  if (diff === 1) return isAr ? 'أمس' : 'Yesterday';
  return d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguage();
  const isAr = language === 'ar';

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<MsgItem>>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollToMatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const markReadCooldownRef = useRef<number>(0);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const searchInputRef = useRef<TextInput>(null);

  // ── Image Preview State ──
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // ── Scroll to Bottom Button ──
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const isBuyer = conversation ? conversation.buyer_id === user?.id : null;
  const {
    messages,
    loading,
    refreshing,
    otherTyping,
    isOnline,
    reload,
    appendMessage,
    updateMessage,
    markReadLocally,
  } = useMessages(id, isBuyer, user?.id);

  const [imageUploading, setImageUploading] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<Record<string, number>>({});
  const recordingRef = useRef<any>(null);
  const soundRef = useRef<any>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Quote/Reply State ──
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // ----- Helper: Cleanup sound and recording resources -----
  const cleanupAudioResources = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (_) {}
      recordingRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  // ----- Improved mark as read function -----
  const doMark = useCallback(async () => {
    if (!id || !user) return;
    const now = Date.now();
    if (now - markReadCooldownRef.current < 800) return; // منع التكرار السريع
    markReadCooldownRef.current = now;

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', id)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .is('deleted_by', null);

      if (!error) {
        // تحديث الحالة المحلية فوراً
        markReadLocally(user.id);
        // إعادة المحاولة بعد 300 مللي للتأكد من التحديث في الـ UI
        setTimeout(() => markReadLocally(user.id), 300);
      } else {
        console.warn('⚠️ doMark error:', error);
        // محاولة مرة أخرى بعد تأخير
        setTimeout(() => {
          if (id && user) doMark();
        }, 2000);
      }
    } catch (e) {
      console.warn('⚠️ doMark exception:', e);
    }
  }, [id, user?.id, markReadLocally]);

  // ----- Force mark read on focus and whenever messages change -----
  useFocusEffect(
    useCallback(() => {
      doMark();
      if (Platform.OS !== 'web' && Notifications) {
        Notifications.dismissAllNotificationsAsync().catch(() => {});
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
      return () => {};
    }, [doMark])
  );

  // استدعاء doMark عند تغير قائمة الرسائل (إذا ظهرت رسائل جديدة غير مقروءة)
  useEffect(() => {
    const hasUnread = messages.some(m => m.sender_id !== user?.id && !m.read_at);
    if (hasUnread) {
      if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
      markReadTimeoutRef.current = setTimeout(doMark, 400);
    }
  }, [messages, user?.id, doMark]);

  // ----- Send message handler (improved error handling and retry) -----
  const handleSendMessage = useCallback(async (content: string, imageUrl?: string): Promise<boolean> => {
    if (!id || !user) {
      console.warn('❌ Cannot send: missing id or user');
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'المستخدم أو المحادثة غير موجودة' : 'User or conversation missing');
      return false;
    }

    const clientId = uuidv4();
    const tempMsg: Message = {
      id: clientId,
      conversation_id: id,
      sender_id: user.id,
      content: imageUrl ? (content || '📷 صورة') : content,
      image_url: imageUrl ?? null,
      message_type: imageUrl ? 'image' : 'text',
      read_at: null,
      created_at: new Date().toISOString(),
      _pending: true,
    };

    // إضافة الرسالة مؤقتاً
    try {
      appendMessage(tempMsg);
    } catch (appendErr) {
      console.error('❌ appendMessage error:', appendErr);
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'فشل عرض الرسالة مؤقتاً' : 'Failed to display message');
      return false;
    }

    try {
      const { data: sent, recipientId, isBuyerSending, error } = await sendMessage(id, content, imageUrl, clientId);

      if (error) {
        console.warn('⚠️ sendMessage error:', error);
        // عرض الرسالة الفعلية للخطأ إن وجدت
        const errorMsg = typeof error === 'string' ? error : error?.message || (isAr ? 'فشل الإرسال' : 'Send failed');
        showAlert(
          isAr ? 'فشل الإرسال' : 'Send Failed',
          isAr ? `${errorMsg} - سيتم حفظها وإعادة المحاولة` : `${errorMsg} - will be saved and retried`
        );
        // تحديث الرسالة بحالة فشل
        updateMessage(clientId, { ...tempMsg, _pending: false, _failed: true });
        // حفظ في قائمة الانتظار لإعادة المحاولة
        try {
          await addToOfflineQueue({
            tempId: clientId,
            conversationId: id,
            content: imageUrl ? (content || '📷 صورة') : content,
            image_url: imageUrl,
            message_type: imageUrl ? 'image' : 'text',
            created_at: tempMsg.created_at,
          });
        } catch (queueErr) {
          console.error('❌ addToOfflineQueue error:', queueErr);
        }
        // محاولة إعادة الإرسال تلقائياً بعد 3 ثوانٍ (مرة واحدة)
        setTimeout(async () => {
          try {
            const { data: retrySent, error: retryErr } = await sendMessage(id, content, imageUrl, clientId);
            if (!retryErr && retrySent) {
              updateMessage(clientId, retrySent);
              await removeFromOfflineQueue(clientId);
              showAlert(isAr ? 'تم الإرسال' : 'Sent', isAr ? 'تم إرسال الرسالة بعد المحاولة التلقائية' : 'Message sent after auto-retry');
            }
          } catch (_) {}
        }, 3000);
        return false;
      } else {
        if (sent) {
          updateMessage(clientId, sent);
          // بعد الإرسال، نضع علامة قراءة للرسائل السابقة
          doMark();
          if (recipientId && recipientId !== user.id) {
            const senderName = user.username || user.email?.split('@')[0] || 'مستخدم';
            try {
              notifyRecipient(recipientId, senderName, content || '📷 صورة', id, !isBuyerSending);
            } catch (notifyErr) {
              console.warn('⚠️ notifyRecipient error:', notifyErr);
            }
          }
          return true;
        }
        return false;
      }
    } catch (sendErr) {
      console.error('❌ Unhandled send error:', sendErr);
      const errorMsg = sendErr instanceof Error ? sendErr.message : (isAr ? 'حدث خطأ غير متوقع' : 'Unexpected error');
      showAlert(
        isAr ? 'فشل الإرسال' : 'Send Failed',
        isAr ? `${errorMsg} - سيتم حفظ الرسالة وإعادة المحاولة` : `${errorMsg} - will be saved and retried`
      );
      updateMessage(clientId, { ...tempMsg, _pending: false, _failed: true });
      try {
        await addToOfflineQueue({
          tempId: clientId,
          conversationId: id,
          content: imageUrl ? (content || '📷 صورة') : content,
          image_url: imageUrl,
          message_type: imageUrl ? 'image' : 'text',
          created_at: tempMsg.created_at,
        });
      } catch (queueErr) {
        console.error('❌ addToOfflineQueue error:', queueErr);
      }
      return false;
    }
  }, [id, user, appendMessage, updateMessage, showAlert, isAr, doMark]);

  // ── Retry failed message (improved) ──
  const handleRetryMessage = useCallback(async (failedMsg: Message) => {
    try {
      // إزالة من قائمة الانتظار أولاً
      await removeFromOfflineQueue(failedMsg.id).catch(() => {});
      const { data: sent, error } = await sendMessage(
        id,
        failedMsg.content,
        failedMsg.image_url || undefined,
        failedMsg.id
      );
      if (!error && sent) {
        updateMessage(failedMsg.id, sent);
        doMark();
        showAlert(isAr ? 'تم الإرسال' : 'Sent', isAr ? 'تم إرسال الرسالة بنجاح' : 'Message sent successfully');
      } else {
        const errMsg = typeof error === 'string' ? error : error?.message || (isAr ? 'فشل إعادة الإرسال' : 'Resend failed');
        showAlert(isAr ? 'فشل الإرسال' : 'Send Failed', errMsg);
        // إعادة إضافة الرسالة لقائمة الانتظار
        await addToOfflineQueue({
          tempId: failedMsg.id,
          conversationId: id,
          content: failedMsg.content,
          image_url: failedMsg.image_url || undefined,
          message_type: failedMsg.message_type || 'text',
          created_at: failedMsg.created_at,
        });
      }
    } catch (err) {
      console.error('❌ Retry error:', err);
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'حدث خطأ أثناء إعادة المحاولة' : 'Error while retrying');
    }
  }, [id, updateMessage, showAlert, isAr, doMark]);

  // ----- Audio Recording Handlers (unchanged) -----
  const handleStartRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert(isAr ? 'صلاحية' : 'Permission', isAr ? 'يلزم منح صلاحية الميكروفون' : 'Microphone permission required');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 44100,
          numberOfChannels: 1,
        },
      });
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch (e) {
      console.warn('Start recording error:', e);
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'فشل بدء التسجيل' : 'Failed to start recording');
    }
  }, [isAr, showAlert]);

  const handleStopRecording = useCallback(async (send: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    if (!recordingRef.current) return;

    let tempUri: string | null = null;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      tempUri = recordingRef.current.getURI() ?? null;
      recordingRef.current = null;

      if (!send || !tempUri) {
        if (!tempUri) console.warn('No URI from recording');
        return;
      }

      const fileInfo = await FileSystem.getInfoAsync(tempUri);
      if (!fileInfo.exists || fileInfo.size === 0) {
        showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'الملف الصوتي فارغ أو تالف' : 'Audio file is empty or corrupted');
        return;
      }

      setImageUploading(true);
      const { url, error } = await uploadChatImage(tempUri, `voice_${Date.now()}.m4a`);
      setImageUploading(false);
      if (error || !url) {
        showAlert(isAr ? 'فشل الرفع' : 'Upload Failed', isAr ? 'تعذر رفع الملف الصوتي' : 'Could not upload audio');
        return;
      }
      await handleSendMessage('🎤 رسالة صوتية', url);
    } catch (e) {
      console.warn('Stop recording error:', e);
      setImageUploading(false);
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'فشل معالجة التسجيل' : 'Failed to process recording');
    } finally {
      if (tempUri) {
        try {
          await FileSystem.deleteAsync(tempUri, { idempotent: true });
        } catch {}
      }
    }
  }, [handleSendMessage, isAr, showAlert]);

  const handlePlayVoice = useCallback(async (msgId: string, voiceUrl: string) => {
    try {
      if (playingVoiceId === msgId) {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        }
        setPlayingVoiceId(null);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: voiceUrl }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingVoiceId(msgId);
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          setVoiceProgress(prev => ({
            ...prev,
            [msgId]: status.durationMillis ? status.positionMillis / status.durationMillis : 0,
          }));
          if (status.didJustFinish) {
            setPlayingVoiceId(null);
            soundRef.current = null;
          }
        }
      });
    } catch (e) {
      console.warn('Play voice error:', e);
      setPlayingVoiceId(null);
    }
  }, [playingVoiceId]);

  // ----- Cleanup on unmount -----
  useEffect(() => {
    return () => {
      cleanupAudioResources();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (scrollToMatchTimeoutRef.current) clearTimeout(scrollToMatchTimeoutRef.current);
      if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
    };
  }, [cleanupAudioResources]);

  // ----- Search functionality (unchanged) -----
  const searchMatchIds = useMemo<string[]>(() => {
    if (!searchQuery.trim()) return [];
    return messages
      .filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(m => m.id);
  }, [messages, searchQuery]);

  const totalMatches = searchMatchIds.length;
  const clampedMatchIdx = totalMatches > 0 ? Math.min(searchMatchIndex, totalMatches - 1) : 0;
  const activeMatchId = searchMatchIds[clampedMatchIdx] ?? null;

  const scrollToMatch = useCallback((idx: number) => {
    const msgId = searchMatchIds[idx];
    if (!msgId || !listRef.current) return;
    if (scrollToMatchTimeoutRef.current) clearTimeout(scrollToMatchTimeoutRef.current);
    scrollToMatchTimeoutRef.current = setTimeout(() => {
      if (!listRef.current) return;
      let flatIdx = -1;
      let dateCount = 0;
      let lastDate = '';
      for (let i = 0; i < messages.length; i++) {
        const d = new Date(messages[i].created_at).toDateString();
        if (d !== lastDate) {
          dateCount++;
          lastDate = d;
        }
        if (messages[i].id === msgId) {
          flatIdx = i + dateCount;
          break;
        }
      }
      if (flatIdx >= 0) {
        try {
          listRef.current.scrollToIndex({ index: flatIdx, animated: true, viewPosition: 0.5 });
        } catch {}
      }
      scrollToMatchTimeoutRef.current = null;
    }, 80);
  }, [searchMatchIds, messages]);

  const handleSearchNext = useCallback(() => {
    if (totalMatches === 0) return;
    const next = (clampedMatchIdx + 1) % totalMatches;
    setSearchMatchIndex(next);
    scrollToMatch(next);
  }, [clampedMatchIdx, totalMatches, scrollToMatch]);

  const handleSearchPrev = useCallback(() => {
    if (totalMatches === 0) return;
    const prev = (clampedMatchIdx - 1 + totalMatches) % totalMatches;
    setSearchMatchIndex(prev);
    scrollToMatch(prev);
  }, [clampedMatchIdx, totalMatches, scrollToMatch]);

  useEffect(() => {
    setSearchMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (isSearchActive && totalMatches > 0) {
      scrollToMatch(0);
    }
  }, [isSearchActive, totalMatches, scrollToMatch]);

  // ----- Fetch conversation and block status -----
  useEffect(() => {
    if (!id) return;
    fetchConversationById(id)
      .then(({ data }) => {
        setConversation(data);
        if (data) {
          const otherId = data.buyer_id === user?.id ? data.seller_id : data.buyer_id;
          if (otherId) {
            isUserBlocked(otherId).then(setIsBlocked).catch(() => {});
          }
        }
      })
      .catch((err) => {
        console.warn('fetchConversationById error:', err);
        showAlert(
          isAr ? 'خطأ' : 'Error',
          isAr ? 'فشل تحميل المحادثة' : 'Failed to load conversation'
        );
      });
  }, [id, user?.id, isAr, showAlert]);

  // ----- Offline queue retry -----
  useEffect(() => {
    if (!isOnline || !id || !user || isBuyer === null) return;
    (async () => {
      const queue = await getOfflineQueue();
      const forThisConv = queue.filter(q => q.conversationId === id);
      if (forThisConv.length === 0) return;
      for (const qMsg of forThisConv) {
        const { data: sent, error } = await sendMessage(id, qMsg.content, qMsg.image_url);
        if (!error && sent) {
          updateMessage(qMsg.tempId, sent);
          await removeFromOfflineQueue(qMsg.tempId);
        }
      }
    })();
  }, [isOnline, id, user?.id, isBuyer]);

  // ----- Quick replies -----
  const QUICK_REPLIES_AR = ['هل السعر قابل للتفاوض؟', 'هل المنتج لا يزال متاحاً؟', 'ما هو موقعك؟', 'هل يمكن التوصيل؟'];
  const QUICK_REPLIES_EN = ['Is the price negotiable?', 'Is this still available?', 'Where is your location?', 'Can you deliver?'];
  const quickReplies = isAr ? QUICK_REPLIES_AR : QUICK_REPLIES_EN;

  // ----- Typing indicator -----
  const handleTyping = useCallback((val: string) => {
    setText(val);
    if (!id || !user || isBuyer === null) return;
    updateTypingIndicator(id, isBuyer, true).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      updateTypingIndicator(id, isBuyer, false).catch(() => {});
    }, 3000);
  }, [id, user, isBuyer]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (id && user && isBuyer !== null) {
        updateTypingIndicator(id, isBuyer, false).catch(() => {});
      }
    };
  }, [id, user?.id, isBuyer]);

  // ----- Scroll to bottom -----
  const scrollToBottom = useCallback(() => {
    if (isSearchActive) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
      scrollTimeoutRef.current = null;
      setShowScrollToBottom(false);
      setIsAtBottom(true);
    }, 80);
  }, [isSearchActive]);

  useEffect(() => {
    if (messages.length > 0 && !isSearchActive) {
      scrollToBottom();
    }
  }, [messages.length, isSearchActive, scrollToBottom]);

  // ── Handle scroll events for "scroll to bottom" button ──
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const bottom = contentSize.height - layoutMeasurement.height - 40;
    const atBottom = contentOffset.y >= bottom;
    setIsAtBottom(atBottom);
    setShowScrollToBottom(!atBottom && messages.length > 5);
  }, [messages.length]);

  // ----- Other Handlers -----
  const handleQuickReply = useCallback((reply: string) => {
    setText(reply);
    setShowQuickReplies(false);
  }, []);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !id || sending) {
      return;
    }

    if (!isOnline) {
      showAlert(
        isAr ? 'لا يوجد اتصال' : 'No Internet',
        isAr ? 'الرسالة ستُحفظ وترسل تلقائياً عند عودة الاتصال' : 'Message will be saved and sent when back online'
      );
    }

    let finalContent = content;
    if (replyTo) {
      const quotedText = replyTo.content || (replyTo.message_type === 'image' ? '📷 صورة' : '');
      finalContent = `> ${quotedText}\n\n${content}`;
      setReplyTo(null);
    }

    setSending(true);

    try {
      const success = await handleSendMessage(finalContent);
      if (success) {
        setText('');
        setShowQuickReplies(false);
        // تحديث القراءة بعد الإرسال
        doMark();
      }
    } catch (err) {
      console.error('❌ Unhandled error in handleSend:', err);
      showAlert(
        isAr ? 'خطأ' : 'Error',
        isAr ? `حدث خطأ غير متوقع: ${err instanceof Error ? err.message : ''}` : `Unexpected error: ${err instanceof Error ? err.message : ''}`
      );
    } finally {
      setSending(false);
      if (isBuyer !== null) {
        updateTypingIndicator(id!, isBuyer, false).catch(() => {});
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      }
    }
  }, [text, id, sending, handleSendMessage, isBuyer, isOnline, showAlert, isAr, replyTo, doMark]);

  // ── Copy message text ──
  const handleCopyMessage = useCallback((content: string) => {
    Clipboard.setString(content);
    showAlert(isAr ? 'تم النسخ' : 'Copied', isAr ? 'تم نسخ النص' : 'Text copied');
  }, [isAr, showAlert]);

  // ── Reply to message ──
  const handleReplyToMessage = useCallback((msg: Message) => {
    setReplyTo(msg);
    setTimeout(() => {
      // يمكنك استخدام ref للتركيز على TextInput
    }, 100);
  }, []);

  const handleCameraCapture = useCallback(async () => {
    if (!id || imageUploading) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        showAlert(isAr ? 'صلاحية' : 'Permission', isAr ? 'يلزم منح صلاحية الكاميرا' : 'Camera permission required');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets?.[0]) return;
      setImageUploading(true);
      const { url } = await uploadChatImage(
        result.assets[0].uri,
        result.assets[0].fileName ?? `cam_${Date.now()}.jpg`
      );
      setImageUploading(false);
      if (url) await handleSendMessage('', url);
    } catch (e) {
      console.warn('Camera error:', e);
      setImageUploading(false);
    }
  }, [id, imageUploading, handleSendMessage, isAr, showAlert]);

  const handleImagePick = useCallback(async () => {
    if (!id || imageUploading) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        showAlert(isAr ? 'صلاحية' : 'Permission', isAr ? 'يلزم منح صلاحية المعرض' : 'Gallery permission required');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets?.[0]) return;
      setImageUploading(true);
      const { url } = await uploadChatImage(
        result.assets[0].uri,
        result.assets[0].fileName ?? `chat_${Date.now()}.jpg`
      );
      setImageUploading(false);
      if (url) await handleSendMessage('', url);
    } catch (e) {
      console.warn('Image pick error:', e);
      setImageUploading(false);
    }
  }, [id, imageUploading, handleSendMessage, isAr, showAlert]);

  // ----- Conversation actions (unchanged) -----
  const isSeller = conversation?.seller_id === user?.id;
  const adStatus = (conversation as any)?.ads?.status as string | undefined;
  const adId = conversation?.ad_id;

  const handleMarkSold = useCallback(() => {
    if (!adId) {
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'لا يوجد إعلان مرتبط' : 'No ad linked');
      return;
    }
    if (actionLoading) return;
    setMenuVisible(false);
    showAlert(
      isAr ? 'تأكيد البيع' : 'Confirm Sale',
      isAr ? 'هل تريد تحديد هذا الإعلان كـ «تم البيع»؟' : 'Mark this listing as sold?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'تم البيع ✓' : 'Mark Sold ✓',
          onPress: async () => {
            setActionLoading(true);
            const { error } = await updateAdStatus(adId, 'sold');
            setActionLoading(false);
            if (!error) {
              setConversation(prev => prev ? {
                ...prev,
                ads: { ...prev.ads, title: prev.ads?.title ?? '', status: 'sold' },
              } : prev);
            } else {
              showAlert(isAr ? 'خطأ' : 'Error', error?.message || isAr ? 'فشل التحديث' : 'Update failed');
            }
          },
        },
      ]
    );
  }, [adId, actionLoading, isAr, showAlert]);

  const handleCancelSold = useCallback(async () => {
    if (!adId) {
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'لا يوجد إعلان مرتبط' : 'No ad linked');
      return;
    }
    if (actionLoading) return;
    setMenuVisible(false);
    setActionLoading(true);
    const { error } = await updateAdStatus(adId, 'active');
    setActionLoading(false);
    if (!error) {
      setConversation(prev => prev ? {
        ...prev,
        ads: { ...prev.ads, title: prev.ads?.title ?? '', status: 'active' },
      } : prev);
    } else {
      showAlert(isAr ? 'خطأ' : 'Error', error?.message || isAr ? 'فشل التحديث' : 'Update failed');
    }
  }, [adId, actionLoading, isAr, showAlert]);

  const handleBlockUser = useCallback(() => {
    setMenuVisible(false);
    const otherId = isBuyer ? conversation?.seller_id : conversation?.buyer_id;
    if (!otherId) return;
    showAlert(
      isAr ? (isBlocked ? 'رفع الحظر' : 'حظر المستخدم') : (isBlocked ? 'Unblock User' : 'Block User'),
      isBlocked
        ? (isAr ? 'هل تريد رفع الحظر؟' : 'Unblock this user?')
        : (isAr ? 'هل تريد حظر هذا المستخدم؟' : 'Block this user?'),
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? (isAr ? 'رفع الحظر' : 'Unblock') : (isAr ? 'حظر' : 'Block'),
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setActionLoading(true);
            if (isBlocked) {
              const { error } = await unblockUser(otherId);
              setActionLoading(false);
              if (!error) {
                setIsBlocked(false);
              } else {
                showAlert(isAr ? 'خطأ' : 'Error', error?.message || isAr ? 'فشل رفع الحظر' : 'Unblock failed');
              }
            } else {
              const { error } = await blockUser(otherId);
              setActionLoading(false);
              if (!error) {
                setIsBlocked(true);
              } else {
                showAlert(isAr ? 'خطأ' : 'Error', error?.message || isAr ? 'فشل الحظر' : 'Block failed');
              }
            }
          },
        },
      ]
    );
  }, [isBlocked, isBuyer, conversation, isAr, showAlert]);

  const handleReportUser = useCallback(() => {
    setMenuVisible(false);
    const otherId = isBuyer ? conversation?.seller_id : conversation?.buyer_id;
    if (!otherId || !user) return;
    showAlert(
      isAr ? 'الإبلاغ' : 'Report',
      isAr ? 'الإبلاغ عن المستخدم؟' : 'Report this user?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'إبلاغ' : 'Report',
          style: 'destructive',
          onPress: async () => {
            const supabase = getSupabaseClient();
            await supabase.from('reports').upsert({
              ad_id: conversation?.ad_id ?? '',
              reporter_id: user.id,
              reason: 'abusive_user',
            }, { onConflict: 'ad_id,reporter_id', ignoreDuplicates: true });
            showAlert(isAr ? 'تم الإبلاغ' : 'Reported', '');
          },
        },
      ]
    );
  }, [isBuyer, conversation, user, isAr, showAlert]);

  const handleDeleteConversation = useCallback(() => {
    setMenuVisible(false);
    showAlert(
      isAr ? 'حذف المحادثة' : 'Delete',
      isAr ? 'حذف المحادثة نهائياً؟' : 'Permanently delete?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            const { error } = await deleteConversation(id);
            setActionLoading(false);
            if (!error) {
              router.replace('/(tabs)');
            } else {
              showAlert(isAr ? 'خطأ' : 'Error', error?.message || isAr ? 'فشل الحذف' : 'Delete failed');
            }
          },
        },
      ]
    );
  }, [id, isAr, showAlert, router]);

  // ----- Derived values -----
  const otherUser = isBuyer ? conversation?.seller : conversation?.buyer;
  const otherName = otherUser?.username || otherUser?.email?.split('@')[0] || 'User';
  const otherInitial = otherName.charAt(0).toUpperCase();
  const otherAvatarUrl = (otherUser as any)?.avatar_url ?? null;

  // ----- Pagination -----
  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [id]);

  const pagedMessages = useMemo(
    () => messages.slice(Math.max(0, messages.length - visibleCount)),
    [messages, visibleCount]
  );

  const handleLoadMore = useCallback(() => {
    const max = Math.max(messages.length, PAGE_SIZE);
    setVisibleCount(v => Math.min(v + PAGE_SIZE, max));
  }, [messages.length]);

  // ----- Date grouping -----
  type MsgItem = (Message & { _type?: undefined }) | { _type: 'date'; _date: string; id: string };

  const withDates = useMemo<MsgItem[]>(() => {
    const items: MsgItem[] = [];
    let lastDate = '';
    for (const msg of pagedMessages) {
      const d = new Date(msg.created_at).toDateString();
      if (d !== lastDate) {
        items.push({ _type: 'date', _date: msg.created_at, id: `date_${msg.id}` });
        lastDate = d;
      }
      items.push(msg);
    }
    return items;
  }, [pagedMessages]);

  // ----- Render functions (unchanged) -----
  const renderItem = useCallback(({ item }: { item: MsgItem }) => {
    if (item._type === 'date') {
      return (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateText}>{formatDateGroup(item._date, isAr)}</Text>
        </View>
      );
    }
    const msg = item;
    const isMine = msg.sender_id === user?.id;
    const isVoice = msg.message_type === 'image' && !!msg.image_url && msg.image_url.includes('.m4a');
    const isImage = msg.message_type === 'image' && !!msg.image_url && !isVoice;
    const isRead = !!msg.read_at;
    const isFailed = msg._failed === true;

    const borderRadiusStyle = isMine
      ? {
          borderTopRightRadius: isAr ? 4 : 18,
          borderTopLeftRadius: isAr ? 18 : 4,
          borderBottomRightRadius: isAr ? 4 : 18,
          borderBottomLeftRadius: isAr ? 18 : 4,
        }
      : {
          borderTopLeftRadius: isAr ? 4 : 18,
          borderTopRightRadius: isAr ? 18 : 4,
          borderBottomLeftRadius: isAr ? 4 : 18,
          borderBottomRightRadius: isAr ? 18 : 4,
        };

    return (
      <View style={[
        styles.messageRow,
        { flexDirection: isMine ? (isAr ? 'row' : 'row-reverse') : (isAr ? 'row-reverse' : 'row') }
      ]}>
        <Pressable
          onLongPress={() => {
            if (!isImage && !isVoice) {
              handleCopyMessage(msg.content);
            }
          }}
          delayLongPress={400}
          style={{ flex: 1, alignItems: isMine ? 'flex-end' : 'flex-start' }}
        >
          <View style={[
            styles.messageBubble,
            isMine
              ? [styles.messageSent, { backgroundColor: colors.primary }]
              : [styles.messageReceived, { backgroundColor: colors.surface }],
            borderRadiusStyle,
            isImage ? { paddingHorizontal: 4, paddingVertical: 4 } : null,
            isFailed && { borderWidth: 1, borderColor: '#EF4444' },
          ]}>
            {isVoice ? (
              <Pressable
                style={[
                  styles.voicePlayer,
                  { backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : colors.primaryGhost }
                ]}
                onPress={() => handlePlayVoice(msg.id, msg.image_url!)}
              >
                <MaterialIcons
                  name={playingVoiceId === msg.id ? 'pause-circle-filled' : 'play-circle-filled'}
                  size={32}
                  color={isMine ? '#fff' : colors.primary}
                />
                <View style={{
                  height: 3,
                  backgroundColor: isMine ? 'rgba(255,255,255,0.3)' : colors.border,
                  flex: 1,
                  borderRadius: 2,
                }}>
                  <View style={{
                    height: 3,
                    backgroundColor: isMine ? '#fff' : colors.primary,
                    width: `${((voiceProgress[msg.id] ?? 0) * 100).toFixed(0)}%`,
                  }} />
                </View>
              </Pressable>
            ) : isImage ? (
              <Pressable onPress={() => setPreviewImage(msg.image_url!)}>
                <Image
                  source={{ uri: msg.image_url! }}
                  style={{ width: 200, height: 150, borderRadius: 14 }}
                  contentFit="cover"
                />
              </Pressable>
            ) : (
              <Text style={[
                styles.messageText,
                { color: isMine ? '#fff' : colors.textPrimary, textAlign: isAr ? 'right' : 'left' }
              ]}>
                {msg.content}
              </Text>
            )}

            {isFailed && (
              <Pressable
                style={[styles.retryBtn, { marginTop: 4 }]}
                onPress={() => handleRetryMessage(msg)}
              >
                <MaterialIcons name="refresh" size={14} color="#EF4444" />
                <Text style={[styles.retryText, { color: '#EF4444' }]}>
                  {isAr ? 'إعادة المحاولة' : 'Retry'}
                </Text>
              </Pressable>
            )}

            <View style={{
              flexDirection: isAr ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              marginTop: 4,
            }}>
              <Text style={[
                styles.messageTime,
                { color: isMine ? 'rgba(255,255,255,0.7)' : colors.textMuted }
              ]}>
                {formatTime(msg.created_at)}
              </Text>
              {isMine && !isFailed && (
                <MaterialIcons
                  name={isRead ? 'done-all' : 'done'}
                  size={14}
                  color={isRead ? (isMine ? '#4ADE80' : '#4ADE80') : 'rgba(255,255,255,0.7)'}
                />
              )}
              {isMine && isRead && (
                <Text style={[styles.readReceipt, { color: colors.primary }]}>
                  {isAr ? 'تم المشاهدة' : 'Read'}
                </Text>
              )}
            </View>

            {/* Reply button on long press */}
            {!isImage && !isVoice && (
              <Pressable
                style={[styles.replyBtn, { position: 'absolute', top: 4, right: isMine ? 4 : undefined, left: isMine ? undefined : 4 }]}
                onPress={() => handleReplyToMessage(msg)}
              >
                <MaterialIcons name="reply" size={16} color={isMine ? 'rgba(255,255,255,0.6)' : colors.textMuted} />
              </Pressable>
            )}
          </View>
        </Pressable>
      </View>
    );
  }, [isAr, user, colors, playingVoiceId, voiceProgress, handlePlayVoice, handleCopyMessage, handleRetryMessage, handleReplyToMessage]);

  const footerComponent = useMemo(() => {
    if (!otherTyping) return null;
    return (
      <View style={[styles.messageRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[styles.messageBubble, styles.messageReceived, { backgroundColor: colors.surface }]}>
          <TypingDots color={colors.textMuted} />
        </View>
      </View>
    );
  }, [otherTyping, isAr, colors]);

  if (!id) {
    return (
      <View style={styles.center}>
        <Text>Conversation not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>

        {!isOnline && (
          <View style={[styles.offlineBanner, { backgroundColor: '#EF4444', paddingTop: insets.top }]}>
            <MaterialIcons name="wifi-off" size={16} color="#fff" />
            <Text style={[styles.offlineBannerText, { color: '#fff' }]}>
              {isAr ? 'غير متصل بالإنترنت' : 'No Internet Connection'}
            </Text>
            <Pressable onPress={() => reload()} hitSlop={8}>
              <MaterialIcons name="refresh" size={16} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* ── Reply to message indicator ── */}
        {replyTo && (
          <View style={[styles.replyIndicator, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyIndicatorLabel, { color: colors.primary }]}>
                {isAr ? 'رد على' : 'Replying to'}
              </Text>
              <Text style={[styles.replyIndicatorText, { color: colors.textPrimary }]} numberOfLines={1}>
                {replyTo.content || (replyTo.message_type === 'image' ? '📷 صورة' : '')}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        <View style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            backgroundColor: colors.primary,
            flexDirection: isAr ? 'row-reverse' : 'row',
          }
        ]}>
          <View style={[styles.headerLeft, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Pressable hitSlop={15} style={styles.iconButton} onPress={() => router.back()}>
              <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={24} color="#FFF" />
            </Pressable>

            <View style={styles.avatarContainer}>
              {otherAvatarUrl ? (
                <Image source={{ uri: otherAvatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[
                  styles.avatar,
                  {
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }
                ]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{otherInitial}</Text>
                </View>
              )}
              {!otherTyping && <View style={styles.onlineIndicator} />}
            </View>

            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerName, { textAlign: isAr ? 'right' : 'left' }]} numberOfLines={1}>
                {otherName}
              </Text>
              <Text style={[styles.headerStatus, { textAlign: isAr ? 'right' : 'left' }]}>
                {otherTyping
                  ? (isAr ? 'يكتب...' : 'typing...')
                  : (isAr ? 'نشط الآن' : 'Active')
                }
                {conversation?.ads?.title ? ` • ${conversation.ads.title}` : ''}
              </Text>
            </View>
          </View>

          <View style={[styles.headerActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Pressable
              hitSlop={10}
              style={styles.iconButton}
              onPress={() => {
                setIsSearchActive(v => !v);
                if (!isSearchActive) {
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }
              }}
            >
              <MaterialIcons name="search" size={24} color="#FFF" />
            </Pressable>
            <Pressable hitSlop={10} style={styles.iconButton} onPress={() => setMenuVisible(true)}>
              <MaterialIcons name="more-vert" size={24} color="#FFF" />
            </Pressable>
          </View>
        </View>

        {isSearchActive && (
          <View style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
              flexDirection: isAr ? 'row-reverse' : 'row',
            }
          ]}>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}
              placeholder={isAr ? 'البحث...' : 'Search...'}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoFocus
            />
            {totalMatches > 0 && (
              <Text style={{ color: colors.textMuted }}>{clampedMatchIdx + 1}/{totalMatches}</Text>
            )}
            <Pressable onPress={handleSearchPrev} style={styles.searchNavBtn}>
              <MaterialIcons name="expand-less" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleSearchNext} style={styles.searchNavBtn}>
              <MaterialIcons name="expand-more" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
          statusBarTranslucent
        >
          <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
            <View style={[styles.menuSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>
                {isAr ? 'خيارات المحادثة' : 'Conversation Options'}
              </Text>

              {isSeller ? (
                adStatus === 'sold' ? (
                  <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleCancelSold}>
                    <View style={[styles.menuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                      <MaterialIcons name="undo" size={20} color="#D97706" />
                    </View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemTitle, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? 'إلغاء البيع' : 'Cancel Sale'}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleMarkSold}>
                    <View style={[styles.menuIconWrap, { backgroundColor: '#DCFCE7' }]}>
                      <MaterialIcons name="check-circle" size={20} color="#16A34A" />
                    </View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemTitle, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? 'تم البيع ✓' : 'Mark as Sold ✓'}
                      </Text>
                    </View>
                  </Pressable>
                )
              ) : null}

              <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleBlockUser}>
                <View style={[styles.menuIconWrap, { backgroundColor: isBlocked ? '#DBEAFE' : '#FEE2E2' }]}>
                  <MaterialIcons name={isBlocked ? 'lock-open' : 'block'} size={20} color={isBlocked ? '#2563EB' : '#EF4444'} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[
                    styles.menuItemTitle,
                    { color: isBlocked ? '#2563EB' : '#EF4444', textAlign: isAr ? 'right' : 'left' }
                  ]}>
                    {isBlocked ? (isAr ? 'رفع الحظر' : 'Unblock User') : (isAr ? 'حظر المستخدم' : 'Block User')}
                  </Text>
                </View>
              </Pressable>

              <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleReportUser}>
                <View style={[styles.menuIconWrap, { backgroundColor: '#FFF7ED' }]}>
                  <MaterialIcons name="flag" size={20} color="#D97706" />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: '#D97706', textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'الإبلاغ عن المستخدم' : 'Report User'}
                  </Text>
                </View>
              </Pressable>

              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

              <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleDeleteConversation}>
                <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: '#EF4444', textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'حذف المحادثة' : 'Delete Conversation'}
                  </Text>
                </View>
              </Pressable>

              <Pressable style={[styles.menuCancelBtn, { backgroundColor: colors.background }]} onPress={() => setMenuVisible(false)}>
                <Text style={[styles.menuCancelText, { color: colors.textPrimary }]}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <FlatList
          ref={listRef}
          data={withDates}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={reload}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            messages.length > visibleCount ? (
              <Pressable style={[styles.dateSeparator, { backgroundColor: colors.surfaceTint }]} onPress={handleLoadMore}>
                <Text style={styles.dateText}>{isAr ? 'رسائل أقدم' : 'Older'}</Text>
              </Pressable>
            ) : null
          }
          renderItem={renderItem}
          ListFooterComponent={footerComponent}
          onScroll={handleScroll}
        />

        {/* ── Scroll to bottom button ── */}
        {showScrollToBottom && (
          <Pressable
            style={[styles.scrollToBottomBtn, { backgroundColor: colors.primary }]}
            onPress={scrollToBottom}
          >
            <MaterialIcons name="keyboard-arrow-down" size={24} color="#fff" />
          </Pressable>
        )}

        {showQuickReplies && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8, backgroundColor: colors.surface }}
          >
            {quickReplies.map((reply, i) => (
              <Pressable
                key={i}
                style={[styles.quickReplyChip, { borderColor: colors.primary }]}
                onPress={() => handleQuickReply(reply)}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{reply}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={[
          styles.inputArea,
          {
            paddingBottom: insets.bottom + 12,
            flexDirection: isAr ? 'row-reverse' : 'row',
            backgroundColor: colors.background,
          }
        ]}>
          {isRecording ? (
            <View style={[
              styles.recordingRow,
              {
                flexDirection: isAr ? 'row-reverse' : 'row',
                backgroundColor: colors.surface,
              }
            ]}>
              <View style={[styles.recordingDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.recordingTimer, { color: colors.textPrimary }]}>
                {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:
                {String(recordingDuration % 60).padStart(2, '0')}
              </Text>
              <Pressable onPress={() => handleStopRecording(false)} hitSlop={10}>
                <MaterialIcons name="delete" color="#EF4444" size={24} />
              </Pressable>
            </View>
          ) : (
            <View style={[
              styles.inputPill,
              {
                flexDirection: isAr ? 'row-reverse' : 'row',
                backgroundColor: colors.surface,
              }
            ]}>
              <Pressable hitSlop={10} style={styles.inputAction} onPress={() => setShowQuickReplies(!showQuickReplies)}>
                <MaterialIcons name="quickreply" size={22} color={colors.textMuted} />
              </Pressable>
              <TextInput
                style={[styles.textInput, { textAlign: isAr ? 'right' : 'left', color: colors.textPrimary }]}
                placeholder={t.typeMessage}
                placeholderTextColor={colors.textMuted}
                value={text}
                onChangeText={handleTyping}
                multiline
              />
              <View style={[styles.inputInnerActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <Pressable hitSlop={10} style={styles.inputAction} onPress={handleImagePick}>
                  <MaterialIcons name="attach-file" size={22} color={colors.textMuted} />
                </Pressable>
                {!text.trim() && (
                  <Pressable hitSlop={10} style={styles.inputAction} onPress={handleCameraCapture}>
                    <MaterialIcons name="camera-alt" size={22} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          <Pressable
            style={[
              styles.sendButton,
              { backgroundColor: (text.trim() || isRecording) ? colors.primary : '#10B981' }
            ]}
            onPress={isRecording ? () => handleStopRecording(true) : (text.trim() ? handleSend : handleStartRecording)}
          >
            {sending || imageUploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialIcons
                name={text.trim() || isRecording ? 'send' : 'mic'}
                size={22}
                color="#FFF"
                style={isAr && (text.trim() || isRecording) ? { transform: [{ scaleX: -1 }] } : undefined}
              />
            )}
          </Pressable>
        </View>

      </View>

      {/* ── Image Preview Modal ── */}
      <Modal visible={!!previewImage} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={styles.imagePreviewOverlay} onPress={() => setPreviewImage(null)}>
          <Image
            source={{ uri: previewImage! }}
            style={styles.imagePreview}
            contentFit="contain"
          />
          <Pressable style={styles.imagePreviewClose} onPress={() => setPreviewImage(null)}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 8,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerLeft: { alignItems: 'center', gap: 8, flex: 1 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E5E7EB' },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0A6E5C',
  },
  headerTextContainer: { flex: 1, justifyContent: 'center' },
  headerName: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  headerStatus: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  headerActions: { alignItems: 'center', gap: 4 },
  chatScroll: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, flexGrow: 1 },
  dateSeparator: {
    alignSelf: 'center',
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  dateText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  messageRow: { marginBottom: 12 },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  messageReceived: { borderTopLeftRadius: 4 },
  messageSent: { borderTopRightRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageTime: { fontSize: 10 },
  inputArea: { paddingHorizontal: 10, paddingTop: 10, alignItems: 'flex-end', gap: 8 },
  inputPill: { flex: 1, borderRadius: 24, minHeight: 48, maxHeight: 120, alignItems: 'center', paddingHorizontal: 4, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  textInput: { flex: 1, fontSize: 15, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 12, minHeight: 48 },
  inputInnerActions: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  inputAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginBottom: 2,
  },
  voicePlayer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, minWidth: 170 },
  recordingRow: { flex: 1, borderRadius: 24, minHeight: 48, alignItems: 'center', paddingHorizontal: 16, gap: 10, elevation: 2 },
  recordingDot: { width: 10, height: 10, borderRadius: 5 },
  recordingTimer: { flex: 1, fontSize: 16, fontWeight: '600' },
  quickReplyChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  typingDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 2 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  offlineBannerText: { color: '#fff', fontSize: 12, fontWeight: '600', flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 6, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 16, height: 38, paddingHorizontal: 4 },
  searchNavBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  menuHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  menuTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  menuItem: { alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 4 },
  menuIconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  menuItemText: { flex: 1, gap: 3 },
  menuItemTitle: { fontSize: 16, fontWeight: '700' },
  menuDivider: { height: 1, marginVertical: 6 },
  menuCancelBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  menuCancelText: { fontSize: 16, fontWeight: '700' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  readReceipt: {
    fontSize: 10,
    fontWeight: '600',
  },
  replyBtn: {
    padding: 4,
    opacity: 0.5,
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 8,
  },
  replyIndicatorLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyIndicatorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  scrollToBottomBtn: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: '80%',
  },
  imagePreviewClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    padding: 8,
  },
});