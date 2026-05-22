import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/template';
import { MessagePreview, EmptyState, Button } from '@/components';
import { useConversations } from '@/hooks/useChat';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, isRTL, language } = useLanguage();
  const { conversations, loading, reload, unreadCount } = useConversations();

  const totalConvs = conversations.length;
  const isAr = language === 'ar';

  const handleConvPress = useCallback((id: string) => {
    router.push(`/chat/${id}`);
  }, [router]);

  const renderConversation = useCallback(({ item }: any) => (
    <MessagePreview
      conversation={item}
      currentUserId={user!.id}
      onPress={handleConvPress}
    />
  ), [user, handleConvPress]);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>{isAr ? 'صندوق' : 'Your'}</Text>
          <Text style={styles.headerTitle}>{t.yourMessages}</Text>

          <View style={[styles.statsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.statPill, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <MaterialIcons name="chat-bubble" size={11} color="rgba(255,255,255,0.85)" />
              <Text style={styles.statPillText}>{totalConvs} {isAr ? 'محادثة' : 'chats'}</Text>
            </View>
            {unreadCount > 0 ? (
              <View style={[styles.statPill, { backgroundColor: '#F59E0B' }]}>
                <MaterialIcons name="mark-chat-unread" size={11} color="#fff" />
                <Text style={styles.statPillText}>{unreadCount} {isAr ? 'غير مقروءة' : 'unread'}</Text>
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
              <Text style={[styles.listHeaderText, { color: colors.textMuted }]}>
                {isAr ? 'الأحدث أولاً' : 'Most recent first'}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
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
          ) : null
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
    paddingTop: Spacing.sm,
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
