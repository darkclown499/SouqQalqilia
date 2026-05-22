import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Conversation } from '@/services/chatService';
import { Radius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { timeAgo } from '@/utils/timeAgo';

interface MessagePreviewProps {
  conversation: Conversation;
  currentUserId: string;
  onPress: (id: string) => void;
}

const AVATAR_COLORS = ['#0A6E5C', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#10B981'];
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export const MessagePreview = memo(function MessagePreview({
  conversation, currentUserId, onPress,
}: MessagePreviewProps) {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();

  const isBuyer = conversation.buyer_id === currentUserId;
  const otherUser = isBuyer ? conversation.seller : conversation.buyer;
  const otherName = otherUser?.username || otherUser?.email?.split('@')[0] || 'User';
  const avatarColor = getAvatarColor(otherName);
  const avatarUrl = (otherUser as any)?.avatar_url;

  const adTitle = (conversation as any).ads?.title ?? '';
  const adThumb = (conversation as any).ad_images?.[0]?.url ?? (conversation as any).ads?.ad_images?.[0]?.url;

  const unreadCount: number = (conversation as any).unread_count ?? 0;
  const hasUnread = unreadCount > 0;

  const lastMsg = conversation.last_message ?? '';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed
            ? colors.surfaceTint
            : hasUnread
            ? colors.primaryGhost
            : colors.surface,
        },
      ]}
      onPress={() => onPress(conversation.id)}
    >
      {/* Unread indicator bar */}
      {hasUnread ? (
        <View style={[styles.unreadBar, { backgroundColor: colors.primary }]} />
      ) : null}

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {avatarUrl ? (
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
        {/* Name + time row */}
        <View style={[styles.top, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text
            style={[styles.name, { color: colors.textPrimary, fontWeight: hasUnread ? '700' : '600' }]}
            numberOfLines={1}
          >
            {otherName}
          </Text>
          <Text style={[styles.time, { color: hasUnread ? colors.primary : colors.textMuted, fontWeight: hasUnread ? '700' : '400' }]}>
            {timeAgo(conversation.last_message_at)}
          </Text>
        </View>

        {/* Ad title reference */}
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

        {/* Last message */}
        <Text
          style={[
            styles.lastMessage,
            {
              color: hasUnread ? colors.textPrimary : colors.textSecondary,
              fontWeight: hasUnread ? '600' : '400',
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
          numberOfLines={2}
        >
          {lastMsg || (isRTL ? 'ابدأ المحادثة...' : 'Start a conversation...')}
        </Text>
      </View>

      {/* Right: unread badge or chevron */}
      <View style={styles.right}>
        {hasUnread ? (
          <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.unreadText}>
              {unreadCount > 99 ? '99+' : String(unreadCount)}
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
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.md,
    position: 'relative',
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  right: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
