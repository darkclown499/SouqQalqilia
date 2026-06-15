import React, { memo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Conversation, markMessagesRead } from '@/services/chatService';
import {
  useChatReadStore,
  markConversationRead,
  rollbackConversationRead,
  shouldOverrideServerCount,
} from '@/stores/chatReadStore';
import { Radius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { timeAgo } from '@/utils/timeAgo';
import { ShimmerBlock } from '@/components/feature/AdCard';

// ── Skeleton loading row ─────────────────────────────────────────────────────
function MessageSkeletonRow({ isDark, colors }: { isDark: boolean; colors: any }) {
  return (
    <View style={skelStyles.row}>
      <ShimmerBlock style={[skelStyles.avatar, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
      <View style={skelStyles.content}>
        <ShimmerBlock style={[skelStyles.nameLine, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
        <ShimmerBlock style={[skelStyles.adLine, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
        <ShimmerBlock style={[skelStyles.msgLine, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
      </View>
      <ShimmerBlock style={[skelStyles.timeBadge, { backgroundColor: colors.surfaceTint }]} isDark={isDark} />
    </View>
  );
}

export function MessageListSkeleton() {
  const { colors, isDark } = useTheme();
  return (
    <View style={skelStyles.container}>
      {Array.from({ length: 6 }).map((_, i) => (
        <MessageSkeletonRow key={i} isDark={isDark} colors={colors} />
      ))}
    </View>
  );
}

const skelStyles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 14, gap: Spacing.md,
  },
  avatar: { width: 54, height: 54, borderRadius: 27, flexShrink: 0 },
  content: { flex: 1, gap: 6, minWidth: 0 },
  nameLine: { height: 13, borderRadius: 6, width: '55%' },
  adLine: { height: 10, borderRadius: 5, width: '35%' },
  msgLine: { height: 11, borderRadius: 5, width: '85%' },
  timeBadge: { width: 38, height: 10, borderRadius: 5, flexShrink: 0, alignSelf: 'flex-start', marginTop: 3 },
});

// ─────────────────────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 72;
const SWIPE_MAX = 110;

const AVATAR_COLORS = ['#0A6E5C', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#10B981'];
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ── Swipe hint overlay ───────────────────────────────────────────────────────
function SwipeHint({ visible, dir, colors, isAr }: {
  visible: boolean; dir: 'left' | 'right'; colors: any; isAr: boolean;
}) {
  if (!visible) return null;
  const isRight = dir === 'right';
  return (
    <View
      style={[hintS.wrap, isRight ? hintS.right : hintS.left, { backgroundColor: colors.primary }]}
      pointerEvents="none"
    >
      <MaterialIcons name={isRight ? 'chevron-right' : 'chevron-left'} size={18} color="#fff" />
      <MaterialIcons name="done-all" size={16} color="#fff" />
      <Text style={hintS.label}>{isAr ? 'تمييز كمقروء' : 'Mark as read'}</Text>
      <MaterialIcons name={isRight ? 'chevron-right' : 'chevron-left'} size={18} color="#fff" />
    </View>
  );
}

const hintS = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, borderRadius: 10,
    justifyContent: 'center', minWidth: 100,
  },
  right: { right: 8 },
  left: { left: 8 },
  label: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
interface MessagePreviewProps {
  conversation: Conversation;
  currentUserId: string;
  onPress: (id: string) => void;
  isBlocked?: boolean;
  /** Called after successful DB mark — parent can do a background server sync */
  onMarkedRead?: (conversationId: string) => void;
}

export const MessagePreview = memo(function MessagePreview({
  conversation,
  currentUserId,
  onPress,
  isBlocked = false,
  onMarkedRead,
}: MessagePreviewProps) {
  const { colors } = useTheme();
  const { isRTL, language } = useLanguage();
  const isAr = language === 'ar';

  // ── Subscribe to the global read store ────────────────────────────────────
  // useChatReadStore() returns a version number. The component re-renders only
  // when markConversationRead() or rollbackConversationRead() is called —
  // NOT on every server poll. This is the key to zero-flicker behaviour.
  useChatReadStore();

  const isBuyer = conversation.buyer_id === currentUserId;
  const otherUser = isBuyer ? conversation.seller : conversation.buyer;
  const otherName = isBlocked
    ? (isAr ? 'مستخدم محظور' : 'Blocked User')
    : (otherUser?.username || otherUser?.email?.split('@')[0] || 'User');
  const avatarColor = getAvatarColor(otherName);
  const avatarUrl = (otherUser as any)?.avatar_url;

  const adTitle = (conversation as any).ads?.title ?? '';
  const rawAdImages: any[] = (conversation as any).ads?.ad_images ?? [];
  const adThumb = [...rawAdImages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url ?? null;

  // ── Derive hasUnread via Timestamp Fencing ──────────────────────────────
  // shouldOverrideServerCount() compares the store's markedAt epoch against
  // conversation.last_message_at — NOT integer counts. This eliminates the
  // "8 messages" bug where old+new counts were summed incorrectly.
  const serverUnread: number = (conversation as any).unread_count ?? 0;
  const lastMsgAt: string | null = (conversation as any).last_message_at ?? null;
  // override=true means: same messages, still being processed → show as read
  // override=false means: new message arrived after mark → show real badge
  const overrideToRead = shouldOverrideServerCount(conversation.id, lastMsgAt);
  const hasUnread = serverUnread > 0 && !overrideToRead;
  // Display count: always 0 when locally read (prevents badge flicker)
  const displayUnread = hasUnread ? serverUnread : 0;

  const lastMsg = conversation.last_message ?? '';

  // ── Swipe state ────────────────────────────────────────────────────────────
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiping, setSwiping] = useState(false);
  const [swipeDir, setSwipeDir] = useState<'left' | 'right'>('right');
  const [marking, setMarking] = useState(false);
  const isDragging = useRef(false);
  // Stable ref to the latest triggerMarkRead — prevents stale closure inside
  // PanResponder which is created once via useRef and never re-created.
  const triggerMarkReadRef = useRef<() => Promise<void>>(async () => {});

  const snapBack = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0, useNativeDriver: true,
      damping: 18, stiffness: 220,
    }).start();
    setSwiping(false);
    isDragging.current = false;
  }, [translateX]);

  const triggerMarkRead = useCallback(async () => {
    // Only act on conversations that are actually unread
    if (!hasUnread || marking) { snapBack(); return; }
    setMarking(true);

    // ── STEP 1: Optimistic update — synchronous, before any await ───────────
    // Pass the CURRENT last_message_at as the fence anchor.
    // This is the key fix for the swipe-lock bug: using the live prop value
    // (not a stale closure) ensures the fence is always fresh.
    markConversationRead(conversation.id, lastMsgAt);

    // ── STEP 2: Visual snap animation (purely cosmetic) ────────────────────
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: swipeDir === 'right' ? SWIPE_MAX : -SWIPE_MAX,
        duration: 80, useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0, useNativeDriver: true,
        damping: 18, stiffness: 220,
      }),
    ]).start();
    setSwiping(false);
    isDragging.current = false;

    // ── STEP 3: Persist to DB in background ───────────────────────────────
    try {
      await markMessagesRead(conversation.id, currentUserId);
      // Signal parent for a background server sync (badge re-count etc.)
      onMarkedRead?.(conversation.id);
    } catch {
      // ── ROLLBACK: DB call failed — revert optimistic update ────────────
      rollbackConversationRead(conversation.id);
      // (UI re-renders automatically via store notification)
    }
    setMarking(false);
  }, [hasUnread, marking, conversation.id, lastMsgAt, currentUserId, swipeDir, translateX, onMarkedRead, snapBack]);

  // Keep ref pointing to the latest triggerMarkRead after every render
  useEffect(() => { triggerMarkReadRef.current = triggerMarkRead; }, [triggerMarkRead]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.4,
      onPanResponderGrant: () => {
        isDragging.current = true;
        setSwiping(true);
      },
      onPanResponderMove: (_e, gs) => {
        const dir = gs.dx > 0 ? 'right' : 'left';
        setSwipeDir(dir);
        const sign = gs.dx > 0 ? 1 : -1;
        const abs = Math.abs(gs.dx);
        const clamped = abs > SWIPE_THRESHOLD
          ? SWIPE_THRESHOLD + (abs - SWIPE_THRESHOLD) * 0.35
          : abs;
        translateX.setValue(sign * Math.min(clamped, SWIPE_MAX));
      },
      onPanResponderRelease: (_e, gs) => {
        if (Math.abs(gs.dx) >= SWIPE_THRESHOLD) {
          triggerMarkReadRef.current();
        } else {
          snapBack();
        }
      },
      onPanResponderTerminate: () => snapBack(),
    })
  ).current;

  // Swipe hint: show when drag crosses 20 px
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    const id = translateX.addListener(({ value }) => setShowHint(Math.abs(value) > 20));
    return () => translateX.removeListener(id);
  }, [translateX]);

  return (
    <View style={styles.container}>
      {/* Swipe hint backdrop — only shown when the row has unread messages */}
      <SwipeHint visible={showHint && hasUnread} dir={swipeDir} colors={colors} isAr={isAr} />

      <Animated.View
        style={[styles.rowAnimated, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed
                ? colors.surfaceTint
                : hasUnread
                ? colors.primaryGhost
                : colors.surface,
              opacity: marking ? 0.75 : 1,
            },
          ]}
          onPress={() => {
            if (isDragging.current) return;
            onPress(conversation.id);
          }}
        >
          {/* Unread bar */}
          {hasUnread ? (
            <View style={[styles.unreadBar, { backgroundColor: colors.primary }]} />
          ) : null}

          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {isBlocked ? (
              <View style={[styles.avatar, { backgroundColor: '#EF4444' }]}>
                <MaterialIcons name="block" size={24} color="#fff" />
              </View>
            ) : avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={[styles.avatar, { borderColor: hasUnread ? colors.primary : 'transparent', borderWidth: hasUnread ? 2 : 0 }]}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColor, borderColor: hasUnread ? colors.primary : 'transparent', borderWidth: hasUnread ? 2 : 0 }]}>
                <Text style={styles.avatarText}>{otherName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={[styles.content, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.top, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.name, { color: colors.textPrimary, fontWeight: hasUnread ? '700' : '600' }]} numberOfLines={1}>
                {otherName}
              </Text>
              <Text style={[styles.time, { color: hasUnread ? colors.primary : colors.textMuted, fontWeight: hasUnread ? '700' : '400' }]}>
                {timeAgo(conversation.last_message_at)}
              </Text>
            </View>

            {adTitle ? (
              <View style={[styles.adRef, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {adThumb ? (
                  <Image source={{ uri: adThumb }} style={styles.adThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.adThumbPlaceholder, { backgroundColor: colors.primaryGhost }]}>
                    <MaterialIcons name="storefront" size={9} color={colors.primary} />
                  </View>
                )}
                <Text style={[styles.adRefText, { color: colors.primary }]} numberOfLines={1}>{adTitle}</Text>
              </View>
            ) : null}

            <Text
              style={[
                styles.lastMessage,
                {
                  color: isBlocked ? '#EF4444' : hasUnread ? colors.textPrimary : colors.textSecondary,
                  fontWeight: hasUnread ? '600' : '400',
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
              numberOfLines={2}
            >
              {isBlocked
                ? (isAr ? 'هذا المستخدم محظور — المحتوى مخفي' : 'This user is blocked — content hidden')
                : lastMsg || (isRTL ? 'ابدأ المحادثة...' : 'Start a conversation...')}
            </Text>

            {/* Static swipe affordance hint */}
            {hasUnread && !swiping ? (
              <View style={[styles.swipeHintStatic, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={11} color={colors.primary} />
                <Text style={[styles.swipeHintText, { color: colors.primary }]}>
                  {isAr ? 'اسحب يمينًا أو يسارًا لتمييز كمقروء' : 'Swipe to mark as read'}
                </Text>
                <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={11} color={colors.primary} />
              </View>
            ) : null}
          </View>

          {/* Badge / chevron */}
          <View style={styles.right}>
            {hasUnread ? (
              <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.unreadText}>
                  {displayUnread > 99 ? '99+' : String(displayUnread)}
                </Text>
              </View>
            ) : (
              <MaterialIcons
                name={isRTL ? 'chevron-left' : 'chevron-right'}
                size={20}
                color={colors.textMuted}
              />
            )}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { position: 'relative', overflow: 'hidden' },
  rowAnimated: {},
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    gap: Spacing.md, position: 'relative',
  },
  unreadBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3,
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  content: { flex: 1, gap: 3, minWidth: 0 },
  top: { justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  name: { fontSize: FontSize.md, flex: 1 },
  time: { fontSize: FontSize.xs, flexShrink: 0 },
  adRef: { alignItems: 'center', gap: 5, flexWrap: 'nowrap' },
  adThumb: { width: 18, height: 18, borderRadius: 4 },
  adThumbPlaceholder: { width: 18, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  adRefText: { fontSize: FontSize.xs, fontWeight: '600', flex: 1 },
  lastMessage: { fontSize: FontSize.sm, lineHeight: 18 },
  swipeHintStatic: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  swipeHintText: { fontSize: 10, fontWeight: '600', opacity: 0.8 },
  right: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unreadBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
