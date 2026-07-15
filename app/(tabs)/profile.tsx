import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  KeyboardAvoidingView, Platform, Linking, Modal, ActivityIndicator,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming,
} from 'react-native-reanimated';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { AdCard, Button, EmptyState } from '@/components';
import { useMyAds } from '@/hooks/useAds';
import { updateAdStatus } from '@/services/adsService';
import { checkIsAdmin } from '@/services/adminService';
import { pickImage, uploadImage } from '@/services/imageService';
import { fetchBlockedIds, unblockUser, subscribeToBlockChanges } from '@/services/blockService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import type { FontScaleLevel } from '@/contexts/ThemeContext';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_MESSAGE, APP_VERSION } from '@/constants/config';
import type { Language } from '@/constants/i18n';

const FACEBOOK_URL = 'https://www.facebook.com/share/1L5KLdnkaY/';
const INSTAGRAM_URL = 'https://www.instagram.com/co.plankton?igsh=MWV4Z2RncTVoYW81ZA==';

// ─── Animated Dark Mode Switch ────────────────────────────────────────────────
function AnimatedSwitch({ value, onValueChange, colors }: {
  value: boolean; onValueChange: (v: boolean) => void; colors: any;
}) {
  const translateX = useSharedValue(value ? 24 : 3);
  const trackColor = useSharedValue(value ? 1 : 0);

  const handleToggle = useCallback(() => {
    const next = !value;
    translateX.value = withSpring(next ? 24 : 3, { damping: 12, stiffness: 200 });
    trackColor.value = withTiming(next ? 1 : 0, { duration: 280 });
    onValueChange(next);
  }, [value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    zIndex: 10,
  }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: trackColor.value > 0.5 ? colors.primary : '#CBD5E1',
  }));

  return (
    <Pressable onPress={handleToggle} hitSlop={8}>
      <Animated.View style={[switchS.track, trackStyle]}>
        {/* Moon icon — left side (visible when ON/dark) */}
        <View style={switchS.iconLeft}>
          <MaterialIcons name="nightlight-round" size={13} color="rgba(255,255,255,0.85)" />
        </View>
        {/* Sun icon — right side (visible when OFF/light) */}
        <View style={switchS.iconRight}>
          <MaterialIcons name="wb-sunny" size={13} color="#F59E0B" />
        </View>
        {/* Thumb slides over the icons */}
        <Animated.View style={[switchS.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const switchS = StyleSheet.create({
  track: { width: 52, height: 28, borderRadius: 14, position: 'relative', overflow: 'hidden', justifyContent: 'center' },
  thumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 4 },
  iconLeft: { position: 'absolute', left: 5, alignItems: 'center', justifyContent: 'center', width: 18, height: 28 },
  iconRight: { position: 'absolute', right: 5, alignItems: 'center', justifyContent: 'center', width: 18, height: 28 },
});

// ─── Font Scale Picker ──────────────────────────────────────────────────────
const FONT_LEVELS: { level: FontScaleLevel; labelAr: string; labelEn: string; icon: string }[] = [
  { level: 0, labelAr: 'S',  labelEn: 'S',  icon: 'text-fields' },
  { level: 1, labelAr: 'M',  labelEn: 'M',  icon: 'text-fields' },
  { level: 2, labelAr: 'L',  labelEn: 'L',  icon: 'text-fields' },
  { level: 3, labelAr: 'XL', labelEn: 'XL', icon: 'text-fields' },
];

function FontScalePicker({ level, onChange, isRTL, colors }: {
  level: FontScaleLevel;
  onChange: (l: FontScaleLevel) => void;
  isRTL: boolean;
  colors: any;
}) {
  const previewSizes = [12, 14, 16, 19];
  const SCALE_MULT = [0.85, 1.0, 1.15, 1.30];
  return (
    <View style={[fpS.wrap, { borderBottomColor: colors.borderLight }]}>
      <View style={[fpS.headerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[fpS.iconBox, { backgroundColor: '#EEF2FF' }]}>
          <MaterialIcons name="format-size" size={20} color="#4F46E5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[fpS.label, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? 'حجم الخط' : 'Text Size'}
          </Text>
          <Text style={[fpS.sub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? 'اختر حجم النص المناسب لك' : 'Choose your preferred text size'}
          </Text>
        </View>
      </View>

      {/* Preview text */}
      <View style={[fpS.previewBox, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
        <Text style={[fpS.previewText, { color: colors.textSecondary, fontSize: Math.round(14 * SCALE_MULT[level]) }]}>
          {isRTL ? 'مرحباً بك في سوق قلقيلية' : 'Welcome to Souq Qalqilya'}
        </Text>
        <Text style={[fpS.previewSub, { color: colors.textMuted, fontSize: Math.round(12 * SCALE_MULT[level]) }]}>
          {isRTL ? 'اعثر على أفضل العروض' : 'Find the best deals near you'}
        </Text>
      </View>

      {/* Segment buttons */}
      <View style={[fpS.btnRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderColor: colors.border, backgroundColor: colors.background }]}>
        {FONT_LEVELS.map((fl) => {
          const isSelected = fl.level === level;
          return (
            <Pressable
              key={fl.level}
              style={[fpS.btn, isSelected && { backgroundColor: colors.primary }]}
              onPress={() => onChange(fl.level)}
            >
              <Text style={[fpS.btnSample, {
                fontSize: previewSizes[fl.level],
                color: isSelected ? '#fff' : colors.textSecondary,
                fontWeight: isSelected ? '800' : '600',
              }]}>
                أ
              </Text>
              <Text style={[fpS.btnLabel, {
                color: isSelected ? '#fff' : colors.textMuted,
                fontWeight: isSelected ? '700' : '500',
              }]}>
                {isRTL ? fl.labelAr : fl.labelEn}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const fpS = StyleSheet.create({
  wrap: { borderBottomWidth: 1, paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 14, gap: 10 },
  headerRow: { alignItems: 'center', gap: Spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { fontSize: FontSize.md, fontWeight: '600' },
  sub: { fontSize: FontSize.xs, marginTop: 1 },
  previewBox: { borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, gap: 3 },
  previewText: { fontWeight: '600', lineHeight: 22 },
  previewSub: { lineHeight: 18 },
  btnRow: { flexDirection: 'row', borderRadius: Radius.lg, borderWidth: 1.5, overflow: 'hidden' },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 2 },
  btnSample: { lineHeight: 24 },
  btnLabel: { fontSize: 10 },
});

// ─── Section Header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon, label, color, bg }: { icon: string; label: string; color: string; bg: string }) {
  return (
    <View style={sH.wrap}>
      <View style={[sH.icon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[sH.label, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const sH = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  icon: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});

// ─── Setting Row ─────────────────────────────────────────────────────────────
function SettingRow({ icon, iconBg, iconColor, label, sub, isRTL, colors, onPress, right, danger, borderBottom = true }: any) {
  const content = (
    <View style={[styles.sRowInner, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomWidth: borderBottom ? 1 : 0, borderBottomColor: colors.borderLight }]}>
      <View style={[styles.sRowIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sRowLabel, { color: danger ? colors.error : colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
        {sub ? <Text style={[styles.sRowSub, { color: danger ? colors.error + 'AA' : colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{sub}</Text> : null}
      </View>
      {right ?? <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refreshSession } = useAuth();
  const { showAlert } = useAlert();
  const { colors, isDark, toggleTheme, fontScaleLevel, setFontScaleLevel, fontSize } = useTheme();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { ads, loading, load } = useMyAds();

  const [ownerStore, setOwnerStore] = useState<{ id: string; name: string; name_ar: string; is_approved: boolean } | null | undefined>(undefined);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [localDisplayName, setLocalDisplayName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; username: string; email: string; avatar_url: string | null }[]>([]);
  const [blockedExpanded, setBlockedExpanded] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [activeTab, setActiveTab] = useState<'listings' | 'settings'>('listings');
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testPushResult, setTestPushResult] = useState<'idle' | 'success' | 'error' | 'no_token'>('idle');
  const [currentPushToken, setCurrentPushToken] = useState<string | null>(null);

  // ── Memoized computed values ─────────────────────────────────────────────
  const isPhoneUser = useMemo(() => (user?.email ?? '').includes('@sms.souqqalqilya.local'), [user?.email]);
  const extractedPhone = useMemo(() => (user?.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1'), [user?.email]);
  const displayEmail = useMemo(() => isPhoneUser ? (editPhone || extractedPhone) : (user?.email ?? ''), [isPhoneUser, editPhone, extractedPhone, user?.email]);
  const displayName = useMemo(() => localDisplayName ?? user?.username ?? user?.email?.split('@')[0] ?? 'User', [localDisplayName, user]);
  const activeAds = useMemo(() => ads.filter(a => a.status === 'active' || a.status === 'featured'), [ads]);
  const soldAds = useMemo(() => ads.filter(a => a.status === 'sold'), [ads]);

  // ── Quick actions (memoized) ──────────────────────────────────────────────
  const quickActions = useMemo(() => [
    { icon: 'edit', label: isRTL ? 'تعديل الملف' : 'Edit Profile', color: colors.primary, bg: colors.primaryGhost, onPress: () => setEditMode(v => !v) },
    { icon: 'person', label: isRTL ? 'ملفي العام' : 'My Page', color: '#7C3AED', bg: '#EDE9FE', onPress: () => user && router.push(`/seller/${user.id}` as any) },
    { icon: 'add-circle-outline', label: isRTL ? 'نشر إعلان' : 'Post Ad', color: colors.primary, bg: colors.primaryGhost, onPress: () => router.push('/(tabs)/post') },
    { icon: 'favorite-border', label: isRTL ? 'المفضلة' : 'Favorites', color: '#EF4444', bg: '#FEE2E2', onPress: () => router.push('/favorites') },
    ...(isAdmin ? [{ icon: 'admin-panel-settings', label: isRTL ? 'الإدارة' : 'Admin', color: '#D97706', bg: '#FEF3C7', onPress: () => router.push('/admin/index' as any) }] : []),
  ], [isRTL, colors, isAdmin, router, user]);

  // ── Callbacks ─────────────────────────────────────────────────────────────
  const loadBlockedUsers = useCallback(async () => {
    try {
      const ids = await fetchBlockedIds();
      if (ids.length === 0) { setBlockedUsers([]); return; }
      const { data } = await getSupabaseClient()
        .from('user_profiles')
        .select('id, username, email, avatar_url')
        .in('id', ids);
      setBlockedUsers((data ?? []) as any);
    } catch (err) {
      console.error('loadBlockedUsers error:', err);
    }
  }, []);

  const handleUnblock = useCallback((userId: string, name: string) => {
    showAlert(
      isRTL ? 'رفع الحظر' : 'Unblock User',
      isRTL ? `هل تريد رفع الحظر عن "${name}"؟` : `Unblock "${name}"?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isRTL ? 'رفع الحظر' : 'Unblock',
          onPress: async () => {
            setUnblockingId(userId);
            try {
              await unblockUser(userId);
              setBlockedUsers(prev => prev.filter(u => u.id !== userId));
            } catch (err) {
              console.error('Unblock error:', err);
              showAlert(isRTL ? 'خطأ' : 'Error', isRTL ? 'فشل رفع الحظر' : 'Unblock failed');
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  }, [isRTL, showAlert, t.cancel]);

  const handleLogout = useCallback(() => {
    showAlert(t.signOut, t.signOutConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.signOut, style: 'destructive', onPress: async () => {
          const { error } = await logout();
          if (error) showAlert('Error', error);
        },
      },
    ]);
  }, [showAlert, t, logout]);

  const handleDeleteAd = useCallback((adId: string, adTitle: string) => {
    showAlert(
      isRTL ? 'حذف الإعلان' : 'Delete Listing',
      isRTL ? `هل أنت متأكد من حذف "${adTitle}"؟` : `Delete "${adTitle}"?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isRTL ? 'حذف' : 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await updateAdStatus(adId, 'deleted');
              load();
            } catch (err) {
              console.error('Delete ad error:', err);
              showAlert(isRTL ? 'خطأ' : 'Error', isRTL ? 'فشل حذف الإعلان' : 'Failed to delete listing');
            }
          },
        },
      ]
    );
  }, [isRTL, showAlert, t.cancel, load]);

  const handleMarkSold = useCallback((adId: string) => {
    showAlert(t.markAsSold, t.markAsSoldConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.confirm, onPress: async () => {
          try {
            await updateAdStatus(adId, 'sold');
            load();
          } catch (err) {
            console.error('Mark sold error:', err);
            showAlert(isRTL ? 'خطأ' : 'Error', isRTL ? 'فشل التحديث' : 'Update failed');
          }
        },
      },
    ]);
  }, [showAlert, t, load, isRTL]);

  const handlePickAvatar = useCallback(async () => {
    if (!user) return;
    setAvatarLoading(true);
    try {
      const img = await pickImage();
      if (!img) return;
      const { url, error } = await uploadImage(img.base64, user.id, 'avatar');
      if (error || !url) throw new Error(error ?? 'Upload failed');
      const supabase = getSupabaseClient();
      await supabase.from('user_profiles').update({ avatar_url: url }).eq('id', user.id);
      setAvatarUrl(url);
    } catch (e: any) {
      console.error('Avatar upload error:', e);
      showAlert('Error', e.message ?? 'Failed to update avatar.');
    } finally {
      setAvatarLoading(false);
    }
  }, [user, showAlert]);

  const handlePickBanner = useCallback(async () => {
    if (!user) return;
    setBannerLoading(true);
    try {
      const img = await pickImage('gallery');
      if (!img) return;
      const { url, error } = await uploadImage(img.base64, user.id, 'banner');
      if (error || !url) throw new Error(error ?? 'Upload failed');
      const supabase = getSupabaseClient();
      await supabase.from('user_profiles').update({ banner_url: url }).eq('id', user.id);
      setBannerUrl(url);
    } catch (e: any) {
      console.error('Banner upload error:', e);
      showAlert('Error', e.message ?? 'Failed to update banner.');
    } finally {
      setBannerLoading(false);
    }
  }, [user, showAlert]);

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      return showAlert(isRTL ? 'مطلوب' : 'Required', isRTL ? 'يرجى إدخال اسم المستخدم' : 'Please enter a display name.');
    }
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('user_profiles').update({ username: trimmedName, phone: editPhone.trim() || null }).eq('id', user.id);
      if (error) throw error;
      const { data: fresh, error: readErr } = await supabase.from('user_profiles').select('username').eq('id', user.id).single();
      if (readErr || fresh?.username !== trimmedName) throw new Error(readErr?.message ?? 'Save failed — please try again.');
      setLocalDisplayName(trimmedName);
      setEditName(trimmedName);
      await refreshSession();
      showAlert(t.profileUpdated, t.profileUpdatedMsg);
      setEditMode(false);
    } catch (e: any) {
      console.error('Save profile error:', e);
      showAlert('Error', e.message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }, [user, editName, editPhone, isRTL, showAlert, refreshSession, t]);

  const handleDeleteAccount = useCallback(() => setDeleteConfirmVisible(true), []);

  const confirmDeleteAccount = useCallback(async () => {
    setDeletingAccount(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setDeleteConfirmVisible(false);
        return showAlert(isRTL ? 'خطأ' : 'Error', isRTL ? 'لا توجد جلسة نشطة.' : 'No active session.');
      }
      const { error } = await supabase.functions.invoke('delete-account', { body: {}, headers: { Authorization: `Bearer ${session.access_token}` } });
      if (error) {
        let errorMessage = error.message;
        try { const text = await (error as any).context?.text?.(); if (text) { const parsed = JSON.parse(text); errorMessage = parsed?.error ?? text; } } catch { }
        setDeleteConfirmVisible(false);
        return showAlert(isRTL ? 'فشل الحذف' : 'Delete Failed', errorMessage);
      }
      await supabase.auth.signOut();
      setDeleteConfirmVisible(false);
      router.replace('/login');
    } catch (e: any) {
      console.error('Delete account error:', e);
      setDeleteConfirmVisible(false);
      showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to delete account.');
    } finally {
      setDeletingAccount(false);
    }
  }, [isRTL, showAlert, router]);

  const handleChangePassword = useCallback(() => {
    if (isPhoneUser) {
      return showAlert(
        isRTL ? 'مستخدم هاتف' : 'Phone User',
        isRTL
          ? 'حسابك مرتبط برقم الهاتف فقط. لا توجد كلمة مرور لتغييرها.'
          : 'Your account is linked to your phone number only. There is no password to change.'
      );
    }
    if (!user?.email) return;
    showAlert(
      isRTL ? 'تغيير كلمة المرور' : 'Change Password',
      isRTL ? `هل تريد إرسال رابط تغيير كلمة المرور إلى ${user.email}؟` : `Send a password reset link to ${user.email}?`,
      [
        { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isRTL ? 'إرسال الرابط' : 'Send Link',
          onPress: async () => {
            try {
              const supabase = getSupabaseClient();
              const redirectTo = Platform.OS === 'web'
                ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')
                : 'souqqalqilya://auth/callback';
              const { error } = await supabase.auth.resetPasswordForEmail(user.email!, { redirectTo });
              if (error) throw error;
              showAlert(isRTL ? 'تم الإرسال' : 'Email Sent', isRTL ? `تم إرسال رابط إعادة التعيين إلى ${user.email}` : `A reset link was sent to ${user.email}`);
            } catch (e: any) {
              console.error('Reset password error:', e);
              showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to send reset link');
            }
          },
        },
      ]
    );
  }, [isPhoneUser, isRTL, showAlert, user]);

  const handleTestNotification = useCallback(async () => {
    if (!user) return;
    setTestPushLoading(true);
    setTestPushResult('idle');
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('push-notify', {
        body: {
          recipient_id: user.id,
          sender_name: isRTL ? 'اختبار الإشعارات' : 'Push Test',
          message_preview: isRTL
            ? 'FCM/APNs يعمل بشكل صحيح ✅ — سوق قلقيلية'
            : 'FCM/APNs working correctly ✅ — Souq Qalqilya',
        },
      });
      if (error) {
        let errorMsg = error.message;
        try {
          const textContent = await (error as any).context?.text?.();
          if (textContent) {
            try { const parsed = JSON.parse(textContent); errorMsg = parsed?.error ?? textContent; } catch { errorMsg = textContent; }
          }
        } catch { /* ignore */ }
        setTestPushResult('error');
        showAlert(isRTL ? 'فشل الإرسال' : 'Send Failed', errorMsg);
      } else if (data?.skipped === 'no_token' || data?.skipped === 'invalid_token_format') {
        setTestPushResult('no_token');
        showAlert(
          isRTL ? 'لا يوجد رمز إشعارات' : 'No Push Token',
          isRTL
            ? 'لم يتم تسجيل رمز الإشعارات لهذا الجهاز. تأكد من منح صلاحية الإشعارات وأعد تشغيل التطبيق.'
            : 'No push token registered for this device. Please grant notification permission and restart the app.'
        );
      } else {
        setTestPushResult('success');
        showAlert(
          isRTL ? 'نجح الإرسال' : 'Notification Sent',
          isRTL
            ? 'تم إرسال الإشعار التجريبي. تحقق من شريط الإشعارات أعلى شاشتك.'
            : 'Test notification sent. Check your notification tray at the top of your screen.'
        );
      }
    } catch (e: any) {
      console.error('Test notification error:', e);
      setTestPushResult('error');
      showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to send test notification');
    } finally {
      setTestPushLoading(false);
      setTimeout(() => setTestPushResult('idle'), 6000);
    }
  }, [user, isRTL, showAlert]);

  const handleWhatsApp = useCallback(() => {
    const msg = encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE);
    Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${msg}`).catch(() => {});
  }, []);

  const openLink = useCallback((url: string) => Linking.openURL(url).catch(() => {}), []);

  // ── Main useEffect with AbortController ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    const signal = controller.signal;

    const loadData = async () => {
      try {
        load();
        setEditName(user.username || '');
        const admin = await checkIsAdmin();
        if (!signal.aborted) setIsAdmin(admin);

        // Fetch owner store
        const supabase = getSupabaseClient();
        const { data: storeData } = await supabase
          .from('stores')
          .select('id, name, name_ar, is_approved')
          .eq('owner_id', user.id)
          .maybeSingle();
        if (!signal.aborted) setOwnerStore(storeData as any);

        // Load profile data
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('avatar_url, banner_url, phone, is_verified, push_token')
          .eq('id', user.id)
          .single();

        if (!signal.aborted && profileData) {
          // Google photo sync
          if (!profileData.avatar_url) {
            try {
              const { data: { user: freshUser } } = await supabase.auth.getUser();
              const googlePhoto = freshUser?.user_metadata?.avatar_url ?? freshUser?.user_metadata?.picture ?? freshUser?.user_metadata?.photo_url;
              if (googlePhoto) {
                setAvatarUrl(googlePhoto);
                supabase.from('user_profiles').update({ avatar_url: googlePhoto }).eq('id', user.id).then().catch(console.error);
              }
            } catch { /* non-critical */ }
          } else {
            setAvatarUrl(profileData.avatar_url);
          }
          if (profileData.banner_url) setBannerUrl(profileData.banner_url);
          if (profileData.phone) setEditPhone(profileData.phone ?? '');
          setIsVerified(!!profileData.is_verified);
          setCurrentPushToken(profileData.push_token ?? null);
        }

        // Load blocked users
        await loadBlockedUsers();
      } catch (err) {
        if (!signal.aborted) console.error('Profile load error:', err);
      }
    };

    loadData();

    return () => {
      controller.abort();
    };
  }, [user?.id, load, loadBlockedUsers]);

  // ── Block changes subscription ────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToBlockChanges(loadBlockedUsers);
    return unsub;
  }, [loadBlockedUsers]);

  // ── Render functions ──────────────────────────────────────────────────────
  const renderAdItem = useCallback(({ item: ad }: { item: any }) => (
    <View style={styles.adRow}>
      <AdCard ad={ad} />
      <View style={[styles.adActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable
          style={[styles.adActionBtn, { backgroundColor: colors.primaryGhost, borderColor: colors.primary }]}
          onPress={() => router.push(`/edit-ad/${ad.id}` as any)}
        >
          <MaterialIcons name="edit" size={14} color={colors.primary} />
          <Text style={[styles.adActionBtnText, { color: colors.primary }]}>{isRTL ? 'تعديل' : 'Edit'}</Text>
        </Pressable>

        {ad.status === 'active' || ad.status === 'featured' ? (
          <Pressable
            style={[styles.adActionBtn, { backgroundColor: colors.successLight, borderColor: colors.success, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => handleMarkSold(ad.id)}
          >
            <MaterialIcons name="check-circle-outline" size={14} color={colors.success} />
            <Text style={[styles.adActionBtnText, { color: colors.success }]}>{t.markAsSold}</Text>
          </Pressable>
        ) : (
          <View style={[styles.soldChip, { backgroundColor: colors.accentLight }]}>
            <Text style={[styles.soldChipText, { color: colors.accentDark }]}>✓ {t.sold.toUpperCase()}</Text>
          </View>
        )}

        <Pressable
          style={[styles.adActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
          onPress={() => handleDeleteAd(ad.id, ad.title)}
        >
          <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
          <Text style={[styles.adActionBtnText, { color: '#EF4444' }]}>{isRTL ? 'حذف' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  ), [colors, isRTL, router, handleMarkSold, t, handleDeleteAd]);

  // ── Guest View ──
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.guestHero, { backgroundColor: colors.primary }]}>
          <View style={[styles.guestAvatarRing, { borderColor: 'rgba(255,255,255,0.3)' }]}>
            <View style={[styles.guestAvatarInner, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <MaterialIcons name="person-outline" size={40} color="rgba(255,255,255,0.9)" />
            </View>
          </View>
          <Text style={styles.guestHeroTitle}>{isRTL ? 'ملفي الشخصي' : 'My Profile'}</Text>
          <Text style={styles.guestHeroSub}>{t.notSignedInSub}</Text>
        </View>
        <View style={styles.guestBody}>
          <Pressable style={[styles.guestLoginBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/login')}>
            <MaterialIcons name="login" size={20} color="#fff" />
            <Text style={styles.guestLoginText}>{t.signInRegister}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── HERO ── */}
          <View style={[styles.hero, { backgroundColor: colors.primary }]}>
            {/* Avatar */}
            <Pressable style={styles.avatarWrap} onPress={handlePickAvatar} disabled={avatarLoading}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
                  <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.avatarCamBtn, { backgroundColor: colors.accent }]}>
                {avatarLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="camera-alt" size={13} color="#fff" />
                )}
              </View>
            </Pressable>

            {/* Name + badges */}
            <Text style={styles.heroName}>{displayName}</Text>
            <Text style={styles.heroEmail}>{displayEmail}</Text>

            <View style={styles.heroBadges}>
              {isAdmin ? (
                <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <MaterialIcons name="verified" size={12} color="#fff" />
                  <Text style={styles.heroBadgeText}>Admin</Text>
                </View>
              ) : null}
              {isVerified && !isAdmin ? (
                <View style={[styles.heroBadge, { backgroundColor: 'rgba(37,99,235,0.35)' }]}>
                  <MaterialIcons name="verified" size={12} color="#93C5FD" />
                  <Text style={[styles.heroBadgeText, { color: '#BFDBFE' }]}>{isRTL ? 'موثّق' : 'Verified'}</Text>
                </View>
              ) : null}
            </View>

            {/* Stats row */}
            <View style={[styles.statsRow, { backgroundColor: 'rgba(0,0,0,0.18)' }]}>
              {[
                { num: activeAds.length, label: t.active, icon: 'storefront' },
                { num: soldAds.length, label: t.sold, icon: 'check-circle-outline' },
                { num: ads.length, label: t.total, icon: 'list-alt' },
              ].map((s, i, arr) => (
                <React.Fragment key={s.label}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNum}>{s.num}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                  {i < arr.length - 1 ? <View style={styles.statDiv} /> : null}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* ── OWNER STORE CARD ── */}
          {ownerStore !== undefined && (
            ownerStore === null ? (
              <Pressable
                style={styles.storeCtaCard}
                onPress={() => router.push('/register-store' as any)}
              >
                <View style={[styles.storeCtaIcon, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="store" size={22} color="#fff" />
                </View>
                <View style={styles.storeCtaTextWrap}>
                  <Text style={[styles.storeCtaTitle, { color: colors.primary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? 'سجّل متجرك معنا 🛒' : 'Register Your Store 🛒'}
                  </Text>
                  <Text style={[styles.storeCtaSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? 'ابدأ البيع عبر التطبيق اليوم' : 'Start selling through the app today'}
                  </Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.primary} flexShrink={0} />
              </Pressable>
            ) : ownerStore.is_approved ? (
              <Pressable
                style={styles.storeCtaCard}
                onPress={() => router.push('/store-dashboard' as any)}
              >
                <View style={[styles.storeCtaIcon, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name="settings" size={22} color="#fff" />
                </View>
                <View style={styles.storeCtaTextWrap}>
                  <Text style={[styles.storeCtaTitle, { color: colors.primary, textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? '⚙️ إعدادات وإدارة متجري' : '⚙️ Manage My Store'}
                  </Text>
                  <Text style={[styles.storeCtaSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                    {isRTL ? (ownerStore.name_ar || ownerStore.name) : ownerStore.name}
                  </Text>
                </View>
                <View style={[styles.approvedBadge, { backgroundColor: '#D1FAE5' }]} >
                  <MaterialIcons name="check-circle" size={14} color="#16a34a" />
                  <Text style={styles.approvedText}>{isRTL ? 'مفعّل' : 'Active'}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.storeCtaCard, { borderColor: '#F59E0B' }]}
                onPress={() => router.push('/store-dashboard' as any)}
              >
                <View style={[styles.storeCtaIcon, { backgroundColor: '#F59E0B' }]}>
                  <MaterialIcons name="access-time" size={22} color="#fff" />
                </View>
                <View style={styles.storeCtaTextWrap}>
                  <Text style={[styles.storeCtaTitle, { color: '#D97706', textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? `متجرك ${ownerStore.name_ar || ownerStore.name} قيد المراجعة ⏳` : `Store "${ownerStore.name}" Under Review ⏳`}
                  </Text>
                  <Text style={[styles.storeCtaSub, { color: '#92400E', textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? 'سيتم تفعيله خلال 24 ساعة' : 'Will be activated within 24 hours'}
                  </Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color="#D97706" flexShrink={0} />
              </Pressable>
            )
          )}

          {/* ── QUICK ACTIONS ── */}
          <View style={[styles.actionsRow, { backgroundColor: colors.surface }]}>
            {quickActions.map((a) => (
              <Pressable
                key={a.label}
                style={({ pressed }) => [styles.actionTile, { opacity: pressed ? 0.7 : 1 }]}
                onPress={a.onPress}
              >
                <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
                  <MaterialIcons name={a.icon as any} size={22} color={a.color} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.textSecondary }]} numberOfLines={1}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* ── EDIT PROFILE ── */}
          {editMode ? (
            <View style={[styles.editCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.editCardHead, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.editCardIcon, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="edit" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.editCardTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{t.editProfile}</Text>
                <Pressable onPress={() => setEditMode(false)} hitSlop={8}><MaterialIcons name="close" size={20} color={colors.textMuted} /></Pressable>
              </View>

              {/* Banner upload row */}
              <Pressable
                style={[styles.bannerEditRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={handlePickBanner}
                disabled={bannerLoading}
              >
                <View style={[styles.bannerThumbPreview, { backgroundColor: colors.primaryGhost, overflow: 'hidden' }]}>
                  {bannerUrl ? (
                    <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <MaterialIcons name="panorama" size={22} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.avatarEditLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'صورة الغلاف' : 'Cover Photo'}</Text>
                  <Text style={[styles.avatarEditSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{bannerLoading ? (isRTL ? 'جارٍ الرفع...' : 'Uploading...') : (isRTL ? 'اضغط لتغيير الغلاف' : 'Tap to change cover')}</Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
              </Pressable>

              {/* Avatar row */}
              <Pressable style={[styles.avatarEditRow, { flexDirection: isRTL ? 'row-reverse' : 'row', borderColor: colors.border, backgroundColor: colors.background }]} onPress={handlePickAvatar} disabled={avatarLoading}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarSmall} contentFit="cover" />
                ) : (
                  <View style={[styles.avatarSmallPlaceholder, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarSmallText}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.avatarEditLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.changePhoto}</Text>
                  <Text style={[styles.avatarEditSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{avatarLoading ? t.loading : (isRTL ? 'اضغط لتغيير صورتك' : 'Tap to change')}</Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
              </Pressable>

              <View style={styles.editFields}>
                <Text style={[styles.editLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t.username}</Text>
                <TextInput
                  style={[styles.editInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t.usernamePlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={editName}
                  onChangeText={setEditName}
                />
                <Text style={[styles.editLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t.profilePhone}</Text>
                <TextInput
                  style={[styles.editInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t.profilePhonePlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={[styles.editBtns, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable style={[styles.editCancelBtn, { borderColor: colors.border }]} onPress={() => setEditMode(false)}>
                  <Text style={[styles.editCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text>
                </Pressable>
                <Pressable style={[styles.editSaveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSaveProfile} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="check" size={16} color="#fff" />}
                  <Text style={styles.editSaveText}>{saving ? t.loading : t.saveChanges}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* ── TAB SWITCHER ── */}
          <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              { key: 'listings', icon: 'storefront', label: isRTL ? 'إعلاناتي' : 'My Listings', count: ads.length },
              { key: 'settings', icon: 'settings', label: isRTL ? 'الإعدادات' : 'Settings', count: 0 },
            ].map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tabBtn, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
                  onPress={() => setActiveTab(tab.key as any)}
                >
                  <MaterialIcons name={tab.icon as any} size={18} color={isActive ? colors.primary : colors.textMuted} />
                  <Text style={[styles.tabBtnText, { color: isActive ? colors.primary : colors.textMuted, fontWeight: isActive ? '700' : '500' }]}>{tab.label}</Text>
                  {tab.count > 0 ? (
                    <View style={[styles.tabCount, { backgroundColor: isActive ? colors.primary : colors.border }]}>
                      <Text style={[styles.tabCountText, { color: isActive ? '#fff' : colors.textMuted }]}>{tab.count}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* ═══════════════════════ MY LISTINGS TAB ═══════════════════════ */}
          {activeTab === 'listings' ? (
            <View style={styles.listingsSection}>
              {/* Post new button */}
              <Pressable
                style={[styles.postNewBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/(tabs)/post')}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.postNewText}>{t.postNew}</Text>
              </Pressable>

              {loading && ads.length === 0 ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 40 }} />
              ) : ads.length === 0 ? (
                <View style={[styles.emptyListings, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.emptyIcon, { backgroundColor: colors.primaryGhost }]}>
                    <MaterialIcons name="storefront" size={32} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t.noListingsYet}</Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>{t.noListingsYetSub}</Text>
                </View>
              ) : (
                <FlatList
                  data={ads}
                  keyExtractor={item => item.id}
                  renderItem={renderAdItem}
                  scrollEnabled={false}
                  contentContainerStyle={{ gap: Spacing.sm }}
                />
              )}
            </View>
          ) : null}

          {/* ═══════════════════════ SETTINGS TAB ═══════════════════════════ */}
          {activeTab === 'settings' ? (
            <View style={styles.settingsSection}>
              {/* ── APPEARANCE ── */}
              <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <SectionHeader icon="palette" label={isRTL ? 'المظهر' : 'Appearance'} color={colors.primary} bg={colors.primaryGhost} />

                <SettingRow
                  icon={isDark ? 'dark-mode' : 'light-mode'}
                  iconBg={isDark ? '#1E2A3A' : '#FFF7ED'}
                  iconColor={isDark ? '#60A5FA' : '#F59E0B'}
                  label={t.darkMode}
                  sub={isDark ? t.darkModeActive : t.lightModeActive}
                  isRTL={isRTL} colors={colors}
                  right={<AnimatedSwitch value={isDark} onValueChange={toggleTheme} colors={colors} />}
                />

                {/* ── FONT SIZE PICKER ── */}
                <FontScalePicker
                  level={fontScaleLevel}
                  onChange={setFontScaleLevel}
                  isRTL={isRTL}
                  colors={colors}
                />

                <SettingRow
                  icon="language"
                  iconBg={colors.primaryGhost}
                  iconColor={colors.primary}
                  label={t.language}
                  sub={t.languageSub}
                  isRTL={isRTL} colors={colors}
                  borderBottom={false}
                  right={
                    <View style={[styles.langToggle, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.background, borderColor: colors.border }]}>
                      {(['en', 'ar'] as Language[]).map(lang => (
                        <Pressable key={lang} style={[styles.langOption, { backgroundColor: language === lang ? colors.primary : 'transparent' }]} onPress={() => setLanguage(lang)}>
                          <Text style={[styles.langOptionText, { color: language === lang ? '#fff' : colors.textSecondary, fontWeight: language === lang ? '700' : '500' }]}>
                            {lang === 'en' ? 'EN' : 'ع'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  }
                />
              </View>

              {/* ── SECURITY ── */}
              <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <SectionHeader icon="security" label={isRTL ? 'الأمان والخصوصية' : 'Security & Privacy'} color="#7C3AED" bg="#EDE9FE" />

                <SettingRow
                  icon="lock-reset" iconBg="#EDE9FE" iconColor="#7C3AED"
                  label={isRTL ? 'تغيير كلمة المرور' : 'Change Password'}
                  sub={isRTL ? 'إرسال رابط إعادة تعيين' : 'Send a password reset link'}
                  isRTL={isRTL} colors={colors} onPress={handleChangePassword} borderBottom={false}
                />
              </View>

              {/* ── HELP CENTER ── */}
              <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <SectionHeader icon="support-agent" label={isRTL ? 'مركز المساعدة' : 'Help Center'} color="#0A6E5C" bg={colors.primaryGhost} />

                {/* ── AI SUPPORT CHAT ── */}
                <View style={[styles.waWrap, { borderBottomColor: colors.borderLight }]}>
                  <Pressable
                    style={({ pressed }) => [styles.waCard, { opacity: pressed ? 0.88 : 1, backgroundColor: colors.primary }]}
                    onPress={() => router.push('/ai-support')}
                  >
                    <View style={styles.waIconBadge}>
                      <MaterialIcons name="smart-toy" size={26} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.waTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
                        {isRTL ? 'مساعد سوق قلقيلية الذكي' : 'Souq Qalqilya AI Assistant'}
                      </Text>
                      <Text style={[styles.waSub, { textAlign: isRTL ? 'right' : 'left' }]}>
                        {isRTL ? 'إجابات فورية على أسئلتك بالعربية' : 'Instant answers to your questions'}
                      </Text>
                    </View>
                    <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                </View>

                {/* WhatsApp */}
                <View style={[styles.waWrap, { borderBottomColor: colors.borderLight }]}>
                  <Pressable style={({ pressed }) => [styles.waCard, { opacity: pressed ? 0.88 : 1 }]} onPress={handleWhatsApp}>
                    <View style={styles.waIconBadge}><MaterialIcons name="support-agent" size={26} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.waTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t.contactSupport}</Text>
                      <Text style={[styles.waSub, { textAlign: isRTL ? 'right' : 'left' }]}>{t.contactSupportSub}</Text>
                    </View>
                    <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color="#fff" />
                  </Pressable>
                </View>

                <SettingRow
                  icon="facebook" iconBg="#DBEAFE" iconColor="#1877F2"
                  label={isRTL ? 'صفحة فيسبوك' : 'Facebook Page'}
                  sub={isRTL ? 'تابعنا على فيسبوك' : 'Follow us on Facebook'}
                  isRTL={isRTL} colors={colors} onPress={() => openLink(FACEBOOK_URL)}
                />
                <SettingRow
                  icon="photo-camera" iconBg="#FCE7F3" iconColor="#C13584"
                  label={isRTL ? 'صفحة إنستغرام' : 'Instagram Profile'}
                  sub={isRTL ? 'تابعنا على إنستغرام' : 'Follow us on Instagram'}
                  isRTL={isRTL} colors={colors} onPress={() => openLink(INSTAGRAM_URL)}
                />
                <SettingRow
                  icon="help-outline" iconBg="#FEF3C7" iconColor="#D97706"
                  label={isRTL ? 'الأسئلة الشائعة' : 'FAQs'}
                  sub={isRTL ? 'إجابات على الأسئلة الشائعة' : 'Common questions answered'}
                  isRTL={isRTL} colors={colors} onPress={() => router.push('/faq')}
                />
                <SettingRow
                  icon="bug-report" iconBg="#FEE2E2" iconColor="#EF4444"
                  label={isRTL ? 'الإبلاغ عن مشكلة' : 'Report a Bug'}
                  sub={isRTL ? 'أرسل وصف المشكلة' : 'Send an issue description'}
                  isRTL={isRTL} colors={colors} borderBottom={false}
                  onPress={() => router.push('/support-form')}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.newBadgeText}>{isRTL ? 'جديد' : 'NEW'}</Text>
                      </View>
                      <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
                    </View>
                  }
                />
              </View>

              {/* ── ACCOUNT ── */}
              <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <SectionHeader icon="manage-accounts" label={isRTL ? 'الحساب' : 'Account'} color={colors.error} bg={colors.errorLight} />

                <SettingRow
                  icon="privacy-tip" iconBg={colors.primaryGhost} iconColor={colors.primary}
                  label={t.privacyPolicy} sub={t.privacyPolicySub}
                  isRTL={isRTL} colors={colors} onPress={() => router.push('/privacy')}
                />
                <SettingRow
                  icon="logout" iconBg={colors.errorLight} iconColor={colors.error}
                  label={t.signOut}
                  isRTL={isRTL} colors={colors} danger onPress={handleLogout}
                />
                <SettingRow
                  icon="delete-forever" iconBg="#FEE2E2" iconColor="#DC2626"
                  label={isRTL ? 'حذف الحساب' : 'Delete Account'}
                  sub={isRTL ? 'حذف نهائي لجميع البيانات' : 'Permanently removes all your data'}
                  isRTL={isRTL} colors={colors} danger borderBottom={false}
                  onPress={handleDeleteAccount}
                />
              </View>

              {/* ── PUSH NOTIFICATION TEST ── */}
              {Platform.OS !== 'web' ? (
                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SectionHeader
                    icon="notifications-active"
                    label={isRTL ? 'اختبار الإشعارات' : 'Notification Test'}
                    color="#D97706"
                    bg="#FEF3C7"
                  />

                  {/* Token status row */}
                  <View style={[ptStyles.tokenRow, { backgroundColor: colors.background, borderColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <MaterialIcons
                      name={currentPushToken ? 'vpn-key' : 'warning'}
                      size={14}
                      color={currentPushToken ? colors.primary : '#D97706'}
                    />
                    <Text style={[ptStyles.tokenLabel, { color: colors.textMuted }]} numberOfLines={1}>
                      {currentPushToken
                        ? `Token: ...${currentPushToken.slice(-16)}`
                        : (isRTL ? 'لا يوجد رمز — امنح صلاحية الإشعارات' : 'No token — grant notification permission')}
                    </Text>
                  </View>

                  {/* Test button */}
                  <Pressable
                    style={({ pressed }) => [
                      ptStyles.testBtn,
                      {
                        backgroundColor:
                          testPushResult === 'success' ? '#16A34A'
                          : testPushResult === 'error' || testPushResult === 'no_token' ? '#DC2626'
                          : '#D97706',
                        opacity: testPushLoading || pressed ? 0.75 : 1,
                      },
                    ]}
                    onPress={handleTestNotification}
                    disabled={testPushLoading}
                  >
                    {testPushLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <MaterialIcons
                        name={
                          testPushResult === 'success' ? 'check-circle'
                          : testPushResult === 'error' || testPushResult === 'no_token' ? 'error-outline'
                          : 'send'
                        }
                        size={18}
                        color="#fff"
                      />
                    )}
                    <Text style={ptStyles.testBtnText}>
                      {testPushLoading
                        ? (isRTL ? 'جارٍ الإرسال...' : 'Sending...')
                        : testPushResult === 'success'
                        ? (isRTL ? 'نجح الإرسال ✓' : 'Sent Successfully ✓')
                        : testPushResult === 'error'
                        ? (isRTL ? 'فشل — اضغط للمحاولة' : 'Failed — Tap to retry')
                        : testPushResult === 'no_token'
                        ? (isRTL ? 'لا يوجد رمز إشعارات' : 'No Push Token Registered')
                        : (isRTL ? 'إرسال إشعار تجريبي' : 'Send Test Notification')}
                    </Text>
                  </Pressable>

                  {/* Hint */}
                  <Text style={[ptStyles.hint, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL
                      ? 'يرسل إشعاراً لهذا الجهاز عبر Expo Push API للتحقق من FCM/APNs قبل الرفع للمتاجر'
                      : 'Sends a push to this device via Expo Push API to verify FCM/APNs before store submission'}
                  </Text>
                </View>
              ) : null}

              {/* ── BLOCKED USERS ── */}
              {blockedUsers.length > 0 ? (
                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Pressable
                    style={[styles.blockedHead, { flexDirection: isRTL ? 'row-reverse' : 'row', borderBottomColor: blockedExpanded ? colors.borderLight : 'transparent' }]}
                    onPress={() => setBlockedExpanded(v => !v)}
                  >
                    <View style={[styles.sRowIcon, { backgroundColor: '#FEE2E2' }]}>
                      <MaterialIcons name="block" size={18} color="#EF4444" />
                    </View>
                    <Text style={[styles.sRowLabel, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>
                      {isRTL ? 'المستخدمون المحظورون' : 'Blocked Users'}
                    </Text>
                    <View style={styles.blockedBadge}><Text style={styles.blockedBadgeText}>{blockedUsers.length}</Text></View>
                    <MaterialIcons name={blockedExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={colors.textMuted} />
                  </Pressable>

                  {blockedExpanded ? (
                    <View style={styles.blockedList}>
                      {blockedUsers.map((bu, idx) => {
                        const buName = bu.username || bu.email?.split('@')[0] || 'User';
                        return (
                          <View key={bu.id} style={[styles.blockedItem, { borderBottomColor: colors.borderLight, borderBottomWidth: idx === blockedUsers.length - 1 ? 0 : 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                            {bu.avatar_url ? (
                              <Image source={{ uri: bu.avatar_url }} style={styles.blockedAvatar} contentFit="cover" transition={200} />
                            ) : (
                              <View style={[styles.blockedAvatarPh, { backgroundColor: colors.primaryGhost }]}>
                                <Text style={[styles.blockedAvatarText, { color: colors.primary }]}>{buName.charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.blockedName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{buName}</Text>
                              <Text style={[styles.blockedEmail, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{bu.email}</Text>
                            </View>
                            <Pressable
                              style={[styles.unblockBtn, { backgroundColor: colors.primaryGhost, opacity: unblockingId === bu.id ? 0.5 : 1 }]}
                              onPress={() => handleUnblock(bu.id, buName)}
                              disabled={unblockingId === bu.id}
                            >
                              <MaterialIcons name="lock-open" size={13} color={colors.primary} />
                              <Text style={[styles.unblockBtnText, { color: colors.primary }]}>{isRTL ? 'رفع' : 'Unblock'}</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* ── VERSION FOOTER ── */}
              <View style={styles.versionFooter}>
                <View style={[styles.versionDot, { backgroundColor: colors.border }]} />
                <View style={styles.versionRow}>
                  <MaterialIcons name="info-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.versionText, { color: colors.textMuted }]}>
                    {isRTL ? `سوق قلقيلية · الإصدار ${APP_VERSION}` : `Souq Qalqilya · Version ${APP_VERSION}`}
                  </Text>
                </View>
                <Text style={[styles.versionSub, { color: colors.border }]}>
                  {isRTL ? 'بُني بـ ❤ من فريق بلانكتون' : 'Built with ❤ by Plankton Team'}
                </Text>
              </View>

              <View style={{ height: 32 }} />
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* ── DELETE ACCOUNT MODAL ── */}
      <Modal visible={deleteConfirmVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.deleteIconWrap}>
              <View style={[styles.deleteIconOuter, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="delete-forever" size={34} color="#DC2626" />
              </View>
            </View>
            <Text style={[styles.deleteTitleText, { color: '#DC2626' }]}>
              {isRTL ? 'حذف الحساب نهائياً' : 'Permanently Delete Account'}
            </Text>
            <Text style={[styles.deleteSubText, { color: colors.textMuted }]}>
              {isRTL ? 'هذا الإجراء لا يمكن التراجع عنه.' : 'This action cannot be undone.'}
            </Text>
            <View style={[styles.deleteWarningsCard, { backgroundColor: colors.errorLight, borderColor: '#FCA5A5' }]}>
              {[
                isRTL ? 'سيتم حذف جميع إعلاناتك المنشورة' : 'All your listings will be permanently deleted',
                isRTL ? 'ستُحذف جميع محادثاتك ورسائلك' : 'All your conversations will be erased',
                isRTL ? 'لن تتمكن من استرداد حسابك أبداً' : 'Your account cannot be recovered',
              ].map((warn, i) => (
                <View key={i} style={[styles.deleteWarnRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <MaterialIcons name="cancel" size={14} color="#DC2626" style={{ flexShrink: 0 }} />
                  <Text style={[styles.deleteWarnText, { color: '#7F1D1D', textAlign: isRTL ? 'right' : 'left' }]}>{warn}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.deleteActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={[styles.deleteCancelBtn, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={() => setDeleteConfirmVisible(false)} disabled={deletingAccount}>
                <Text style={[styles.deleteCancelText, { color: colors.textSecondary }]}>{isRTL ? 'إلغاء' : 'Cancel'}</Text>
              </Pressable>
              <Pressable style={[styles.deleteConfirmBtn, { opacity: deletingAccount ? 0.7 : 1 }]} onPress={confirmDeleteAccount} disabled={deletingAccount}>
                {deletingAccount ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <MaterialIcons name="delete-forever" size={15} color="#fff" />
                    <Text style={styles.deleteConfirmText}>{isRTL ? 'نعم، احذف حسابي' : 'Delete My Account'}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  storeCtaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 16, marginTop: 16,
    borderWidth: 1, borderColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4,
  },
  storeCtaIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  storeCtaTextWrap: { flex: 1, marginHorizontal: 12 },
  storeCtaTitle: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  storeCtaSub: { fontSize: FontSize.xs, lineHeight: 16 },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  approvedText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },

  // ── Guest
  guestHero: { paddingTop: 60, paddingBottom: 48, alignItems: 'center', gap: 12 },
  guestAvatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  guestAvatarInner: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center' },
  guestHeroTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  guestHeroSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', textAlign: 'center', paddingHorizontal: 32 },
  guestBody: { padding: Spacing.lg },
  guestLoginBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: Radius.xl, ...Shadow.colored },
  guestLoginText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },

  // ── Hero
  hero: { paddingBottom: Spacing.xxl, alignItems: 'center', paddingTop: 0, overflow: 'hidden' },
  bannerTouchArea: { width: '100%', height: 110, position: 'relative', overflow: 'hidden', marginBottom: -(46) },
  bannerPlaceholder: { width: '100%', height: 110 },
  bannerEditBadge: { position: 'absolute', bottom: 8, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  bannerEditText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  avatarWrap: { position: 'relative', marginBottom: 12, marginTop: 8 },
  avatarImg: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: '#fff' },
  avatarPlaceholder: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 34, fontWeight: '800', color: '#fff' },
  avatarCamBtn: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroName: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', marginBottom: 3, letterSpacing: -0.3 },
  heroEmail: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginBottom: Spacing.sm },
  heroBadges: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: Spacing.xl, width: '100%', justifyContent: 'center', marginTop: 4 },
  statItem: { alignItems: 'center', gap: 2, flex: 1 },
  statNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' },
  statDiv: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)' },

  // ── Quick Actions
  actionsRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  actionTile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: Spacing.sm },
  actionIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' },

  // ── Banner in edit
  bannerEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, marginBottom: 4 },
  bannerThumbPreview: { width: 64, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  // ── Edit Card
  editCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  editCardHead: { alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, marginBottom: 4 },
  editCardIcon: { width: 30, height: 30, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  editCardTitle: { fontSize: FontSize.md, fontWeight: '700' },
  avatarEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  avatarSmall: { width: 46, height: 46, borderRadius: 23 },
  avatarSmallPlaceholder: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: '#fff', fontWeight: '800', fontSize: FontSize.lg },
  avatarEditLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  avatarEditSub: { fontSize: FontSize.xs, marginTop: 2 },
  editFields: { gap: Spacing.sm },
  editLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 2 },
  editInput: { minHeight: 48, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.md },
  editBtns: { gap: Spacing.sm, marginTop: 4 },
  editCancelBtn: { flex: 1, height: 44, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  editCancelText: { fontSize: FontSize.md, fontWeight: '600' },
  editSaveBtn: { flex: 2, height: 44, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  editSaveText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  // ── Tab Bar
  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabBtnText: { fontSize: FontSize.sm },
  tabCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, minWidth: 20, alignItems: 'center' },
  tabCountText: { fontSize: 10, fontWeight: '800' },

  // ── Listings
  listingsSection: { padding: Spacing.lg, gap: Spacing.sm },
  postNewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: Radius.xl, marginBottom: Spacing.sm, ...Shadow.colored },
  postNewText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  emptyListings: { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm, borderWidth: 1 },
  emptyIcon: { width: 64, height: 64, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptySub: { fontSize: FontSize.sm, textAlign: 'center' },
  adRow: { marginBottom: Spacing.sm },
  adActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 6 },
  adActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5 },
  adActionBtnText: { fontSize: FontSize.xs, fontWeight: '700' },
  soldChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  soldChipText: { fontSize: FontSize.xs, fontWeight: '700' },

  // ── Settings
  settingsSection: { padding: Spacing.lg, gap: Spacing.md },
  settingsCard: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', ...Shadow.xs },
  sRowInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 13 },
  sRowIcon: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sRowLabel: { fontSize: FontSize.md, fontWeight: '600' },
  sRowSub: { fontSize: FontSize.xs, marginTop: 2 },

  // Language toggle
  langToggle: { borderRadius: Radius.full, borderWidth: 1.5, overflow: 'hidden', flexDirection: 'row' },
  langOption: { paddingHorizontal: 14, paddingVertical: 7, minWidth: 40, alignItems: 'center' },
  langOptionText: { fontSize: FontSize.sm },

  // WhatsApp card
  waWrap: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  waCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: '#25D366', borderRadius: Radius.xl, paddingVertical: 12, paddingHorizontal: Spacing.md, shadowColor: '#25D366', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  waIconBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  waTitle: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff', marginBottom: 2 },
  waSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)' },

  // New badge
  newBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3 },
  newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Blocked users
  blockedHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 13, borderBottomWidth: 1 },
  blockedBadge: { backgroundColor: '#EF4444', borderRadius: Radius.full, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  blockedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  blockedList: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  blockedItem: { alignItems: 'center', gap: Spacing.md, paddingVertical: 11 },
  blockedAvatar: { width: 42, height: 42, borderRadius: 21 },
  blockedAvatarPh: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  blockedAvatarText: { fontSize: FontSize.lg, fontWeight: '800' },
  blockedName: { fontSize: FontSize.sm, fontWeight: '700' },
  blockedEmail: { fontSize: FontSize.xs, marginTop: 2 },
  unblockBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full },
  unblockBtnText: { fontSize: FontSize.xs, fontWeight: '700' },

  // Version footer
  versionFooter: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8 },
  versionDot: { width: 40, height: 1.5, borderRadius: 99 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  versionText: { fontSize: FontSize.xs, fontWeight: '500' },
  versionSub: { fontSize: 10, fontWeight: '500' },

  // Delete account modal
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  deleteSheet: { borderRadius: Radius.xxl, padding: Spacing.lg, width: '100%', maxWidth: 360, gap: Spacing.md, ...Shadow.lg },
  deleteIconWrap: { alignItems: 'center', marginBottom: 4 },
  deleteIconOuter: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FCA5A5' },
  deleteTitleText: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  deleteSubText: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, marginTop: -4 },
  deleteWarningsCard: { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, gap: 9 },
  deleteWarnRow: { alignItems: 'flex-start', gap: 8 },
  deleteWarnText: { fontSize: FontSize.sm, lineHeight: 20, flex: 1 },
  deleteActions: { gap: Spacing.sm, marginTop: 4 },
  deleteCancelBtn: { flex: 1, height: 48, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  deleteCancelText: { fontSize: FontSize.md, fontWeight: '600' },
  deleteConfirmBtn: { flex: 2, height: 48, borderRadius: Radius.lg, backgroundColor: '#DC2626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: '#DC2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  deleteConfirmText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '800' },
});

const ptStyles = StyleSheet.create({
  tokenRow: {
    marginHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: 2,
  },
  tokenLabel: { fontSize: FontSize.xs, fontWeight: '500', flex: 1 },
  testBtn: {
    marginHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: Radius.lg,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  testBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  hint: {
    fontSize: FontSize.xs,
    lineHeight: 17,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: Spacing.md,
  },
});