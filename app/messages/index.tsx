import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '@/template';
import { useConversations } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';

  const { conversations, loading, reload, unreadCount } = useConversations({
    enabled: !!user,
  });

  // تحديث البيانات عند التركيز على الشاشة
  useFocusEffect(
    useCallback(() => {
      if (user) {
        reload();
      }
    }, [user, reload])
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const otherId = item.buyer_id === user?.id ? item.seller_id : item.buyer_id;
      const otherName = item.buyer_id === user?.id ? item.seller_name : item.buyer_name;
      const displayName = otherName || (isAr ? 'مستخدم' : 'User');
      const lastMessage = item.last_message || '';
      const lastMessageTime = item.last_message_at
        ? new Date(item.last_message_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      const unread = item.unread_count || 0;

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
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
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
            {lastMessageTime && (
              <Text
                style={[
                  styles.time,
                  { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {lastMessageTime}
              </Text>
            )}
          </View>
          {unread > 0 && (
            <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [colors, isRTL, isAr, user, router]
  );

  const EmptyState = () => (
    <View style={styles.emptyWrap}>
      <MaterialIcons name="chat-bubble-outline" size={48} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        {isAr ? 'لا توجد محادثات' : 'No conversations'}
      </Text>
    </View>
  );

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
        <Text style={styles.headerTitle}>
          {isAr ? 'المحادثات' : 'Conversations'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState />}
      />
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
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: '#fff',
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
});