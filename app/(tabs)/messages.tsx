import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/template';
import { MessagePreview, EmptyState, Button } from '@/components';
import { MessageListSkeleton } from '@/components/feature/MessagePreview';
import { useConversations, triggerUnreadRefresh } from '@/hooks/useChat';
import { markMessagesRead } from '@/services/chatService';
import { markConversationRead } from '@/stores/chatReadStore';
import { fetchBlockedIds, subscribeToBlockChanges } from '@/services/blockService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

// ── Helpers ──────────────────────────────────────────────────────────────────
const pluralize = (count: number, singular: string, plural: string): string => {
  return count === 1 ? singular : plural;
};

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, isRTL, language } = useLanguage();
  const { conversations, loading, reload, unreadCount, error: convError } = useConversations();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // ── Auto-mark all unread conversations on tab focus ────────────────────────
  const conversationsRef = useRef<typeof conversations>([]);
  conversationsRef.current = conversations;
  const isFocusedRef = useRef(false);
  const markedReadSetRef = useRef<Set<string>>(new Set());

  // ✅ تحسين: إضافة شرط isFocusedRef داخل الدالة
  const autoMarkAllUnread = useCallback(() => {
    if (!user || !isFocusedRef.current) return;

    const unreadConvs = conversationsRef.current.filter(
      (c: any) => (c.unread_count ?? 0) > 0 && !markedReadSetRef.current.has(c.id)
    );
    if (unreadConvs.length === 0) return;

    // Optimistic local update
    unreadConvs.forEach((conv: any) => {
      markConversationRead(conv.id, conv.last_message_at ?? null);
      markedReadSetRef.current.add(conv.id);
    });

    // DB writes – parallel, fire-and-forget
    Promise.all(
      unreadConvs.map((conv: any) =>
        markMessagesRead(conv.id, user.id).catch((err) => {
          console.warn(`Failed to mark conversation ${conv.id} as read:`, err);
        })
      )
    )
      .then(() => triggerUnreadRefresh().catch(console.warn))
      .catch(console.warn);
  }, [user]);

  // ✅ دمج FocusEffect + useEffect في منطق واحد
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      autoMarkAllUnread();
      return () => {
        isFocusedRef.current = false;
      };
    }, [autoMarkAllUnread])
  );

  // ✅ useEffect إضافي فقط يُستدعى عند تغير المحادثات إذا كان التبويب نشطاً
  useEffect(() => {
    if (isFocusedRef.current && !loading) {
      autoMarkAllUnread();
    }
  }, [conversations, loading, autoMarkAllUnread]);

  // ── Blocked IDs with incremental update ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const fetch = async () => {
      try {
        const ids = await fetchBlockedIds({ signal: controller.signal });
        // ✅ تحديث تدريجي بدلاً من استبدال Set بالكامل
        setBlockedIds(prev => new Set([...prev, ...ids]));
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn('Failed to fetch blocked IDs:', err);
        setError('Failed to load blocked users');
      }
    };
    fetch();
    return () => controller.abort();
  }, [user?.id]);

  // Re-sync when any block/unblock happens
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToBlockChanges(() => {
      fetchBlockedIds()
        .then(ids => {
          // ✅ تحديث تدريجي (يعني نستبدل القائمة بالكامل هنا لأنها عملية إعادة تحميل كاملة)
          setBlockedIds(new Set(ids));
        })
        .catch(console.warn);
    });
    return unsub;
  }, [user?.id]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalConvs = conversations.length;
  const isAr = language === 'ar';
  // ✅ تحويل convError إلى string بأمان
  const hasError = convError ? String(convError) : error;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleConvPress = useCallback((id: string) => {
    router.push(`/chat/${id}`);
  }, [router]);

  const handleMarkedRead = useCallback((_conversationId: string) => {
    setTimeout(() => triggerUnreadRefresh().catch(console.warn), 2000);
  }, []);

  const renderConversation = useCallback(({ item }: any) => {
    const otherId = item.buyer_id === user!.id ? item.seller_id : item.buyer_id;
    return (
      <MessagePreview
        conversation={item}
        currentUserId={user!.id}
        onPress={handleConvPress}
        isBlocked={blockedIds.has(otherId)}
        onMarkedRead={handleMarkedRead}
      />
    );
  }, [user, handleConvPress, blockedIds, handleMarkedRead]);

  // ── Guest (not logged in) ──────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={[styles.guest, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>{isAr ? 'صندوق' : 'Your'}</Text>
            <Text style={styles.headerTitle}>{t.yourMessages}</Text>
          </View>
          <View style={[styles.headerIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <MaterialIcons name="chat-bubble-outline" size={24} color="#fff" />
          </View>
        </View>
        <View style={styles.guestBody}>
          <View style={[styles.guestIllustration, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="forum" size={52} color={colors.primary} />
          </View>
          <Text style={[styles.guestTitle, { color: colors.textPrimary }]}>{t.signInMessages}</Text>
          <Text style={[styles.guestSub, { color: colors.textMuted }]}>{t.signInMessagesSub}</Text>
          <Button label={t.signInRegister} onPress={() => router.push('/login')} style={styles.guestBtn} />
        </View>
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (hasError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>{isAr ? 'صندوق' : 'Your'}</Text>
            <Text style={styles.headerTitle}>{t.yourMessages}</Text>
          </View>
          <View style={[styles.headerIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <MaterialIcons name="forum" size={26} color="#fff" />
          </View>
        </View>
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="error-outline" size={44} color={colors.error || '#EF4444'} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {isAr ? 'حدث خطأ' : 'Something went wrong'}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {hasError}
          </Text>
          <Pressable
            style={[styles.browseBtn, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => { setError(null); reload(); }}
          >
            <MaterialIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.browseBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + Spacing.sm }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>{isAr ? 'صندوق' : 'Your'}</Text>
          <Text style={styles.headerTitle}>{t.yourMessages}</Text>

          <View style={[styles.statsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.statPill, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <MaterialIcons name="chat-bubble" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.statPillText}>
                {totalConvs} {isAr ? pluralize(totalConvs, 'محادثة', 'محادثات') : pluralize(totalConvs, 'chat', 'chats')}
              </Text>
            </View>
            {unreadCount > 0 ? (
              <View style={[styles.statPill, { backgroundColor: '#F59E0B' }]}>
                <MaterialIcons name="mark-chat-unread" size={11} color="#fff" />
                <Text style={styles.statPillText}>
                  {unreadCount} {isAr ? pluralize(unreadCount, 'غير مقروءة', 'غير مقروءة') : pluralize(unreadCount, 'unread', 'unread')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.headerIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <MaterialIcons name="forum" size={26} color="#fff" />
          {unreadCount > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── CONVERSATION LIST ── */}
      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={renderConversation}
        windowSize={5}
        maxToRenderPerBatch={15}
        initialNumToRender={15}
        removeClippedSubviews={true}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
        )}
        refreshing={loading}
        onRefresh={reload}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          totalConvs > 0 ? (
            <View style={[styles.listHeader, { backgroundColor: colors.surfaceTint, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <MaterialIcons name="sort" size={14} color={colors.textMuted} />
              <Text style={[styles.listHeaderText, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'الأحدث أولاً' : 'Most recent first'}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <MessageListSkeleton />
          ) : (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIllus, { backgroundColor: colors.surfaceTint }]}>
                <MaterialIcons name="chat-bubble-outline" size={44} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t.noConversations}</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>{t.noConversationsSub}</Text>
              <Pressable
                style={[styles.browseBtn, { backgroundColor: colors.primary, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => router.push('/(tabs)/')}
              >
                <MaterialIcons name="storefront" size={16} color="#fff" />
                <Text style={styles.browseBtnText}>{isAr ? 'تصفح الإعلانات' : 'Browse Listings'}</Text>
              </Pressable>
            </View>
          )
        }
        contentContainerStyle={totalConvs === 0 ? { flex: 1 } : { paddingBottom: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    // ✅ paddingTop تم نقله إلى الداخل لاستخدام insets.top
    // paddingTop: Math.max(Spacing.sm, 8),  // أزلنا هذا السطر
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 2,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
    marginBottom: Spacing.sm,
  },
  statsRow: {
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statPillText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  listHeaderText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },

  separator: { height: 1 },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIllus: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 13,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  guest: { flex: 1 },
  guestBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  guestIllustration: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  guestTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  guestSub: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  guestBtn: { width: '100%', marginTop: Spacing.sm },
});