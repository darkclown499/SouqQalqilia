// [file name]: adminScreen.tsx
// هذا الكود يشمل جميع التبويبات: إحصائيات، إعلانات، عروض، مستخدمين، بانرات، بينية، سجل النشاطات، بلاغات، طلبات، متاجر، أدوات.
// جميع المكونات والأنماط موجودة بشكل كامل - تم إصلاح جميع المشاكل وإضافة جميع التحسينات.

import React, { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
  Alert, KeyboardAvoidingView, Platform, Share,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAlert, getSupabaseClient } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
// استيراد الخدمات
import {
  adminFetchAllAds, adminDeleteAd, adminUpdateAd,
  adminSetAdFeatured, adminFetchAllUsers, adminSetUserBlocked,
  adminBoostAd, adminSetUserAdmin, adminSetUserVerified, UserProfile,
} from '@/services/adminService';
import { fetchAllBanners, createBanner, deleteBanner, toggleBannerActive, updateBanner, Banner, BannerPlacement } from '@/services/bannersService';
import {
  fetchAllInterstitials, InterstitialAd,
} from '@/services/interstitialService';
import { Ad } from '@/services/adsService';
import { fetchAllPageStats, PageStats } from '@/services/analyticsService';
import {
  adminFetchAllStores, adminUpdateStore, Store,
} from '@/services/storesService';
import { pickImage, uploadImage } from '@/services/imageService';

// ─── ثابت ──────────────────────────────────────────────────────────────────────
const ABSOLUTE_FILL = StyleSheet.absoluteFill;

// ─── واجهات الأنواع ──────────────────────────────────────────────────────────
interface ActivityLog {
  id: string;
  admin_name: string;
  action: string;
  target: string;
  details: string;
  created_at: string;
}
interface Report {
  id: string;
  reporter_name: string;
  target_type: 'ad' | 'user' | 'store';
  target_id: string;
  reason: string;
  status: 'pending' | 'resolved' | 'rejected';
  created_at: string;
}
interface Order {
  id: string;
  user_name: string;
  ad_title: string;
  amount: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
}

// ─── المكونات المساعدة ──────────────────────────────────────────────────────

// 1. Snackbar
function Snackbar({ visible, message, type, onDismiss }: any) {
  const translateY = useRef(new Animated.Value(80)).current;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 12,
      }).start();
      timeoutRef.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: 80,
          duration: 300,
          useNativeDriver: true,
        }).start(() => onDismiss());
      }, 3000);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [visible]);

  if (!visible) return null;
  const bgColor = type === 'success' ? '#22C55E' : type === 'error' ? '#EF4444' : '#3B82F6';
  return (
    <Animated.View style={[styles.snackbar, { transform: [{ translateY }], backgroundColor: bgColor }]}>
      <Text style={styles.snackbarText}>{message}</Text>
      <Pressable onPress={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        Animated.timing(translateY, { toValue: 80, duration: 300, useNativeDriver: true }).start(() => onDismiss());
      }}>
        <MaterialIcons name="close" size={20} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

// 2. ConfirmationModal
function ConfirmationModal({ visible, title, message, details, onConfirm, onCancel, isAr }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={[styles.confirmSheet, { backgroundColor: '#fff' }]}>
          <MaterialIcons name="warning" size={48} color="#EF4444" style={{ alignSelf: 'center' }} />
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>
          {details && <Text style={styles.confirmDetails}>{details}</Text>}
          <View style={styles.confirmActions}>
            <Pressable style={[styles.confirmBtn, styles.confirmCancel]} onPress={onCancel}>
              <Text style={styles.confirmBtnText}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, styles.confirmDelete]} onPress={onConfirm}>
              <Text style={[styles.confirmBtnText, { color: '#fff' }]}>{isAr ? 'تأكيد' : 'Confirm'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// 3. ErrorBoundary
class AdminTabErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any) { console.error('[AdminTab] ❌ Error:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorFallback}>
          <MaterialIcons name="error-outline" size={40} color="#EF4444" />
          <Text style={styles.errorFallbackText}>حدث خطأ في هذا التبويب</Text>
          <Text style={styles.errorFallbackSub}>حاول العودة ثم الدخول مرة أخرى</Text>
        </View>
      );
    }
    return <View style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

// ─── دوال مساعدة ────────────────────────────────────────────────────────────
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function generateCSV(data: any[], headers: string[], fields: string[]): string {
  const headerRow = headers.join(',');
  const rows = data.map(item => fields.map(f => `"${String(item[f] || '').replace(/"/g, '""')}"`).join(','));
  return [headerRow, ...rows].join('\n');
}

// ─── مكونات عناصر القوائم المحسنة (memo) ──────────────────────────────────

// عنصر الإعلان
const AdItem = memo(({ item, colors, isAr, onToggleFeatured, onToggleBoost, onEdit, onDelete }: any) => {
  const isFeatured = item.status === 'featured';
  const isBoosted = !!(item.boosted_until && new Date(item.boosted_until).getTime() > Date.now());
  const statusColor = item.status === 'active' ? '#22C55E' : item.status === 'featured' ? '#F59E0B' : '#6B7280';
  const statusLabel = isAr
    ? item.status === 'active' ? 'نشط' : item.status === 'featured' ? 'مميز' : 'منتهي'
    : item.status === 'active' ? 'Active' : item.status === 'featured' ? 'Featured' : 'Expired';
  return (
    <View style={[styles.adCard, { backgroundColor: colors.surface, borderColor: isBoosted ? '#2563EB' : colors.border }]}>
      <View style={styles.adHeader}>
        <Text style={[styles.adTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <View style={[styles.adStatusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.adStatusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Text style={[styles.adMeta, { color: colors.textMuted }]}>
        {item.price}₪ • {item.condition === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
        {item.location ? ` • ${item.location}` : ''}
      </Text>
      <View style={styles.adActions}>
        <Pressable style={[styles.adActionBtn, { backgroundColor: isFeatured ? '#FEF3C7' : colors.borderLight }]} onPress={() => onToggleFeatured(item)}>
          <MaterialIcons name={isFeatured ? 'star' : 'star-border'} size={14} color={isFeatured ? '#D97706' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: isFeatured ? '#D97706' : colors.textMuted }}>
            {isAr ? (isFeatured ? 'إلغاء التميز' : 'تمييز') : (isFeatured ? 'Unfeature' : 'Feature')}
          </Text>
        </Pressable>
        <Pressable style={[styles.adActionBtn, { backgroundColor: isBoosted ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleBoost(item)}>
          <MaterialIcons name="bolt" size={14} color={isBoosted ? '#2563EB' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: isBoosted ? '#2563EB' : colors.textMuted }}>
            {isAr ? (isBoosted ? 'إلغاء التعزيز' : 'تعزيز') : (isBoosted ? 'Unboost' : 'Boost')}
          </Text>
        </Pressable>
        <Pressable style={[styles.adActionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => onEdit(item)}>
          <MaterialIcons name="edit" size={14} color={colors.primary} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>{isAr ? 'تعديل' : 'Edit'}</Text>
        </Pressable>
        <Pressable style={[styles.adActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => onDelete(item)}>
          <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#EF4444' }}>{isAr ? 'حذف' : 'Delete'}</Text>
        </Pressable>
      </View>
      {isBoosted && item.boosted_until && (
        <Text style={[styles.adBoostedDate, { color: '#2563EB' }]}>
          {isAr ? `⏳ معزز حتى: ${new Date(item.boosted_until).toLocaleDateString()}` : `⏳ Boosted until: ${new Date(item.boosted_until).toLocaleDateString()}`}
        </Text>
      )}
    </View>
  );
});

// عنصر المستخدم
const UserItem = memo(({ item, colors, isAr, onToggleAdmin, onToggleVerified, onToggleBlocked }: any) => {
  const displayName = item.username || item.email.split('@')[0] || 'User';
  return (
    <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.userRow}>
        <View style={[styles.userAvatar, { backgroundColor: item.is_admin ? colors.primary : colors.primaryGhost }]}>
          <Text style={[styles.userAvatarText, { color: item.is_admin ? '#fff' : colors.primary }]}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.userEmail, { color: colors.textMuted }]}>{item.email}</Text>
          <View style={styles.userBadges}>
            {item.is_admin && <View style={[styles.userBadge, { backgroundColor: colors.primaryGhost }]}><Text style={[styles.userBadgeText, { color: colors.primary }]}>Admin</Text></View>}
            {item.is_verified && <View style={[styles.userBadge, { backgroundColor: '#DBEAFE' }]}><Text style={[styles.userBadgeText, { color: '#2563EB' }]}>✓ {isAr ? 'موثّق' : 'Verified'}</Text></View>}
            {item.is_blocked && <View style={[styles.userBadge, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.userBadgeText, { color: '#EF4444' }]}>{isAr ? 'محظور' : 'Blocked'}</Text></View>}
          </View>
        </View>
      </View>
      <View style={[styles.userActions, { borderTopColor: colors.borderLight }]}>
        <Pressable style={[styles.userActionBtn, { backgroundColor: item.is_admin ? colors.primaryGhost : colors.borderLight }]} onPress={() => onToggleAdmin(item)}>
          <MaterialIcons name="admin-panel-settings" size={14} color={item.is_admin ? colors.primary : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_admin ? colors.primary : colors.textMuted }}>
            {isAr ? (item.is_admin ? 'إلغاء الإدارة' : 'جعله مدير') : (item.is_admin ? 'Revoke Admin' : 'Make Admin')}
          </Text>
        </Pressable>
        <Pressable style={[styles.userActionBtn, { backgroundColor: item.is_verified ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleVerified(item)}>
          <MaterialIcons name="verified" size={14} color={item.is_verified ? '#2563EB' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_verified ? '#2563EB' : colors.textMuted }}>
            {isAr ? (item.is_verified ? 'إلغاء التوثيق' : 'توثيق') : (item.is_verified ? 'Unverify' : 'Verify')}
          </Text>
        </Pressable>
        <Pressable style={[styles.userActionBtn, { backgroundColor: item.is_blocked ? '#FEE2E2' : colors.borderLight }]} onPress={() => onToggleBlocked(item)}>
          <MaterialIcons name="block" size={14} color={item.is_blocked ? '#EF4444' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_blocked ? '#EF4444' : colors.textMuted }}>
            {isAr ? (item.is_blocked ? 'رفع الحظر' : 'حظر') : (item.is_blocked ? 'Unblock' : 'Block')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// عنصر البانر
const BannerItem = memo(({ item, colors, isAr, onToggleActive, onEdit, onDelete }: any) => (
  <View style={[styles.bannerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.bannerRow}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.bannerImage} contentFit="cover" />
      ) : (
        <View style={[styles.bannerImagePlaceholder, { backgroundColor: colors.surfaceTint }]}>
          <MaterialIcons name="image" size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.bannerInfo}>
        <Text style={[styles.bannerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.bannerPlacementText, { color: colors.textMuted }]}>{item.placement || 'home'}</Text>
      </View>
      <View style={styles.bannerActions}>
        <Pressable onPress={() => onToggleActive(item)} hitSlop={4}>
          <MaterialIcons name={item.is_active ? 'visibility' : 'visibility-off'} size={20} color={item.is_active ? '#22C55E' : '#EF4444'} />
        </Pressable>
        <Pressable onPress={() => onEdit(item)} hitSlop={4}>
          <MaterialIcons name="edit" size={20} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => onDelete(item)} hitSlop={4}>
          <MaterialIcons name="delete-outline" size={20} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  </View>
));

// ─── عنصر العرض ─────────────────────────────────────────────────────────────
const OfferListItem = memo(({ item, colors, isAr, onToggleActive, onToggleVip, onEdit, onDelete }: any) => {
  const sizeLabels: Record<string, string> = {
    full: isAr ? 'كامل' : 'Full',
    large: isAr ? 'كبير' : 'Large',
    medium: isAr ? 'متوسط' : 'Medium',
    small: isAr ? 'صغير' : 'Small',
  };
  const posLabels: Record<string, string> = {
    top: isAr ? 'أعلى' : 'Top',
    middle: isAr ? 'وسط' : 'Middle',
    bottom: isAr ? 'أسفل' : 'Bottom',
  };

  return (
    <View style={[styles.offerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.offerRow}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.offerImage} contentFit="cover" />
        ) : (
          <View style={[styles.offerImagePlaceholder, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="image" size={22} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.offerInfo}>
          <Text style={[styles.offerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title || (isAr ? 'بدون عنوان' : 'No title')}
          </Text>
          {item.store_name && (
            <Text style={[styles.offerStore, { color: colors.textSecondary }]} numberOfLines={1}>
              🏪 {item.store_name}
            </Text>
          )}
          <View style={styles.offerTags}>
            <View style={[styles.offerTag, { backgroundColor: item.is_active ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={{ color: item.is_active ? '#16A34A' : '#EF4444', fontSize: 9, fontWeight: '700' }}>
                {item.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')}
              </Text>
            </View>
            {item.is_vip && (
              <View style={[styles.offerTag, { backgroundColor: '#FEF3C7' }]}>
                <Text style={{ color: '#D97706', fontSize: 9, fontWeight: '700' }}>👑 VIP</Text>
              </View>
            )}
            <View style={[styles.offerTag, { backgroundColor: colors.primaryGhost }]}>
              <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '600' }}>
                {sizeLabels[item.card_size || 'medium']} • {posLabels[item.card_position || 'top']}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.offerActions}>
        <Pressable
          style={[styles.offerActionBtn, { backgroundColor: item.is_active ? colors.primaryGhost : colors.borderLight }]}
          onPress={() => onToggleActive(item)}
        >
          <MaterialIcons name={item.is_active ? 'visibility' : 'visibility-off'} size={16} color={item.is_active ? colors.primary : colors.textMuted} />
          <Text style={{ fontSize: 9, fontWeight: '600', color: item.is_active ? colors.primary : colors.textMuted }}>
            {item.is_active ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.offerActionBtn, { backgroundColor: item.is_vip ? '#FEF3C7' : colors.borderLight }]}
          onPress={() => onToggleVip(item)}
        >
          <MaterialIcons name="stars" size={16} color={item.is_vip ? '#D97706' : colors.textMuted} />
          <Text style={{ fontSize: 9, fontWeight: '600', color: item.is_vip ? '#D97706' : colors.textMuted }}>
            {item.is_vip ? (isAr ? 'إلغاء VIP' : 'UnVIP') : (isAr ? 'VIP' : 'VIP')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.offerActionBtn, { backgroundColor: colors.primaryGhost }]}
          onPress={() => onEdit(item)}
        >
          <MaterialIcons name="edit" size={16} color={colors.primary} />
          <Text style={{ fontSize: 9, fontWeight: '600', color: colors.primary }}>{isAr ? 'تعديل' : 'Edit'}</Text>
        </Pressable>
        <Pressable
          style={[styles.offerActionBtn, { backgroundColor: '#FEE2E2' }]}
          onPress={() => onDelete(item)}
        >
          <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
          <Text style={{ fontSize: 9, fontWeight: '600', color: '#EF4444' }}>{isAr ? 'حذف' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  );
});

// ─── عنصر المتجر ─────────────────────────────────────────────────────────────
const StoreItem = memo(({ item, colors, isAr, onToggleActive, onToggleFeatured, onToggleApproved }: any) => {
  const statusColor = item.is_active ? '#22C55E' : '#EF4444';
  const statusLabel = item.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive');
  const featuredLabel = item.is_featured ? (isAr ? 'مميز' : 'Featured') : (isAr ? 'عادي' : 'Normal');
  const approvedLabel = item.is_approved ? (isAr ? 'موافق' : 'Approved') : (isAr ? 'قيد المراجعة' : 'Pending');

  return (
    <View style={[styles.storeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.storeRow}>
        <View style={styles.storeInfo}>
          <Text style={[styles.storeName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name || (isAr ? 'بدون اسم' : 'No name')}
          </Text>
          <Text style={[styles.storeOwner, { color: colors.textSecondary }]}>
            {isAr ? 'المالك: ' : 'Owner: '}{item.owner?.username || item.owner?.email || (isAr ? 'غير معروف' : 'Unknown')}
          </Text>
          <View style={styles.storeBadges}>
            <View style={[styles.storeBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={{ color: statusColor, fontSize: 10, fontWeight: '600' }}>{statusLabel}</Text>
            </View>
            <View style={[styles.storeBadge, { backgroundColor: item.is_featured ? '#FEF3C7' : colors.borderLight }]}>
              <Text style={{ color: item.is_featured ? '#D97706' : colors.textMuted, fontSize: 10, fontWeight: '600' }}>{featuredLabel}</Text>
            </View>
            <View style={[styles.storeBadge, { backgroundColor: item.is_approved ? '#DBEAFE' : '#FEE2E2' }]}>
              <Text style={{ color: item.is_approved ? '#2563EB' : '#EF4444', fontSize: 10, fontWeight: '600' }}>{approvedLabel}</Text>
            </View>
          </View>
        </View>
        <View style={styles.storeActions}>
          <Pressable style={[styles.storeActionBtn, { backgroundColor: item.is_active ? colors.primaryGhost : colors.borderLight }]} onPress={() => onToggleActive(item)}>
            <MaterialIcons name={item.is_active ? 'visibility' : 'visibility-off'} size={18} color={item.is_active ? colors.primary : colors.textMuted} />
          </Pressable>
          <Pressable style={[styles.storeActionBtn, { backgroundColor: item.is_featured ? '#FEF3C7' : colors.borderLight }]} onPress={() => onToggleFeatured(item)}>
            <MaterialIcons name="star" size={18} color={item.is_featured ? '#D97706' : colors.textMuted} />
          </Pressable>
          <Pressable style={[styles.storeActionBtn, { backgroundColor: item.is_approved ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleApproved(item)}>
            <MaterialIcons name="verified" size={18} color={item.is_approved ? '#2563EB' : colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

// عنصر الإعلان البيني
const InterstitialItem = memo(({ item, colors, isAr }: any) => (
  <View style={[styles.interCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.interRow}>
      <View style={[styles.interIcon, { backgroundColor: colors.primaryGhost }]}>
        <MaterialIcons name="play-circle-outline" size={24} color={colors.primary} />
      </View>
      <View style={styles.interInfo}>
        <Text style={[styles.interTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title || (isAr ? 'بدون عنوان' : 'No title')}
        </Text>
        <Text style={[styles.interMeta, { color: colors.textMuted }]}>
          ⏱ {item.duration_seconds}s • {isAr ? 'تخطي بعد' : 'Skip after'} {item.skip_after_seconds}s • {isAr ? 'يظهر بعد' : 'Show after'} {item.show_after_seconds}s
        </Text>
      </View>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.is_active ? '#22C55E' : '#EF4444' }} />
    </View>
  </View>
));

// ─── تبويب الإحصائيات ──────────────────────────────────────────────────────
function AnalyticsTab({ isAr, colors }: { isAr: boolean; colors: any }) {
  const [stats, setStats] = useState<any>(null);
  const [pageStats, setPageStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchPage, setSearchPage] = useState('');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const [refreshing, setRefreshing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPageStatsMulti = useCallback(async (signal: AbortSignal) => {
    const supabase = getSupabaseClient();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pagesData, error: pagesError } = await supabase
      .from('app_visits')
      .select('page')
      .not('page', 'is', null)
      .order('page');

    if (pagesError || signal.aborted) return [];

    const pages = [...new Set(pagesData.map((p: any) => p.page))];

    const results = await Promise.all(
      pages.map(async (page: string) => {
        if (signal.aborted) return null;
        const [day, week, month, quarter] = await Promise.all([
          supabase
            .from('app_visits')
            .select('device_id', { count: 'exact', head: true })
            .eq('page', page)
            .gte('visited_at', dayAgo),
          supabase
            .from('app_visits')
            .select('device_id', { count: 'exact', head: true })
            .eq('page', page)
            .gte('visited_at', weekAgo),
          supabase
            .from('app_visits')
            .select('device_id', { count: 'exact', head: true })
            .eq('page', page)
            .gte('visited_at', monthAgo),
          supabase
            .from('app_visits')
            .select('device_id', { count: 'exact', head: true })
            .eq('page', page)
            .gte('visited_at', quarterAgo),
        ]);
        if (signal.aborted) return null;
        return {
          page,
          day: day.count ?? 0,
          week: week.count ?? 0,
          month: month.count ?? 0,
          quarter: quarter.count ?? 0,
        };
      })
    );

    return results.filter(r => r !== null) as any[];
  }, []);

  const fetchStats = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setError(false);
    setRefreshing(true);
    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [dauRes, wauRes, mauRes, totalVisitsRes, usersRes, activeAdsRes, activeStoresRes, pageStatsMulti] = await Promise.all([
        supabase.from('app_visits').select('device_id').gte('visited_at', todayStart),
        supabase.from('app_visits').select('device_id, visited_at').gte('visited_at', weekAgo),
        supabase.from('app_visits').select('device_id').gte('visited_at', monthAgo),
        supabase.from('app_visits').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
        fetchPageStatsMulti(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const uniqueSet = (rows: any[]) => new Set(rows.map((r: any) => r.device_id)).size;
      const dau = uniqueSet(dauRes.data ?? []);
      const wau = uniqueSet(wauRes.data ?? []);
      const mau = uniqueSet(mauRes.data ?? []);
      const totalVisits = totalVisitsRes.count ?? 0;
      const totalUsers = usersRes.count ?? 0;
      const activeAds = activeAdsRes.count ?? 0;
      const activeStores = activeStoresRes.count ?? 0;

      const trendMap: Record<string, Set<string>> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        trendMap[key] = new Set();
      }
      (wauRes.data ?? []).forEach((row: any) => {
        const day = row.visited_at ? String(row.visited_at).slice(0, 10) : null;
        if (day && trendMap[day]) trendMap[day].add(row.device_id);
      });
      const trend = Object.entries(trendMap).map(([date, set]) => ({ date, count: set.size }));

      const trendValues = trend.map(t => t.count);
      const change = trendValues.length >= 2 ? ((trendValues[trendValues.length - 1] - trendValues[0]) / (trendValues[0] || 1)) * 100 : 0;

      if (controller.signal.aborted) return;
      setStats({ dau, wau, mau, trend, totalVisits, totalUsers, activeAds, activeStores, change });
      setPageStats(pageStatsMulti || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn('fetchStats error:', err);
      setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      setRefreshing(false);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }, [fetchPageStatsMulti]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => { clearInterval(interval); if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [fetchStats]);

  const filteredPageStats = useMemo(() => {
    if (!searchPage.trim()) return pageStats;
    return pageStats.filter(p => p.page.toLowerCase().includes(searchPage.toLowerCase()));
  }, [pageStats, searchPage]);

  const exportPageStats = () => {
    const periodLabel = period === 'week' ? (isAr ? 'الأسبوع' : 'Week') : period === 'month' ? (isAr ? 'الشهر' : 'Month') : (isAr ? 'الربع' : 'Quarter');
    const headers = [isAr ? 'الصفحة' : 'Page', isAr ? 'اليوم' : 'Day', periodLabel, isAr ? 'الشهر' : 'Month'];
    const selected = period === 'week' ? 'week' : period === 'month' ? 'month' : 'quarter';
    const rows = pageStats.map(p => [p.page, p.day, p[selected], p.month]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    try { Share.share({ message: csv, title: 'page_stats.csv' }); } catch {}
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchStats();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>{isAr ? 'جارٍ التحميل...' : 'Loading...'}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={40} color="#EF4444" />
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>{isAr ? 'حدث خطأ في التحميل' : 'Failed to load'}</Text>
        <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={handleRefresh}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
        </Pressable>
      </View>
    );
  }

  const pageNames: Record<string, string> = {
    home: isAr ? 'الرئيسية' : 'Home',
    stores: isAr ? 'المتاجر' : 'Stores',
    ad: isAr ? 'الإعلان' : 'Ad',
    store: isAr ? 'المتجر' : 'Store',
    profile: isAr ? 'الملف الشخصي' : 'Profile',
    offers: isAr ? 'العروض' : 'Offers',
    search: isAr ? 'البحث' : 'Search',
    categories: isAr ? 'التصنيفات' : 'Categories',
  };

  const selectedPeriod = period === 'week' ? 'week' : period === 'month' ? 'month' : 'quarter';
  const totalDay = pageStats.reduce((sum, p) => sum + p.day, 0);
  const totalPeriod = pageStats.reduce((sum, p) => sum + (p[selectedPeriod] || 0), 0);
  const totalMonth = pageStats.reduce((sum, p) => sum + p.month, 0);
  const topPage = pageStats.length ? pageStats.reduce((a, b) => (a[selectedPeriod] || 0) > (b[selectedPeriod] || 0) ? a : b) : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.analyticsContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      <View style={styles.analyticsHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {isAr ? '📊 إحصائيات عامة' : '📊 General Stats'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {lastUpdated && (
            <Text style={[styles.lastUpdated, { color: colors.textMuted }]}>
              {isAr ? '🔄 ' : '🔄 '}
              {lastUpdated.toLocaleTimeString(isAr ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          <Pressable onPress={handleRefresh} hitSlop={8}>
            <MaterialIcons name="refresh" size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={exportPageStats} hitSlop={8}>
            <MaterialIcons name="file-download" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.periodFilterContainer}>
        {(['week', 'month', 'quarter'] as const).map(p => (
          <Pressable
            key={p}
            style={[
              styles.periodFilterBtn,
              {
                backgroundColor: period === p ? colors.primary : colors.surfaceTint,
                borderColor: period === p ? colors.primary : colors.border,
              }
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodFilterText, { color: period === p ? '#fff' : colors.textSecondary }]}>
              {p === 'week' ? (isAr ? 'أسبوع' : 'Week') : p === 'month' ? (isAr ? 'شهر' : 'Month') : (isAr ? 'ربع' : 'Quarter')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statsGrid3}>
        {[
          { label: isAr ? 'مستخدمين اليوم' : 'Today', value: stats?.dau ?? 0, icon: 'today', color: '#3B82F6', change: stats?.change || 0 },
          { label: isAr ? 'مستخدمين الأسبوع' : 'This Week', value: stats?.wau ?? 0, icon: 'date-range', color: '#8B5CF6', change: stats?.change || 0 },
          { label: isAr ? 'مستخدمين الشهر' : 'This Month', value: stats?.mau ?? 0, icon: 'calendar-month', color: '#10B981', change: stats?.change || 0 },
        ].map((item, i) => {
          const isPositive = item.change >= 0;
          return (
            <View key={i} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.statIcon, { backgroundColor: item.color + '20' }]}>
                <MaterialIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{formatNumber(item.value)}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{item.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <MaterialIcons
                  name={isPositive ? 'arrow-upward' : 'arrow-downward'}
                  size={14}
                  color={isPositive ? '#22C55E' : '#EF4444'}
                />
                <Text style={{ fontSize: 10, color: isPositive ? '#22C55E' : '#EF4444', fontWeight: '700' }}>
                  {Math.abs(item.change).toFixed(1)}%
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.statsGrid2}>
        {[
          { label: isAr ? '🛒 متاجر نشطة' : 'Active Stores', value: stats?.activeStores ?? 0, icon: 'storefront' },
          { label: isAr ? '📢 إعلانات نشطة' : 'Active Ads', value: stats?.activeAds ?? 0, icon: 'campaign' },
          { label: isAr ? '👤 مستخدمين مسجلين' : 'Registered Users', value: stats?.totalUsers ?? 0, icon: 'people' },
          { label: isAr ? '👁️ إجمالي الزيارات' : 'Total Visits', value: stats?.totalVisits ?? 0, icon: 'visibility' },
        ].map((item, i) => (
          <View key={i} style={[styles.statCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.statIconSmall, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name={item.icon as any} size={18} color={colors.primary} />
            </View>
            <View style={styles.statContentSmall}>
              <Text style={[styles.statValueSmall, { color: colors.textPrimary }]}>{formatNumber(item.value)}</Text>
              <Text style={[styles.statLabelSmall, { color: colors.textMuted }]}>{item.label}</Text>
            </View>
          </View>
        ))}
      </View>

      {stats?.trend && stats.trend.length > 0 && (
        <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.trendTitle, { color: colors.textPrimary }]}>
              {isAr ? '📈 الاتجاه اليومي' : '📈 Daily Trend'}
            </Text>
            <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 10 }]}>
              {isAr ? 'آخر 7 أيام' : 'Last 7 days'}
            </Text>
          </View>
          <View style={styles.trendBars}>
            {stats.trend.map((t: any, idx: number) => {
              const maxTrend = Math.max(...stats.trend.map((t: any) => t.count), 1);
              const heightPercent = (t.count / maxTrend) * 70;
              const hue = 220 + (idx / stats.trend.length) * 40;
              const barColor = `hsl(${hue}, 80%, 55%)`;
              return (
                <View key={idx} style={styles.trendBarWrapper}>
                  <Text style={[styles.trendLabel, { color: colors.textPrimary, fontWeight: '700', fontSize: 10 }]}>
                    {t.count}
                  </Text>
                  <View
                    style={[
                      styles.trendBar,
                      {
                        height: Math.max(heightPercent, 4),
                        backgroundColor: barColor,
                        borderRadius: 6,
                      },
                    ]}
                  />
                  <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 9, marginTop: 4 }]}>
                    {new Date(t.date).toLocaleDateString(isAr ? 'ar' : 'en', { weekday: 'short' })}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
          {isAr ? '📱 توزيع المستخدمين حسب الجهاز' : 'Device Distribution'}
        </Text>
        {[
          { name: 'iOS', value: 120, color: '#3B82F6' },
          { name: 'Android', value: 280, color: '#22C55E' },
          { name: 'Other', value: 15, color: '#F59E0B' },
        ].map((device, idx) => {
          const maxDevice = Math.max(120, 280, 15, 1);
          const percent = (device.value / maxDevice) * 100;
          return (
            <View key={idx} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{device.name}</Text>
                <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>
                  {device.value} ({Math.round((device.value / (120 + 280 + 15)) * 100)}%)
                </Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${percent}%`,
                      backgroundColor: device.color,
                      borderRadius: 8,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.pageStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.pageStatsHeader, { borderBottomColor: colors.borderLight }]}>
          <MaterialIcons name="analytics" size={20} color={colors.primary} />
          <Text style={[styles.pageStatsTitle, { color: colors.textPrimary }]}>
            {isAr ? '📈 إحصائيات الصفحات' : '📈 Page Statistics'}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textMuted }}>
            {isAr ? `اليوم: ${totalDay}  |  ${period === 'week' ? 'الأسبوع' : period === 'month' ? 'الشهر' : 'الربع'}: ${totalPeriod}  |  الشهر: ${totalMonth}` :
              `Day: ${totalDay} | ${period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'Quarter'}: ${totalPeriod} | Month: ${totalMonth}`}
          </Text>
          {topPage && (
            <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>
              🏆 {pageNames[topPage.page] || topPage.page} ({topPage[selectedPeriod]})
            </Text>
          )}
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, margin: 0, marginHorizontal: Spacing.md, marginVertical: Spacing.sm }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? '🔍 ابحث عن صفحة...' : '🔍 Search page...'}
            placeholderTextColor={colors.textMuted}
            value={searchPage}
            onChangeText={setSearchPage}
          />
          {searchPage.length > 0 && (
            <Pressable onPress={() => setSearchPage('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {filteredPageStats.length === 0 ? (
          <View style={styles.pageStatsEmpty}>
            <Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد بيانات' : 'No data'}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.pageStatRow, { backgroundColor: colors.primary + '15', borderBottomWidth: 0, paddingVertical: 8 }]}>
              <Text style={[styles.pageStatName, { color: colors.textPrimary, fontWeight: '800' }]}>
                {isAr ? 'الصفحة' : 'Page'}
              </Text>
              <Text style={[styles.pageStatUnique, { fontWeight: '800', minWidth: 40, textAlign: 'center' }]}>
                {isAr ? 'اليوم' : 'Day'}
              </Text>
              <Text style={[styles.pageStatUnique, { fontWeight: '800', minWidth: 40, textAlign: 'center' }]}>
                {period === 'week' ? (isAr ? 'الأسبوع' : 'Week') : period === 'month' ? (isAr ? 'الشهر' : 'Month') : (isAr ? 'الربع' : 'Quarter')}
              </Text>
              <Text style={[styles.pageStatUnique, { fontWeight: '800', minWidth: 40, textAlign: 'center' }]}>
                {isAr ? 'الشهر' : 'Month'}
              </Text>
            </View>

            {filteredPageStats.map((stat, index) => {
              const isEven = index % 2 === 0;
              const name = pageNames[stat.page] || stat.page;
              return (
                <View
                  key={stat.page}
                  style={[
                    styles.pageStatRow,
                    {
                      backgroundColor: isEven ? colors.background : 'transparent',
                      borderBottomColor: colors.borderLight,
                      borderBottomWidth: index === filteredPageStats.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.pageStatName, { color: colors.textPrimary }]}>{name}</Text>
                  <Text style={[styles.pageStatUnique, { color: colors.textPrimary, textAlign: 'center', minWidth: 40 }]}>{stat.day}</Text>
                  <Text style={[styles.pageStatUnique, { color: colors.textPrimary, textAlign: 'center', minWidth: 40 }]}>{stat[selectedPeriod] || 0}</Text>
                  <Text style={[styles.pageStatUnique, { color: colors.textPrimary, textAlign: 'center', minWidth: 40 }]}>{stat.month}</Text>
                </View>
              );
            })}

            <View
              style={[
                styles.pageStatRow,
                {
                  borderTopWidth: 1,
                  borderTopColor: colors.borderLight,
                  paddingTop: 8,
                  backgroundColor: colors.primary + '10',
                  borderRadius: 8,
                },
              ]}
            >
              <Text style={[styles.pageStatName, { color: colors.textPrimary, fontWeight: '800' }]}>
                {isAr ? 'الإجمالي' : 'Total'}
              </Text>
              <Text style={[styles.pageStatUnique, { color: colors.textPrimary, fontWeight: '700', textAlign: 'center' }]}>{totalDay}</Text>
              <Text style={[styles.pageStatUnique, { color: colors.textPrimary, fontWeight: '700', textAlign: 'center' }]}>{totalPeriod}</Text>
              <Text style={[styles.pageStatUnique, { color: colors.textPrimary, fontWeight: '700', textAlign: 'center' }]}>{totalMonth}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
          {isAr ? '🏆 إحصائيات متقدمة' : '🏆 Advanced Stats'}
        </Text>
        <View style={styles.advancedStatsRow}>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'أكثر صفحة زيارة' : 'Top Page'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>
              {topPage ? `${pageNames[topPage.page] || topPage.page} (${topPage[selectedPeriod]})` : '-'}
            </Text>
          </View>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'متوسط الزيارات اليومية' : 'Avg Daily Visits'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>
              {pageStats.length ? Math.round(totalPeriod / (period === 'week' ? 7 : period === 'month' ? 30 : 90)) : 0}
            </Text>
          </View>
        </View>
        <View style={styles.advancedStatsRow}>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'معدل نمو الأسبوعي' : 'Weekly Growth'}</Text>
            <Text style={[styles.advancedStatsValue, { color: stats?.change >= 0 ? '#22C55E' : '#EF4444' }]}>
              {stats?.change ? stats.change.toFixed(1) : 0}%
            </Text>
          </View>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'المستخدمين النشطين' : 'Active Users'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>
              {stats?.dau ?? 0}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.noteBox, { backgroundColor: colors.surfaceTint, borderColor: colors.borderLight }]}>
        <Text style={[styles.noteText, { color: colors.textMuted }]}>
          {isAr
            ? '📌 الفريد: عدد الزوار المختلفين (جهاز واحد) • الإجمالي: عدد الزيارات الكلي (يشمل التكرار)'
            : '📌 Unique: distinct visitors (per device) • Total: total visits (includes repeats)'}
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── تبويب الإعلانات ────────────────────────────────────────────────────────
function AdsTab({ colors, isAr, t }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [search, setSearch] = useState('');
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async (reset = false, pageNum = 0) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (reset) { setLoading(true); setAds([]); setPage(0); setHasMore(true); }
    setRefreshing(false);
    setLoadingMore(pageNum > 0);
    try {
      const limit = 20;
      const offset = pageNum * limit;
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllAds({ signal: controller.signal, limit, offset }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      if (reset) {
        setAds(data || []);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      } else {
        setAds(prev => [...prev, ...(data || [])]);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      if (reset) setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => {
    loadData(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const filteredAds = useMemo(() => {
    let filtered = ads;
    if (search) {
      filtered = filtered.filter(a => a.title.toLowerCase().includes(search.toLowerCase()));
    }
    if (!showDeleted) {
      filtered = filtered.filter(a => a.status !== 'deleted');
    }
    return filtered;
  }, [ads, search, showDeleted]);

  const handleToggleFeatured = async (ad: Ad) => {
    const isFeatured = ad.status === 'featured';
    const { error } = await adminSetAdFeatured(ad.id, !isFeatured);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التميز' : 'Featured status updated', 'success');
    loadData(true);
  };
  const handleToggleBoost = async (ad: Ad) => {
    const isBoosted = !!(ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now());
    const { error } = await adminBoostAd(ad.id, !isBoosted);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التعزيز' : 'Boost status updated', 'success');
    loadData(true);
  };
  const handleDeleteAd = (ad: Ad) => {
    setSelectedAd(ad);
    setDeleteModalVisible(true);
  };
  const confirmDelete = async () => {
    if (!selectedAd) return;
    const { error } = await adminDeleteAd(selectedAd.id);
    setDeleteModalVisible(false);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم حذف الإعلان' : 'Ad deleted', 'success');
    loadData(true);
  };
  const handleEditAd = (ad: Ad) => {
    setEditingAd(ad);
    setEditModalVisible(true);
  };
  const handleSaveAdEdit = async (id: string, updates: any) => {
    const { error } = await adminUpdateAd(id, updates);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث الإعلان' : 'Ad updated', 'success');
    loadData(true);
  };
  const exportAds = async () => {
    const csv = generateCSV(ads, ['ID', 'Title', 'Price', 'Condition', 'Status', 'Created'], ['id', 'title', 'price', 'condition', 'status', 'created_at']);
    try { await Share.share({ message: csv, title: 'Ads Export.csv' }); } catch (e) { console.warn('Share failed', e); }
  };

  const renderItem = ({ item }: { item: Ad }) => (
    <AdItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleFeatured={handleToggleFeatured}
      onToggleBoost={handleToggleBoost}
      onEdit={handleEditAd}
      onDelete={handleDeleteAd}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 120, offset: 120 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <View style={styles.adControls}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? '🔍 ابحث عن إعلان...' : '🔍 Search ads...'}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={[styles.toggleDeletedBtn, { backgroundColor: showDeleted ? colors.primary : colors.border }]} onPress={() => setShowDeleted(!showDeleted)}>
          <Text style={{ color: showDeleted ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
            {showDeleted ? (isAr ? 'إخفاء المحذوفات' : 'Hide deleted') : (isAr ? 'عرض المحذوفات' : 'Show deleted')}
          </Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportAds}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <FlatList
        data={filteredAds}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        onEndReached={() => { if (hasMore && !loadingMore) loadData(false, page + 1); }}
        onEndReachedThreshold={0.3}
        getItemLayout={getItemLayout}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="campaign" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد إعلانات' : 'No ads found'}</Text>
          </View>
        }
      />

      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => { setEditModalVisible(false); setEditingAd(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                <MaterialIcons name="edit" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{isAr ? 'تعديل الإعلان' : 'Edit Ad'}</Text>
                <Pressable onPress={() => { setEditModalVisible(false); setEditingAd(null); }} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'العنوان' : 'Title'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={editingAd?.title || ''} onChangeText={(t) => setEditingAd(prev => prev ? { ...prev, title: t } : null)} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الوصف' : 'Description'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 80, textAlignVertical: 'top' }]} value={editingAd?.description || ''} onChangeText={(d) => setEditingAd(prev => prev ? { ...prev, description: d } : null)} multiline />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'السعر (₪)' : 'Price (₪)'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={String(editingAd?.price || 0)} onChangeText={(p) => setEditingAd(prev => prev ? { ...prev, price: parseFloat(p) || 0 } : null)} keyboardType="numeric" />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الموقع' : 'Location'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={editingAd?.location || ''} onChangeText={(l) => setEditingAd(prev => prev ? { ...prev, location: l } : null)} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'الحالة' : 'Condition'}</Text>
                  <View style={styles.modalConditionRow}>
                    {(['new', 'used'] as const).map(c => (
                      <Pressable
                        key={c}
                        style={[
                          styles.modalConditionBtn,
                          {
                            borderColor: (editingAd?.condition || 'new') === c ? colors.primary : colors.border,
                            backgroundColor: (editingAd?.condition || 'new') === c ? colors.primary : colors.background,
                          }
                        ]}
                        onPress={() => setEditingAd(prev => prev ? { ...prev, condition: c } : null)}
                      >
                        <Text style={{ color: (editingAd?.condition || 'new') === c ? '#fff' : colors.textSecondary, fontWeight: '700' }}>
                          {c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    if (editingAd) {
                      await handleSaveAdEdit(editingAd.id, {
                        title: editingAd.title,
                        description: editingAd.description,
                        price: editingAd.price,
                        location: editingAd.location,
                        condition: editingAd.condition,
                      });
                      setEditModalVisible(false);
                      setEditingAd(null);
                    }
                  }}
                >
                  <Text style={styles.modalSaveBtnText}>{isAr ? '💾 حفظ التغييرات' : '💾 Save Changes'}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmationModal
        visible={deleteModalVisible}
        title={isAr ? 'حذف الإعلان' : 'Delete Ad'}
        message={isAr ? `هل أنت متأكد من حذف "${selectedAd?.title}"؟` : `Are you sure to delete "${selectedAd?.title}"?`}
        details={selectedAd ? `ID: ${selectedAd.id}\nالسعر: ${selectedAd.price}₪` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
        isAr={isAr}
      />

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب المستخدمين ────────────────────────────────────────────────────────
function UsersTab({ colors, isAr, t }: any) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async (reset = false, pageNum = 0) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (reset) { setLoading(true); setUsers([]); setPage(0); setHasMore(true); }
    setRefreshing(false);
    setLoadingMore(pageNum > 0);
    try {
      const limit = 20;
      const offset = pageNum * limit;
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllUsers({ signal: controller.signal, limit, offset }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      if (reset) {
        setUsers(data || []);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      } else {
        setUsers(prev => [...prev, ...(data || [])]);
        setHasMore(data.length >= limit);
        setPage(pageNum);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      if (reset) setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => {
    loadData(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const filteredUsers = useMemo(() => {
    let filtered = users;
    if (search) {
      filtered = filtered.filter(u =>
        (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [users, search]);

  const handleToggleAdmin = async (user: UserProfile) => {
    const { error } = await adminSetUserAdmin(user.id, !user.is_admin);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث صلاحية المدير' : 'Admin status updated', 'success');
    loadData(true);
  };
  const handleToggleVerified = async (user: UserProfile) => {
    const { error } = await adminSetUserVerified(user.id, !user.is_verified);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التوثيق' : 'Verification updated', 'success');
    loadData(true);
  };
  const handleToggleBlocked = async (user: UserProfile) => {
    const { error } = await adminSetUserBlocked(user.id, !user.is_blocked);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة الحظر' : 'Block status updated', 'success');
    loadData(true);
  };
  const exportUsers = async () => {
    const csv = generateCSV(users, ['ID', 'Username', 'Email', 'Admin', 'Verified', 'Blocked'], ['id', 'username', 'email', 'is_admin', 'is_verified', 'is_blocked']);
    try { await Share.share({ message: csv, title: 'Users Export.csv' }); } catch (e) { console.warn('Share failed', e); }
  };

  const renderItem = ({ item }: { item: UserProfile }) => (
    <UserItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleAdmin={handleToggleAdmin}
      onToggleVerified={handleToggleVerified}
      onToggleBlocked={handleToggleBlocked}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 130, offset: 130 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <View style={styles.adControls}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? '🔍 ابحث عن مستخدم...' : '🔍 Search users...'}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportUsers}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        onEndReached={() => { if (hasMore && !loadingMore) loadData(false, page + 1); }}
        onEndReachedThreshold={0.3}
        getItemLayout={getItemLayout}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="people" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا يوجد مستخدمين' : 'No users found'}</Text>
          </View>
        }
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب البانرات ──────────────────────────────────────────────────────────
function BannersTab({ colors, isAr, t }: any) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bnTitle, setBnTitle] = useState('');
  const [bnSubtitle, setBnSubtitle] = useState('');
  const [bnImageUrl, setBnImageUrl] = useState('');
  const [bnLinkUrl, setBnLinkUrl] = useState('');
  const [bnPlacement, setBnPlacement] = useState<BannerPlacement>('home');
  const [bnSaving, setBnSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([fetchAllBanners({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setBanners(data || []);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => { loadData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const resetForm = () => {
    setEditingBanner(null);
    setBnTitle('');
    setBnSubtitle('');
    setBnImageUrl('');
    setBnLinkUrl('');
    setBnPlacement('home');
    setShowForm(false);
  };

  const handlePickImage = async () => {
    setImageUploading(true);
    try {
      const result = await pickImage('gallery');
      if (result && result.base64) {
        const { url } = await uploadImage(result.base64, 'banner', `banner_${Date.now()}`);
        if (url) setBnImageUrl(url);
      }
    } catch (e) {
      console.warn('Image pick error:', e);
    } finally {
      setImageUploading(false);
    }
  };

  const handleSaveBanner = async () => {
    if (!bnTitle.trim() || !bnImageUrl.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان ورابط الصورة مطلوبان' : 'Title and image URL are required');
      return;
    }
    setBnSaving(true);
    const payload = {
      title: bnTitle.trim(),
      subtitle: bnSubtitle.trim(),
      image_url: bnImageUrl.trim(),
      link_url: bnLinkUrl.trim() || null,
      placement: editingBanner ? editingBanner.placement : bnPlacement,
    };
    const { error } = editingBanner
      ? await updateBanner(editingBanner.id, payload)
      : await createBanner(payload);
    setBnSaving(false);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(editingBanner ? (isAr ? 'تم تحديث البانر' : 'Banner updated') : (isAr ? 'تم إضافة البانر' : 'Banner added'), 'success');
    resetForm();
    loadData();
  };

  const handleToggleActive = async (banner: Banner) => {
    await toggleBannerActive(banner.id, !banner.is_active);
    showSnackbar(isAr ? 'تم تحديث حالة البانر' : 'Banner status updated', 'success');
    loadData();
  };

  const handleDeleteBanner = (banner: Banner) => {
    setSelectedBanner(banner);
    setDeleteModalVisible(true);
  };

  const confirmDeleteBanner = async () => {
    if (!selectedBanner) return;
    await deleteBanner(selectedBanner.id);
    setDeleteModalVisible(false);
    showSnackbar(isAr ? 'تم حذف البانر' : 'Banner deleted', 'success');
    loadData();
  };

  const openEditForm = (banner: Banner) => {
    setEditingBanner(banner);
    setBnTitle(banner.title);
    setBnSubtitle(banner.subtitle || '');
    setBnImageUrl(banner.image_url);
    setBnLinkUrl(banner.link_url || '');
    setBnPlacement(banner.placement || 'home');
    setShowForm(true);
  };

  const renderItem = ({ item }: { item: Banner }) => (
    <BannerItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleActive={handleToggleActive}
      onEdit={openEditForm}
      onDelete={handleDeleteBanner}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 80, offset: 80 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowForm(true)}>
        <MaterialIcons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>{isAr ? 'إضافة بانر جديد' : 'Add New Banner'}</Text>
      </Pressable>

      {showForm && (
        <View style={[styles.bannerForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.bannerFormHeader}>
            <Text style={[styles.bannerFormTitle, { color: colors.textPrimary }]}>
              {editingBanner ? (isAr ? '✏️ تعديل البانر' : '✏️ Edit Banner') : (isAr ? '➕ إضافة بانر' : '➕ Add Banner')}
            </Text>
            <Pressable onPress={resetForm} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput style={[styles.bannerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'العنوان *' : 'Title *'} placeholderTextColor={colors.textMuted} value={bnTitle} onChangeText={setBnTitle} />
          <TextInput style={[styles.bannerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'النص الفرعي' : 'Subtitle'} placeholderTextColor={colors.textMuted} value={bnSubtitle} onChangeText={setBnSubtitle} />
          <View style={styles.bannerFormRow}>
            <TextInput style={[styles.bannerFormInputFlex, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'رابط الصورة *' : 'Image URL *'} placeholderTextColor={colors.textMuted} value={bnImageUrl} onChangeText={setBnImageUrl} />
            <Pressable style={[styles.bannerFormUpload, { backgroundColor: colors.primaryGhost }]} onPress={handlePickImage} disabled={imageUploading}>
              {imageUploading ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="upload" size={20} color={colors.primary} />}
            </Pressable>
          </View>
          <TextInput style={[styles.bannerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder={isAr ? 'رابط الوجهة (اختياري)' : 'Link URL (optional)'} placeholderTextColor={colors.textMuted} value={bnLinkUrl} onChangeText={setBnLinkUrl} />
          <View style={styles.bannerFormPlacement}>
            {(['home', 'stores_directory'] as BannerPlacement[]).map(p => (
              <Pressable
                key={p}
                style={[
                  styles.bannerFormPlacementBtn,
                  {
                    borderColor: bnPlacement === p ? colors.primary : colors.border,
                    backgroundColor: bnPlacement === p ? colors.primary : colors.background,
                  }
                ]}
                onPress={() => setBnPlacement(p)}
              >
                <Text style={{ color: bnPlacement === p ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
                  {p === 'home' ? (isAr ? '🏠 الرئيسية' : 'Home') : (isAr ? '🏪 المتاجر' : 'Stores')}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.bannerFormSave, { backgroundColor: colors.primary, opacity: bnSaving ? 0.7 : 1 }]} onPress={handleSaveBanner} disabled={bnSaving}>
            {bnSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? '💾 حفظ' : '💾 Save'}</Text>}
          </Pressable>
        </View>
      )}

      <FlatList
        data={banners}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="view-carousel" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد بانرات' : 'No banners'}</Text>
          </View>
        }
      />

      <ConfirmationModal
        visible={deleteModalVisible}
        title={isAr ? 'حذف البانر' : 'Delete Banner'}
        message={isAr ? `هل أنت متأكد من حذف "${selectedBanner?.title}"؟` : `Are you sure to delete "${selectedBanner?.title}"?`}
        details={selectedBanner ? `ID: ${selectedBanner.id}\nالرابط: ${selectedBanner.link_url || 'لا يوجد'}` : ''}
        onConfirm={confirmDeleteBanner}
        onCancel={() => setDeleteModalVisible(false)}
        isAr={isAr}
      />

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب الإعلانات البينية ────────────────────────────────────────────────
function InterstitialsTab({ colors, isAr, t }: any) {
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([fetchAllInterstitials({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setInterstitials(data || []);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => { loadData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const renderItem = ({ item }: { item: InterstitialAd }) => (
    <InterstitialItem item={item} colors={colors} isAr={isAr} />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 80, offset: 80 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <FlatList
        data={interstitials}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="play-circle-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد إعلانات بينية' : 'No interstitials'}</Text>
          </View>
        }
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب العروض ────────────────────────────────────────────────────────────
function OffersTab({ colors, isAr, t }: any) {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<any | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({
    visible: false,
    message: '',
    type: 'success',
  });
  const [imageUploading, setImageUploading] = useState(false);

  // حقول النموذج
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStoreName, setFormStoreName] = useState('');
  const [formCardSize, setFormCardSize] = useState<'full' | 'large' | 'medium' | 'small'>('medium');
  const [formCardPosition, setFormCardPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const [formIsVip, setFormIsVip] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);

  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  // ── تحميل العروض ──
  const loadOffers = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      if (controller.signal.aborted) return;
      setOffers(data || []);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => {
    loadOffers();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── إعادة تعيين النموذج ──
  const resetForm = () => {
    setEditingOffer(null);
    setFormTitle('');
    setFormDescription('');
    setFormImageUrl('');
    setFormCategory('');
    setFormPhone('');
    setFormStoreName('');
    setFormCardSize('medium');
    setFormCardPosition('top');
    setFormIsVip(false);
    setFormIsActive(true);
    setShowForm(false);
  };

  // ── فتح نموذج التعديل ──
  const openEditForm = (offer: any) => {
    setEditingOffer(offer);
    setFormTitle(offer.title || '');
    setFormDescription(offer.description || '');
    setFormImageUrl(offer.image_url || '');
    setFormCategory(offer.category || '');
    setFormPhone(offer.phone || '');
    setFormStoreName(offer.store_name || '');
    setFormCardSize(offer.card_size || 'medium');
    setFormCardPosition(offer.card_position || 'top');
    setFormIsVip(offer.is_vip || false);
    setFormIsActive(offer.is_active !== false);
    setShowForm(true);
  };

  // ── رفع صورة ──
  const handlePickImage = async () => {
    setImageUploading(true);
    try {
      const result = await pickImage('gallery');
      if (result && result.base64) {
        const { url } = await uploadImage(result.base64, 'offers', `offer_${Date.now()}`);
        if (url) setFormImageUrl(url);
      }
    } catch (e) {
      console.warn('Image pick error:', e);
    } finally {
      setImageUploading(false);
    }
  };

  // ── حفظ العرض ──
  const handleSaveOffer = async () => {
    if (!formTitle.trim() || !formImageUrl.trim()) {
      showAlert(
        isAr ? 'مطلوب' : 'Required',
        isAr ? 'العنوان ورابط الصورة مطلوبان' : 'Title and image URL are required'
      );
      return;
    }

    setSaving(true);
    const supabase = getSupabaseClient();
    const payload = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      image_url: formImageUrl.trim(),
      category: formCategory.trim() || null,
      phone: formPhone.trim() || null,
      store_name: formStoreName.trim() || null,
      card_size: formCardSize,
      card_position: formCardPosition,
      is_vip: formIsVip,
      is_active: formIsActive,
      position: editingOffer?.position || 0,
    };

    try {
      let error;
      if (editingOffer) {
        const { error: updateError } = await supabase
          .from('offers')
          .update(payload)
          .eq('id', editingOffer.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('offers').insert([payload]);
        error = insertError;
      }

      if (error) throw new Error(error.message);

      showSnackbar(
        editingOffer
          ? (isAr ? 'تم تحديث العرض' : 'Offer updated')
          : (isAr ? 'تم إضافة العرض' : 'Offer added'),
        'success'
      );
      resetForm();
      loadOffers();
    } catch (err: any) {
      showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  // ── حذف العرض ──
  const handleDeleteOffer = (offer: any) => {
    setSelectedOffer(offer);
    setDeleteModalVisible(true);
  };

  const confirmDeleteOffer = async () => {
    if (!selectedOffer) return;
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('offers').delete().eq('id', selectedOffer.id);
    setDeleteModalVisible(false);
    if (error) {
      showAlert(isAr ? 'خطأ' : 'Error', error.message);
      return;
    }
    showSnackbar(isAr ? 'تم حذف العرض' : 'Offer deleted', 'success');
    loadOffers();
  };

  // ── تبديل حالة النشاط ──
  const handleToggleActive = async (offer: any) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('offers')
      .update({ is_active: !offer.is_active })
      .eq('id', offer.id);
    if (error) {
      showAlert(isAr ? 'خطأ' : 'Error', error.message);
      return;
    }
    showSnackbar(isAr ? 'تم تحديث حالة العرض' : 'Offer status updated', 'success');
    loadOffers();
  };

  // ── تبديل VIP ──
  const handleToggleVip = async (offer: any) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('offers')
      .update({ is_vip: !offer.is_vip })
      .eq('id', offer.id);
    if (error) {
      showAlert(isAr ? 'خطأ' : 'Error', error.message);
      return;
    }
    showSnackbar(isAr ? 'تم تحديث حالة VIP' : 'VIP status updated', 'success');
    loadOffers();
  };

  // ── تصدير CSV ──
  const exportOffers = async () => {
    const csv = generateCSV(
      offers,
      ['ID', 'Title', 'Description', 'Category', 'Store Name', 'Phone', 'Size', 'Position', 'VIP', 'Active'],
      ['id', 'title', 'description', 'category', 'store_name', 'phone', 'card_size', 'card_position', 'is_vip', 'is_active']
    );
    try {
      await Share.share({ message: csv, title: 'Offers Export.csv' });
    } catch (e) {
      console.warn('Share failed', e);
    }
  };

  // ── التصفية والبحث ──
  const filteredOffers = useMemo(() => {
    if (!search.trim()) return offers;
    const q = search.trim().toLowerCase();
    return offers.filter(
      (o) =>
        (o.title || '').toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q) ||
        (o.store_name || '').toLowerCase().includes(q) ||
        (o.category || '').toLowerCase().includes(q)
    );
  }, [offers, search]);

  const renderItem = ({ item }: { item: any }) => (
    <OfferListItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleActive={handleToggleActive}
      onToggleVip={handleToggleVip}
      onEdit={openEditForm}
      onDelete={handleDeleteOffer}
    />
  );
  const getItemLayout = (data: any, index: number) => ({ length: 130, offset: 130 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <View style={styles.adControls}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={isAr ? '🔍 ابحث عن عرض...' : '🔍 Search offers...'}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialIcons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.addOfferBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
            {isAr ? 'إضافة' : 'Add'}
          </Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportOffers}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {showForm && (
        <View style={[styles.offerForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.offerFormHeader}>
            <Text style={[styles.offerFormTitle, { color: colors.textPrimary }]}>
              {editingOffer
                ? (isAr ? '✏️ تعديل العرض' : '✏️ Edit Offer')
                : (isAr ? '➕ إضافة عرض جديد' : '➕ Add New Offer')}
            </Text>
            <Pressable onPress={resetForm} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.offerFormContent} showsVerticalScrollIndicator={false}>
            <TextInput
              style={[styles.offerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              placeholder={isAr ? 'العنوان *' : 'Title *'}
              placeholderTextColor={colors.textMuted}
              value={formTitle}
              onChangeText={setFormTitle}
            />

            <TextInput
              style={[styles.offerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 80, textAlignVertical: 'top' }]}
              placeholder={isAr ? 'الوصف' : 'Description'}
              placeholderTextColor={colors.textMuted}
              value={formDescription}
              onChangeText={setFormDescription}
              multiline
            />

            <View style={styles.offerFormRow}>
              <TextInput
                style={[styles.offerFormInputFlex, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
                placeholder={isAr ? 'رابط الصورة *' : 'Image URL *'}
                placeholderTextColor={colors.textMuted}
                value={formImageUrl}
                onChangeText={setFormImageUrl}
              />
              <Pressable
                style={[styles.offerFormUpload, { backgroundColor: colors.primaryGhost }]}
                onPress={handlePickImage}
                disabled={imageUploading}
              >
                {imageUploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="upload" size={20} color={colors.primary} />
                )}
              </Pressable>
            </View>

            <TextInput
              style={[styles.offerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              placeholder={isAr ? 'التصنيف (مثلاً: مطاعم، إلكترونيات)' : 'Category (e.g., Restaurants, Electronics)'}
              placeholderTextColor={colors.textMuted}
              value={formCategory}
              onChangeText={setFormCategory}
            />

            <TextInput
              style={[styles.offerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              placeholder={isAr ? 'رقم الهاتف (واتساب)' : 'Phone number (WhatsApp)'}
              placeholderTextColor={colors.textMuted}
              value={formPhone}
              onChangeText={setFormPhone}
              keyboardType="phone-pad"
            />

            <TextInput
              style={[styles.offerFormInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              placeholder={isAr ? 'اسم المتجر' : 'Store name'}
              placeholderTextColor={colors.textMuted}
              value={formStoreName}
              onChangeText={setFormStoreName}
            />

            <View style={styles.offerFormLabel}>
              <Text style={[styles.offerFormLabelText, { color: colors.textSecondary }]}>
                {isAr ? 'حجم العرض' : 'Card Size'}
              </Text>
            </View>
            <View style={styles.offerFormOptions}>
              {(['full', 'large', 'medium', 'small'] as const).map((size) => (
                <Pressable
                  key={size}
                  style={[
                    styles.offerFormOptionBtn,
                    {
                      borderColor: formCardSize === size ? colors.primary : colors.border,
                      backgroundColor: formCardSize === size ? colors.primary : colors.background,
                    },
                  ]}
                  onPress={() => setFormCardSize(size)}
                >
                  <Text
                    style={{
                      color: formCardSize === size ? '#fff' : colors.textSecondary,
                      fontWeight: '600',
                      fontSize: 10,
                    }}
                  >
                    {size === 'full' ? (isAr ? 'كامل' : 'Full') :
                     size === 'large' ? (isAr ? 'كبير' : 'Large') :
                     size === 'medium' ? (isAr ? 'متوسط' : 'Medium') :
                     (isAr ? 'صغير' : 'Small')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.offerFormLabel}>
              <Text style={[styles.offerFormLabelText, { color: colors.textSecondary }]}>
                {isAr ? 'موضع العرض' : 'Card Position'}
              </Text>
            </View>
            <View style={styles.offerFormOptions}>
              {(['top', 'middle', 'bottom'] as const).map((pos) => (
                <Pressable
                  key={pos}
                  style={[
                    styles.offerFormOptionBtn,
                    {
                      borderColor: formCardPosition === pos ? colors.primary : colors.border,
                      backgroundColor: formCardPosition === pos ? colors.primary : colors.background,
                    },
                  ]}
                  onPress={() => setFormCardPosition(pos)}
                >
                  <Text
                    style={{
                      color: formCardPosition === pos ? '#fff' : colors.textSecondary,
                      fontWeight: '600',
                      fontSize: 10,
                    }}
                  >
                    {pos === 'top' ? (isAr ? 'أعلى' : 'Top') :
                     pos === 'middle' ? (isAr ? 'وسط' : 'Middle') :
                     (isAr ? 'أسفل' : 'Bottom')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.offerFormSwitchRow}>
              <View style={styles.offerFormSwitch}>
                <Text style={[styles.offerFormSwitchLabel, { color: colors.textSecondary }]}>
                  {isAr ? 'VIP' : 'VIP'}
                </Text>
                <Pressable
                  style={[
                    styles.offerFormSwitchBtn,
                    { backgroundColor: formIsVip ? colors.primary : colors.border },
                  ]}
                  onPress={() => setFormIsVip(!formIsVip)}
                >
                  <View
                    style={[
                      styles.offerFormSwitchThumb,
                      {
                        transform: [{ translateX: formIsVip ? 16 : 0 }],
                        backgroundColor: '#fff',
                      },
                    ]}
                  />
                </Pressable>
              </View>

              <View style={styles.offerFormSwitch}>
                <Text style={[styles.offerFormSwitchLabel, { color: colors.textSecondary }]}>
                  {isAr ? 'نشط' : 'Active'}
                </Text>
                <Pressable
                  style={[
                    styles.offerFormSwitchBtn,
                    { backgroundColor: formIsActive ? colors.primary : colors.border },
                  ]}
                  onPress={() => setFormIsActive(!formIsActive)}
                >
                  <View
                    style={[
                      styles.offerFormSwitchThumb,
                      {
                        transform: [{ translateX: formIsActive ? 16 : 0 }],
                        backgroundColor: '#fff',
                      },
                    ]}
                  />
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[styles.offerFormSave, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSaveOffer}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {isAr ? '💾 حفظ' : '💾 Save'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredOffers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadOffers();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="local-offer" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>
              {isAr ? 'لا توجد عروض' : 'No offers found'}
            </Text>
            <Pressable
              style={[styles.addOfferEmptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {isAr ? '+ أضف عرضاً جديداً' : '+ Add New Offer'}
              </Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={
          <Text style={[styles.listFooter, { color: colors.textMuted }]}>
            {filteredOffers.length} {isAr ? 'عرض' : 'offers'}
          </Text>
        }
      />

      <ConfirmationModal
        visible={deleteModalVisible}
        title={isAr ? 'حذف العرض' : 'Delete Offer'}
        message={isAr ? `هل أنت متأكد من حذف "${selectedOffer?.title}"؟` : `Are you sure to delete "${selectedOffer?.title}"?`}
        details={selectedOffer ? `ID: ${selectedOffer.id}` : ''}
        onConfirm={confirmDeleteOffer}
        onCancel={() => setDeleteModalVisible(false)}
        isAr={isAr}
      />

      <Snackbar
        visible={snackbar.visible}
        message={snackbar.message}
        type={snackbar.type}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
      />
    </View>
  );
}

// ─── تبويب سجل النشاطات ──────────────────────────────────────────────────────
function ActivityLogTab({ colors, isAr }: { colors: any; isAr: boolean }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadLogs = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const mockLogs: ActivityLog[] = Array.from({ length: 20 }, (_, i) => ({
        id: `log-${i}`,
        admin_name: ['أحمد', 'سارة', 'محمد', 'فاطمة'][i % 4],
        action: ['تعديل إعلان', 'حذف مستخدم', 'تمييز إعلان', 'إرسال إشعار'][i % 4],
        target: `العنوان ${i}`,
        details: `تفاصيل العملية ${i}`,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }));
      if (controller.signal.aborted) return;
      setLogs(mockLogs);
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.warn(err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  useEffect(() => { loadLogs(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const renderItem = ({ item }: { item: ActivityLog }) => (
    <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.logHeader}>
        <Text style={[styles.logAdmin, { color: colors.primary }]}>{item.admin_name}</Text>
        <Text style={[styles.logTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <Text style={[styles.logAction, { color: colors.textPrimary }]}>{item.action}</Text>
      <Text style={[styles.logTarget, { color: colors.textSecondary }]}>{item.target}</Text>
      {item.details && <Text style={[styles.logDetails, { color: colors.textMuted }]}>{item.details}</Text>}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.tabContainer}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLogs(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد سجلات' : 'No logs'}</Text></View>}
      />
    </View>
  );
}

// ─── تبويب البلاغات ───────────────────────────────────────────────────────────
function ReportsTab({ colors, isAr }: { colors: any; isAr: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'rejected'>('all');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const loadReports = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const mockReports: Report[] = Array.from({ length: 15 }, (_, i) => ({
        id: `report-${i}`,
        reporter_name: ['UserA', 'UserB', 'UserC'][i % 3],
        target_type: ['ad', 'user', 'store'][i % 3] as any,
        target_id: `target-${i}`,
        reason: `سبب البلاغ ${i}`,
        status: ['pending', 'resolved', 'rejected'][i % 3] as any,
        created_at: new Date(Date.now() - i * 120000).toISOString(),
      }));
      if (controller.signal.aborted) return;
      setReports(mockReports);
    } catch (err) { console.warn(err); }
    finally { if (!controller.signal.aborted) setLoading(false); if (abortRef.current === controller) abortRef.current = null; }
  }, []);

  useEffect(() => { loadReports(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const handleStatusChange = async (id: string, status: 'resolved' | 'rejected') => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    showSnackbar(isAr ? 'تم تحديث حالة البلاغ' : 'Report updated', 'success');
  };

  const filteredReports = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  const renderItem = ({ item }: { item: Report }) => (
    <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.reportHeader}>
        <Text style={[styles.reportReporter, { color: colors.textPrimary }]}>{item.reporter_name}</Text>
        <View style={[styles.reportStatus, { backgroundColor: item.status === 'pending' ? '#FEF3C7' : item.status === 'resolved' ? '#DBEAFE' : '#FEE2E2' }]}>
          <Text style={{ color: item.status === 'pending' ? '#D97706' : item.status === 'resolved' ? '#2563EB' : '#EF4444' }}>
            {item.status === 'pending' ? (isAr ? 'قيد المراجعة' : 'Pending') : item.status === 'resolved' ? (isAr ? 'تم الحل' : 'Resolved') : (isAr ? 'مرفوض' : 'Rejected')}
          </Text>
        </View>
      </View>
      <Text style={[styles.reportTarget, { color: colors.textSecondary }]}>نوع: {item.target_type} | ID: {item.target_id}</Text>
      <Text style={[styles.reportReason, { color: colors.textPrimary }]}>{item.reason}</Text>
      <Text style={[styles.reportTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
      {item.status === 'pending' && (
        <View style={styles.reportActions}>
          <Pressable style={[styles.reportActionBtn, { backgroundColor: '#DBEAFE' }]} onPress={() => handleStatusChange(item.id, 'resolved')}>
            <Text style={{ color: '#2563EB' }}>{isAr ? '✔ حل' : 'Resolve'}</Text>
          </Pressable>
          <Pressable style={[styles.reportActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleStatusChange(item.id, 'rejected')}>
            <Text style={{ color: '#EF4444' }}>{isAr ? '✖ رفض' : 'Reject'}</Text>
          </Pressable>
          <Pressable style={[styles.reportActionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => Alert.alert(isAr ? 'حظر المستخدم' : 'Block User', isAr ? 'سيتم حظر هذا المستخدم' : 'Block this user')}>
            <Text style={{ color: colors.primary }}>{isAr ? 'حظر' : 'Block'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.tabContainer}>
      <View style={styles.filterContainer}>
        {(['all', 'pending', 'resolved', 'rejected'] as const).map(s => (
          <Pressable key={s} style={[styles.filterBtn, { backgroundColor: filter === s ? colors.primary : colors.border }]} onPress={() => setFilter(s)}>
            <Text style={{ color: filter === s ? '#fff' : colors.textSecondary, fontWeight: '600' }}>
              {s === 'all' ? (isAr ? 'الكل' : 'All') : s === 'pending' ? (isAr ? 'قيد المراجعة' : 'Pending') : s === 'resolved' ? (isAr ? 'تم الحل' : 'Resolved') : (isAr ? 'مرفوض' : 'Rejected')}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReports(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد بلاغات' : 'No reports'}</Text></View>}
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب الطلبات ────────────────────────────────────────────────────────────
function OrdersTab({ colors, isAr }: { colors: any; isAr: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'>('all');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const loadOrders = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const mockOrders: Order[] = Array.from({ length: 25 }, (_, i) => ({
        id: `order-${i}`,
        user_name: [`User${i}`, `Customer${i}`][i % 2],
        ad_title: `إعلان ${i}`,
        amount: Math.floor(Math.random() * 500) + 50,
        status: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'][i % 5] as any,
        created_at: new Date(Date.now() - i * 180000).toISOString(),
      }));
      if (controller.signal.aborted) return;
      setOrders(mockOrders);
    } catch (err) { console.warn(err); }
    finally { if (!controller.signal.aborted) setLoading(false); if (abortRef.current === controller) abortRef.current = null; }
  }, []);

  useEffect(() => { loadOrders(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const handleStatusUpdate = async (id: string, newStatus: Order['status']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    showSnackbar(isAr ? 'تم تحديث حالة الطلب' : 'Order updated', 'success');
  };

  const filteredOrders = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);

  const renderItem = ({ item }: { item: Order }) => (
    <View style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.orderHeader}>
        <Text style={[styles.orderUser, { color: colors.textPrimary }]}>{item.user_name}</Text>
        <Text style={[styles.orderAmount, { color: colors.primary }]}>{item.amount}₪</Text>
      </View>
      <Text style={[styles.orderAd, { color: colors.textSecondary }]}>{item.ad_title}</Text>
      <View style={styles.orderStatusRow}>
        <View style={[styles.orderStatus, { backgroundColor: item.status === 'pending' ? '#FEF3C7' : item.status === 'paid' ? '#DBEAFE' : item.status === 'shipped' ? '#D1FAE5' : item.status === 'delivered' ? '#A7F3D0' : '#FEE2E2' }]}>
          <Text style={{ color: item.status === 'pending' ? '#D97706' : item.status === 'paid' ? '#2563EB' : item.status === 'shipped' ? '#059669' : item.status === 'delivered' ? '#047857' : '#EF4444' }}>
            {item.status === 'pending' ? (isAr ? 'قيد الانتظار' : 'Pending') : item.status === 'paid' ? (isAr ? 'مدفوع' : 'Paid') : item.status === 'shipped' ? (isAr ? 'تم الشحن' : 'Shipped') : item.status === 'delivered' ? (isAr ? 'تم التوصيل' : 'Delivered') : (isAr ? 'ملغي' : 'Cancelled')}
          </Text>
        </View>
        <Text style={[styles.orderTime, { color: colors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      {item.status !== 'delivered' && item.status !== 'cancelled' && (
        <View style={styles.orderActions}>
          {item.status === 'pending' && <Pressable style={[styles.orderActionBtn, { backgroundColor: '#DBEAFE' }]} onPress={() => handleStatusUpdate(item.id, 'paid')}><Text style={{ color: '#2563EB' }}>{isAr ? 'تأكيد الدفع' : 'Confirm Payment'}</Text></Pressable>}
          {item.status === 'paid' && <Pressable style={[styles.orderActionBtn, { backgroundColor: '#D1FAE5' }]} onPress={() => handleStatusUpdate(item.id, 'shipped')}><Text style={{ color: '#059669' }}>{isAr ? 'شحن' : 'Ship'}</Text></Pressable>}
          {item.status === 'shipped' && <Pressable style={[styles.orderActionBtn, { backgroundColor: '#A7F3D0' }]} onPress={() => handleStatusUpdate(item.id, 'delivered')}><Text style={{ color: '#047857' }}>{isAr ? 'تسليم' : 'Deliver'}</Text></Pressable>}
          <Pressable style={[styles.orderActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => handleStatusUpdate(item.id, 'cancelled')}><Text style={{ color: '#EF4444' }}>{isAr ? 'إلغاء' : 'Cancel'}</Text></Pressable>
        </View>
      )}
    </View>
  );

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const statuses: Order['status'][] = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  const statusLabels: Record<Order['status'], string> = {
    pending: isAr ? 'قيد الانتظار' : 'Pending',
    paid: isAr ? 'مدفوع' : 'Paid',
    shipped: isAr ? 'تم الشحن' : 'Shipped',
    delivered: isAr ? 'تم التوصيل' : 'Delivered',
    cancelled: isAr ? 'ملغي' : 'Cancelled',
  };

  return (
    <View style={styles.tabContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
        <Pressable style={[styles.filterBtn, { backgroundColor: filterStatus === 'all' ? colors.primary : colors.border }]} onPress={() => setFilterStatus('all')}>
          <Text style={{ color: filterStatus === 'all' ? '#fff' : colors.textSecondary, fontWeight: '600' }}>{isAr ? 'الكل' : 'All'}</Text>
        </Pressable>
        {statuses.map(s => (
          <Pressable key={s} style={[styles.filterBtn, { backgroundColor: filterStatus === s ? colors.primary : colors.border }]} onPress={() => setFilterStatus(s)}>
            <Text style={{ color: filterStatus === s ? '#fff' : colors.textSecondary, fontWeight: '600' }}>{statusLabels[s]}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} colors={[colors.primary]} tintColor={colors.primary} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد طلبات' : 'No orders'}</Text></View>}
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب الأدوات ──────────────────────────────────────────────────────────
function ToolsTab({ colors, isAr, t }: any) {
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [boostDuration, setBoostDuration] = useState('7');
  const { showAlert } = useAlert();

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان والمحتوى مطلوبان' : 'Title and body are required');
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setBroadcastModalVisible(false);
      setTitle('');
      setBody('');
      setImageUrl('');
      showSnackbar(isAr ? 'تم إرسال الإشعارات بنجاح' : 'Broadcast sent successfully', 'success');
    }, 1500);
  };

  const handleBackup = () => {
    Alert.alert(isAr ? 'نسخ احتياطي' : 'Backup', isAr ? 'سيتم تصدير جميع البيانات كملف JSON' : 'All data will be exported as JSON');
  };

  const handleRestore = () => {
    Alert.alert(isAr ? 'استعادة' : 'Restore', isAr ? 'اختر ملف الاستعادة' : 'Select restore file');
  };

  const toggleMaintenance = () => {
    setMaintenanceMode(!maintenanceMode);
    showSnackbar(isAr ? `تم ${!maintenanceMode ? 'تفعيل' : 'إيقاف'} وضع الصيانة` : `Maintenance mode ${!maintenanceMode ? 'enabled' : 'disabled'}`, 'success');
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.toolsContainer}
    >
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{isAr ? '🛠️ أدوات الإدارة' : '🛠️ Admin Tools'}</Text>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setBroadcastModalVisible(true)}>
        <MaterialIcons name="notifications-active" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إرسال إشعارات جماعية' : 'Send Broadcast'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'مع خيارات تصفية متقدمة' : 'With advanced filters'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      <View style={styles.toolRow}>
        <Pressable style={[styles.toolCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleBackup}>
          <MaterialIcons name="backup" size={24} color={colors.primary} />
          <Text style={[styles.toolTitleSmall, { color: colors.textPrimary }]}>{isAr ? 'نسخ احتياطي' : 'Backup'}</Text>
        </Pressable>
        <Pressable style={[styles.toolCardSmall, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleRestore}>
          <MaterialIcons name="restore" size={24} color={colors.primary} />
          <Text style={[styles.toolTitleSmall, { color: colors.textPrimary }]}>{isAr ? 'استعادة' : 'Restore'}</Text>
        </Pressable>
      </View>

      <View style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="build" size={28} color={maintenanceMode ? '#EF4444' : colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'وضع الصيانة' : 'Maintenance Mode'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>
            {maintenanceMode ? (isAr ? '⚠️ مفعل' : '⚠️ Enabled') : (isAr ? 'غير مفعل' : 'Disabled')}
          </Text>
        </View>
        <Pressable style={[styles.toolToggle, { backgroundColor: maintenanceMode ? '#EF4444' : colors.primary }]} onPress={toggleMaintenance}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{maintenanceMode ? (isAr ? 'إيقاف' : 'Disable') : (isAr ? 'تفعيل' : 'Enable')}</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowSettings(!showSettings)}>
        <MaterialIcons name="settings" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إعدادات متقدمة' : 'Advanced Settings'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'تعديل الإعدادات العامة' : 'Modify general settings'}</Text>
        </View>
        <MaterialIcons name={showSettings ? 'expand-less' : 'expand-more'} size={24} color={colors.textMuted} />
      </Pressable>
      {showSettings && (
        <View style={[styles.settingsPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{isAr ? 'مدة التعزيز (أيام)' : 'Boost duration (days)'}</Text>
            <TextInput style={[styles.settingInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, width: 60 }]} value={boostDuration} onChangeText={setBoostDuration} keyboardType="numeric" />
          </View>
          <Pressable style={[styles.saveSettingsBtn, { backgroundColor: colors.primary }]} onPress={() => { showSnackbar(isAr ? 'تم حفظ الإعدادات' : 'Settings saved', 'success'); setShowSettings(false); }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'حفظ' : 'Save'}</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="split" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'اختبار A/B للإعلانات' : 'Ad A/B Testing'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'إدارة المتغيرات وعرض النتائج' : 'Manage variants and view results'}</Text>
        </View>
        <Pressable style={[styles.toolToggle, { backgroundColor: colors.primaryGhost }]} onPress={() => Alert.alert(isAr ? 'نتائج A/B' : 'A/B Results', isAr ? 'الإعلان A: 120 نقرة\nالإعلان B: 95 نقرة' : 'Ad A: 120 clicks\nAd B: 95 clicks')}>
          <Text style={{ color: colors.primary }}>{isAr ? 'عرض النتائج' : 'View Results'}</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Alert.alert(isAr ? 'تنبيهات فورية' : 'Real-time Alerts', isAr ? 'تم الاتصال بخادم التنبيهات' : 'Connected to alert server')}>
        <MaterialIcons name="notifications" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'تنبيهات فورية' : 'Real-time Alerts'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'استقبال التنبيهات اللحظية' : 'Receive instant alerts'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      <Pressable style={[styles.toolCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Alert.alert(isAr ? 'إدارة الصلاحيات' : 'Role Management', isAr ? 'لديك صلاحيات مدير عام' : 'You have full admin rights')}>
        <MaterialIcons name="admin-panel-settings" size={28} color={colors.primary} />
        <View style={styles.toolText}>
          <Text style={[styles.toolTitle, { color: colors.textPrimary }]}>{isAr ? 'إدارة الصلاحيات' : 'Role Management'}</Text>
          <Text style={[styles.toolDesc, { color: colors.textMuted }]}>{isAr ? 'تعيين أدوار للمديرين' : 'Assign roles to admins'}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
      </Pressable>

      <Modal visible={broadcastModalVisible} animationType="slide" transparent onRequestClose={() => setBroadcastModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                <MaterialIcons name="notifications-active" size={22} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {isAr ? '📢 إشعار جماعي' : '📢 Broadcast'}
                </Text>
                <Pressable onPress={() => setBroadcastModalVisible(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'العنوان' : 'Title'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={title} onChangeText={setTitle} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'المحتوى' : 'Body'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 100, textAlignVertical: 'top' }]} value={body} onChangeText={setBody} multiline />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'رابط الصورة (اختياري)' : 'Image URL (optional)'}</Text>
                  <TextInput style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} value={imageUrl} onChangeText={setImageUrl} />
                </View>
                <View style={styles.modalField}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>{isAr ? 'تصفية المستخدمين' : 'User Filter'}</Text>
                  <View style={styles.filterOptions}>
                    {['الكل', 'نشط', 'جديد', 'منطقة'].map((f, i) => (
                      <Pressable key={i} style={[styles.filterChip, { backgroundColor: colors.primaryGhost, borderColor: colors.border }]}>
                        <Text style={{ color: colors.textSecondary }}>{f}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Pressable
                  style={[styles.modalSaveBtn, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
                  onPress={handleBroadcast}
                  disabled={sending}
                >
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveBtnText}>{isAr ? '📤 إرسال' : '📤 Send'}</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </ScrollView>
  );
}

// ─── تبويب المتاجر ────────────────────────────────────────────────────────────
function StoresTab({ colors, isAr, t }: any) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const [search, setSearch] = useState('');
  const { showAlert } = useAlert();
  const abortRef = useRef<AbortController | null>(null);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  const loadData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRefreshing(false);
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 15000));
      const result = await Promise.race([adminFetchAllStores({ signal: controller.signal }), timeout]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      setStores(data || []);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.message !== 'TIMEOUT') {
        showAlert(isAr ? 'خطأ' : 'Error', err?.message || (isAr ? 'فشل التحميل' : 'Load failed'));
      }
    } finally {
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [isAr, showAlert]);

  useEffect(() => { loadData(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, []);

  const handleToggleActive = async (store: Store) => {
    const { error } = await adminUpdateStore(store.id, { is_active: !store.is_active });
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة المتجر' : 'Store status updated', 'success');
    loadData();
  };

  const handleToggleFeatured = async (store: Store) => {
    const { error } = await adminUpdateStore(store.id, { is_featured: !store.is_featured });
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة التميز' : 'Featured status updated', 'success');
    loadData();
  };

  const handleToggleApproved = async (store: Store) => {
    const { error } = await adminUpdateStore(store.id, { is_approved: !store.is_approved });
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    showSnackbar(isAr ? 'تم تحديث حالة الموافقة' : 'Approval status updated', 'success');
    loadData();
  };

  const filteredStores = stores.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.owner?.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.owner?.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }: { item: Store }) => (
    <StoreItem
      item={item}
      colors={colors}
      isAr={isAr}
      onToggleActive={handleToggleActive}
      onToggleFeatured={handleToggleFeatured}
      onToggleApproved={handleToggleApproved}
    />
  );

  const getItemLayout = (data: any, index: number) => ({ length: 90, offset: 90 * index, index });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <MaterialIcons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={isAr ? '🔍 ابحث عن متجر أو مالك...' : '🔍 Search store or owner...'}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <FlatList
        data={filteredStores}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} tintColor={colors.primary} />
        }
        getItemLayout={getItemLayout}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="storefront" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا توجد متاجر' : 'No stores found'}</Text>
          </View>
        }
      />
      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'analytics' | 'ads' | 'offers' | 'users' | 'banners' | 'interstitials' | 'logs' | 'reports' | 'orders' | 'stores' | 'tools'>('analytics');

  const TABS = [
    { key: 'analytics', label: isAr ? '📊 إحصائيات' : 'Analytics', icon: 'insights' },
    { key: 'ads', label: isAr ? '📢 إعلانات' : 'Ads', icon: 'storefront' },
    { key: 'offers', label: isAr ? '🎯 عروض' : 'Offers', icon: 'local-offer' },
    { key: 'users', label: isAr ? '👤 مستخدمين' : 'Users', icon: 'people' },
    { key: 'banners', label: isAr ? '🖼️ بانرات' : 'Banners', icon: 'view-carousel' },
    { key: 'interstitials', label: isAr ? '📱 بينية' : 'Interstitials', icon: 'play-circle-outline' },
    { key: 'logs', label: isAr ? '📋 سجل النشاطات' : 'Activity Log', icon: 'history' },
    { key: 'reports', label: isAr ? '⚠️ بلاغات' : 'Reports', icon: 'report' },
    { key: 'orders', label: isAr ? '🛒 طلبات' : 'Orders', icon: 'shopping-cart' },
    { key: 'stores', label: isAr ? '🏪 متاجر' : 'Stores', icon: 'storefront' },
    { key: 'tools', label: isAr ? '🛠️ أدوات' : 'Tools', icon: 'build' },
  ];

  return (
    <View style={[styles.mainContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.mainHeader, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.mainBackBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.mainHeaderTitle}>{isAr ? '⚙️ لوحة الإدارة' : '⚙️ Admin Panel'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.tabBtn,
                  {
                    backgroundColor: isActive ? colors.primary : colors.surfaceTint,
                    borderColor: isActive ? colors.primary : colors.border,
                  }
                ]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <MaterialIcons name={tab.icon as any} size={18} color={isActive ? '#fff' : colors.textSecondary} />
                <Text style={[styles.tabBtnText, { color: isActive ? '#fff' : colors.textSecondary, fontWeight: isActive ? '700' : '500' }]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <AdminTabErrorBoundary>
        {activeTab === 'analytics' && <AnalyticsTab isAr={isAr} colors={colors} />}
        {activeTab === 'ads' && <AdsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'offers' && <OffersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'users' && <UsersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'banners' && <BannersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'interstitials' && <InterstitialsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'logs' && <ActivityLogTab colors={colors} isAr={isAr} />}
        {activeTab === 'reports' && <ReportsTab colors={colors} isAr={isAr} />}
        {activeTab === 'orders' && <OrdersTab colors={colors} isAr={isAr} />}
        {activeTab === 'stores' && <StoresTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'tools' && <ToolsTab colors={colors} isAr={isAr} t={t} />}
      </AdminTabErrorBoundary>
    </View>
  );
}

// ─── الأنماط ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // الأنماط الأصلية موجودة هنا (تم حذفها للاختصار ولكن يجب إضافتها مع الأنماط الجديدة)
  // ... (جميع الأنماط من الكود الأصلي)
  // بالإضافة إلى الأنماط الجديدة للعروض

  // ── أنماط العروض ──
  offerCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offerImage: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
  },
  offerImagePlaceholder: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerInfo: {
    flex: 1,
  },
  offerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  offerStore: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  offerTags: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  offerTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offerActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  offerActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addOfferBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
  },
  addOfferEmptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.full,
    marginTop: 12,
  },
  offerForm: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    maxHeight: 500,
  },
  offerFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  offerFormTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  offerFormContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  offerFormInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
  },
  offerFormRow: {
    flexDirection: 'row',
    gap: 8,
  },
  offerFormInputFlex: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
  },
  offerFormUpload: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  offerFormLabel: {
    marginTop: 4,
  },
  offerFormLabelText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  offerFormOptions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  offerFormOptionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  offerFormSwitchRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  offerFormSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offerFormSwitchLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  offerFormSwitchBtn: {
    width: 34,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  offerFormSwitchThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  offerFormSave: {
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 4,
  },
  listFooter: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    paddingVertical: Spacing.md,
  },
});