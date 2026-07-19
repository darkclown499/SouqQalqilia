import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  RefreshControl, Platform, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import NetInfo from '@react-native-community/netinfo';
import { useAuth, useAlert } from '@/template';
import { useConversations } from '@/hooks/useChat';
import { deleteConversation } from '@/services/chatService';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConversationItem {
  id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name?: string;
  seller_name?: string;
  buyer_avatar?: string | null;
  seller_avatar?: string | null;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
}

// ── Helper: time ago ─────────────────────────────────────────────────────────
function timeAgo(dateStr: string, isAr: boolean): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return isAr ? 'الآن' : 'now';
  if (diff < 3600) return isAr ? `منذ ${Math.floor(diff / 60)} دقيقة` : `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return isAr ? `منذ ${Math.floor(diff / 3600)} ساعة` : `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return isAr ? `منذ ${Math.floor(diff / 86400)} يوم` : `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' });
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';

  // ✅ استدعاء useConversations مع معالجة الخطأ
  let conversationsData;
  try {
    conversationsData = useConversations({ enabled: !!user });
  } catch (err) {
    console.error('[MessagesScreen] useConversations error:', err);
    conversationsData = {
      conversations: [],
      loading: false,
      reload: () => Promise.resolve(),
      unreadCount: 0,
    };
  }

  const {
    conversations = [],
    loading = false,
    reload = () => Promise.resolve(),
    unreadCount = 0,
  } = conversationsData;

  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);
  const isReloading = useRef(false);
  const lastReloadTime = useRef(0);
  const RELOAD_DEBOUNCE_MS = 3000;

  // مراقبة حالة الاتصال
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== false);
    });
    return () => unsub();
  }, []);

  // ✅ دالة تحميل آمنة مع التحقق من وجود reload
  const safeReload = useCallback(async () => {
    if (isReloading.current) {
      console.log('⏳ تحميل جارٍ بالفعل، تم تجاهل الطلب');
      return;
    }
    const now = Date.now();
    if (now - lastReloadTime.current < RELOAD_DEBOUNCE_MS) {
      console.log('⏳ تم التحميل مؤخراً، تم تجاهل الطلب');
      return;
    }
    isReloading.current = true;
    lastReloadTime.current = now;
    setError(null);

    try {
      if (typeof reload === 'function') {
        await reload();
      } else {
        console.warn('[MessagesScreen] reload is not a function');
        setError(isAr ? 'تعذر تحديث المحادثات' : 'Failed to reload conversations');
      }
    } catch (err: any) {
      console.error('[MessagesScreen] reload error:', err);
      if (isMounted.current) {
        setError(err?.message || (isAr ? 'فشل تحميل المحادثات' : 'Failed to load conversations'));
      }
    } finally {
      isReloading.current = false;
    }
  }, [reload, isAr]);

  // ✅ تحديث البيانات عند التركيز مع منع التحميل المتكرر
  useFocusEffect(
    useCallback(() => {
      if (user && isMounted.current) {
        safeReload();
      }
    }, [user, safeReload])
  );

  // ✅ دالة التحديث اليدوي
  const handleRefresh = useCallback(async () => {
    if (!isMounted.current) return;
    setRefreshing(true);
    await safeReload();
    setRefreshing(false);
  }, [safeReload]);

  // ── حذف المحادثة بالضغط المطول ──────────────────────────────────────────
  const handleLongPress = useCallback((conversationId: string) => {
    showAlert(
      isAr ? 'حذف المحادثة' : 'Delete Conversation',
      isAr ? 'هل تريد حذف هذه المحادثة نهائياً؟' : 'Delete this conversation permanently?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteConversation(conversationId);
              await safeReload();
            } catch (err: any) {
              showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل الحذف' : 'Delete failed'));
            }
          },
        },
      ]
    );
  }, [isAr, showAlert, safeReload]);

  // ── تصفية المحادثات مع التحقق من البيانات ─────────────────────────────
  const filteredConversations = useMemo(() => {
    // ✅ تأكد من وجود conversations وأنها مصفوفة
    if (!conversations || !Array.isArray(conversations)) return [];
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((item: ConversationItem) => {
      if (!item) return false;
      const otherName = item.buyer_id === user?.id ? item.seller_name : item.buyer_name;
      const name = otherName || (isAr ? 'مستخدم' : 'User');
      return name.toLowerCase().includes(query) || (item.last_message || '').toLowerCase().includes(query);
    });
  }, [conversations, searchQuery, user, isAr]);

  // ── Render item مع التحقق من العنصر ─────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: ConversationItem }) => {
      // ✅ تأكد من وجود item
      if (!item || !item.id) {
        return null;
      }

      const otherId = item.buyer_id === user?.id ? item.seller_id : item.buyer_id;
      const otherName = item.buyer_id === user?.id ? item.seller_name : item.buyer_name;
      const otherAvatar = item.buyer_id === user?.id ? item.seller_avatar : item.buyer_avatar;
      const displayName = otherName || (isAr ? 'مستخدم' : 'User');
      const lastMessage = item.last_message || '';
      const unread = item.unread_count ?? 0; // ✅ استخدام ?? بدلاً من ||
      const time = item.last_message_at ? timeAgo(item.last_message_at, isAr) : '';

      return (
        <Pressable
          style={({ pressed }) => [
            styles.item,
            {
              backgroundColor: pressed ? colors.primaryGhost : colors.background,
              borderColor: colors.borderLight,
              flexDirection: isRTL ? 'row-reverse' : 'row',
            },
          ]}
          onPress={() => router.push(`/chat/${item.id}` as any)}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={500}
        >
          {/* الصورة الرمزية */}
          {otherAvatar ? (
            <Image source={{ uri: otherAvatar }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}

          <View style={[styles.body, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text
              style={[
                styles.name,
                { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' },
              ]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text
              style={[
                styles.lastMsg,
                { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' },
              ]}
              numberOfLines={1}
            >
              {lastMessage || (isAr ? 'لا توجد رسائل' : 'No messages')}
            </Text>
            {time ? (
              <Text
                style={[
                  styles.time,
                  { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {time}
              </Text>
            ) : null}
          </View>
          {unread > 0 && (
            <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [colors, isRTL, isAr, user, router, handleLongPress]
  );

  // ── Empty State محسّن ────────────────────────────────────────────────────
  const EmptyState = useCallback(() => (
    <View style={styles.emptyWrap}>
      <MaterialIcons name="chat-bubble-outline" size={48} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textPrimary }]}>
        {searchQuery.trim() ? (isAr ? 'لا توجد نتائج' : 'No results found') : (isAr ? 'لا توجد محادثات بعد' : 'No conversations yet')}
      </Text>
      <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
        {searchQuery.trim()
          ? (isAr ? 'جرب كلمة بحث مختلفة' : 'Try a different search term')
          : (isAr ? 'تواصل مع البائعين لبدء محادثة جديدة' : 'Contact sellers to start a new conversation')
        }
      </Text>
      {!searchQuery.trim() && (
        <Pressable
          style={[styles.exploreBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(tabs)')}
        >
          <Text style={styles.exploreBtnText}>
            {isAr ? 'استكشف الإعلانات' : 'Explore Listings'}
          </Text>
        </Pressable>
      )}
    </View>
  ), [colors, isAr, router, searchQuery]);

  // ── getItemLayout محسن ──────────────────────────────────────────────────
  const getItemLayout = useCallback((data: any, index: number) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { length: 80, offset: 0, index };
    }
    return {
      length: 80,
      offset: 80 * index,
      index,
    };
  }, []);

  // ── التحقق من تسجيل الدخول ──────────────────────────────────────────────
  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MaterialIcons name="person-off" size={48} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          {isAr ? 'يرجى تسجيل الدخول لعرض المحادثات' : 'Please log in to view conversations'}
        </Text>
      </View>
    );
  }

  // ── حالة التحميل الأولي ──────────────────────────────────────────────────
  if (loading && (!conversations || conversations.length === 0)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textMuted }}>
          {isAr ? 'جاري تحميل المحادثات...' : 'Loading conversations...'}
        </Text>
      </View>
    );
  }

  // ── واجهة المستخدم الرئيسية ─────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* الهيدر */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons
            name={isRTL ? 'arrow-forward' : 'arrow-back'}
            size={24}
            color="#fff"
          />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {isAr ? 'المحادثات' : 'Conversations'}
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.headerBadge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.headerBadgeText}>
                {unreadCount > 99 ? '99+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={styles.refreshBtn}
          onPress={handleRefresh}
          hitSlop={8}
          disabled={refreshing || loading}
        >
          {(refreshing || loading) ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="refresh" size={24} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* شريط البحث */}
      <View style={[styles.searchContainer, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={[styles.searchInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={isAr ? 'ابحث في المحادثات...' : 'Search conversations...'}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* شريط انقطاع الإنترنت */}
      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: '#F59E0B' }]}>
          <MaterialIcons name="wifi-off" size={16} color="#fff" />
          <Text style={styles.offlineText}>
            {isAr ? 'أنت غير متصل' : 'You are offline'}
          </Text>
        </View>
      )}

      {/* عرض الخطأ إن وجد */}
      {error ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={40} color="#EF4444" />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => { setError(null); handleRefresh(); }}
            style={[styles.retryBtn, { borderColor: colors.primary }]}
          >
            <Text style={{ color: colors.primary, fontWeight: '700' }}>
              {isAr ? 'إعادة المحاولة' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={<EmptyState />}
          getItemLayout={getItemLayout}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={11}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: '#fff',
  },
  headerBadge: {
    borderRadius: 99,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  // أنماط شريط البحث
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '500',
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: 80,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  lastMsg: {
    fontSize: FontSize.sm,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
  },
  badge: {
    borderRadius: 99,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyWrap: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -4,
  },
  exploreBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  exploreBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
  },
});