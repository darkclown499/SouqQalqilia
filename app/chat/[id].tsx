
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl, Animated, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert } from '@/template';
import { useMessages } from '@/hooks/useChat';
import { fetchConversationById, sendMessage, markMessagesRead, updateTypingIndicator, fetchTypingStatus, notifyRecipient, deleteConversation, Conversation, Message } from '@/services/chatService';
import { blockUser, isUserBlocked } from '@/services/blockService';
import { updateAdStatus } from '@/services/adsService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

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
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const isAr = language === 'ar';

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<MsgItem>>(null); // Added type argument to FlatList
  const { messages, loading, refreshing, reload, pollSilent, appendMessage, updateMessage, markReadLocally } = useMessages(id);
  // NOTE: Do NOT call useConversations() here — it would create an isolated instance
  // disconnected from the tab layout's badge. The tab layout polls every 2s and will
  // auto-refresh the unread count after markMessagesRead() updates the DB.

  useEffect(() => {
    if (id) {
      fetchConversationById(id).then(({ data }) => {
        setConversation(data);
        // Check if the other user is already blocked
        if (data) {
          const otherId = data.buyer_id === user?.id ? data.seller_id : data.buyer_id;
          if (otherId) isUserBlocked(otherId).then(setIsBlocked);
        }
      });
    }
  }, [id, user?.id]);

  // Poll typing indicator every 2 seconds
  useEffect(() => {
    if (!id || !user || !conversation) return;
    const isBuyer = conversation.buyer_id === user.id;
    const check = async () => {
      const status = await fetchTypingStatus(id);
      const otherAt = isBuyer ? status.seller_typing_at : status.buyer_typing_at;
      if (otherAt) {
        const diff = Date.now() - new Date(otherAt).getTime();
        setOtherTyping(diff < 4000);
      } else {
        setOtherTyping(false);
      }
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [id, user?.id, conversation]);

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
    if (!id || !user || !conversation) return;
    const isBuyer = conversation.buyer_id === user.id;
    updateTypingIndicator(id, isBuyer, true).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      updateTypingIndicator(id, isBuyer, false).catch(() => {});
    }, 3000);
  };

  // Clear typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (id && user && conversation) {
        const isBuyer = conversation.buyer_id === user.id;
        updateTypingIndicator(id, isBuyer, false).catch(() => {});
      }
    };
  }, [id, user?.id, conversation]);

  // ── Mark messages as read ──────────────────────────────────────────────────
  // Fires immediately on mount and whenever we detect new unread messages.
  // After the DB update, also update local state so read receipts flip instantly.
  const markedOnMount = useRef(false);

  const doMark = useCallback(async () => {
    if (!id || !user) return; // Added null/undefined checks for id and user
    await markMessagesRead(id, user.id);
    // Immediately flip read_at in local state — no need to wait for next poll
    markReadLocally(user.id);
  }, [id, user?.id, markReadLocally]); // Dependencies for useCallback

  useEffect(() => {
    // Always mark on first mount
    if (!markedOnMount.current) {
      markedOnMount.current = true;
      doMark();
      return;
    }

    // Re-mark whenever new unread messages appear (detected by hasUnreadFromOther)
    const hasUnread = messages.some(m => m.sender_id !== user?.id && !m.read_at); // Added user?.id
    if (hasUnread) doMark();
  }, [messages, user?.id, doMark]); // Corrected dependencies for useEffect

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleQuickReply = (reply: string) => {
    setText(reply);
    setShowQuickReplies(false);
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content || !id || sending) return;
    setSending(true);
    setText('');

    // Optimistic: show message instantly before DB confirms
    const tempId = `temp_${Date.now()}`;
    // Explicitly using the imported Message type for clarity and correctness
    const tempMsg: Message = {
      id: tempId,
      conversation_id: id,
      sender_id: user?.id ?? '', // Ensure sender_id is never null
      content,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    appendMessage(tempMsg);

    const { data: sent, recipientId, error } = await sendMessage(id, content);
    if (error) {
      showAlert(isAr ? 'خطأ' : 'Error', error);
    } else {
      // Replace temp with confirmed DB message
      if (sent) updateMessage(tempId, sent);
      // Reconcile with DB silently
      pollSilent();
      // Send push notification to the other party (fire-and-forget)
      if (recipientId) {
        const senderDisplayName =
          user?.username || user?.email?.split('@')[0] || 'رسالة جديدة';
        notifyRecipient(recipientId, senderDisplayName, content, id);
      }
    }
    setSending(false);
    // Clear typing indicator after send
    if (conversation) {
      const isBuyer = conversation.buyer_id === user?.id; // Added user?.id
      updateTypingIndicator(id!, isBuyer, false).catch(() => {});
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }
  };

  const isBuyer = conversation?.buyer_id === user?.id;
  const isSeller = conversation?.seller_id === user?.id;
  const adStatus = (conversation as any)?.ads?.status as string | undefined;
  const adId = conversation?.ad_id;

  // Guard: if id is missing, show error state
  if (!id) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Conversation not found.</Text>
      </View>
    );
  }

  // ── Mark as Sold / Cancel Sale ──────────────────────────────────────────
  const handleMarkSold = async () => {
    if (!adId || actionLoading) return;
    setMenuVisible(false);
    showAlert(
      isAr ? 'تأكيد البيع' : 'Confirm Sale',
      isAr ? 'هل تريد تحديد هذا الإعلان كـ «تم البيع»؟ سيظهر للمشترين أنه غير متاح.' : 'Mark this listing as sold? Buyers will see it as unavailable.',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'تم البيع ✓' : 'Mark Sold ✓',
          onPress: async () => {
            setActionLoading(true);
            const { error } = await updateAdStatus(adId, 'sold');
            setActionLoading(false);
            if (error) {
              showAlert(isAr ? 'خطأ' : 'Error', error);
            } else {
              setConversation(prev => prev ? { ...prev, ads: { ...prev.ads, title: prev.ads?.title ?? '', status: 'sold' } } : prev);
              showAlert(isAr ? 'تم البيع 🎉' : 'Marked as Sold 🎉', isAr ? 'تم تحديث حالة الإعلان بنجاح.' : 'Listing status updated successfully.');
            }
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
    if (error) {
      showAlert(isAr ? 'خطأ' : 'Error', error);
    } else {
      setConversation(prev => prev ? { ...prev, ads: { ...prev.ads, title: prev.ads?.title ?? '', status: 'active' } } : prev);
      showAlert(isAr ? 'تم إعادة التفعيل' : 'Listing Reactivated', isAr ? 'الإعلان متاح للبيع مجدداً.' : 'The listing is available again.');
    }
  };

  // ── Block User ─────────────────────────────────────────────────────────
  const handleBlockUser = () => {
    setMenuVisible(false);
    const otherId = isBuyer ? conversation?.seller_id : conversation?.buyer_id;
    if (!otherId) return;
    const actionLabel = isBlocked ? (isAr ? 'رفع الحظر' : 'Unblock') : (isAr ? 'حظر' : 'Block');
    const msgText = isBlocked
      ? (isAr ? 'هل تريد رفع الحظر عن هذا المستخدم؟' : 'Unblock this user?')
      : (isAr ? 'هل تريد حظر هذا المستخدم؟ سيختفي محتواه من موجزك فوراً.' : 'Block this user? Their content will be hidden from your feed immediately.');
    showAlert(
      isAr ? (isBlocked ? 'رفع الحظر' : 'حظر المستخدم') : (isBlocked ? 'Unblock User' : 'Block User'),
      msgText,
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
              if (!error) { setIsBlocked(false); showAlert(isAr ? 'تم رفع الحظر' : 'Unblocked', isAr ? 'تم رفع الحظر عن هذا المستخدم.' : 'User has been unblocked.'); }
            } else {
              const { error } = await blockUser(otherId);
              setActionLoading(false);
              if (!error) { setIsBlocked(true); showAlert(isAr ? 'تم الحظر' : 'Blocked', isAr ? 'تم حظر هذا المستخدم. محتواه مخفي الآن.' : 'User blocked. Their content is now hidden.'); }
            }
          },
        },
      ]
    );
  };

  // ── Report User ───────────────────────────────────────────────────────
  const handleReportUser = () => {
    setMenuVisible(false);
    const otherId = isBuyer ? conversation?.seller_id : conversation?.buyer_id;
    if (!otherId || !user) return;
    showAlert(
      isAr ? 'الإبلاغ عن المستخدم' : 'Report User',
      isAr ? 'هل تريد الإبلاغ عن هذا المستخدم بسبب سلوك مسيء؟ سنراجع البلاغ خلال 24 ساعة.' : 'Report this user for abusive behavior? We will review within 24 hours.',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'إبلاغ' : 'Report',
          style: 'destructive',
          onPress: async () => {
            const supabase = (await import('@/template')).getSupabaseClient();
            // Upsert user_profiles defensively
            await supabase.from('user_profiles').upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
            await supabase.from('reports').upsert({ ad_id: conversation?.ad_id ?? '', reporter_id: user.id, reason: 'abusive_user' }, { onConflict: 'ad_id,reporter_id', ignoreDuplicates: true });
            showAlert(isAr ? 'تم الإبلاغ' : 'Reported', isAr ? 'شكراً. سنراجع هذا البلاغ خلال 24 ساعة.' : 'Thank you. We will review this report within 24 hours.');
          },
        },
      ]
    );
  };

  // ── Delete Conversation ────────────────────────────────────────────────
  const handleDeleteConversation = () => {
    setMenuVisible(false);
    showAlert(
      isAr ? 'حذف المحادثة' : 'Delete Conversation',
      isAr ? 'سيتم حذف المحادثة وجميع رسائلها بشكل نهائي. هل تريد المتابعة؟' : 'This will permanently delete the conversation and all messages. Continue?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setActionLoading(true);
            const { error } = await deleteConversation(id);
            setActionLoading(false);
            if (error) {
              showAlert(isAr ? 'خطأ' : 'Error', error);
            } else {
              router.replace('/(tabs)/messages');
            }
          },
        },
      ]
    );
  };

  const otherUser = isBuyer ? conversation?.seller : conversation?.buyer;
  const otherName = otherUser?.username || otherUser?.email?.split('@')[0] || 'User';
  const otherInitial = otherName.charAt(0).toUpperCase();
  const otherAvatarUrl = (otherUser as any)?.avatar_url ?? null;

  // Build messages with date group headers
  // Using the imported Message type for better type safety
  type MsgItem = (Message & { _type?: undefined }) | { _type: 'date'; _date: string; id: string };
  const withDates: MsgItem[] = [];
  let lastDate = '';
  for (const msg of messages) {
    const d = new Date(msg.created_at).toDateString();
    if (d !== lastDate) {
      // Cast is removed and replaced with a valid type structure
      withDates.push({ _type: 'date', _date: msg.created_at, id: `date_${msg.id}` });
      lastDate = d;
    }
    // Cast is removed and replaced with a valid type structure
    withDates.push(msg);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

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
            <Image
              source={{ uri: otherAvatarUrl }}
              style={styles.headerAvatarImg}
              contentFit="cover"
              transition={200}
            />
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
                <Text style={styles.headerAd} numberOfLines={1}>
                  {' · '}{conversation.ads.title}
                </Text>
              ) : null}
              {adStatus === 'sold' ? (
                <View style={styles.soldPill}>
                  <Text style={styles.soldPillText}>{isAr ? 'بيع' : 'Sold'}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* More options button */}
          <Pressable
            style={styles.moreBtn}
            onPress={() => setMenuVisible(true)}
            hitSlop={8}
          >
            {actionLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialIcons name="more-vert" size={22} color="#fff" />}
          </Pressable>
        </View>

        {/* ── ACTION MENU MODAL ── */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
          statusBarTranslucent
        >
          <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
            <View style={[styles.menuSheet, { backgroundColor: colors.surface }]}>
              {/* Handle */}
              <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />

              {/* Title */}
              <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>
                {isAr ? 'خيارات المحادثة' : 'Conversation Options'}
              </Text>

              {/* Sold / Cancel Sale — only for seller */}
              {isSeller ? (
                adStatus === 'sold' ? (
                  <Pressable
                    style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                    onPress={handleCancelSold}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                      <MaterialIcons name="undo" size={20} color="#D97706" />
                    </View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemTitle, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? 'إلغاء البيع' : 'Cancel Sale'}
                      </Text>
                      <Text style={[styles.menuItemSub, { color: colors.textMuted, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? 'إعادة الإعلان نشطاً للبيع مجدداً' : 'Reactivate the listing for sale'}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                    onPress={handleMarkSold}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: '#DCFCE7' }]}>
                      <MaterialIcons name="check-circle" size={20} color="#16A34A" />
                    </View>
                    <View style={styles.menuItemText}>
                      <Text style={[styles.menuItemTitle, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? 'تم البيع ✓' : 'Mark as Sold ✓'}
                      </Text>
                      <Text style={[styles.menuItemSub, { color: colors.textMuted, textAlign: isAr ? 'right' : 'left' }]}>
                        {isAr ? 'أعلم المشترين أن الإعلان غير متاح' : 'Let buyers know this item is taken'}
                      </Text>
                    </View>
                  </Pressable>
                )
              ) : null}

              {/* Block User */}
              <Pressable
                style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                onPress={handleBlockUser}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: isBlocked ? '#DBEAFE' : '#FEE2E2' }]}>
                  <MaterialIcons name={isBlocked ? 'lock-open' : 'block'} size={20} color={isBlocked ? '#2563EB' : '#EF4444'} />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: isBlocked ? '#2563EB' : '#EF4444', textAlign: isAr ? 'right' : 'left' }]}>
                    {isBlocked ? (isAr ? 'رفع الحظر' : 'Unblock User') : (isAr ? 'حظر المستخدم' : 'Block User')}
                  </Text>
                  <Text style={[styles.menuItemSub, { color: colors.textMuted, textAlign: isAr ? 'right' : 'left' }]}>
                    {isBlocked
                      ? (isAr ? 'السماح لهذا المستخدم بالتواصل مجدداً' : 'Allow this user to contact you again')
                      : (isAr ? 'إخفاء محتواه فوراً ومنعه من التواصل' : 'Hide their content and prevent contact')}
                  </Text>
                </View>
              </Pressable>

              {/* Report User */}
              <Pressable
                style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                onPress={handleReportUser}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#FFF7ED' }]}>
                  <MaterialIcons name="flag" size={20} color="#D97706" />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: '#D97706', textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'الإبلاغ عن المستخدم' : 'Report User'}
                  </Text>
                  <Text style={[styles.menuItemSub, { color: colors.textMuted, textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'إبلاغ عن سلوك مسيء — مراجعة خلال 24 ساعة' : 'Report abusive behavior — reviewed within 24h'}
                  </Text>
                </View>
              </Pressable>

              {/* Divider */}
              <View style={[styles.menuDivider, { backgroundColor: colors.borderLight }]} />

              {/* Delete Conversation */}
              <Pressable
                style={[styles.menuItem, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
                onPress={handleDeleteConversation}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
                </View>
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuItemTitle, { color: '#EF4444', textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'حذف المحادثة' : 'Delete Conversation'}
                  </Text>
                  <Text style={[styles.menuItemSub, { color: colors.textMuted, textAlign: isAr ? 'right' : 'left' }]}>
                    {isAr ? 'حذف نهائي لجميع الرسائل' : 'Permanently remove all messages'}
                  </Text>
                </View>
              </Pressable>

              {/* Cancel */}
              <Pressable
                style={[styles.menuCancelBtn, { backgroundColor: colors.background }]}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={[styles.menuCancelText, { color: colors.textPrimary }]}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Text>
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
              <RefreshControl
                refreshing={refreshing}
                onRefresh={reload}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              // Date separator
              if (item._type === 'date') { // Directly access _type
                return (
                  <View style={styles.dateSep}>
                    <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
                    <View style={[styles.datePill, { backgroundColor: colors.surfaceTint }]}>
                      <Text style={[styles.datePillText, { color: colors.textMuted }]}>
                        {formatDateGroup(item._date, isAr)}
                      </Text>
                    </View>
                    <View style={[styles.dateLine, { backgroundColor: colors.border }]} />
                  </View>
                );
              }

              const msg = item; // item is now correctly typed as Message
              const isMine = msg.sender_id === user?.id;
              const isRead = !!msg.read_at;

              return (
                <View style={[
                  styles.msgRow,
                  isMine
                    ? isAr ? styles.msgRowOther : styles.msgRowMine
                    : isAr ? styles.msgRowMine : styles.msgRowOther,
                ]}>
                  {!isMine ? (
                    <View style={[styles.bubbleAvatar, { backgroundColor: colors.primaryGhost }]}>
                      <Text style={[styles.bubbleAvatarText, { color: colors.primary }]}>{otherInitial}</Text>
                    </View>
                  ) : null}
                  <View style={styles.bubbleWrap}>
                    <View style={[
                      styles.bubble,
                      isMine
                        ? { backgroundColor: colors.primary, borderBottomRightRadius: isAr ? Radius.lg : 4, borderBottomLeftRadius: isAr ? 4 : Radius.lg }
                        : { backgroundColor: colors.surface, borderBottomLeftRadius: isAr ? Radius.lg : 4, borderBottomRightRadius: isAr ? 4 : Radius.lg, ...Shadow.sm },
                    ]}>
                      <Text style={[styles.msgText, { color: isMine ? '#fff' : colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                        {msg.content}
                      </Text>
                    </View>
                    <View style={[styles.msgMeta, { flexDirection: isMine ? (isAr ? 'row' : 'row-reverse') : (isAr ? 'row-reverse' : 'row'), gap: 4 }]}>
                      <Text style={[styles.msgTime, { color: colors.textMuted }]}>
                        {formatTime(msg.created_at)}
                      </Text>
                      {isMine ? (
                        <MaterialIcons
                          name={isRead ? 'done-all' : 'done'}
                          size={14}
                          color={isRead ? colors.primary : colors.textMuted}
                        />
                      ) : null}
                    </View>
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
            style={[
              styles.sendBtn,
              { backgroundColor: text.trim() && !sending ? colors.primary : colors.border },
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <MaterialIcons
                  name="send"
                  size={20}
                  color={text.trim() ? '#fff' : colors.textMuted}
                  style={isAr ? { transform: [{ scaleX: -1 }] } : undefined}
                />
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

  // Action Menu
  menuOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingBottom: 32, paddingTop: 12,
    gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 20,
  },
  menuHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  menuTitle: {
    fontSize: FontSize.lg, fontWeight: '700',
    textAlign: 'center', marginBottom: Spacing.sm,
  },
  menuItem: {
    alignItems: 'center', gap: Spacing.md,
    paddingVertical: 14, paddingHorizontal: 4,
  },
  menuIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  menuItemText: { flex: 1, gap: 3 },
  menuItemTitle: { fontSize: FontSize.md, fontWeight: '700' },
  menuItemSub: { fontSize: FontSize.xs, lineHeight: 16 },
  menuDivider: { height: 1, marginVertical: 6 },
  menuCancelBtn: {
    borderRadius: Radius.xl, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  menuCancelText: { fontSize: FontSize.md, fontWeight: '700' },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarImg: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarText: { color: '#fff', fontWeight: '800', fontSize: FontSize.md },
  headerInfo: { flex: 1, gap: 2 },
  headerName: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  onlineText: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)' },
  headerAd: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center' },
  msgList: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1, paddingBottom: Spacing.md },
  dateSep: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  dateLine: { flex: 1, height: 1 },
  datePill: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  datePillText: { fontSize: FontSize.xs, fontWeight: '600' },
  msgRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  bubbleAvatarText: { fontSize: FontSize.xs, fontWeight: '700' },
  bubbleWrap: { maxWidth: '72%', gap: 3 },
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  msgText: { fontSize: FontSize.md, lineHeight: 22 },
  msgMeta: { alignItems: 'center' },
  msgTime: { fontSize: 10, fontWeight: '500' },
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
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  typingRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end', marginTop: Spacing.sm },
  typingBubble: {
    borderRadius: Radius.lg, borderBottomLeftRadius: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  quickRepliesWrap: {
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  quickRepliesContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  quickReplyChip: {
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 220,
  },
  quickReplyText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  quickReplyToggleBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
});
