
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl, Animated, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useMessages } from '@/hooks/useChat';
import {
  fetchConversationById, sendMessage, markMessagesRead, updateTypingIndicator,
  notifyRecipient, deleteConversation, uploadChatImage,
  addToOfflineQueue, removeFromOfflineQueue, getOfflineQueue,
  Conversation, Message,
} from '@/services/chatService';
import { blockUser, isUserBlocked } from '@/services/blockService';
import { updateAdStatus } from '@/services/adsService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

// ── Emoji reaction constants ──────────────────────────────────────────────────
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'] as const;
type ReactionEmoji = typeof REACTION_EMOJIS[number];

// ── Highlighted text component for search ─────────────────────────────────────
function HighlightedText({
  text, query, baseStyle, highlightColor,
}: { text: string; query: string; baseStyle: any; highlightColor: string }) {
  if (!query.trim()) return <Text style={baseStyle}>{text}</Text>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return (
    <Text style={baseStyle}>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <Text key={i} style={{ backgroundColor: highlightColor, color: '#1a1a1a', borderRadius: 3 }}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

// ── Animated floating emoji picker ────────────────────────────────────────────
function EmojiPicker({
  visible, onSelect, onDismiss, isDark,
}: { visible: boolean; onSelect: (emoji: ReactionEmoji) => void; onDismiss: () => void; isDark: boolean }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, damping: 14, stiffness: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0);
      opacity.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;
  return (
    <Animated.View
      style={[
        emojiStyles.picker,
        {
          backgroundColor: isDark ? '#2D3748' : '#fff',
          transform: [{ scale }],
          opacity,
        },
      ]}
    >
      {REACTION_EMOJIS.map(emoji => (
        <Pressable
          key={emoji}
          style={({ pressed }) => [emojiStyles.emojiBtn, { transform: [{ scale: pressed ? 0.8 : 1 }] }]}
          onPress={() => { onSelect(emoji); onDismiss(); }}
          hitSlop={4}
        >
          <Text style={emojiStyles.emojiText}>{emoji}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

const emojiStyles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 16,
    alignSelf: 'center',
    marginBottom: 4,
  },
  emojiBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
});

/** Animated three-dot typing indicator */
function TypingDots({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
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
        <Animated.View
          key={i}
          style={[styles.typingDot, { backgroundColor: color, transform: [{ translateY: dot }] }]}
        />
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

  // ── Emoji reaction state ──────────────────────────────────────────────────
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  // local reaction overrides: msgId → emoji (optimistic)
  const [localReactions, setLocalReactions] = useState<Record<string, string>>({});

  // ── Message search state ──────────────────────────────────────────────────
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const searchInputRef = useRef<TextInput>(null);

  const isBuyer = conversation ? conversation.buyer_id === user?.id : null;

  const { messages, loading, refreshing, otherTyping, isOnline, reload, appendMessage, updateMessage, markReadLocally, removeMessage } = useMessages(id, isBuyer);
  const [imageUploading, setImageUploading] = useState(false);

  // ── Search match indices ──────────────────────────────────────────────────
  // Returns indices in the `messages` array where content matches query
  const searchMatchIds = useMemo<string[]>(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter(m => m.content?.toLowerCase().includes(q))
      .map(m => m.id);
  }, [messages, searchQuery]);

  const totalMatches = searchMatchIds.length;
  const clampedMatchIdx = totalMatches > 0 ? Math.min(searchMatchIndex, totalMatches - 1) : 0;
  const activeMatchId = searchMatchIds[clampedMatchIdx] ?? null;

  const scrollToMatch = useCallback((idx: number) => {
    const msgId = searchMatchIds[idx];
    if (!msgId || !listRef.current) return;
    // Find index in withDates array — will be computed later but we can use messages index
    const flatIdx = messages.findIndex(m => m.id === msgId);
    if (flatIdx < 0) return;
    try {
      listRef.current.scrollToIndex({ index: flatIdx, animated: true, viewPosition: 0.5 });
    } catch { /* ignore out-of-range */ }
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

  // Reset match index when query changes
  useEffect(() => { setSearchMatchIndex(0); }, [searchQuery]);

  // Auto-scroll to first match when search activates
  useEffect(() => {
    if (isSearchActive && totalMatches > 0) scrollToMatch(0);
  }, [isSearchActive, totalMatches]);

  // ── Emoji reaction handler ────────────────────────────────────────────────
  const handleReaction = useCallback(async (msgId: string, emoji: ReactionEmoji) => {
    if (!user) return;
    // Optimistic update
    setLocalReactions(prev => ({ ...prev, [msgId]: emoji }));
    // Persist to DB: reactions stored as JSONB { userId: emoji }
    try {
      const supabase = getSupabaseClient();
      // Use raw SQL-style update via RPC or direct update
      const { data: current } = await supabase
        .from('messages')
        .select('reactions')
        .eq('id', msgId)
        .single();
      const existing: Record<string, string> = (current?.reactions as any) ?? {};
      const updated = { ...existing, [user.id]: emoji };
      await supabase.from('messages').update({ reactions: updated }).eq('id', msgId);
    } catch { /* optimistic already applied */ }
  }, [user]);

  useEffect(() => {
    if (id) {
      fetchConversationById(id).then(({ data }) => {
        setConversation(data);
        if (data) {
          const otherId = data.buyer_id === user?.id ? data.seller_id : data.buyer_id;
          if (otherId) isUserBlocked(otherId).then(setIsBlocked);
        }
      });
    }
  }, [id, user?.id]);

  // ── Flush offline queue when connection is restored ────────────────────────
  useEffect(() => {
    if (!isOnline || !id || !user) return;
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
  }, [isOnline, id, user?.id]);

  const QUICK_REPLIES_AR = [
    'هل السعر قابل للتفاوض؟',
    'هل المنتج لا يزال متاحاً؟',
    'ما هو موقعك؟',
    'هل يمكن التوصيل؟',
    'هل يوجد عيوب في المنتج؟',
    'متى يمكنني الاستلام؟',
  ];
  const QUICK_REPLIES_EN = [
    'Is the price negotiable?',
    'Is this still available?',
    'Where is your location?',
    'Can you deliver?',
    'Any defects or issues?',
    'When can I pick it up?',
  ];
  const quickReplies = isAr ? QUICK_REPLIES_AR : QUICK_REPLIES_EN;

  const handleTyping = (val: string) => {
    setText(val);
    if (!id || !user || isBuyer === null) return;
    updateTypingIndicator(id, isBuyer, true).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      updateTypingIndicator(id, isBuyer, false).catch(() => {});
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (id && user && isBuyer !== null) {
        updateTypingIndicator(id, isBuyer, false).catch(() => {});
      }
    };
  }, [id, user?.id, isBuyer]);

  const markedOnMount = useRef(false);

  const doMark = useCallback(async () => {
    if (!id || !user) return;
    await markMessagesRead(id, user.id);
    markReadLocally(user.id);
  }, [id, user?.id, markReadLocally]);

  useEffect(() => {
    if (!markedOnMount.current) {
      markedOnMount.current = true;
      doMark();
      return;
    }
    const hasUnread = messages.some(m => m.sender_id !== user?.id && !m.read_at);
    if (hasUnread) doMark();
  }, [messages, user?.id, doMark]);

  useEffect(() => {
    if (messages.length > 0 && !isSearchActive) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length, isSearchActive]);

  const handleQuickReply = (reply: string) => {
    setText(reply);
    setShowQuickReplies(false);
  };

  const handleSendMessage = async (content: string, imageUrl?: string) => {
    if (!id) return;
    const tempId = `temp_${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversation_id: id,
      sender_id: user?.id ?? '',
      content: imageUrl ? (content || '\uD83D\uDCF7 صورة') : content,
      image_url: imageUrl ?? null,
      message_type: imageUrl ? 'image' : 'text',
      read_at: null,
      created_at: new Date().toISOString(),
      _pending: true,
    };
    appendMessage(tempMsg);

    const { data: sent, recipientId, isBuyerSending, error } = await sendMessage(id, content, imageUrl);
    if (error) {
      updateMessage(tempId, { ...tempMsg, _pending: false, _failed: true });
      await addToOfflineQueue({
        tempId,
        conversationId: id,
        content: imageUrl ? (content || '\uD83D\uDCF7 صورة') : content,
        image_url: imageUrl,
        message_type: imageUrl ? 'image' : 'text',
        created_at: tempMsg.created_at,
      });
    } else {
      if (sent) updateMessage(tempId, sent);
      if (recipientId) {
        const senderDisplayName = user?.username || user?.email?.split('@')[0] || 'رسالة جديدة';
        notifyRecipient(recipientId, senderDisplayName, content || '\uD83D\uDCF7 صورة', id, !isBuyerSending);
      }
    }
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !id || sending) return;
    setSending(true);
    setText('');
    await handleSendMessage(content);
    setSending(false);
    if (isBuyer !== null) {
      updateTypingIndicator(id!, isBuyer, false).catch(() => {});
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }
  };

  /** Capture a photo directly from the camera and send it as a chat message */
  const handleCameraCapture = async () => {
    if (!id || imageUploading) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        showAlert(
          isAr ? 'لا يوجد إذن' : 'Permission Denied',
          isAr ? 'يرجى السماح للتطبيق بالوصول إلى الكاميرا' : 'Please allow camera access to take photos.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setImageUploading(true);
      const fileName = asset.fileName ?? `cam_${Date.now()}.jpg`;
      const { url, error } = await uploadChatImage(asset.uri, fileName);
      setImageUploading(false);
      if (error || !url) { showAlert(isAr ? 'فشل الرفع' : 'Upload Failed', error ?? 'Unknown error'); return; }
      await handleSendMessage('', url);
    } catch (e: any) {
      setImageUploading(false);
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Could not open camera');
    }
  };

  /** Pick an image from library and send it as a chat message */
  const handleImagePick = async () => {
    if (!id || imageUploading) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        showAlert(
          isAr ? 'لا يوجد إذن' : 'Permission Denied',
          isAr ? 'يرجى السماح للتطبيق بالوصول إلى معرض الصور' : 'Please allow access to your photo library.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setImageUploading(true);
      const fileName = asset.fileName ?? `chat_${Date.now()}.jpg`;
      const { url, error } = await uploadChatImage(asset.uri, fileName);
      setImageUploading(false);
      if (error || !url) { showAlert(isAr ? 'فشل الرفع' : 'Upload Failed', error ?? 'Unknown error'); return; }
      await handleSendMessage('', url);
    } catch (e: any) {
      setImageUploading(false);
      showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Could not pick image');
    }
  };

  const isSeller = conversation?.seller_id === user?.id;
  const adStatus = (conversation as any)?.ads?.status as string | undefined;
  const adId = conversation?.ad_id;

  if (!id) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Conversation not found.</Text>
      </View>
    );
  }

  const handleMarkSold = async () => {
    if (!adId || actionLoading) return;
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
            if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); }
            else { setConversation(prev => prev ? { ...prev, ads: { ...prev.ads, title: prev.ads?.title ?? '', status: 'sold' } } : prev); }
          },
        },
      ]
    );
  };

  const handleCancelSold = async () => {
    if (!adId || actionLoading) return;
    setMenuVisible(false);
    setActionLoading(true);
    const { error } = await updateAdStatus(adId, 'active');
    setActionLoading(false);
    if (!error) setConversation(prev => prev ? { ...prev, ads: { ...prev.ads, title: prev.ads?.title ?? '', status: 'active' } } : prev);
  };

  const handleBlockUser = () => {
    setMenuVisible(false);
    const otherId = isBuyer ? conversation?.seller_id : conversation?.buyer_id;
    if (!otherId) return;
    const actionLabel = isBlocked ? (isAr ? 'رفع الحظر' : 'Unblock') : (isAr ? 'حظر' : 'Block');
    showAlert(
      isAr ? (isBlocked ? 'رفع الحظر' : 'حظر المستخدم') : (isBlocked ? 'Unblock User' : 'Block User'),
      isBlocked ? (isAr ? 'هل تريد رفع الحظر؟' : 'Unblock this user?') : (isAr ? 'هل تريد حظر هذا المستخدم؟' : 'Block this user?'),
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setActionLoading(true);
            if (isBlocked) {
              const { error } = await (await import('@/services/blockService')).unblockUser(otherId);
              setActionLoading(false);
              if (!error) setIsBlocked(false);
            } else {
              const { error } = await blockUser(otherId);
              setActionLoading(false);
              if (!error) setIsBlocked(true);
            }
          },
        },
      ]
    );
  };

  const handleReportUser = () => {
    setMenuVisible(false);
    const otherId = isBuyer ? conversation?.seller_id : conversation?.buyer_id;
    if (!otherId || !user) return;
    showAlert(
      isAr ? 'الإبلاغ عن المستخدم' : 'Report User',
      isAr ? 'هل تريد الإبلاغ عن هذا المستخدم؟' : 'Report this user for abusive behavior?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'إبلاغ' : 'Report',
          style: 'destructive',
          onPress: async () => {
            const supabase = getSupabaseClient();
            await supabase.from('user_profiles').upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
            await supabase.from('reports').upsert({ ad_id: conversation?.ad_id ?? '', reporter_id: user.id, reason: 'abusive_user' }, { onConflict: 'ad_id,reporter_id', ignoreDuplicates: true });
            showAlert(isAr ? 'تم الإبلاغ' : 'Reported', isAr ? 'شكراً. سنراجع البلاغ.' : 'Thank you. We will review this report.');
          },
        },
      ]
    );
  };

  const handleDeleteConversation = () => {
    setMenuVisible(false);
    showAlert(
      isAr ? 'حذف المحادثة' : 'Delete Conversation',
      isAr ? 'سيتم حذف المحادثة نهائياً.' : 'This will permanently delete the conversation.',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            const { error } = await deleteConversation(id);
            setActionLoading(false);
            if (error) showAlert(isAr ? 'خطأ' : 'Error', error);
            else router.replace('/(tabs)/messages');
          },
        },
      ]
    );
  };

  const otherUser = isBuyer ? conversation?.seller : conversation?.buyer;
  const otherName = otherUser?.username || otherUser?.email?.split('@')[0] || 'User';
  const otherInitial = otherName.charAt(0).toUpperCase();
  const otherAvatarUrl = (otherUser as any)?.avatar_url ?? null;

  type MsgItem = (Message & { _type?: undefined }) | { _type: 'date'; _date: string; id: string };
  const withDates: MsgItem[] = [];
  let lastDate = '';
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) {
      withDates.push({ _type: 'date', _date: msg.created_at, id: `date_${msg.id}` });
      lastDate = d;
    }
    withDates.push(msg);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── OFFLINE BANNER ── */}
        {!isOnline ? (
          <View style={[styles.offlineBanner, { backgroundColor: '#F59E0B' }]}>
            <MaterialIcons name="wifi-off" size={14} color="#fff" />
            <Text style={styles.offlineBannerText}>
              {isAr ? 'أنت غير متصل — الرسائل ستُرسل عند استعادة الاتصال' : 'You are offline — messages will be sent when connection is restored'}
            </Text>
          </View>
        ) : null}

        {/* ── HEADER ── */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable
            style={[styles.backBtn, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={22} color="#fff" />
          </Pressable>

          {otherAvatarUrl ? (
            <Image source={{ uri: otherAvatarUrl }} style={styles.headerAvatarImg} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={styles.headerAvatarText}>{otherInitial}</Text>
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={[styles.headerName, { textAlign: isAr ? 'right' : 'left' }]} numberOfLines={1}>{otherName}</Text>
            <View style={[styles.onlineRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              {otherTyping ? (
                <>
                  <View style={[styles.onlineDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.onlineText}>{isAr ? 'يكتب...' : 'typing...'}</Text>
                </>
              ) : (
                <>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineText}>{isAr ? 'نشط' : 'Active'}</Text>
                </>
              )}
              {conversation?.ads?.title ? (
                <Text style={styles.headerAd} numberOfLines={1}>{' · '}{conversation.ads.title}</Text>
              ) : null}
              {adStatus === 'sold' ? (
                <View style={styles.soldPill}><Text style={styles.soldPillText}>{isAr ? 'بيع' : 'Sold'}</Text></View>
              ) : null}
            </View>
          </View>

          {/* Search toggle */}
          <Pressable
            style={[styles.moreBtn, isSearchActive && { backgroundColor: 'rgba(255,255,255,0.28)' }]}
            onPress={() => {
              setIsSearchActive(v => {
                if (!v) setTimeout(() => searchInputRef.current?.focus(), 100);
                else setSearchQuery('');
                return !v;
              });
            }}
            hitSlop={8}
          >
            <MaterialIcons name={isSearchActive ? 'search-off' : 'search'} size={22} color="#fff" />
          </Pressable>

          {/* More options */}
          <Pressable style={styles.moreBtn} onPress={() => setMenuVisible(true)} hitSlop={8}>
            {actionLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name="more-vert" size={22} color="#fff" />}
          </Pressable>
        </View>

        {/* ── SEARCH BAR ── */}
        {isSearchActive ? (
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}
              placeholder={isAr ? 'البحث في الرسائل...' : 'Search messages...'}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {totalMatches > 0 ? (
              <Text style={[styles.searchCounter, { color: colors.textMuted }]}>
                {clampedMatchIdx + 1}/{totalMatches}
              </Text>
            ) : searchQuery.trim() ? (
              <Text style={[styles.searchCounter, { color: colors.textMuted }]}>0</Text>
            ) : null}
            <Pressable onPress={handleSearchPrev} disabled={totalMatches === 0} hitSlop={6} style={styles.searchNavBtn}>
              <MaterialIcons name={isAr ? 'expand-less' : 'expand-less'} size={22} color={totalMatches > 0 ? colors.primary : colors.border} />
            </Pressable>
            <Pressable onPress={handleSearchNext} disabled={totalMatches === 0} hitSlop={6} style={styles.searchNavBtn}>
              <MaterialIcons name="expand-more" size={22} color={totalMatches > 0 ? colors.primary : colors.border} />
            </Pressable>
            <Pressable onPress={() => { setIsSearchActive(false); setSearchQuery(''); }} hitSlop={6}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {/* ── ACTION MENU MODAL ── */}
        <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)} statusBarTranslucent>
          <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
            <View style={[styles.menuSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>
                {isAr ? 'خيارات المحادثة' : 'Conversation Options'}
              </Text>

              {isSeller ? (
                adStatus === 'sold' ? (
                  <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleCancelSold}>
                    <View style={[styles.menuIconWrap, { backgroundColor: '#FEF3C7' }]}><MaterialIcons name="undo" size={20} color="#D97706" /></View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemTitle, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'إلغاء البيع' : 'Cancel Sale'}</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleMarkSold}>
                    <View style={[styles.menuIconWrap, { backgroundColor: '#DCFCE7' }]}><MaterialIcons name="check-circle" size={20} color="#16A34A" /></View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemTitle, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'تم البيع ✓' : 'Mark as Sold ✓'}</Text>
                    </View>
                  </Pressable>
                )
              ) : null}

              <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleBlockUser}>
                <View style={[styles.menuIconWrap, { backgroundColor: isBlocked ? '#DBEAFE' : '#FEE2E2' }]}>
                  <MaterialIcons name={isBlocked ? 'lock-open' : 'block'} size={20} color={isBlocked ? '#2563EB' : '#EF4444'} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: isBlocked ? '#2563EB' : '#EF4444', textAlign: isAr ? 'right' : 'left' }]}>
                    {isBlocked ? (isAr ? 'رفع الحظر' : 'Unblock User') : (isAr ? 'حظر المستخدم' : 'Block User')}
                  </Text>
                </View>
              </Pressable>

              <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleReportUser}>
                <View style={[styles.menuIconWrap, { backgroundColor: '#FFF7ED' }]}><MaterialIcons name="flag" size={20} color="#D97706" /></View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: '#D97706', textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'الإبلاغ عن المستخدم' : 'Report User'}</Text>
                </View>
              </Pressable>

              <View style={[styles.menuDivider, { backgroundColor: colors.borderLight }]} />

              <Pressable style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]} onPress={handleDeleteConversation}>
                <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}><MaterialIcons name="delete-outline" size={20} color="#EF4444" /></View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: '#EF4444', textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'حذف المحادثة' : 'Delete Conversation'}</Text>
                </View>
              </Pressable>

              <Pressable style={[styles.menuCancelBtn, { backgroundColor: colors.background }]} onPress={() => setMenuVisible(false)}>
                <Text style={[styles.menuCancelText, { color: colors.textPrimary }]}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* ── MESSAGES ── */}
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={withDates}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />
            }
            onContentSizeChange={() => {
              if (!isSearchActive) listRef.current?.scrollToEnd({ animated: false });
            }}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => {
              if (item._type === 'date') {
                return (
                  <View style={styles.dateSep}>
                    <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
                    <View style={[styles.datePill, { backgroundColor: colors.surfaceTint }]}>
                      <Text style={[styles.datePillText, { color: colors.textMuted }]}>{formatDateGroup(item._date, isAr)}</Text>
                    </View>
                    <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
                  </View>
                );
              }

              const msg = item;
              const isMine = msg.sender_id === user?.id;
              const isRead = !!msg.read_at;
              const isPending = !!(msg as any)._pending;
              const isFailed = !!(msg as any)._failed;
              const isImage = msg.message_type === 'image' && !!msg.image_url;

              // Determine reaction to display (local optimistic first, then from DB)
              const dbReactions: Record<string, string> = ((msg as any).reactions as any) ?? {};
              const myReaction = localReactions[msg.id] ?? (user?.id ? dbReactions[user.id] : null);
              // Aggregate all emoji counts
              const allReactions = { ...dbReactions };
              if (localReactions[msg.id]) allReactions[user?.id ?? ''] = localReactions[msg.id];
              const reactionCounts = Object.values(allReactions).reduce<Record<string, number>>((acc, e) => {
                acc[e] = (acc[e] ?? 0) + 1;
                return acc;
              }, {});
              const reactionEntries = Object.entries(reactionCounts);

              // Search highlight active for this message
              const isActiveMatch = activeMatchId === msg.id;
              const hasSearchMatch = searchQuery.trim() && msg.content?.toLowerCase().includes(searchQuery.toLowerCase());

              const isPickerOpen = pickerMsgId === msg.id;

              return (
                <View
                  style={[
                    styles.msgRow,
                    isMine
                      ? isAr ? styles.msgRowOther : styles.msgRowMine
                      : isAr ? styles.msgRowMine : styles.msgRowOther,
                    isActiveMatch ? { backgroundColor: colors.primaryGhost + '66', borderRadius: Radius.lg } : null,
                  ]}
                >
                  {!isMine ? (
                    <View style={[styles.bubbleAvatar, { backgroundColor: colors.primaryGhost }]}>
                      <Text style={[styles.bubbleAvatarText, { color: colors.primary }]}>{otherInitial}</Text>
                    </View>
                  ) : null}

                  <View style={styles.bubbleWrap}>
                    {/* Emoji picker above bubble */}
                    {isPickerOpen ? (
                      <EmojiPicker
                        visible={isPickerOpen}
                        onSelect={(emoji) => handleReaction(msg.id, emoji)}
                        onDismiss={() => setPickerMsgId(null)}
                        isDark={isDark}
                      />
                    ) : null}

                    {/* Message bubble with long-press */}
                    <Pressable
                      onLongPress={() => setPickerMsgId(prev => prev === msg.id ? null : msg.id)}
                      delayLongPress={380}
                      style={({ pressed }) => [
                        styles.bubble,
                        isImage ? styles.bubbleImage : null,
                        isMine
                          ? { backgroundColor: isFailed ? '#EF4444' : colors.primary, borderBottomRightRadius: isAr ? Radius.lg : 4, borderBottomLeftRadius: isAr ? 4 : Radius.lg, opacity: pressed ? 0.88 : 1 }
                          : { backgroundColor: colors.surface, borderBottomLeftRadius: isAr ? Radius.lg : 4, borderBottomRightRadius: isAr ? 4 : Radius.lg, ...Shadow.sm, opacity: pressed ? 0.88 : 1 },
                        hasSearchMatch && !isActiveMatch ? { borderWidth: 1.5, borderColor: colors.primary + '66' } : null,
                        isActiveMatch ? { borderWidth: 2, borderColor: colors.primary } : null,
                      ]}
                    >
                      {isImage ? (
                        <Image source={{ uri: msg.image_url! }} style={styles.msgImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                      ) : null}
                      {msg.content && msg.content !== '\uD83D\uDCF7 صورة' ? (
                        isSearchActive && searchQuery.trim() ? (
                          <HighlightedText
                            text={msg.content}
                            query={searchQuery}
                            baseStyle={[styles.msgText, { color: isMine ? '#fff' : colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}
                            highlightColor="#FDE68A"
                          />
                        ) : (
                          <Text style={[styles.msgText, { color: isMine ? '#fff' : colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                            {msg.content}
                          </Text>
                        )
                      ) : !isImage ? (
                        <Text style={[styles.msgText, { color: isMine ? '#fff' : colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                          {msg.content}
                        </Text>
                      ) : null}
                    </Pressable>

                    {/* Reaction badges below bubble */}
                    {reactionEntries.length > 0 ? (
                      <View style={[styles.reactionRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                        {reactionEntries.map(([emoji, count]) => (
                          <Pressable
                            key={emoji}
                            style={[
                              styles.reactionBadge,
                              {
                                backgroundColor: myReaction === emoji ? colors.primaryGhost : colors.surface,
                                borderColor: myReaction === emoji ? colors.primary : colors.border,
                              },
                            ]}
                            onPress={() => handleReaction(msg.id, emoji as ReactionEmoji)}
                          >
                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                            {count > 1 ? <Text style={[styles.reactionCount, { color: colors.textMuted }]}>{count}</Text> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    <View style={[styles.msgMeta, { flexDirection: isMine ? (isAr ? 'row' : 'row-reverse') : (isAr ? 'row-reverse' : 'row'), gap: 4 }]}>
                      <Text style={[styles.msgTime, { color: colors.textMuted }]}>{formatTime(msg.created_at)}</Text>
                      {isMine ? (
                        isFailed ? (
                          <Pressable onPress={() => { removeMessage(msg.id); removeFromOfflineQueue(msg.id); }} hitSlop={6}>
                            <MaterialIcons name="error-outline" size={14} color="#EF4444" />
                          </Pressable>
                        ) : isPending ? (
                          <MaterialIcons name="schedule" size={12} color={colors.textMuted} />
                        ) : (
                          <MaterialIcons name={isRead ? 'done-all' : 'done'} size={14} color={isRead ? '#4ADE80' : colors.textMuted} />
                        )
                      ) : null}
                    </View>
                    {isFailed ? (
                      <Text style={[styles.failedLabel, { color: '#EF4444' }]}>
                        {isAr ? 'فشل الإرسال — اضغط ✕ للحذف' : 'Failed to send — tap ✕ to remove'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              otherTyping ? (
                <View style={[styles.typingRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.bubbleAvatar, { backgroundColor: colors.primaryGhost }]}>
                    <Text style={[styles.bubbleAvatarText, { color: colors.primary }]}>{otherInitial}</Text>
                  </View>
                  <View style={[styles.typingBubble, { backgroundColor: colors.surface, ...Shadow.sm }]}>
                    <TypingDots color={colors.textMuted} />
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceTint }]}>
                  <MaterialIcons name="chat-bubble-outline" size={36} color={colors.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t.sayHello}</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  {isAr ? 'ابدأ المحادثة مع البائع' : 'Start the conversation with the seller'}
                </Text>
              </View>
            }
          />
        )}

        {/* Dismiss emoji picker on tap outside */}
        {pickerMsgId ? (
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setPickerMsgId(null)}
            pointerEvents="box-only"
          />
        ) : null}

        {/* ── QUICK REPLIES ── */}
        {showQuickReplies ? (
          <View style={[styles.quickRepliesWrap, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.quickRepliesContent, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              {quickReplies.map((reply, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.quickReplyChip, { backgroundColor: pressed ? colors.primary : colors.primaryGhost, borderColor: colors.primary }]}
                  onPress={() => handleQuickReply(reply)}
                >
                  <Text style={[styles.quickReplyText, { color: colors.primary }]} numberOfLines={1}>{reply}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── INPUT BAR ── */}
        <View style={[
          styles.inputBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + Spacing.sm,
            flexDirection: isAr ? 'row-reverse' : 'row',
          },
        ]}>
          <Pressable
            style={[styles.quickReplyToggleBtn, { backgroundColor: showQuickReplies ? colors.primary : colors.primaryGhost }]}
            onPress={() => setShowQuickReplies(v => !v)}
            hitSlop={4}
          >
            <MaterialIcons name="quickreply" size={20} color={showQuickReplies ? '#fff' : colors.primary} />
          </Pressable>
          <Pressable
            style={[styles.quickReplyToggleBtn, { backgroundColor: imageUploading ? colors.primary : colors.primaryGhost }]}
            onPress={handleCameraCapture}
            disabled={imageUploading}
            hitSlop={4}
          >
            {imageUploading
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name="camera-alt" size={20} color={colors.primary} />
            }
          </Pressable>
          <Pressable
            style={[styles.quickReplyToggleBtn, { backgroundColor: colors.primaryGhost }]}
            onPress={handleImagePick}
            disabled={imageUploading}
            hitSlop={4}
          >
            <MaterialIcons name="photo-library" size={20} color={colors.primary} />
          </Pressable>
          <TextInput
            style={[styles.textInput, {
              borderColor: colors.border,
              backgroundColor: colors.background,
              color: colors.textPrimary,
              textAlign: isAr ? 'right' : 'left',
            }]}
            placeholder={t.typeMessage}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={handleTyping}
            multiline
            maxLength={500}
          />
          <Pressable
            style={[styles.sendBtn, { backgroundColor: text.trim() && !sending ? colors.primary : colors.border }]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <MaterialIcons name="send" size={20} color={text.trim() ? '#fff' : colors.textMuted} style={isAr ? { transform: [{ scaleX: -1 }] } : undefined} />
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  moreBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldPill: {
    backgroundColor: '#EF4444', borderRadius: 99,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  soldPillText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // ── Search bar ──
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    gap: 6, borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1, fontSize: FontSize.md, height: 38,
    paddingHorizontal: 4,
  },
  searchCounter: {
    fontSize: FontSize.xs, fontWeight: '600', minWidth: 38, textAlign: 'center',
  },
  searchNavBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },

  // ── Action menu ──
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  menuSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingBottom: 32, paddingTop: 12, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 20,
  },
  menuHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  menuTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.sm },
  menuItem: { alignItems: 'center', gap: Spacing.md, paddingVertical: 14, paddingHorizontal: 4 },
  menuIconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  menuItemText: { flex: 1, gap: 3 },
  menuItemTitle: { fontSize: FontSize.md, fontWeight: '700' },
  menuItemSub: { fontSize: FontSize.xs, lineHeight: 16 },
  menuDivider: { height: 1, marginVertical: 6 },
  menuCancelBtn: { borderRadius: Radius.xl, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  menuCancelText: { fontSize: FontSize.md, fontWeight: '700' },

  // ── Header avatar ──
  headerAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarImg: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  headerAvatarText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },
  headerInfo: { flex: 1, gap: 2 },
  headerName: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  onlineText: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)' },
  headerAd: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', flex: 1 },

  // ── Messages ──
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center' },
  msgList: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1, paddingBottom: Spacing.md },
  dateSep: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  dateLine: { flex: 1, height: 1 },
  datePill: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  datePillText: { fontSize: FontSize.xs, fontWeight: '600' },
  msgRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', paddingHorizontal: 2 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  bubbleAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bubbleAvatarText: { fontSize: FontSize.xs, fontWeight: '700' },
  bubbleWrap: { maxWidth: '72%', gap: 3 },
  bubble: { borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  msgText: { fontSize: FontSize.md, lineHeight: 22 },
  msgMeta: { alignItems: 'center' },
  msgTime: { fontSize: 10, fontWeight: '500' },

  // ── Reaction badges ──
  reactionRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 4, marginTop: 3, marginBottom: 1,
  },
  reactionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1.5,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: '700' },

  // ── Input bar ──
  inputBar: {
    alignItems: 'flex-end',
    gap: Spacing.sm, padding: Spacing.sm, paddingHorizontal: Spacing.md, borderTopWidth: 1,
  },
  textInput: {
    flex: 1, minHeight: 46, maxHeight: 110,
    borderWidth: 1.5, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    fontSize: FontSize.md, lineHeight: 20,
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },

  // ── Typing ──
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  typingRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', marginTop: Spacing.sm },
  typingBubble: { borderRadius: Radius.lg, borderBottomLeftRadius: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },

  // ── Misc ──
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  offlineBannerText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '600', flex: 1 },
  bubbleImage: { padding: 0, overflow: 'hidden', borderRadius: Radius.lg },
  msgImage: { width: 200, height: 150, borderRadius: Radius.lg },
  failedLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  quickRepliesContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm, alignItems: 'center' },
  quickReplyChip: { borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220 },
  quickReplyText: { fontSize: FontSize.sm, fontWeight: '600' },
  quickReplyToggleBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  quickRepliesWrap: { borderTopWidth: 1 },
});
