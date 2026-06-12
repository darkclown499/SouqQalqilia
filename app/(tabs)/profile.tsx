import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  KeyboardAvoidingView, Platform, Linking, Modal, ActivityIndicator,
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

// ─── Section Header ───────────────────────────────────────────────────────────
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
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { ads, loading, load } = useMyAds();

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

  const textAlign = { textAlign: isRTL ? ('right' as const) : ('left' as const) };

  useEffect(() => {
    if (user) {
      load();
      setEditName(user.username || '');
      checkIsAdmin().then(setIsAdmin);
      getSupabaseClient()
        .from('user_profiles')
        .select('avatar_url, banner_url, phone, is_verified')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.avatar_url) setAvatarUrl(data.avatar_url);
          if (data?.banner_url) setBannerUrl(data.banner_url);
          if (data?.phone) setEditPhone(data.phone ?? '');
          setIsVerified(!!data?.is_verified);
        });
      loadBlockedUsers();
    }
  }, [user]);

  useEffect(() => {
    const unsub = subscribeToBlockChanges(() => loadBlockedUsers());
    return unsub;
  }, [loadBlockedUsers]);

  const loadBlockedUsers = useCallback(async () => {
    const ids = await fetchBlockedIds();
    if (ids.length === 0) { setBlockedUsers([]); return; }
    const { data } = await getSupabaseClient()
      .from('user_profiles')
      .select('id, username, email, avatar_url')
      .in('id', ids);
    setBlockedUsers((data ?? []) as any);
  }, []);

  const handleUnblock = (userId: string, name: string) => {
    showAlert(
      isRTL ? 'رفع الحظر' : 'Unblock User',
      isRTL ? `هل تريد رفع الحظر عن "${name}"؟` : `Unblock "${name}"?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isRTL ? 'رفع الحظر' : 'Unblock',
          onPress: async () => {
            setUnblockingId(userId);
            await unblockUser(userId);
            setBlockedUsers(prev => prev.filter(u => u.id !== userId));
            setUnblockingId(null);
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    showAlert(t.signOut, t.signOutConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.signOut, style: 'destructive', onPress: async () => {
          const { error } = await logout();
          if (error) showAlert('Error', error);
        },
      },
    ]);
  };

  const handleDeleteAd = (adId: string, adTitle: string) => {
    showAlert(
      isRTL ? 'حذف الإعلان' : 'Delete Listing',
      isRTL ? `هل أنت متأكد من حذف "${adTitle}"؟` : `Delete "${adTitle}"?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isRTL ? 'حذف' : 'Delete', style: 'destructive',
          onPress: async () => { await updateAdStatus(adId, 'deleted'); load(); },
        },
      ]
    );
  };

  const handleMarkSold = (adId: string) => {
    showAlert(t.markAsSold, t.markAsSoldConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.confirm, onPress: async () => { await updateAdStatus(adId, 'sold'); load(); } },
    ]);
  };

  const handlePickAvatar = async () => {
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
      showAlert('Error', e.message ?? 'Failed to update avatar.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handlePickBanner = async () => {
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
      showAlert('Error', e.message ?? 'Failed to update banner.');
    } finally {
      setBannerLoading(false);
    }
  };

  const handleSaveProfile = async () => {
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
      showAlert('Error', e.message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => setDeleteConfirmVisible(true);

  const confirmDeleteAccount = async () => {
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
      setDeleteConfirmVisible(false);
      showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to delete account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleChangePassword = () => {
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
              showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to send reset link');
            }
          },
        },
      ]
    );
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE);
    Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${msg}`).catch(() => {});
  };

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

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

  // For phone-auth users, show real phone number instead of synthetic email
  const isPhoneUser = (user.email ?? '').includes('@sms.souqqalqilya.local');
  // Derive display contact: prefer stored editPhone, fallback to extracting from synthetic email
  const extractedPhone = (user.email ?? '').replace(/^phone_(\d+)@sms\.souqqalqilya\.local$/, '+$1');
  const displayEmail = isPhoneUser
    ? (editPhone || extractedPhone)
    : (user.email ?? '');
  const displayName = localDisplayName ?? user.username ?? user.email?.split('@')[0] ?? 'User';
  const activeAds = ads.filter(a => a.status === 'active' || a.status === 'featured');
  const soldAds = ads.filter(a => a.status === 'sold');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScrollView showsVerticalScrollIndicator={false}>

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
                <MaterialIcons name={avatarLoading ? 'hourglass-empty' : 'camera-alt'} size={13} color="#fff" />
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

          {/* ── QUICK ACTIONS ── */}
          <View style={[styles.actionsRow, { backgroundColor: colors.surface }]}>
            {[
              { icon: 'edit', label: isRTL ? 'تعديل الملف' : 'Edit Profile', color: colors.primary, bg: colors.primaryGhost, onPress: () => setEditMode(v => !v) },
              { icon: 'person', label: isRTL ? 'ملفي العام' : 'My Page', color: '#7C3AED', bg: '#EDE9FE', onPress: () => user && router.push(`/seller/${user.id}` as any) },
              { icon: 'add-circle-outline', label: isRTL ? 'نشر إعلان' : 'Post Ad', color: colors.primary, bg: colors.primaryGhost, onPress: () => router.push('/(tabs)/post') },
              { icon: 'favorite-border', label: isRTL ? 'المفضلة' : 'Favorites', color: '#EF4444', bg: '#FEE2E2', onPress: () => router.push('/favorites') },
              ...(isAdmin ? [{ icon: 'admin-panel-settings', label: isRTL ? 'الإدارة' : 'Admin', color: '#D97706', bg: '#FEF3C7', onPress: () => router.push('/admin') }] : []),
            ].map((a) => (
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

              {ads.length === 0 && !loading ? (
                <View style={[styles.emptyListings, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.emptyIcon, { backgroundColor: colors.primaryGhost }]}>
                    <MaterialIcons name="storefront" size={32} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t.noListingsYet}</Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>{t.noListingsYetSub}</Text>
                </View>
              ) : (
                ads.map(ad => (
                  <View key={ad.id} style={styles.adRow}>
                    <AdCard ad={ad} />
                    <View style={[styles.adActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      {/* Edit button */}
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

                      {/* Delete button */}
                      <Pressable
                        style={[styles.adActionBtn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                        onPress={() => handleDeleteAd(ad.id, ad.title)}
                      >
                        <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
                        <Text style={[styles.adActionBtnText, { color: '#EF4444' }]}>{isRTL ? 'حذف' : 'Delete'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

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
  editInput: { height: 48, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.md },
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
