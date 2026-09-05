// [file name]: adminScreen.tsx
// هذا الكود يشمل جميع التبويبات: إحصائيات، إعلانات، مستخدمين، بانرات، بينية، سجل النشاطات، بلاغات، طلبات، أدوات.
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
import { useAlert, getSupabaseClient, useAuth } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
// استيراد الخدمات
import {
  adminFetchAllAds, adminDeleteAd, adminUpdateAd,
  adminSetAdFeatured, adminFetchAllUsers, adminSetUserBlocked,
  adminBoostAd, adminSetUserAdmin, adminSetUserVerified, UserProfile,
  checkIsAdmin, adminFetchAdsQuickStats, adminFetchReportedAdIds, adminFetchUserAdCounts,
  adminFetchUsersQuickStats, adminFetchLastSeen, adminFetchUserFavoriteCounts,
} from '@/services/adminService';
import { fetchAllBanners, createBanner, deleteBanner, toggleBannerActive, updateBanner, Banner, BannerPlacement } from '@/services/bannersService';
import {
  fetchAllInterstitials, InterstitialAd,
} from '@/services/interstitialService';
import { Ad } from '@/services/adsService';
import { fetchCategories, getCategoryName, Category } from '@/services/categoriesService';
import {
  adminFetchAllStores, adminUpdateStore, Store, checkStoreIsOpen, fetchAllStoreRatings,
} from '@/services/storesService';
import { pickImage, uploadImage } from '@/services/imageService';

// ─── ثابت ──────────────────────────────────────────────────────────────────────
const ABSOLUTE_FILL = StyleSheet.absoluteFill;

// ─── واجهات الأنواع ──────────────────────────────────────────────────────────
interface Report {
  id: string;
  reporter_name: string;
  target_type: 'ad' | 'user' | 'store';
  target_id: string;
  target_user_id: string | null;
  reason: string;
  status: 'pending' | 'resolved' | 'rejected';
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
function ConfirmationModal({ visible, title, message, details, onConfirm, onCancel, isAr, colors }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={[styles.confirmSheet, { backgroundColor: colors?.surface ?? '#fff' }]}>
          <MaterialIcons name="warning" size={48} color="#EF4444" style={{ alignSelf: 'center' }} />
          <Text style={[styles.confirmTitle, { color: colors?.textPrimary }]}>{title}</Text>
          <Text style={[styles.confirmMessage, { color: colors?.textSecondary }]}>{message}</Text>
          {details && <Text style={[styles.confirmDetails, { color: colors?.textMuted }]}>{details}</Text>}
          <View style={styles.confirmActions}>
            <Pressable style={[styles.confirmBtn, styles.confirmCancel, { backgroundColor: colors?.surfaceTint }]} onPress={onCancel}>
              <Text style={[styles.confirmBtnText, { color: colors?.textPrimary }]}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
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
const AdItem = memo(({ item, colors, isAr, isRTL, onToggleFeatured, onToggleBoost, onEdit, onDelete, onView, pending, isReported, selectionMode, selected, onToggleSelect }: any) => {
  const isFeatured = item.status === 'featured';
  const isSold = item.status === 'sold';
  const isBoosted = !!(item.boosted_until && new Date(item.boosted_until).getTime() > Date.now());
  const isDeleted = item.status === 'deleted';
  // ✅ مُصلَّح: "مباع" كان يظهر رمادي باسم "منتهي" — صار له لون وتسمية خاصة
  const statusColor = isDeleted ? '#EF4444' : isSold ? '#3B82F6' : item.status === 'active' ? '#22C55E' : item.status === 'featured' ? '#F59E0B' : '#6B7280';
  const statusLabel = isAr
    ? isDeleted ? 'محذوف' : isSold ? 'مباع' : item.status === 'active' ? 'نشط' : item.status === 'featured' ? 'مميز' : item.status
    : isDeleted ? 'Deleted' : isSold ? 'Sold' : item.status === 'active' ? 'Active' : item.status === 'featured' ? 'Featured' : item.status;
  const categoryName = item.categories ? (isAr ? (item.categories.name_ar || item.categories.name) : item.categories.name) : null;
  const sellerName = item.user_profiles?.username || item.user_profiles?.email?.split('@')[0] || null;
  const thumb = item.ad_images?.[0]?.url;
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const daysSince = item.created_at ? Math.floor((Date.now() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000)) : null;
  return (
    <View style={[styles.adCard, { backgroundColor: colors.surface, borderColor: isReported ? '#EF4444' : isBoosted ? '#2563EB' : colors.border, opacity: pending ? 0.6 : 1 }]}>
      <View style={[styles.adHeader, { flexDirection: rowDir }]}>
        {selectionMode && (
          <Pressable onPress={() => onToggleSelect(item.id)} hitSlop={8}>
            <MaterialIcons name={selected ? 'check-box' : 'check-box-outline-blank'} size={22} color={selected ? colors.primary : colors.textMuted} />
          </Pressable>
        )}
        {thumb ? (
          <Image source={{ uri: thumb }} style={{ width: 32, height: 32, borderRadius: 6 }} contentFit="cover" />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="image-not-supported" size={16} color={colors.textMuted} />
          </View>
        )}
        <Text style={[styles.adTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{item.title}</Text>
        {isReported && <MaterialIcons name="flag" size={16} color="#EF4444" />}
        <View style={[styles.adStatusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.adStatusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Text style={[styles.adMeta, { color: colors.textMuted }]}>
        {item.price}₪ • {item.condition === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
        {daysSince !== null ? ` • ${isAr ? `منذ ${daysSince} يوم` : `${daysSince}d ago`}` : ''}
        {item.location ? ` • ${item.location}` : ''}
        {categoryName ? ` • ${categoryName}` : ''}
      </Text>
      {sellerName && (
        <Text style={[styles.adMeta, { color: colors.textMuted, fontSize: 11 }]} numberOfLines={1}>
          {isAr ? '👤 البائع: ' : '👤 Seller: '}{sellerName}
        </Text>
      )}
      <View style={[styles.adActions, { flexDirection: rowDir, flexWrap: 'wrap' }]}>
        <Pressable
          disabled={pending || isSold || isDeleted}
          style={[styles.adActionBtn, { backgroundColor: isFeatured ? '#FEF3C7' : colors.borderLight, opacity: (isSold || isDeleted) ? 0.4 : 1 }]}
          onPress={() => onToggleFeatured(item)}
        >
          <MaterialIcons name={isFeatured ? 'star' : 'star-border'} size={14} color={isFeatured ? '#D97706' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: isFeatured ? '#D97706' : colors.textMuted }}>
            {isAr ? (isFeatured ? 'إلغاء التميز' : 'تمييز') : (isFeatured ? 'Unfeature' : 'Feature')}
          </Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.adActionBtn, { backgroundColor: isBoosted ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleBoost(item)}>
          <MaterialIcons name="bolt" size={14} color={isBoosted ? '#2563EB' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: isBoosted ? '#2563EB' : colors.textMuted }}>
            {isAr ? (isBoosted ? 'إلغاء التعزيز' : 'تعزيز') : (isBoosted ? 'Unboost' : 'Boost')}
          </Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.adActionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => onEdit(item)}>
          <MaterialIcons name="edit" size={14} color={colors.primary} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>{isAr ? 'تعديل' : 'Edit'}</Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.adActionBtn, { backgroundColor: '#E0F2FE' }]} onPress={() => onView(item)}>
          <MaterialIcons name="open-in-new" size={14} color="#0284C7" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#0284C7' }}>{isAr ? 'عرض' : 'View'}</Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.adActionBtn, { backgroundColor: '#FEE2E2' }]} onPress={() => onDelete(item)}>
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
const UserItem = memo(({ item, colors, isAr, isRTL, onToggleAdmin, onToggleVerified, onToggleBlocked, onViewAds, onViewReports, onViewFiledReports, onViewProfile, onNotify, pending, isSelf, adCount, favCount, lastSeen, selectionMode, selected, onToggleSelect }: any) => {
  const displayName = item.username || item.email?.split('@')[0] || 'User';
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const joinDate = item.created_at ? new Date(item.created_at).toLocaleDateString(isAr ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  const lastSeenLabel = lastSeen ? new Date(lastSeen).toLocaleDateString(isAr ? 'ar' : 'en', { month: 'short', day: 'numeric' }) : null;
  return (
    <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: isSelf ? colors.primary : colors.border, opacity: pending ? 0.6 : 1 }]}>
      <View style={[styles.userRow, { flexDirection: rowDir }]}>
        {selectionMode && (
          <Pressable onPress={() => onToggleSelect(item.id)} hitSlop={8}>
            <MaterialIcons name={selected ? 'check-box' : 'check-box-outline-blank'} size={22} color={selected ? colors.primary : colors.textMuted} />
          </Pressable>
        )}
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
        ) : (
          <View style={[styles.userAvatar, { backgroundColor: item.is_admin ? colors.primary : colors.primaryGhost }]}>
            <Text style={[styles.userAvatarText, { color: item.is_admin ? '#fff' : colors.primary }]}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <View style={{ flexDirection: rowDir, alignItems: 'center', gap: 6 }}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>{displayName}</Text>
            {isSelf && (
              <View style={{ backgroundColor: colors.primaryGhost, paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.primary }}>{isAr ? 'أنت' : 'You'}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.userEmail, { color: colors.textMuted }]}>{item.email}</Text>
          {item.phone ? <Text style={[styles.userEmail, { color: colors.textMuted, fontSize: 11 }]}>📞 {item.phone}</Text> : null}
          <Text style={[styles.userEmail, { color: colors.textMuted, fontSize: 11 }]}>
            {isAr ? `📢 ${adCount ?? 0} إعلان` : `📢 ${adCount ?? 0} ads`}
            {` • `}{isAr ? `❤️ ${favCount ?? 0} مفضلة` : `❤️ ${favCount ?? 0} favs`}
          </Text>
          <Text style={[styles.userEmail, { color: colors.textMuted, fontSize: 11 }]}>
            {joinDate ? `${isAr ? 'انضم' : 'joined'} ${joinDate}` : ''}
            {lastSeenLabel ? ` • ${isAr ? 'آخر زيارة' : 'last seen'} ${lastSeenLabel}` : ''}
          </Text>
          <View style={[styles.userBadges, { flexDirection: rowDir }]}>
            {item.is_admin && <View style={[styles.userBadge, { backgroundColor: colors.primaryGhost }]}><Text style={[styles.userBadgeText, { color: colors.primary }]}>Admin</Text></View>}
            {item.is_verified && <View style={[styles.userBadge, { backgroundColor: '#DBEAFE' }]}><Text style={[styles.userBadgeText, { color: '#2563EB' }]}>✓ {isAr ? 'موثّق' : 'Verified'}</Text></View>}
            {item.is_blocked && <View style={[styles.userBadge, { backgroundColor: '#FEE2E2' }]}><Text style={[styles.userBadgeText, { color: '#EF4444' }]}>{isAr ? 'محظور' : 'Blocked'}</Text></View>}
          </View>
        </View>
      </View>
      <View style={[styles.userActions, { borderTopColor: colors.borderLight, flexDirection: rowDir, flexWrap: 'wrap' }]}>
        <Pressable
          disabled={pending || isSelf}
          style={[styles.userActionBtn, { backgroundColor: item.is_admin ? colors.primaryGhost : colors.borderLight, opacity: isSelf ? 0.4 : 1 }]}
          onPress={() => onToggleAdmin(item)}
        >
          <MaterialIcons name="admin-panel-settings" size={14} color={item.is_admin ? colors.primary : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_admin ? colors.primary : colors.textMuted }}>
            {isAr ? (item.is_admin ? 'إلغاء الإدارة' : 'جعله مدير') : (item.is_admin ? 'Revoke Admin' : 'Make Admin')}
          </Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.userActionBtn, { backgroundColor: item.is_verified ? '#DBEAFE' : colors.borderLight }]} onPress={() => onToggleVerified(item)}>
          <MaterialIcons name="verified" size={14} color={item.is_verified ? '#2563EB' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_verified ? '#2563EB' : colors.textMuted }}>
            {isAr ? (item.is_verified ? 'إلغاء التوثيق' : 'توثيق') : (item.is_verified ? 'Unverify' : 'Verify')}
          </Text>
        </Pressable>
        <Pressable
          disabled={pending || isSelf}
          style={[styles.userActionBtn, { backgroundColor: item.is_blocked ? '#FEE2E2' : colors.borderLight, opacity: isSelf ? 0.4 : 1 }]}
          onPress={() => onToggleBlocked(item)}
        >
          <MaterialIcons name="block" size={14} color={item.is_blocked ? '#EF4444' : colors.textMuted} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_blocked ? '#EF4444' : colors.textMuted }}>
            {isAr ? (item.is_blocked ? 'رفع الحظر' : 'حظر') : (item.is_blocked ? 'Unblock' : 'Block')}
          </Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.userActionBtn, { backgroundColor: '#E0F2FE' }]} onPress={() => onViewAds(item)}>
          <MaterialIcons name="campaign" size={14} color="#0284C7" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#0284C7' }}>{isAr ? 'إعلاناته' : 'Their ads'}</Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.userActionBtn, { backgroundColor: '#FEF3C7' }]} onPress={() => onViewReports(item)}>
          <MaterialIcons name="flag" size={14} color="#D97706" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#D97706' }}>{isAr ? 'البلاغات ضده' : 'Reports on them'}</Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.userActionBtn, { backgroundColor: '#F3E8FF' }]} onPress={() => onViewFiledReports(item)}>
          <MaterialIcons name="outlined-flag" size={14} color="#9333EA" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#9333EA' }}>{isAr ? 'بلاغاته المقدّمة' : 'Filed reports'}</Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.userActionBtn, { backgroundColor: colors.borderLight }]} onPress={() => onViewProfile(item)}>
          <MaterialIcons name="person" size={14} color={colors.textSecondary} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary }}>{isAr ? 'الملف العام' : 'Public profile'}</Text>
        </Pressable>
        <Pressable disabled={pending} style={[styles.userActionBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => onNotify(item)}>
          <MaterialIcons name="notifications" size={14} color="#16A34A" />
          <Text style={{ fontSize: 10, fontWeight: '600', color: '#16A34A' }}>{isAr ? 'إشعار' : 'Notify'}</Text>
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

// ─── تبويب الإحصائيات (معدل بالكامل مع جميع التحسينات) ──────────────────────
function AnalyticsTab({ isAr, colors }: { isAr: boolean; colors: any }) {
  const [stats, setStats] = useState<any>(null);
  const [pageStats, setPageStats] = useState<any[]>([]);
  const [deviceStats, setDeviceStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchPage, setSearchPage] = useState('');
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('week');
  const [refreshing, setRefreshing] = useState(false);
  const [visitType, setVisitType] = useState<'unique' | 'total'>('unique'); // ✅ جديد: نوع الزيارة
  const [extraStats, setExtraStats] = useState<{
    adsByStatus: { status: string; count: number }[];
    topCategories: { name: string; count: number }[];
    userGrowth: { date: string; count: number }[];
    topStores: { name: string; views: number }[];
    pendingReports: number;
    totalConversations: number;
    totalMessages: number;
    messagesLast7d: number;
    verifiedUsers: number;
    blockedUsers: number;
    totalUsersCount: number;
    avgActivePrice: number;
    freeAdsPct: number;
    topLocations: { name: string; count: number }[];
    topSellers: { name: string; count: number }[];
    avgAdsPerSeller: number;
    adsWithoutImagesPct: number;
    topFavoritedAds: { title: string; count: number }[];
    topFavoritedCategories: { name: string; count: number }[];
    avgStoreRating: number;
    topRatedStore: { name: string; rating: number } | null;
    storesOpenNow: number;
    storesClosedNow: number;
    busiestHour: { hour: number; count: number }[];
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ✅ جديد: إحصائيات شاملة تغطي كل قطعة بالتطبيق (إعلانات، تصنيفات، مستخدمين، متاجر، بلاغات، دردشة)
  const fetchExtraStats = useCallback(async (signal: AbortSignal) => {
    const supabase = getSupabaseClient();
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        adsAllRes,
        adImagesRes,
        categoriesRes,
        usersGrowthRes,
        storesRes,
        pendingReportsRes,
        conversationsCountRes,
        messagesCountRes,
        messagesRecentRes,
        verifiedCountRes,
        blockedCountRes,
        totalUsersCountRes,
        favoritesRes,
        storeRatingsMap,
        visitsHourRes,
      ] = await Promise.all([
        supabase.from('ads').select('id, status, category_id, price, user_id, location'),
        supabase.from('ad_images').select('ad_id'),
        supabase.from('categories').select('id, name, name_ar'),
        supabase.from('user_profiles').select('created_at').gte('created_at', sevenDaysAgo),
        supabase.from('stores').select('id, name, name_ar, views_count, opening_time, closing_time').eq('is_active', true),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_verified', true),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_blocked', true),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('favorites').select('ad_id, ads(title, category_id)'),
        fetchAllStoreRatings(),
        supabase.from('app_visits').select('visited_at').gte('visited_at', sevenDaysAgo),
      ]);

      if (signal.aborted) return null;

      const ads = adsAllRes.data ?? [];

      // توزيع الإعلانات حسب الحالة
      const statusCounts: Record<string, number> = {};
      ads.forEach((r: any) => {
        const s = r.status || 'unknown';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
      const adsByStatus = Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      // أكثر التصنيفات نشاطاً
      const catMap: Record<string, string> = {};
      (categoriesRes.data ?? []).forEach((c: any) => {
        catMap[c.id] = isAr ? (c.name_ar || c.name) : c.name;
      });
      const catCounts: Record<string, number> = {};
      ads.forEach((r: any) => {
        if (!r.category_id) return;
        catCounts[r.category_id] = (catCounts[r.category_id] || 0) + 1;
      });
      const topCategories = Object.entries(catCounts)
        .map(([id, count]) => ({ name: catMap[id] || id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // نمو المستخدمين آخر 7 أيام
      const growthMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        growthMap[d.toISOString().slice(0, 10)] = 0;
      }
      (usersGrowthRes.data ?? []).forEach((r: any) => {
        const day = r.created_at ? String(r.created_at).slice(0, 10) : null;
        if (day && day in growthMap) growthMap[day] += 1;
      });
      const userGrowth = Object.entries(growthMap).map(([date, count]) => ({ date, count }));

      const stores = storesRes.data ?? [];

      // أكثر المتاجر زيارة (تعتمد على عمود views_count الموجود أصلاً)
      const topStores = [...stores]
        .sort((a: any, b: any) => (b.views_count || 0) - (a.views_count || 0))
        .slice(0, 5)
        .map((s: any) => ({ name: isAr ? (s.name_ar || s.name) : s.name, views: s.views_count || 0 }));

      // متاجر مفتوحة الآن مقابل مغلقة
      let storesOpenNow = 0, storesClosedNow = 0;
      stores.forEach((s: any) => {
        if (checkStoreIsOpen(s)) storesOpenNow++; else storesClosedNow++;
      });

      // متوسط تقييم المتاجر + الأعلى تقييماً
      const ratingEntries = Object.entries(storeRatingsMap as Record<string, { avg: number; count: number }>);
      const avgStoreRating = ratingEntries.length
        ? parseFloat((ratingEntries.reduce((s, [, v]) => s + v.avg, 0) / ratingEntries.length).toFixed(1))
        : 0;
      const storeNameMap: Record<string, string> = {};
      stores.forEach((s: any) => { storeNameMap[s.id] = isAr ? (s.name_ar || s.name) : s.name; });
      const topRatedEntry = ratingEntries
        .filter(([, v]) => v.count >= 1)
        .sort((a, b) => b[1].avg - a[1].avg)[0];
      const topRatedStore = topRatedEntry
        ? { name: storeNameMap[topRatedEntry[0]] || topRatedEntry[0], rating: topRatedEntry[1].avg }
        : null;

      // متوسط سعر الإعلانات النشطة + نسبة الإعلانات المجانية
      const activeAdsList = ads.filter((a: any) => a.status === 'active');
      const avgActivePrice = activeAdsList.length
        ? Math.round(activeAdsList.reduce((s: number, a: any) => s + (Number(a.price) || 0), 0) / activeAdsList.length)
        : 0;
      const freeAdsPct = activeAdsList.length
        ? Math.round((activeAdsList.filter((a: any) => !a.price || Number(a.price) === 0).length / activeAdsList.length) * 100)
        : 0;

      // توزيع الإعلانات حسب المنطقة
      const locCounts: Record<string, number> = {};
      ads.forEach((r: any) => {
        if (!r.location) return;
        locCounts[r.location] = (locCounts[r.location] || 0) + 1;
      });
      const topLocations = Object.entries(locCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // أكثر البائعين نشاطاً + متوسط الإعلانات لكل بائع
      const sellerCounts: Record<string, number> = {};
      ads.forEach((r: any) => {
        if (!r.user_id) return;
        sellerCounts[r.user_id] = (sellerCounts[r.user_id] || 0) + 1;
      });
      const sellerIds = Object.keys(sellerCounts);
      const avgAdsPerSeller = sellerIds.length ? parseFloat((ads.length / sellerIds.length).toFixed(1)) : 0;
      const topSellerIds = Object.entries(sellerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
      let topSellers: { name: string; count: number }[] = [];
      if (topSellerIds.length) {
        const { data: sellerProfiles } = await supabase.from('user_profiles').select('id, username, email').in('id', topSellerIds);
        const sellerNameMap: Record<string, string> = {};
        (sellerProfiles ?? []).forEach((p: any) => {
          sellerNameMap[p.id] = p.username || p.email?.split('@')[0] || (isAr ? 'مستخدم' : 'User');
        });
        topSellers = topSellerIds.map((id) => ({ name: sellerNameMap[id] || id, count: sellerCounts[id] }));
      }

      // نسبة الإعلانات بدون صور
      const adIdsWithImages = new Set((adImagesRes.data ?? []).map((r: any) => r.ad_id));
      const adsWithoutImagesPct = ads.length
        ? Math.round((ads.filter((a: any) => !adIdsWithImages.has(a.id)).length / ads.length) * 100)
        : 0;

      // أكثر الإعلانات إضافة للمفضلة + أكثر التصنيفات طلباً بالمفضلة
      const favAdCounts: Record<string, { title: string; count: number }> = {};
      const favCatCounts: Record<string, number> = {};
      (favoritesRes.data ?? []).forEach((r: any) => {
        const title = r.ads?.title;
        if (title) {
          if (!favAdCounts[r.ad_id]) favAdCounts[r.ad_id] = { title, count: 0 };
          favAdCounts[r.ad_id].count += 1;
        }
        const catId = r.ads?.category_id;
        if (catId) favCatCounts[catId] = (favCatCounts[catId] || 0) + 1;
      });
      const topFavoritedAds = Object.values(favAdCounts).sort((a, b) => b.count - a.count).slice(0, 5);
      const topFavoritedCategories = Object.entries(favCatCounts)
        .map(([id, count]) => ({ name: catMap[id] || id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // أكثر ساعات اليوم ازدحاماً (آخر 7 أيام)
      const hourCounts: Record<number, number> = {};
      (visitsHourRes.data ?? []).forEach((r: any) => {
        if (!r.visited_at) return;
        const hour = new Date(r.visited_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      const busiestHour = Object.entries(hourCounts)
        .map(([hour, count]) => ({ hour: Number(hour), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        adsByStatus,
        topCategories,
        userGrowth,
        topStores,
        pendingReports: pendingReportsRes.count ?? 0,
        totalConversations: conversationsCountRes.count ?? 0,
        totalMessages: messagesCountRes.count ?? 0,
        messagesLast7d: messagesRecentRes.count ?? 0,
        verifiedUsers: verifiedCountRes.count ?? 0,
        blockedUsers: blockedCountRes.count ?? 0,
        totalUsersCount: totalUsersCountRes.count ?? 0,
        avgActivePrice,
        freeAdsPct,
        topLocations,
        topSellers,
        avgAdsPerSeller,
        adsWithoutImagesPct,
        topFavoritedAds,
        topFavoritedCategories,
        avgStoreRating,
        topRatedStore,
        storesOpenNow,
        storesClosedNow,
        busiestHour,
      };
    } catch {
      return null;
    }
  }, [isAr]);

  // دالة لجلب إحصائيات الصفحات لفترات متعددة (فردي + إجمالي)
  // ✅ مُصلَّحة: تجلب كل الصفوف مرة واحدة وتحسب "الفريد" فعلياً عبر Set على device_id
  // (كانت سابقاً تستخدم count:head على device_id وهو ما يحسب أي تفرد إطلاقاً — نفس رقم الإجمالي)
  const fetchPageStatsMulti = useCallback(async (signal: AbortSignal) => {
    const supabase = getSupabaseClient();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const quarterAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('app_visits')
      .select('page, device_id, visited_at')
      .not('page', 'is', null)
      .gte('visited_at', quarterAgo);

    if (error || signal.aborted || !data) return [];

    type VisitRow = { device_id: string; visited_at: string };
    const byPage: Record<string, VisitRow[]> = {};
    data.forEach((row: any) => {
      if (!byPage[row.page]) byPage[row.page] = [];
      byPage[row.page].push(row);
    });

    const since = (rows: VisitRow[], iso: string) => rows.filter((r) => r.visited_at >= iso);
    const uniqueCount = (rows: VisitRow[]) => new Set(rows.map((r) => r.device_id)).size;

    return Object.keys(byPage).map((page) => {
      const rows = byPage[page];
      const dayRows = since(rows, dayAgo);
      const weekRows = since(rows, weekAgo);
      const monthRows = since(rows, monthAgo);
      return {
        page,
        dayUnique: uniqueCount(dayRows),
        weekUnique: uniqueCount(weekRows),
        monthUnique: uniqueCount(monthRows),
        quarterUnique: uniqueCount(rows),
        dayTotal: dayRows.length,
        weekTotal: weekRows.length,
        monthTotal: monthRows.length,
        quarterTotal: rows.length,
      };
    });
  }, []);

  // دالة لجلب توزيع الأجهزة — ✅ مُصلَّحة: تحسب أجهزة فريدة (device_id) لا عدد الزيارات
  const fetchDeviceStats = useCallback(async (signal: AbortSignal) => {
    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase
        .from('app_visits')
        .select('platform, device_id')
        .not('platform', 'is', null);
      if (error || signal.aborted || !data) return [];

      const byPlatform: Record<string, Set<string>> = {};
      data.forEach((row: any) => {
        const platform = row.platform || 'Unknown';
        if (!byPlatform[platform]) byPlatform[platform] = new Set();
        if (row.device_id) byPlatform[platform].add(row.device_id);
      });
      const result = Object.entries(byPlatform).map(([name, set]) => ({ name, value: set.size }));
      result.sort((a, b) => b.value - a.value);
      return result;
    } catch {
      return [];
    }
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
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

      const [
        dauRes, wauRes, mauRes, totalVisitsRes, usersRes, activeAdsRes, activeStoresRes, pageStatsMulti, deviceStatsData,
        dauPrevRes, wauPrevRes, mauPrevRes,
      ] = await Promise.all([
        supabase.from('app_visits').select('device_id').gte('visited_at', todayStart),
        supabase.from('app_visits').select('device_id, visited_at').gte('visited_at', weekAgo),
        supabase.from('app_visits').select('device_id').gte('visited_at', monthAgo),
        supabase.from('app_visits').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('stores').select('id', { count: 'exact', head: true }).eq('is_active', true),
        fetchPageStatsMulti(controller.signal),
        fetchDeviceStats(controller.signal),
        // ✅ فترات المقارنة السابقة (لحساب نسب التغيير الحقيقية)
        supabase.from('app_visits').select('device_id').gte('visited_at', yesterdayStart).lt('visited_at', todayStart),
        supabase.from('app_visits').select('device_id').gte('visited_at', twoWeeksAgo).lt('visited_at', weekAgo),
        supabase.from('app_visits').select('device_id').gte('visited_at', twoMonthsAgo).lt('visited_at', monthAgo),
      ]);

      const extra = await fetchExtraStats(controller.signal);
      if (!controller.signal.aborted) setExtraStats(extra);

      if (controller.signal.aborted) return;

      const uniqueSet = (rows: any[]) => new Set(rows.map((r: any) => r.device_id)).size;
      const dau = uniqueSet(dauRes.data ?? []);
      const wau = uniqueSet(wauRes.data ?? []);
      const mau = uniqueSet(mauRes.data ?? []);
      const totalVisits = totalVisitsRes.count ?? 0;
      const totalUsers = usersRes.count ?? 0;
      const activeAds = activeAdsRes.count ?? 0;
      const activeStores = activeStoresRes.count ?? 0;

      // بناء الاتجاه اليومي
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

      // ✅ نسب التغيير الحقيقية: كل مؤشر يقارَن بفترته المكافئة السابقة تماماً
      // (اليوم مقابل أمس، هذا الأسبوع مقابل الأسبوع اللي قبله، هذا الشهر مقابل الشهر اللي قبله)
      const dauPrev = uniqueSet(dauPrevRes.data ?? []);
      const wauPrev = uniqueSet(wauPrevRes.data ?? []);
      const mauPrev = uniqueSet(mauPrevRes.data ?? []);
      const pctChange = (curr: number, prev: number) => {
        if (prev > 0) return ((curr - prev) / prev) * 100;
        return curr > 0 ? 100 : 0;
      };
      const changeDau = pctChange(dau, dauPrev);
      const changeWau = pctChange(wau, wauPrev);
      const changeMau = pctChange(mau, mauPrev);

      if (controller.signal.aborted) return;
      setStats({
        dau,
        wau,
        mau,
        trend,
        totalVisits,
        totalUsers,
        activeAds,
        activeStores,
        changeDau,
        changeWau,
        changeMau,
      });
      setPageStats(pageStatsMulti || []);
      setDeviceStats(deviceStatsData || []);
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
  }, [fetchPageStatsMulti, fetchDeviceStats, fetchExtraStats]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => { clearInterval(interval); if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [fetchStats]);

  // تصفية الصفحات حسب البحث
  const filteredPageStats = useMemo(() => {
    if (!searchPage.trim()) return pageStats;
    return pageStats.filter(p => p.page.toLowerCase().includes(searchPage.toLowerCase()));
  }, [pageStats, searchPage]);

  // تصدير CSV
  const exportPageStats = () => {
    const periodLabel = period === 'week' ? (isAr ? 'آخر أسبوع' : 'Last week') : period === 'month' ? (isAr ? 'آخر شهر' : 'Last month') : (isAr ? 'آخر 3 أشهر' : 'Last 3 months');
    const headers = [isAr ? 'الصفحة' : 'Page', isAr ? 'اليوم' : 'Day', periodLabel];
    const selected = period === 'week' ? 'week' : period === 'month' ? 'month' : 'quarter';
    const typeKey = visitType === 'unique' ? 'Unique' : 'Total';
    const rows = pageStats.map(p => [p.page, p[`day${typeKey}`], p[`${selected}${typeKey}`]]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    try { Share.share({ message: csv, title: 'page_stats.csv' }); } catch {}
  };

  // إعادة التحميل يدوياً
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
  const typeKey = visitType === 'unique' ? 'Unique' : 'Total'; // used to access fields like dayUnique, weekTotal, etc.

  const totalDay = pageStats.reduce((sum, p) => sum + (p[`day${typeKey}`] || 0), 0);
  const totalPeriod = pageStats.reduce((sum, p) => sum + (p[`${selectedPeriod}${typeKey}`] || 0), 0);
  const topPage = pageStats.length ? pageStats.reduce((a, b) => (a[`${selectedPeriod}${typeKey}`] || 0) > (b[`${selectedPeriod}${typeKey}`] || 0) ? a : b) : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.analyticsContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      {/* الرأس */}
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

      {/* الفلاتر الزمنية */}
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
              {p === 'week' ? (isAr ? 'آخر أسبوع' : 'Last week') : p === 'month' ? (isAr ? 'آخر شهر' : 'Last month') : (isAr ? 'آخر 3 أشهر' : 'Last 3 months')}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: Spacing.md, marginTop: -8, marginBottom: 8, textAlign: isAr ? 'right' : 'left' }}>
        {isAr
          ? 'ℹ️ يتحكم بجدول "إحصائيات الصفحات" بالأسفل فقط — بطاقات اليوم/الأسبوع/الشهر فوق ثابتة دايماً'
          : 'ℹ️ Controls the "Page Statistics" table below only — the Day/Week/Month cards above are always fixed'}
      </Text>

      {/* KPI بطاقات - مع حساب تغير خاص لكل بطاقة */}
      <View style={styles.statsGrid3}>
        {[
          { label: isAr ? 'مستخدمين اليوم' : 'Today', value: stats?.dau ?? 0, icon: 'today', color: '#3B82F6', change: stats?.changeDau ?? 0 },
          { label: isAr ? 'مستخدمين الأسبوع' : 'This Week', value: stats?.wau ?? 0, icon: 'date-range', color: '#8B5CF6', change: stats?.changeWau ?? 0 },
          { label: isAr ? 'مستخدمين الشهر' : 'This Month', value: stats?.mau ?? 0, icon: 'calendar-month', color: '#10B981', change: stats?.changeMau ?? 0 },
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

      {/* إحصائيات سريعة */}
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

      {/* الاتجاه اليومي */}
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
                  <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 12, marginTop: 4 }]}>
                    {new Date(t.date).toLocaleDateString(isAr ? 'ar' : 'en', { weekday: 'short' })}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* توزيع الأجهزة - بيانات حقيقية إن وجدت */}
      <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
          {isAr ? '📱 توزيع المستخدمين حسب الجهاز' : 'Device Distribution'}
        </Text>
        {deviceStats.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <MaterialIcons name="devices" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>
              {isAr ? 'لا توجد بيانات عن الأجهزة' : 'No device data available'}
            </Text>
          </View>
        ) : (
          deviceStats.map((device, idx) => {
            const total = deviceStats.reduce((sum, d) => sum + d.value, 0);
            const maxDevice = Math.max(...deviceStats.map(d => d.value), 1);
            const percent = (device.value / maxDevice) * 100;
            return (
              <View key={idx} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{device.name}</Text>
                  <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>
                    {device.value} ({Math.round((device.value / total) * 100)}%)
                  </Text>
                </View>
                <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${percent}%`,
                        backgroundColor: ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6'][idx % 4],
                        borderRadius: 8,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ⭐ إحصائيات الصفحات المتقدمة */}
      <View style={[styles.pageStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* رأس جديد: أزرار تبديل + ملخص الأرقام */}
        <View style={[styles.pageStatsHeader, { borderBottomColor: colors.borderLight, flexWrap: 'wrap' }]}>
          <MaterialIcons name="analytics" size={20} color={colors.primary} />
          <Text style={[styles.pageStatsTitle, { color: colors.textPrimary }]}>
            {isAr ? '📈 إحصائيات الصفحات' : '📈 Page Statistics'}
          </Text>
          {/* أزرار التبديل بين فردي وإجمالي */}
          <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
            <Pressable
              style={[
                styles.visitTypeTab,
                {
                  backgroundColor: visitType === 'unique' ? colors.primary : colors.border,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: Radius.full,
                }
              ]}
              onPress={() => setVisitType('unique')}
            >
              <Text style={{ color: visitType === 'unique' ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 11 }}>
                {isAr ? 'فردي' : 'Unique'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.visitTypeTab,
                {
                  backgroundColor: visitType === 'total' ? colors.primary : colors.border,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: Radius.full,
                }
              ]}
              onPress={() => setVisitType('total')}
            >
              <Text style={{ color: visitType === 'total' ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 11 }}>
                {isAr ? 'إجمالي' : 'Total'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* صف إحصائي سريع: إجماليات اليوم، الأسبوع، الشهر (حسب النوع المختار) */}
        <View style={{ flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm, flexWrap: 'wrap' }}>
          <View style={[styles.summaryStatCard, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
            <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>{isAr ? 'اليوم' : 'Day'}</Text>
            <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>{formatNumber(totalDay)}</Text>
          </View>
          <View style={[styles.summaryStatCard, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
            <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>
              {period === 'week' ? (isAr ? 'آخر أسبوع' : 'Last week') : period === 'month' ? (isAr ? 'آخر شهر' : 'Last month') : (isAr ? 'آخر 3 أشهر' : 'Last 3 months')}
            </Text>
            <Text style={[styles.summaryStatValue, { color: colors.textPrimary }]}>{formatNumber(totalPeriod)}</Text>
          </View>
          {topPage && (
            <View style={[styles.summaryStatCard, { backgroundColor: colors.primary + '15', borderColor: colors.border }]}>
              <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>🏆 {isAr ? 'الأكثر' : 'Top'}</Text>
              <Text style={[styles.summaryStatValue, { color: colors.primary }]}>
                {pageNames[topPage.page] || topPage.page} ({topPage[`${selectedPeriod}${typeKey}`]})
              </Text>
            </View>
          )}
        </View>

        {/* شريط البحث */}
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

        {/* جدول الإحصائيات */}
        {filteredPageStats.length === 0 ? (
          <View style={styles.pageStatsEmpty}>
            <Text style={{ color: colors.textMuted }}>{isAr ? 'لا توجد بيانات' : 'No data'}</Text>
          </View>
        ) : (
          <>
            {/* رأس الجدول — ✅ مُصلَّح: flexDirection يحترم اتجاه اللغة، وكل عمود له عرض ثابت بدل % عشان ما يتقصف اسم الصفحة */}
            <View style={[styles.pageStatRow, { flexDirection: isAr ? 'row-reverse' : 'row', backgroundColor: colors.primary + '15', borderBottomWidth: 0, paddingVertical: 8 }]}>
              <Text style={[styles.pageStatName, { color: colors.textPrimary, fontWeight: '800', flex: 1, textAlign: isAr ? 'right' : 'left' }]}>
                {isAr ? 'الصفحة' : 'Page'}
              </Text>
              <Text style={[styles.pageStatUnique, { fontWeight: '800', width: 56, textAlign: 'center' }]}>
                {isAr ? 'اليوم' : 'Day'}
              </Text>
              <Text style={[styles.pageStatUnique, { fontWeight: '800', width: 72, textAlign: 'center' }]}>
                {period === 'week' ? (isAr ? 'آخر أسبوع' : 'Last week') : period === 'month' ? (isAr ? 'آخر شهر' : 'Last month') : (isAr ? 'آخر 3 أشهر' : 'Last 3mo')}
              </Text>
            </View>

            {filteredPageStats.map((stat, index) => {
              const isEven = index % 2 === 0;
              const name = pageNames[stat.page] || stat.page;
              const dayVal = stat[`day${typeKey}`] ?? 0;
              const periodVal = stat[`${selectedPeriod}${typeKey}`] ?? 0;
              return (
                <View
                  key={stat.page}
                  style={[
                    styles.pageStatRow,
                    {
                      flexDirection: isAr ? 'row-reverse' : 'row',
                      backgroundColor: isEven ? colors.background : 'transparent',
                      borderBottomColor: colors.borderLight,
                      borderBottomWidth: index === filteredPageStats.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[styles.pageStatName, { color: colors.textPrimary, flex: 1, textAlign: isAr ? 'right' : 'left' }]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <Text style={[styles.pageStatUnique, { color: colors.textPrimary, textAlign: 'center', width: 56 }]}>{dayVal}</Text>
                  <Text style={[styles.pageStatUnique, { color: colors.textPrimary, textAlign: 'center', width: 72 }]}>{periodVal}</Text>
                </View>
              );
            })}

            {/* إجمالي الصف */}
            <View
              style={[
                styles.pageStatRow,
                {
                  flexDirection: isAr ? 'row-reverse' : 'row',
                  borderTopWidth: 1,
                  borderTopColor: colors.borderLight,
                  paddingTop: 8,
                  backgroundColor: colors.primary + '10',
                  borderRadius: 8,
                },
              ]}
            >
              <Text style={[styles.pageStatName, { color: colors.textPrimary, fontWeight: '800', flex: 1, textAlign: isAr ? 'right' : 'left' }]}>
                {isAr ? 'الإجمالي' : 'Total'}
              </Text>
              <Text style={[styles.pageStatUnique, { color: colors.textPrimary, fontWeight: '700', textAlign: 'center', width: 56 }]}>{totalDay}</Text>
              <Text style={[styles.pageStatUnique, { color: colors.textPrimary, fontWeight: '700', textAlign: 'center', width: 72 }]}>{totalPeriod}</Text>
            </View>
          </>
        )}
      </View>

      {/* إحصائيات متقدمة إضافية */}
      <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
          {isAr ? '🏆 إحصائيات متقدمة' : '🏆 Advanced Stats'}
        </Text>
        <View style={styles.advancedStatsRow}>
          <View style={styles.advancedStatsCol}>
            <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'أكثر صفحة زيارة' : 'Top Page'}</Text>
            <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>
              {topPage ? `${pageNames[topPage.page] || topPage.page} (${topPage[`${selectedPeriod}${typeKey}`]})` : '-'}
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
            <Text style={[styles.advancedStatsValue, { color: stats?.changeWau >= 0 ? '#22C55E' : '#EF4444' }]}>
              {stats?.changeWau ? stats.changeWau.toFixed(1) : 0}%
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

      {/* ═══════ إحصائيات شاملة لكل قطعة بالتطبيق ═══════ */}
      {extraStats && (
        <>
          {/* بطاقات سريعة: بلاغات معلّقة + دردشة */}
          <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.md }}>
            <View style={[styles.statCardSmall, { flex: 1, backgroundColor: extraStats.pendingReports > 0 ? '#FEF2F2' : colors.surface, borderColor: extraStats.pendingReports > 0 ? '#FCA5A5' : colors.border }]}>
              <View style={[styles.statIconSmall, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="flag" size={18} color="#DC2626" />
              </View>
              <View style={styles.statContentSmall}>
                <Text style={[styles.statValueSmall, { color: extraStats.pendingReports > 0 ? '#DC2626' : colors.textPrimary }]}>{extraStats.pendingReports}</Text>
                <Text style={[styles.statLabelSmall, { color: colors.textMuted }]}>{isAr ? '🚩 بلاغات معلّقة' : 'Pending Reports'}</Text>
              </View>
            </View>
            <View style={[styles.statCardSmall, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.statIconSmall, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="chat-bubble" size={18} color={colors.primary} />
              </View>
              <View style={styles.statContentSmall}>
                <Text style={[styles.statValueSmall, { color: colors.textPrimary }]}>{formatNumber(extraStats.totalConversations)}</Text>
                <Text style={[styles.statLabelSmall, { color: colors.textMuted }]}>{isAr ? '💬 محادثات' : 'Conversations'}</Text>
              </View>
            </View>
          </View>

          {/* نشاط الدردشة */}
          <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
              {isAr ? '💬 نشاط الدردشة' : '💬 Chat Activity'}
            </Text>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'إجمالي الرسائل' : 'Total Messages'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>{formatNumber(extraStats.totalMessages)}</Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? 'رسائل آخر 7 أيام' : 'Messages (7d)'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>{formatNumber(extraStats.messagesLast7d)}</Text>
              </View>
            </View>
          </View>

          {/* توزيع الإعلانات حسب الحالة */}
          {extraStats.adsByStatus.length > 0 && (
            <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
                {isAr ? '📢 توزيع الإعلانات حسب الحالة' : '📢 Ads by Status'}
              </Text>
              {(() => {
                const totalAds = extraStats.adsByStatus.reduce((s, a) => s + a.count, 0);
                const maxAds = Math.max(...extraStats.adsByStatus.map(a => a.count), 1);
                const statusLabel = (s: string) => {
                  const map: Record<string, string> = isAr
                    ? { active: 'نشط', pending: 'قيد المراجعة', expired: 'منتهي', rejected: 'مرفوض', sold: 'مباع', unknown: 'غير محدد' }
                    : { active: 'Active', pending: 'Pending', expired: 'Expired', rejected: 'Rejected', sold: 'Sold', unknown: 'Unknown' };
                  return map[s] || s;
                };
                const statusColor = (s: string) => ({ active: '#22C55E', pending: '#F59E0B', expired: '#94A3B8', rejected: '#EF4444', sold: '#3B82F6' } as Record<string, string>)[s] || '#8B5CF6';
                return extraStats.adsByStatus.map((item, idx) => {
                  const percent = (item.count / maxAds) * 100;
                  return (
                    <View key={idx} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{statusLabel(item.status)}</Text>
                        <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>
                          {item.count} ({totalAds ? Math.round((item.count / totalAds) * 100) : 0}%)
                        </Text>
                      </View>
                      <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                        <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: statusColor(item.status), borderRadius: 8 }]} />
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          )}

          {/* أكثر التصنيفات نشاطاً */}
          {extraStats.topCategories.length > 0 && (
            <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
                {isAr ? '🏷️ أكثر التصنيفات نشاطاً' : '🏷️ Top Categories'}
              </Text>
              {(() => {
                const maxCat = Math.max(...extraStats.topCategories.map(c => c.count), 1);
                return extraStats.topCategories.map((item, idx) => {
                  const percent = (item.count / maxCat) * 100;
                  return (
                    <View key={idx} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{item.name}</Text>
                        <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>{item.count}</Text>
                      </View>
                      <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                        <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899'][idx % 5], borderRadius: 8 }]} />
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          )}

          {/* أكثر المتاجر زيارة */}
          {extraStats.topStores.length > 0 && (
            <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
                {isAr ? '🏪 أكثر المتاجر زيارة' : '🏪 Top Stores by Views'}
              </Text>
              {(() => {
                const maxViews = Math.max(...extraStats.topStores.map(s => s.views), 1);
                return extraStats.topStores.map((item, idx) => {
                  const percent = (item.views / maxViews) * 100;
                  return (
                    <View key={idx} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.deviceName, { color: colors.textPrimary }]} numberOfLines={1}>{idx + 1}. {item.name}</Text>
                        <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>{formatNumber(item.views)}</Text>
                      </View>
                      <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                        <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: '#F59E0B', borderRadius: 8 }]} />
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
          )}

          {/* نمو المستخدمين الجدد */}
          {extraStats.userGrowth.length > 0 && (
            <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.trendTitle, { color: colors.textPrimary }]}>
                  {isAr ? '📈 مستخدمون جدد' : '📈 New Users'}
                </Text>
                <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 10 }]}>
                  {isAr ? 'آخر 7 أيام' : 'Last 7 days'}
                </Text>
              </View>
              <View style={styles.trendBars}>
                {extraStats.userGrowth.map((t, idx) => {
                  const maxGrowth = Math.max(...extraStats.userGrowth.map(g => g.count), 1);
                  const heightPercent = (t.count / maxGrowth) * 70;
                  return (
                    <View key={idx} style={styles.trendBarWrapper}>
                      <Text style={[styles.trendLabel, { color: colors.textPrimary, fontWeight: '700', fontSize: 10 }]}>{t.count}</Text>
                      <View style={[styles.trendBar, { height: Math.max(heightPercent, 4), backgroundColor: '#22C55E', borderRadius: 6 }]} />
                      <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: 12, marginTop: 4 }]}>
                        {new Date(t.date).toLocaleDateString(isAr ? 'ar' : 'en', { weekday: 'short' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* المستخدمون: موثّقين / محظورين / التصاق (Stickiness) */}
          <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
              {isAr ? '👥 صحة قاعدة المستخدمين' : '👥 User Base Health'}
            </Text>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '✅ موثّقين' : 'Verified'}</Text>
                <Text style={[styles.advancedStatsValue, { color: '#22C55E' }]}>
                  {extraStats.totalUsersCount ? Math.round((extraStats.verifiedUsers / extraStats.totalUsersCount) * 100) : 0}% ({formatNumber(extraStats.verifiedUsers)})
                </Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🚫 محظورين' : 'Blocked'}</Text>
                <Text style={[styles.advancedStatsValue, { color: extraStats.blockedUsers > 0 ? '#EF4444' : colors.textPrimary }]}>
                  {formatNumber(extraStats.blockedUsers)}
                </Text>
              </View>
            </View>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🔥 معدل الالتصاق (DAU/MAU)' : '🔥 Stickiness (DAU/MAU)'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>
                  {stats?.mau ? Math.round((stats.dau / stats.mau) * 100) : 0}%
                </Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '⏰ أكثر ساعة ازدحاماً' : '⏰ Busiest Hour'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>
                  {extraStats.busiestHour[0] ? `${extraStats.busiestHour[0].hour}:00 (${extraStats.busiestHour[0].count})` : '-'}
                </Text>
              </View>
            </View>
          </View>

          {/* الإعلانات: السعر، بدون صور، المناطق، البائعين */}
          <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
              {isAr ? '📢 صحة الإعلانات' : '📢 Ads Health'}
            </Text>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '💰 متوسط السعر (نشط)' : 'Avg Price (Active)'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>₪{formatNumber(extraStats.avgActivePrice)}</Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🆓 إعلانات مجانية' : 'Free Ads'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>{extraStats.freeAdsPct}%</Text>
              </View>
            </View>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🖼️ بدون صور' : 'Without Images'}</Text>
                <Text style={[styles.advancedStatsValue, { color: extraStats.adsWithoutImagesPct > 20 ? '#F59E0B' : colors.textPrimary }]}>
                  {extraStats.adsWithoutImagesPct}%
                </Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '📊 متوسط إعلان/بائع' : 'Avg Ads/Seller'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>{extraStats.avgAdsPerSeller}</Text>
              </View>
            </View>
          </View>

          {/* أكثر المناطق نشاطاً */}
          {extraStats.topLocations.length > 0 && (
            <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
                {isAr ? '📍 أكثر المناطق نشاطاً' : '📍 Top Locations'}
              </Text>
              {(() => {
                const maxLoc = Math.max(...extraStats.topLocations.map(l => l.count), 1);
                return extraStats.topLocations.map((item, idx) => (
                  <View key={idx} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{item.name}</Text>
                      <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>{item.count}</Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                      <View style={[styles.progressBarFill, { width: `${(item.count / maxLoc) * 100}%`, backgroundColor: '#3B82F6', borderRadius: 8 }]} />
                    </View>
                  </View>
                ));
              })()}
            </View>
          )}

          {/* أكثر البائعين نشاطاً */}
          {extraStats.topSellers.length > 0 && (
            <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
                {isAr ? '🏅 أكثر البائعين نشاطاً' : '🏅 Top Sellers'}
              </Text>
              {(() => {
                const maxSeller = Math.max(...extraStats.topSellers.map(s => s.count), 1);
                return extraStats.topSellers.map((item, idx) => (
                  <View key={idx} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.deviceName, { color: colors.textPrimary }]} numberOfLines={1}>{idx + 1}. {item.name}</Text>
                      <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>{item.count}</Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                      <View style={[styles.progressBarFill, { width: `${(item.count / maxSeller) * 100}%`, backgroundColor: '#8B5CF6', borderRadius: 8 }]} />
                    </View>
                  </View>
                ));
              })()}
            </View>
          )}

          {/* المفضلة: أكثر الإعلانات والتصنيفات طلباً */}
          {(extraStats.topFavoritedAds.length > 0 || extraStats.topFavoritedCategories.length > 0) && (
            <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
                {isAr ? '❤️ الأكثر إضافة للمفضلة' : '❤️ Most Favorited'}
              </Text>
              {extraStats.topFavoritedAds.map((item, idx) => (
                <View key={idx} style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={[styles.deviceName, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>{idx + 1}. {item.title}</Text>
                  <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>❤️ {item.count}</Text>
                </View>
              ))}
              {extraStats.topFavoritedCategories.length > 0 && (
                <>
                  <Text style={[styles.advancedStatsLabel, { color: colors.textMuted, marginTop: 8, marginBottom: 6 }]}>
                    {isAr ? 'حسب التصنيف' : 'By Category'}
                  </Text>
                  {extraStats.topFavoritedCategories.map((item, idx) => (
                    <View key={idx} style={{ flexDirection: isAr ? 'row-reverse' : 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{item.name}</Text>
                      <Text style={[styles.devicePercent, { color: colors.textSecondary }]}>{item.count}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {/* المتاجر: التقييم + مفتوح/مغلق الآن */}
          <View style={[styles.advancedStatsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.advancedStatsTitle, { color: colors.textPrimary }]}>
              {isAr ? '🏪 صحة المتاجر' : '🏪 Stores Health'}
            </Text>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '⭐ متوسط التقييم' : 'Avg Rating'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary }]}>{extraStats.avgStoreRating || '-'}</Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🏆 الأعلى تقييماً' : 'Top Rated'}</Text>
                <Text style={[styles.advancedStatsValue, { color: colors.textPrimary, fontSize: 12 }]} numberOfLines={1}>
                  {extraStats.topRatedStore ? `${extraStats.topRatedStore.name} (${extraStats.topRatedStore.rating}⭐)` : '-'}
                </Text>
              </View>
            </View>
            <View style={styles.advancedStatsRow}>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🟢 مفتوح الآن' : 'Open Now'}</Text>
                <Text style={[styles.advancedStatsValue, { color: '#22C55E' }]}>{extraStats.storesOpenNow}</Text>
              </View>
              <View style={styles.advancedStatsCol}>
                <Text style={[styles.advancedStatsLabel, { color: colors.textMuted }]}>{isAr ? '🔴 مغلق الآن' : 'Closed Now'}</Text>
                <Text style={[styles.advancedStatsValue, { color: '#EF4444' }]}>{extraStats.storesClosedNow}</Text>
              </View>
            </View>
          </View>
        </>
      )}

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
function AdsTab({ colors, isAr, isRTL, t }: any) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [search, setSearch] = useState('');
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price_desc' | 'price_asc' | 'views_desc'>('newest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'featured' | 'sold'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [noViewsOnly, setNoViewsOnly] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quickStats, setQuickStats] = useState<{ total: number; active: number; featured: number; boosted: number } | null>(null);
  const [reportedAdIds, setReportedAdIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  // ✅ جديد: شريط إحصائيات سريع + ربط بتبويب البلاغات + قائمة التصنيفات للفلترة
  const refreshSideData = useCallback(() => {
    adminFetchAdsQuickStats().then(setQuickStats).catch(() => {});
    adminFetchReportedAdIds().then(setReportedAdIds).catch(() => {});
  }, []);
  useEffect(() => {
    refreshSideData();
    fetchCategories().then(({ data }) => setCategories(data || [])).catch(() => {});
  }, [refreshSideData]);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  // ✅ مُصلَّح: البحث و"عرض المحذوفات" والفرز صاروا يُنفَّذوا فعلياً بالاستعلام (backend)
  // بدل ما يقتصروا على الصفحة المحمّلة فقط بالمتصفح
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
      const result = await Promise.race([
        adminFetchAllAds({
          signal: controller.signal, limit, offset, includeDeleted: showDeleted, search, sortBy,
          status: statusFilter === 'all' ? undefined : statusFilter,
          categoryId: categoryFilter || undefined,
          noViewsOnly,
        }),
        timeout,
      ]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      if (reset) {
        setAds(data || []);
        setHasMore((data || []).length >= limit);
        setPage(pageNum);
      } else {
        setAds(prev => [...prev, ...(data || [])]);
        setHasMore((data || []).length >= limit);
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
  }, [isAr, showAlert, showDeleted, search, sortBy, statusFilter, categoryFilter, noViewsOnly]);

  useEffect(() => {
    loadData(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // ✅ إعادة الجلب من الخادم عند تغيير الفلاتر (مو فلترة محلية على 20 عنصر بس)
  useEffect(() => {
    const t = setTimeout(() => loadData(true), search ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showDeleted, sortBy, statusFilter, categoryFilter, noViewsOnly]);

  const filteredAds = ads; // الفلترة صارت بالخادم بالكامل

  const withPending = async (id: string, fn: () => Promise<{ error: string | null }>) => {
    setPendingIds(prev => new Set(prev).add(id));
    try {
      return await fn();
    } finally {
      setPendingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // ✅ تحديث محلي فوري بمكان الإعادة الكاملة loadData(true) — كانت ترجّع القائمة لأول صفحة
  // وتفقد كل الصفحات المحمّلة بالتمرير عند أي تعديل بسيط
  const patchAdLocally = (id: string, patch: Partial<Ad>) => {
    setAds(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
  };

  const handleToggleFeatured = async (ad: Ad) => {
    // ✅ مُصلَّح: التمييز كان يكتب فوق status ويفقد حالة "مباع" الحقيقية نهائياً
    // (status يُستخدم لتخزين active/sold/featured بعمود واحد — تمييز إعلان مباع كان يحوّله "نشط" بالغلط)
    if (ad.status === 'sold' || ad.status === 'deleted') {
      showAlert(isAr ? 'غير مسموح' : 'Not allowed', isAr ? 'ما بينميّز إعلان مباع أو محذوف' : 'Cannot feature a sold or deleted ad');
      return;
    }
    const isFeatured = ad.status === 'featured';
    const { error } = await withPending(ad.id, () => adminSetAdFeatured(ad.id, !isFeatured));
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    patchAdLocally(ad.id, { status: isFeatured ? 'active' : 'featured' });
    showSnackbar(isAr ? 'تم تحديث حالة التميز' : 'Featured status updated', 'success');
    refreshSideData();
  };
  const handleToggleBoost = async (ad: Ad) => {
    const isBoosted = !!(ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now());
    const { error } = await withPending(ad.id, () => adminBoostAd(ad.id, !isBoosted));
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    patchAdLocally(ad.id, { boosted_until: isBoosted ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
    showSnackbar(isAr ? 'تم تحديث حالة التعزيز' : 'Boost status updated', 'success');
  };
  const handleDeleteAd = (ad: Ad) => {
    setSelectedAd(ad);
    setDeleteModalVisible(true);
  };
  const confirmDelete = async () => {
    if (!selectedAd) return;
    const { error } = await withPending(selectedAd.id, () => adminDeleteAd(selectedAd.id));
    setDeleteModalVisible(false);
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    if (showDeleted) {
      patchAdLocally(selectedAd.id, { status: 'deleted' });
    } else {
      setAds(prev => prev.filter(a => a.id !== selectedAd.id));
    }
    showSnackbar(isAr ? 'تم حذف الإعلان' : 'Ad deleted', 'success');
    refreshSideData();
  };
  const handleEditAd = (ad: Ad) => {
    setEditingAd(ad);
    setEditModalVisible(true);
  };
  const handleSaveAdEdit = async (id: string, updates: any) => {
    const { error } = await withPending(id, () => adminUpdateAd(id, updates));
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    patchAdLocally(id, updates);
    showSnackbar(isAr ? 'تم تحديث الإعلان' : 'Ad updated', 'success');
  };
  const handleViewAd = (ad: Ad) => {
    router.push(`/ad/${ad.id}` as any);
  };

  // ✅ جديد: إجراءات جماعية
  const toggleSelectAd = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds(new Set()); };
  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    showAlert(
      isAr ? 'تأكيد الحذف الجماعي' : 'Confirm bulk delete',
      isAr ? `هل تريد حذف ${selectedIds.size} إعلان؟` : `Delete ${selectedIds.size} ads?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            const ids = Array.from(selectedIds);
            await Promise.all(ids.map(id => adminDeleteAd(id)));
            setAds(prev => showDeleted ? prev.map(a => (ids.includes(a.id) ? { ...a, status: 'deleted' as const } : a)) : prev.filter(a => !ids.includes(a.id)));
            setBulkBusy(false);
            exitSelectionMode();
            showSnackbar(isAr ? 'تم حذف الإعلانات المحددة' : 'Selected ads deleted', 'success');
            refreshSideData();
          },
        },
      ]
    );
  };
  const bulkFeature = async (featured: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds).filter(id => {
      const ad = ads.find(a => a.id === id);
      return ad && ad.status !== 'sold' && ad.status !== 'deleted';
    });
    await Promise.all(ids.map(id => adminSetAdFeatured(id, featured)));
    setAds(prev => prev.map(a => (ids.includes(a.id) ? { ...a, status: featured ? 'featured' as const : 'active' as const } : a)));
    setBulkBusy(false);
    exitSelectionMode();
    showSnackbar(isAr ? 'تم تحديث الإعلانات المحددة' : 'Selected ads updated', 'success');
    refreshSideData();
  };
  // ✅ مُصلَّح: التصدير كان يصدّر كل الإعلانات المحمّلة بدل النتائج المفلترة المعروضة فعلياً
  const exportAds = async () => {
    const csv = generateCSV(filteredAds, ['ID', 'Title', 'Price', 'Condition', 'Status', 'Created'], ['id', 'title', 'price', 'condition', 'status', 'created_at']);
    try {
      await Share.share({ message: csv, title: 'Ads Export.csv' });
    } catch (e) {
      console.warn('Share failed', e);
      Alert.alert(isAr ? 'خطأ' : 'Error', isAr ? 'فشلت مشاركة الملف' : 'Failed to share the file');
    }
  };

  const renderItem = ({ item }: { item: Ad }) => (
    <AdItem
      item={item}
      colors={colors}
      isAr={isAr}
      isRTL={isRTL}
      pending={pendingIds.has(item.id)}
      isReported={reportedAdIds.has(item.id)}
      selectionMode={selectionMode}
      selected={selectedIds.has(item.id)}
      onToggleSelect={toggleSelectAd}
      onToggleFeatured={handleToggleFeatured}
      onToggleBoost={handleToggleBoost}
      onEdit={handleEditAd}
      onDelete={handleDeleteAd}
      onView={handleViewAd}
    />
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const sortOptions: { key: typeof sortBy; label: string }[] = [
    { key: 'newest', label: isAr ? 'الأحدث' : 'Newest' },
    { key: 'price_desc', label: isAr ? 'السعر ↓' : 'Price ↓' },
    { key: 'price_asc', label: isAr ? 'السعر ↑' : 'Price ↑' },
    { key: 'views_desc', label: isAr ? 'الأكثر مشاهدة' : 'Most viewed' },
  ];

  const statusOptions: { key: typeof statusFilter; label: string }[] = [
    { key: 'all', label: isAr ? 'الكل' : 'All' },
    { key: 'active', label: isAr ? 'نشط' : 'Active' },
    { key: 'featured', label: isAr ? 'مميز' : 'Featured' },
    { key: 'sold', label: isAr ? 'مباع' : 'Sold' },
  ];

  return (
    <View style={styles.tabContainer}>
      {/* ✅ جديد: شريط إحصائيات سريع */}
      {quickStats && (
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: 8, flexWrap: 'wrap' }}>
          {[
            { label: isAr ? 'الإجمالي' : 'Total', value: quickStats.total, color: colors.textPrimary },
            { label: isAr ? 'نشط' : 'Active', value: quickStats.active, color: '#22C55E' },
            { label: isAr ? 'مميز' : 'Featured', value: quickStats.featured, color: '#F59E0B' },
            { label: isAr ? 'معزز' : 'Boosted', value: quickStats.boosted, color: '#2563EB' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, minWidth: 70, backgroundColor: colors.surfaceTint, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, padding: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.adControls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={isAr ? '🔍 ابحث عن إعلان (العنوان أو الوصف)...' : '🔍 Search ads (title or description)...'}
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
        <Pressable
          style={[styles.toggleDeletedBtn, { backgroundColor: selectionMode ? colors.primary : colors.border }]}
          onPress={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
        >
          <Text style={{ color: selectionMode ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
            {selectionMode ? (isAr ? 'إلغاء التحديد' : 'Cancel select') : (isAr ? 'تحديد' : 'Select')}
          </Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportAds}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* ✅ جديد: فلترة حسب الحالة + التصنيف + بدون مشاهدات، وفرز حقيقي — كلها مربوطة بالاستعلام */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 6 }}
        contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, paddingHorizontal: Spacing.md }}
      >
        {statusOptions.map(opt => (
          <Pressable
            key={opt.key}
            onPress={() => setStatusFilter(opt.key)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
              backgroundColor: statusFilter === opt.key ? colors.primary : colors.surfaceTint,
              borderWidth: 1, borderColor: statusFilter === opt.key ? colors.primary : colors.border,
              flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: statusFilter === opt.key ? '#fff' : colors.textSecondary }}>{opt.label}</Text>
          </Pressable>
        ))}
        <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
        <Pressable
          onPress={() => setNoViewsOnly(v => !v)}
          style={{
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
            backgroundColor: noViewsOnly ? colors.primary : colors.surfaceTint,
            borderWidth: 1, borderColor: noViewsOnly ? colors.primary : colors.border,
            flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
          }}
        >
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: noViewsOnly ? '#fff' : colors.textSecondary }}>
            {isAr ? '👁️ بدون مشاهدات' : '👁️ Zero views'}
          </Text>
        </Pressable>
      </ScrollView>

      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 8 }}
          contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, paddingHorizontal: Spacing.md }}
        >
          <Pressable
            onPress={() => setCategoryFilter(null)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
              backgroundColor: !categoryFilter ? colors.primary : colors.surfaceTint,
              borderWidth: 1, borderColor: !categoryFilter ? colors.primary : colors.border,
              flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: !categoryFilter ? '#fff' : colors.textSecondary }}>{isAr ? 'كل التصنيفات' : 'All categories'}</Text>
          </Pressable>
          {categories.map(cat => (
            <Pressable
              key={cat.id}
              onPress={() => setCategoryFilter(cat.id)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
                backgroundColor: categoryFilter === cat.id ? colors.primary : colors.surfaceTint,
                borderWidth: 1, borderColor: categoryFilter === cat.id ? colors.primary : colors.border,
                flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: categoryFilter === cat.id ? '#fff' : colors.textSecondary }}>
                {getCategoryName(cat, isAr ? 'ar' : 'en')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 8 }}
        contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, paddingHorizontal: Spacing.md }}
      >
        {sortOptions.map(opt => (
          <Pressable
            key={opt.key}
            onPress={() => setSortBy(opt.key)}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
              backgroundColor: sortBy === opt.key ? colors.primary : colors.surfaceTint,
              borderWidth: 1, borderColor: sortBy === opt.key ? colors.primary : colors.border,
              flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: sortBy === opt.key ? '#fff' : colors.textSecondary }}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ✅ جديد: شريط الإجراءات الجماعية */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, marginBottom: 8 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>
            {isAr ? `${selectedIds.size} محدد` : `${selectedIds.size} selected`}
          </Text>
          <Pressable disabled={bulkBusy} onPress={() => bulkFeature(true)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#FEF3C7' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>{isAr ? 'تمييز' : 'Feature'}</Text>
          </Pressable>
          <Pressable disabled={bulkBusy} onPress={() => bulkFeature(false)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: colors.borderLight }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>{isAr ? 'إلغاء التمييز' : 'Unfeature'}</Text>
          </Pressable>
          <Pressable disabled={bulkBusy} onPress={bulkDelete} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#FEE2E2' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{isAr ? 'حذف' : 'Delete'}</Text>
          </Pressable>
          {bulkBusy && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      )}

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
        colors={colors}
      />

      <Snackbar visible={snackbar.visible} message={snackbar.message} type={snackbar.type} onDismiss={() => setSnackbar({ ...snackbar, visible: false })} />
    </View>
  );
}

// ─── تبويب المستخدمين ────────────────────────────────────────────────────────
function UsersTab({ colors, isAr, isRTL, t }: any) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [adCounts, setAdCounts] = useState<Record<string, number>>({});
  const [favCounts, setFavCounts] = useState<Record<string, number>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'verified' | 'blocked'>('all');
  const [sortBy, setSortBy] = useState<'email' | 'newest' | 'oldest'>('email');
  const [noActivityOnly, setNoActivityOnly] = useState(false);
  const [quickStats, setQuickStats] = useState<{ total: number; verified: number; blocked: number; admins: number } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [adsModal, setAdsModal] = useState<{ visible: boolean; user: UserProfile | null; loading: boolean; ads: any[] }>({ visible: false, user: null, loading: false, ads: [] });
  const [reportsModal, setReportsModal] = useState<{ visible: boolean; user: UserProfile | null; loading: boolean; reports: any[] }>({ visible: false, user: null, loading: false, reports: [] });
  const [filedReportsModal, setFiledReportsModal] = useState<{ visible: boolean; user: UserProfile | null; loading: boolean; reports: any[] }>({ visible: false, user: null, loading: false, reports: [] });
  const [notifyModal, setNotifyModal] = useState<{ visible: boolean; user: UserProfile | null; title: string; message: string; sending: boolean }>({ visible: false, user: null, title: '', message: '', sending: false });
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const refreshQuickStats = useCallback(() => {
    adminFetchUsersQuickStats().then(setQuickStats).catch(() => {});
  }, []);
  useEffect(() => { refreshQuickStats(); }, [refreshQuickStats]);

  const showSnackbar = (message: string, type: string = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  // ✅ مُصلَّح: البحث صار يُنفَّذ فعلياً بالاستعلام (backend) بدل الاقتصار على الصفحة المحمّلة
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
      const result = await Promise.race([
        adminFetchAllUsers({ signal: controller.signal, limit, offset, search, role: roleFilter === 'all' ? undefined : roleFilter, sortBy }),
        timeout,
      ]);
      const { data } = result as any;
      if (controller.signal.aborted) return;
      const newUsers: UserProfile[] = data || [];
      if (reset) {
        setUsers(newUsers);
        setHasMore(newUsers.length >= limit);
        setPage(pageNum);
      } else {
        setUsers(prev => [...prev, ...newUsers]);
        setHasMore(newUsers.length >= limit);
        setPage(pageNum);
      }
      // ✅ جديد: عدد إعلانات/مفضلات كل مستخدم وآخر زيارة له بالصفحة المعروضة
      const ids = newUsers.map(u => u.id);
      adminFetchUserAdCounts(ids).then(counts => setAdCounts(prev => ({ ...prev, ...counts }))).catch(() => {});
      adminFetchUserFavoriteCounts(ids).then(counts => setFavCounts(prev => ({ ...prev, ...counts }))).catch(() => {});
      adminFetchLastSeen(ids).then(map => setLastSeenMap(prev => ({ ...prev, ...map }))).catch(() => {});
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
  }, [isAr, showAlert, search, roleFilter, sortBy]);

  useEffect(() => {
    loadData(true);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadData(true), search ? 400 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, sortBy]);

  // ✅ "بدون نشاط" فلتر محلي (يعتمد على عدّادات الإعلانات المجلوبة للصفحة الحالية)
  const filteredUsers = useMemo(() => {
    if (!noActivityOnly) return users;
    return users.filter(u => (adCounts[u.id] ?? 0) === 0);
  }, [users, noActivityOnly, adCounts]);

  const withPending = async (id: string, fn: () => Promise<{ error: string | null }>) => {
    setPendingIds(prev => new Set(prev).add(id));
    try {
      return await fn();
    } finally {
      setPendingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // ✅ مُصلَّح: تحديث محلي فوري بمكان الإعادة الكاملة loadData(true) — كانت ترجّع القائمة لأول صفحة
  const patchUserLocally = (id: string, patch: Partial<UserProfile>) => {
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...patch } : u)));
  };

  const handleToggleAdmin = (user: UserProfile) => {
    // ✅ مُصلَّح: منع الأدمن من إلغاء صلاحيته عن نفسه بالغلط (ممكن يقفل الجميع برا اللوحة)
    if (user.id === currentUser?.id) {
      showAlert(isAr ? 'غير مسموح' : 'Not allowed', isAr ? 'ما بتقدر تغيّر صلاحيتك الإدارية عن نفسك' : 'You cannot change your own admin rights');
      return;
    }
    const action = user.is_admin ? (isAr ? 'إلغاء صلاحية الإدارة عن' : 'revoke admin rights from') : (isAr ? 'منح صلاحية إدارة لـ' : 'grant admin rights to');
    showAlert(
      isAr ? 'تأكيد' : 'Confirm',
      isAr ? `متأكد إنك بدك ${action} ${user.username || user.email}؟` : `Are you sure you want to ${action} ${user.username || user.email}?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'تأكيد' : 'Confirm',
          style: user.is_admin ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = await withPending(user.id, () => adminSetUserAdmin(user.id, !user.is_admin));
            if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
            patchUserLocally(user.id, { is_admin: !user.is_admin });
            showSnackbar(isAr ? 'تم تحديث صلاحية المدير' : 'Admin status updated', 'success');
            refreshQuickStats();
          },
        },
      ]
    );
  };
  const handleToggleVerified = async (user: UserProfile) => {
    const { error } = await withPending(user.id, () => adminSetUserVerified(user.id, !user.is_verified));
    if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
    patchUserLocally(user.id, { is_verified: !user.is_verified });
    showSnackbar(isAr ? 'تم تحديث حالة التوثيق' : 'Verification updated', 'success');
    refreshQuickStats();
  };
  const handleToggleBlocked = (user: UserProfile) => {
    // ✅ مُصلَّح: منع الأدمن من حظر نفسه بالغلط
    if (user.id === currentUser?.id) {
      showAlert(isAr ? 'غير مسموح' : 'Not allowed', isAr ? 'ما بتقدر تحظر حسابك أنت' : 'You cannot block your own account');
      return;
    }
    const willBlock = !user.is_blocked;
    showAlert(
      isAr ? 'تأكيد' : 'Confirm',
      willBlock
        ? (isAr ? `متأكد إنك بدك تحظر ${user.username || user.email}؟` : `Block ${user.username || user.email}?`)
        : (isAr ? `رفع الحظر عن ${user.username || user.email}؟` : `Unblock ${user.username || user.email}?`),
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: willBlock ? (isAr ? 'حظر' : 'Block') : (isAr ? 'رفع الحظر' : 'Unblock'),
          style: willBlock ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = await withPending(user.id, () => adminSetUserBlocked(user.id, willBlock));
            if (error) { showAlert(isAr ? 'خطأ' : 'Error', error); return; }
            patchUserLocally(user.id, { is_blocked: willBlock });
            showSnackbar(isAr ? 'تم تحديث حالة الحظر' : 'Block status updated', 'success');
            refreshQuickStats();
          },
        },
      ]
    );
  };
  // ✅ مُصلَّح ومُحسَّن: التصدير صار يصدّر النتائج المفلترة المعروضة فعلياً + أعمدة إضافية
  const exportUsers = async () => {
    const rows = filteredUsers.map(u => ({
      ...u,
      ad_count: adCounts[u.id] ?? 0,
      joined: u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : '',
    }));
    const csv = generateCSV(
      rows,
      ['ID', 'Username', 'Email', 'Phone', 'Admin', 'Verified', 'Blocked', 'Ads', 'Joined'],
      ['id', 'username', 'email', 'phone', 'is_admin', 'is_verified', 'is_blocked', 'ad_count', 'joined']
    );
    try {
      await Share.share({ message: csv, title: 'Users Export.csv' });
    } catch (e) {
      console.warn('Share failed', e);
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'فشلت مشاركة الملف' : 'Failed to share the file');
    }
  };

  // ✅ جديد: عرض إعلانات المستخدم / البلاغات المقدّمة ضده أو منه بمودال خفيف
  const handleViewAds = async (user: UserProfile) => {
    setAdsModal({ visible: true, user, loading: true, ads: [] });
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('ads').select('id, title, status, price, created_at').eq('user_id', user.id).neq('status', 'deleted').order('created_at', { ascending: false });
    setAdsModal({ visible: true, user, loading: false, ads: data || [] });
  };
  const handleViewReports = async (user: UserProfile) => {
    setReportsModal({ visible: true, user, loading: true, reports: [] });
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('reports').select('id, reason, status, created_at, ad:ad_id(title)').eq('target_user_id', user.id).order('created_at', { ascending: false });
    setReportsModal({ visible: true, user, loading: false, reports: data || [] });
  };
  // ✅ جديد: البلاغات اللي قدّمها هالمستخدم هو نفسه (يساعد يكتشف بلاغات كيدية متكررة)
  const handleViewFiledReports = async (user: UserProfile) => {
    setFiledReportsModal({ visible: true, user, loading: true, reports: [] });
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('reports').select('id, reason, status, created_at, ad:ad_id(title)').eq('reporter_id', user.id).order('created_at', { ascending: false });
    setFiledReportsModal({ visible: true, user, loading: false, reports: data || [] });
  };
  // ✅ جديد: فتح الملف الشخصي العام لهالمستخدم
  const handleViewProfile = (user: UserProfile) => {
    router.push(`/seller/${user.id}` as any);
  };
  // ✅ جديد: إرسال إشعار مباشر لمستخدم واحد
  const handleOpenNotify = (user: UserProfile) => {
    setNotifyModal({ visible: true, user, title: '', message: '', sending: false });
  };
  const handleSendNotify = async () => {
    if (!notifyModal.user) return;
    if (!notifyModal.title.trim() || !notifyModal.message.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان والرسالة مطلوبان' : 'Title and message are required');
      return;
    }
    setNotifyModal(prev => ({ ...prev, sending: true }));
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(isAr ? 'الجلسة غير صالحة' : 'Invalid session');
      const res = await fetch('https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/functions/v1/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          action: 'admin_notify_user',
          target_user_id: notifyModal.user.id,
          title: notifyModal.title.trim(),
          message: notifyModal.message.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setNotifyModal({ visible: false, user: null, title: '', message: '', sending: false });
      showSnackbar(
        json.skipped === 'no_token'
          ? (isAr ? 'لا يملك المستخدم جهاز مسجّل لتلقي إشعارات' : 'User has no registered device for notifications')
          : (isAr ? 'تم إرسال الإشعار' : 'Notification sent'),
        'success'
      );
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e?.message || (isAr ? 'فشل الإرسال' : 'Failed to send'));
      setNotifyModal(prev => ({ ...prev, sending: false }));
    }
  };

  // ✅ جديد: إجراءات جماعية
  const toggleSelectUser = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectionMode = () => { setSelectionMode(false); setSelectedIds(new Set()); };
  const bulkVerify = async (verified: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id => adminSetUserVerified(id, verified)));
    setUsers(prev => prev.map(u => (ids.includes(u.id) ? { ...u, is_verified: verified } : u)));
    setBulkBusy(false);
    exitSelectionMode();
    showSnackbar(isAr ? 'تم تحديث المستخدمين المحددين' : 'Selected users updated', 'success');
    refreshQuickStats();
  };
  const bulkBlock = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds).filter(id => id !== currentUser?.id); // ✅ استبعاد النفس دايماً حتى بالجماعي
    if (ids.length === 0) return;
    showAlert(
      isAr ? 'تأكيد الحظر الجماعي' : 'Confirm bulk block',
      isAr ? `هل تريد حظر ${ids.length} مستخدم؟` : `Block ${ids.length} users?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حظر' : 'Block',
          style: 'destructive',
          onPress: async () => {
            setBulkBusy(true);
            await Promise.all(ids.map(id => adminSetUserBlocked(id, true)));
            setUsers(prev => prev.map(u => (ids.includes(u.id) ? { ...u, is_blocked: true } : u)));
            setBulkBusy(false);
            exitSelectionMode();
            showSnackbar(isAr ? 'تم حظر المستخدمين المحددين' : 'Selected users blocked', 'success');
            refreshQuickStats();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: UserProfile }) => (
    <UserItem
      item={item}
      colors={colors}
      isAr={isAr}
      isRTL={isRTL}
      pending={pendingIds.has(item.id)}
      isSelf={item.id === currentUser?.id}
      adCount={adCounts[item.id]}
      favCount={favCounts[item.id]}
      lastSeen={lastSeenMap[item.id]}
      selectionMode={selectionMode}
      selected={selectedIds.has(item.id)}
      onToggleSelect={toggleSelectUser}
      onToggleAdmin={handleToggleAdmin}
      onToggleVerified={handleToggleVerified}
      onToggleBlocked={handleToggleBlocked}
      onViewAds={handleViewAds}
      onViewReports={handleViewReports}
      onViewFiledReports={handleViewFiledReports}
      onViewProfile={handleViewProfile}
      onNotify={handleOpenNotify}
    />
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const roleOptions: { key: typeof roleFilter; label: string }[] = [
    { key: 'all', label: isAr ? 'الكل' : 'All' },
    { key: 'admin', label: isAr ? 'إداري' : 'Admin' },
    { key: 'verified', label: isAr ? 'موثّق' : 'Verified' },
    { key: 'blocked', label: isAr ? 'محظور' : 'Blocked' },
  ];
  const userSortOptions: { key: typeof sortBy; label: string }[] = [
    { key: 'email', label: isAr ? 'أبجدي' : 'A–Z' },
    { key: 'newest', label: isAr ? 'الأحدث انضماماً' : 'Newest' },
    { key: 'oldest', label: isAr ? 'الأقدم انضماماً' : 'Oldest' },
  ];
  const chipStyle = (active: boolean) => ({
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: active ? colors.primary : colors.surfaceTint,
    borderWidth: 1, borderColor: active ? colors.primary : colors.border,
    flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start' as const,
  });

  return (
    <View style={styles.tabContainer}>
      {/* ✅ جديد: شريط إحصائيات سريع */}
      {quickStats && (
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: 8, flexWrap: 'wrap' }}>
          {[
            { label: isAr ? 'الإجمالي' : 'Total', value: quickStats.total, color: colors.textPrimary },
            { label: isAr ? 'موثّق' : 'Verified', value: quickStats.verified, color: '#2563EB' },
            { label: isAr ? 'محظور' : 'Blocked', value: quickStats.blocked, color: '#EF4444' },
            { label: isAr ? 'إداري' : 'Admins', value: quickStats.admins, color: colors.primary },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, minWidth: 70, backgroundColor: colors.surfaceTint, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, padding: 8, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.adControls, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.searchContainer, { backgroundColor: colors.background, borderColor: colors.border, flex: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <MaterialIcons name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={isAr ? '🔍 ابحث عن مستخدم (اسم، إيميل، هاتف)...' : '🔍 Search users (name, email, phone)...'}
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
          style={[styles.toggleDeletedBtn, { backgroundColor: selectionMode ? colors.primary : colors.border }]}
          onPress={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
        >
          <Text style={{ color: selectionMode ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 12 }}>
            {selectionMode ? (isAr ? 'إلغاء التحديد' : 'Cancel select') : (isAr ? 'تحديد' : 'Select')}
          </Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, { backgroundColor: colors.primaryGhost }]} onPress={exportUsers}>
          <MaterialIcons name="file-download" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* ✅ جديد: فلترة حسب الدور + بدون نشاط، مربوطة بالاستعلام */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 6 }}
        contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, paddingHorizontal: Spacing.md }}
      >
        {roleOptions.map(opt => (
          <Pressable key={opt.key} onPress={() => setRoleFilter(opt.key)} style={chipStyle(roleFilter === opt.key)}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: roleFilter === opt.key ? '#fff' : colors.textSecondary }}>{opt.label}</Text>
          </Pressable>
        ))}
        <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
        <Pressable onPress={() => setNoActivityOnly(v => !v)} style={chipStyle(noActivityOnly)}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: noActivityOnly ? '#fff' : colors.textSecondary }}>
            {isAr ? '💤 بدون نشاط' : '💤 No activity'}
          </Text>
        </Pressable>
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: 8 }}
        contentContainerStyle={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, paddingHorizontal: Spacing.md }}
      >
        {userSortOptions.map(opt => (
          <Pressable key={opt.key} onPress={() => setSortBy(opt.key)} style={chipStyle(sortBy === opt.key)}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: sortBy === opt.key ? '#fff' : colors.textSecondary }}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ✅ جديد: شريط الإجراءات الجماعية */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, marginBottom: 8 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 12 }}>
            {isAr ? `${selectedIds.size} محدد` : `${selectedIds.size} selected`}
          </Text>
          <Pressable disabled={bulkBusy} onPress={() => bulkVerify(true)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#DBEAFE' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>{isAr ? 'توثيق' : 'Verify'}</Text>
          </Pressable>
          <Pressable disabled={bulkBusy} onPress={() => bulkVerify(false)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: colors.borderLight }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>{isAr ? 'إلغاء التوثيق' : 'Unverify'}</Text>
          </Pressable>
          <Pressable disabled={bulkBusy} onPress={bulkBlock} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: '#FEE2E2' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{isAr ? 'حظر' : 'Block'}</Text>
          </Pressable>
          {bulkBusy && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      )}

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
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialIcons name="people" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, marginTop: 8, fontWeight: '600' }}>{isAr ? 'لا يوجد مستخدمين' : 'No users found'}</Text>
          </View>
        }
      />

      {/* ✅ جديد: مودال إعلانات المستخدم */}
      <Modal visible={adsModal.visible} animationType="slide" transparent onRequestClose={() => setAdsModal({ visible: false, user: null, loading: false, ads: [] })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, maxHeight: '70%' }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="campaign" size={22} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {isAr ? `إعلانات ${adsModal.user?.username || adsModal.user?.email || ''}` : `Ads by ${adsModal.user?.username || adsModal.user?.email || ''}`}
              </Text>
              <Pressable onPress={() => setAdsModal({ visible: false, user: null, loading: false, ads: [] })} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            {adsModal.loading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
            ) : adsModal.ads.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20 }}>{isAr ? 'ما عندو إعلانات' : 'No ads'}</Text>
            ) : (
              <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
                {adsModal.ads.map((ad: any) => (
                  <View key={ad.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{ad.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{ad.price}₪ • {ad.status}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ✅ جديد: مودال البلاغات المقدّمة ضد المستخدم */}
      <Modal visible={reportsModal.visible} animationType="slide" transparent onRequestClose={() => setReportsModal({ visible: false, user: null, loading: false, reports: [] })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, maxHeight: '70%' }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="flag" size={22} color="#D97706" />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {isAr ? `بلاغات ضد ${reportsModal.user?.username || reportsModal.user?.email || ''}` : `Reports on ${reportsModal.user?.username || reportsModal.user?.email || ''}`}
              </Text>
              <Pressable onPress={() => setReportsModal({ visible: false, user: null, loading: false, reports: [] })} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            {reportsModal.loading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
            ) : reportsModal.reports.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20 }}>{isAr ? 'ما في بلاغات' : 'No reports'}</Text>
            ) : (
              <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
                {reportsModal.reports.map((r: any) => (
                  <View key={r.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{r.ad?.title || (isAr ? 'إعلان محذوف' : 'Deleted ad')}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{r.reason} • {r.status}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ✅ جديد: مودال البلاغات اللي قدّمها المستخدم بنفسه */}
      <Modal visible={filedReportsModal.visible} animationType="slide" transparent onRequestClose={() => setFiledReportsModal({ visible: false, user: null, loading: false, reports: [] })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, maxHeight: '70%' }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="outlined-flag" size={22} color="#9333EA" />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {isAr ? `بلاغات قدّمها ${filedReportsModal.user?.username || filedReportsModal.user?.email || ''}` : `Filed by ${filedReportsModal.user?.username || filedReportsModal.user?.email || ''}`}
              </Text>
              <Pressable onPress={() => setFiledReportsModal({ visible: false, user: null, loading: false, reports: [] })} hitSlop={8}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            {filedReportsModal.loading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
            ) : filedReportsModal.reports.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20 }}>{isAr ? 'ما قدّم أي بلاغ' : 'Filed no reports'}</Text>
            ) : (
              <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
                {filedReportsModal.reports.map((r: any) => (
                  <View key={r.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{r.ad?.title || (isAr ? 'إعلان محذوف' : 'Deleted ad')}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{r.reason} • {r.status}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ✅ جديد: مودال إرسال إشعار مباشر لمستخدم واحد */}
      <Modal visible={notifyModal.visible} animationType="slide" transparent onRequestClose={() => setNotifyModal({ visible: false, user: null, title: '', message: '', sending: false })}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
                <MaterialIcons name="notifications" size={22} color="#16A34A" />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {isAr ? `إشعار لـ ${notifyModal.user?.username || notifyModal.user?.email || ''}` : `Notify ${notifyModal.user?.username || notifyModal.user?.email || ''}`}
                </Text>
                <Pressable onPress={() => setNotifyModal({ visible: false, user: null, title: '', message: '', sending: false })} hitSlop={8}>
                  <MaterialIcons name="close" size={24} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={{ padding: Spacing.md, gap: 10 }}>
                <TextInput
                  style={[styles.searchInput, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 10, color: colors.textPrimary }]}
                  placeholder={isAr ? 'عنوان الإشعار' : 'Notification title'}
                  placeholderTextColor={colors.textMuted}
                  value={notifyModal.title}
                  onChangeText={(v) => setNotifyModal(prev => ({ ...prev, title: v }))}
                />
                <TextInput
                  style={[styles.searchInput, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 10, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder={isAr ? 'نص الرسالة' : 'Message'}
                  placeholderTextColor={colors.textMuted}
                  value={notifyModal.message}
                  onChangeText={(v) => setNotifyModal(prev => ({ ...prev, message: v }))}
                  multiline
                />
                <Pressable
                  disabled={notifyModal.sending}
                  onPress={handleSendNotify}
                  style={{ backgroundColor: colors.primary, borderRadius: Radius.md, padding: 12, alignItems: 'center', opacity: notifyModal.sending ? 0.6 : 1 }}
                >
                  {notifyModal.sending ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'إرسال' : 'Send'}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        colors={colors}
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
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('reports')
        .select('id, ad_id, reporter_id, reason, status, created_at, ad:ad_id(title, user_id), reporter:reporter_id(username, email)')
        .order('created_at', { ascending: false });
      if (controller.signal.aborted) return;
      if (error) throw error;
      const mapped: Report[] = (data ?? []).map((r: any) => ({
        id: r.id,
        reporter_name: r.reporter?.username || r.reporter?.email?.split('@')[0] || (isAr ? 'مستخدم' : 'User'),
        target_type: 'ad',
        target_id: r.ad?.title || r.ad_id,
        target_user_id: r.ad?.user_id ?? null,
        reason: r.reason,
        status: r.status || 'pending',
        created_at: r.created_at,
      }));
      setReports(mapped);
    } catch (err: any) {
      console.warn(err);
      showSnackbar(err?.message || (isAr ? 'فشل تحميل البلاغات' : 'Failed to load reports'), 'error');
    }
    finally { if (!controller.signal.aborted) setLoading(false); if (abortRef.current === controller) abortRef.current = null; }
  }, [isAr]);

  useEffect(() => { loadReports(); return () => { if (abortRef.current) abortRef.current.abort(); }; }, [loadReports]);

  const handleStatusChange = async (id: string, status: 'resolved' | 'rejected') => {
    const prev = reports;
    setReports(p => p.map(r => r.id === id ? { ...r, status } : r));
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('reports').update({ status }).eq('id', id);
      if (error) throw error;
      showSnackbar(isAr ? 'تم تحديث حالة البلاغ' : 'Report updated', 'success');
    } catch (err: any) {
      setReports(prev);
      showSnackbar(err?.message || (isAr ? 'فشل تحديث البلاغ' : 'Failed to update report'), 'error');
    }
  };

  const handleBlockReported = async (report: Report) => {
    if (!report.target_user_id) {
      showSnackbar(isAr ? 'تعذر تحديد صاحب الإعلان' : 'Could not identify the ad owner', 'error');
      return;
    }
    try {
      const { error } = await adminSetUserBlocked(report.target_user_id, true);
      if (error) throw new Error(error);
      showSnackbar(isAr ? 'تم حظر المستخدم' : 'User blocked', 'success');
    } catch (err: any) {
      showSnackbar(err?.message || (isAr ? 'فشل حظر المستخدم' : 'Failed to block user'), 'error');
    }
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
      <Text style={[styles.reportTarget, { color: colors.textSecondary }]}>{isAr ? 'الإعلان' : 'Ad'}: {item.target_id}</Text>
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
          <Pressable style={[styles.reportActionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => handleBlockReported(item)}>
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


// ─── تبويب الأدوات ──────────────────────────────────────────────────────────
function ToolsTab({ colors, isAr, t }: any) {
  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; type: string }>({ visible: false, message: '', type: 'success' });
  const { showAlert } = useAlert();

  const showSnackbar = (msg: string, type: string = 'success') => setSnackbar({ visible: true, message: msg, type });

  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان والمحتوى مطلوبان' : 'Title and body are required');
      return;
    }
    setSending(true);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(isAr ? 'الجلسة غير صالحة' : 'Invalid session');

      const res = await fetch('https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/functions/v1/push-notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'broadcast',
          title: title.trim(),
          message: body.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);

      setBroadcastModalVisible(false);
      setTitle('');
      setBody('');
      setImageUrl('');
      showSnackbar(
        isAr ? `تم الإرسال إلى ${json.sent} من ${json.total} جهاز` : `Sent to ${json.sent} of ${json.total} device(s)`,
        'success'
      );
    } catch (err: any) {
      showSnackbar(err?.message || (isAr ? 'فشل إرسال الإشعارات' : 'Failed to send broadcast'), 'error');
    } finally {
      setSending(false);
    }
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
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/');
      return;
    }
    let cancelled = false;
    checkIsAdmin()
      .then((admin) => {
        if (cancelled) return;
        setIsAdmin(admin);
        if (!admin) router.replace('/');
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          router.replace('/');
        }
      });
    return () => { cancelled = true; };
  }, [user, authLoading, router]);

  const [activeTab, setActiveTab] = useState<'analytics' | 'ads' | 'users' | 'banners' | 'interstitials' | 'reports' | 'stores' | 'tools'>('analytics');

  if (authLoading || !user || isAdmin !== true) {
    return (
      <View style={[styles.mainContainer, { backgroundColor: colors.background, paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const TABS = [
    { key: 'analytics', label: isAr ? '📊 إحصائيات' : 'Analytics', icon: 'insights' },
    { key: 'ads', label: isAr ? '📢 إعلانات' : 'Ads', icon: 'storefront' },
    { key: 'users', label: isAr ? '👤 مستخدمين' : 'Users', icon: 'people' },
    { key: 'banners', label: isAr ? '🖼️ بانرات' : 'Banners', icon: 'view-carousel' },
    { key: 'interstitials', label: isAr ? '📱 بينية' : 'Interstitials', icon: 'play-circle-outline' },
    { key: 'reports', label: isAr ? '⚠️ بلاغات' : 'Reports', icon: 'report' },
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
        {activeTab === 'ads' && <AdsTab colors={colors} isAr={isAr} isRTL={isAr} t={t} />}
        {activeTab === 'users' && <UsersTab colors={colors} isAr={isAr} isRTL={isAr} t={t} />}
        {activeTab === 'banners' && <BannersTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'interstitials' && <InterstitialsTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'reports' && <ReportsTab colors={colors} isAr={isAr} />}
        {activeTab === 'stores' && <StoresTab colors={colors} isAr={isAr} t={t} />}
        {activeTab === 'tools' && <ToolsTab colors={colors} isAr={isAr} t={t} />}
      </AdminTabErrorBoundary>
    </View>
  );
}

// ─── الأنماط ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  trendCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  trendTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 8,
  },
  trendBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 80,
  },
  trendBarWrapper: {
    alignItems: 'center',
  },
  trendBar: {
    width: 20,
    borderRadius: 4,
    minHeight: 4,
  },
  trendLabel: {
    fontSize: 8,
    marginTop: 2,
  },
  storeCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  storeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storeInfo: {
    flex: 1,
    marginRight: 8,
  },
  storeName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  storeOwner: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  storeBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  storeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  storeActions: {
    flexDirection: 'row',
    gap: 6,
  },
  storeActionBtn: {
    padding: 6,
    borderRadius: Radius.full,
  },
  errorFallback: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  errorFallbackText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  errorFallbackSub: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    marginTop: 8,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.full,
    marginTop: 12,
  },
  tabContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    margin: Spacing.md,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    height: '100%',
  },
  mainContainer: {
    flex: 1,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  mainBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  tabsWrapper: {
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  tabsContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: 4,
  },
  tabBtnText: {
    fontSize: FontSize.sm,
  },
  analyticsContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  lastUpdated: {
    fontSize: 10,
  },
  statsGrid3: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  statsGrid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCardSmall: {
    flex: 1,
    minWidth: '47%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContentSmall: {
    flex: 1,
  },
  statValueSmall: {
    fontSize: 16,
    fontWeight: '800',
  },
  statLabelSmall: {
    fontSize: 9,
  },
  pageStatsCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pageStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    gap: 8,
  },
  pageStatsTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  pageStatsHeaders: {
    flexDirection: 'row',
    gap: 12,
  },
  pageStatsHeaderLabel: {
    fontSize: 9,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  pageStatsEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  pageStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  pageStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageStatName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pageStatUnique: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  pageStatTotal: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  noteBox: {
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    borderWidth: 1,
  },
  noteText: {
    fontSize: 10,
    textAlign: 'center',
  },
  chartCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  chartTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 8,
  },
  advancedStatsCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  advancedStatsTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 8,
  },
  advancedStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  advancedStatsCol: {
    flex: 1,
  },
  advancedStatsLabel: {
    fontSize: 10,
  },
  advancedStatsValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  adCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  adHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  adStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  adStatusText: {
    fontSize: 9,
    fontWeight: '600',
  },
  adMeta: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  adActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  adActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  adBoostedDate: {
    fontSize: 9,
    marginTop: 4,
  },
  adControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  toggleDeletedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    height: 40,
    justifyContent: 'center',
    flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
  },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0, flexGrow: 0, alignSelf: 'flex-start',
  },
  userCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: FontSize.xs,
  },
  userBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  userBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  userBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  userActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  userActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bannerCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerImage: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
  },
  bannerImagePlaceholder: {
    width: 56,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerInfo: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  bannerPlacementText: {
    fontSize: FontSize.xs,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addBtn: {
    margin: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  bannerForm: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  bannerFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  bannerFormTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  bannerFormInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    fontSize: FontSize.sm,
  },
  bannerFormRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  bannerFormInputFlex: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
  },
  bannerFormUpload: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  bannerFormPlacement: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  bannerFormPlacementBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  bannerFormSave: {
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  interCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  interRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  interIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interInfo: {
    flex: 1,
  },
  interTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  interMeta: {
    fontSize: FontSize.xs,
  },
  logCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logAdmin: { fontWeight: '700' },
  logTime: { fontSize: 10 },
  logAction: { fontSize: FontSize.md, fontWeight: '600' },
  logTarget: { fontSize: FontSize.sm },
  logDetails: { fontSize: 10, marginTop: 2 },
  reportCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportReporter: { fontWeight: '700' },
  reportStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  reportTarget: { fontSize: FontSize.xs, marginTop: 4 },
  reportReason: { marginTop: 4 },
  reportTime: { fontSize: 10, marginTop: 4 },
  reportActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  reportActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  orderCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderUser: { fontWeight: '700' },
  orderAmount: { fontWeight: '700' },
  orderAd: { fontSize: FontSize.sm, marginTop: 2 },
  orderStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  orderStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  orderTime: { fontSize: 10 },
  orderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  orderActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    justifyContent: 'center',
  },
  toolsContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 12,
  },
  toolText: {
    flex: 1,
  },
  toolTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  toolDesc: {
    fontSize: FontSize.xs,
  },
  toolRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  toolCardSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 8,
  },
  toolTitleSmall: {
    fontWeight: '600',
  },
  toolToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  settingsPanel: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingLabel: { fontSize: FontSize.sm },
  settingInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: 6,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  saveSettingsBtn: {
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
    marginTop: 4,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    flex: 1,
  },
  modalContent: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  modalField: {
    gap: 4,
  },
  modalLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.sm,
  },
  modalConditionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modalConditionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  modalSaveBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmSheet: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    color: '#111827',
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    color: '#4B5563',
  },
  confirmDetails: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  confirmCancel: {
    backgroundColor: '#F3F4F6',
  },
  confirmDelete: {
    backgroundColor: '#EF4444',
  },
  confirmBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  snackbar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Shadow.medium,
  },
  snackbarText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  deviceCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  deviceName: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  devicePercent: {
    fontSize: FontSize.xs,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  periodFilterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  periodFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  periodFilterText: {
    fontSize: 12,
    fontWeight: '600',
  },
    // أنماط جديدة للبطاقات الموجزة في إحصائيات الصفحات
  summaryStatCard: {
    flex: 1,
    minWidth: '22%',
    padding: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  summaryStatLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  summaryStatValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  visitTypeTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});