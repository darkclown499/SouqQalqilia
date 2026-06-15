import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { Conversation } from '@/services/chatService';
import { Radius, FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { timeAgo } from '@/utils/timeAgo';
import { ShimmerBlock } from '@/components/feature/AdCard';

// ── Skeleton loading row ──────────────────────────────────────────────────────────────────
// Mimics the exact flex layout of MessagePreview so the loading state
// visually matches the real list without layout shift.
function MessageSkeletonRow({ isDark, colors }: { isDark: boolean; colors: any }) {
  return (
    <View style={skelStyles.row}>
      {/* Circular avatar placeholder */}
      <ShimmerBlock
        style={[skelStyles.avatar, { backgroundColor: colors.surfaceTint }]}
        isDark={isDark}
      />
      {/* Central content column */}
      <View style={skelStyles.content}>
        {/* Name line — shorter, heavier */}
        <ShimmerBlock
          style={[skelStyles.nameLine, { backgroundColor: colors.surfaceTint }]}
          isDark={isDark}
        />
        {/* Ad reference stub */}
        <ShimmerBlock
          style={[skelStyles.adLine, { backgroundColor: colors.surfaceTint }]}
          isDark={isDark}
        />
        {/* Last message line — wider, thinner */}
        <ShimmerBlock
          style={[skelStyles.msgLine, { backgroundColor: colors.surfaceTint }]}
          isDark={isDark}
        />
      </View>
      {/* Timestamp badge on far right */}
      <ShimmerBlock
        style={[skelStyles.timeBadge, { backgroundColor: colors.surfaceTint }]}
        isDark={isDark}
      />
    </View>
  );
}

/** Drop-in loading placeholder for the messages tab.
 *  Renders 6 skeleton rows that accurately mirror the real MessagePreview layout.
 *  Pass this in place of an empty / null list while conversations are fetching.
 */
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.md,
  },
  // Circle matching the avatar in the real row (54×54, radius 27)
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    flexShrink: 0,
  },
  content: { flex: 1, gap: 6, minWidth: 0 },
  // Sender name: 55% width, 13px tall — feels like a bold short name
  nameLine: {
    height: 13,
    borderRadius: 6,
    width: '55%',
  },
  // Ad reference stub: 35% width, 10px tall
  adLine: {
    height: 10,
    borderRadius: 5,
    width: '35%',
  },
  // Last message: 85% width, 11px tall
  msgLine: {
    height: 11,
    borderRadius: 5,
    width: '85%',
  },
  // Timestamp on the right: small rectangular pill
  timeBadge: {
    width: 38,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
});

// ────────────────────────────────────────────────────────────────────────
interface MessagePreviewProps {
  conversation: Conversation;
  currentUserId: string;
  onPress: (id: string) => void;
  isBlocked?: boolean;
}

const AVATAR_COLORS = ['#0A6E5C', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#10B981'];
function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export const MessagePreview = memo(function MessagePreview({
  conversation, currentUserId, onPress, isBlocked = false,
}: MessagePreviewProps) {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();

  const { language } = useLanguage();
  const isAr = language === 'ar';
  const isBuyer = conversation.buyer_id === currentUserId;
  const otherUser = isBuyer ? conversation.seller : conversation.buyer;
  const otherName = isBlocked
    ? (isAr ? 'مستخدم محظور' : 'Blocked User')
    : (otherUser?.username || otherUser?.email?.split('@')[0] || 'User');
  const avatarColor = getAvatarColor(otherName);
  const avatarUrl = (otherUser as any)?.avatar_url;

  const adTitle = (conversation as any).ads?.title ?? '';
  const rawAdImages: any[] = (conversation as any).ads?.ad_images ?? [];
  const sortedAdImages = [...rawAdImages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const adThumb = sortedAdImages[0]?.url ?? null;

  const unreadCount: number = (conversation as any).unread_count ?? 0;
  const hasUnread = unreadCount > 0;

  const lastMsg = conversation.last_message ?? '';

  // ── Online status: user is considered active if they polled within last 2 minutes ──
  const lastPolledAt: string | null = isBuyer
    ? (conversation as any).seller_last_polled_at ?? null
    : (conversation as any).buyer_last_polled_at ?? null;
  const isOtherOnline = lastPolledAt
    ? Date.now() - new Date(lastPolledAt).getTime() < 120_000
    : false;

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
        {isBlocked ? (
          <View style={[styles.avatar, { backgroundColor: '#EF4444', borderColor: 'transparent', borderWidth: 0 }]}>
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
        {/* Online status dot */}
        {isOtherOnline && !isBlocked ? (
          <View style={styles.onlineDot} />
        ) : null}
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
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#4ADE80',
    borderWidth: 2, borderColor: '#fff',
  },
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
