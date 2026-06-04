import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput,
  KeyboardAvoidingView, Platform, Linking, Animated as RNAnimated,
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
import { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_MESSAGE } from '@/constants/config';
import type { Language } from '@/constants/i18n';

const APP_VERSION = '1.0.5';
const FACEBOOK_URL = 'https://www.facebook.com/share/1L5KLdnkaY/';
const INSTAGRAM_URL = 'https://www.instagram.com/co.plankton?igsh=MWV4Z2RncTVoYW81ZA==';

// ─── Animated Dark Mode Switch ────────────────────────────────────────────────
function AnimatedSwitch({ value, onValueChange, colors }: {
  value: boolean; onValueChange: (v: boolean) => void; colors: any;
}) {
  const translateX = useSharedValue(value ? 22 : 2);
  const trackColor = useSharedValue(value ? 1 : 0);
  const starOpacity = useSharedValue(value ? 1 : 0);
  const sunRotate = useSharedValue(value ? 0 : 1);

  const handleToggle = useCallback(() => {
    const next = !value;
    translateX.value = withSpring(next ? 22 : 2, { damping: 12, stiffness: 200 });
    trackColor.value = withTiming(next ? 1 : 0, { duration: 280 });
    starOpacity.value = withTiming(next ? 1 : 0, { duration: 240 });
    sunRotate.value = withSequence(
      withSpring(next ? 0 : 1.2, { damping: 10, stiffness: 180 }),
      withSpring(next ? 0 : 1, { damping: 14, stiffness: 120 })
    );
    onValueChange(next);
  }, [value]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: trackColor.value > 0.5 ? colors.primary : colors.border,
  }));

  const moonStyle = useAnimatedStyle(() => ({
    opacity: starOpacity.value,
    transform: [{ scale: withSpring(value ? 1 : 0.4, { damping: 12 }) }],
  }));

  const sunStyle = useAnimatedStyle(() => ({
    opacity: withTiming(value ? 0 : 1, { duration: 200 }),
    transform: [{ scale: withSpring(value ? 0.4 : 1, { damping: 12 }) }],
  }));

  return (
    <Pressable onPress={handleToggle} hitSlop={8}>
      <Animated.View style={[switchS.track, trackStyle]}>
        {/* Moon icon */}
        <Animated.View style={[switchS.icon, moonStyle]}>
          <MaterialIcons name="nightlight-round" size={14} color="#fff" />
        </Animated.View>
        {/* Sun icon */}
        <Animated.View style={[switchS.icon, sunStyle]}>
          <MaterialIcons name="wb-sunny" size={14} color="#F59E0B" />
        </Animated.View>
        {/* Thumb */}
        <Animated.View style={[switchS.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const switchS = StyleSheet.create({
  track: {
    width: 50, height: 28, borderRadius: 14,
    position: 'relative', overflow: 'hidden',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 3,
  },
  icon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    left: 0, right: 0, top: 0, bottom: 0,
  },
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
  const [isVerified, setIsVerified] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; username: string; email: string; avatar_url: string | null }[]>([]);
  const [blockedExpanded, setBlockedExpanded] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const textAlign = { textAlign: isRTL ? ('right' as const) : ('left' as const) };

  useEffect(() => {
    if (user) {
      load();
      setEditName(user.username || '');
      checkIsAdmin().then(setIsAdmin);
      getSupabaseClient()
        .from('user_profiles')
        .select('avatar_url, phone, is_verified')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.avatar_url) setAvatarUrl(data.avatar_url);
          if (data?.phone) setEditPhone(data.phone ?? '');
          setIsVerified(!!data?.is_verified);
        });
      loadBlockedUsers();
    }
  }, [user]);

  useEffect(() => {
    const unsub = subscribeToBlockChanges(() => loadBlockedUsers());
    return unsub;
  }, []);

  const loadBlockedUsers = async () => {
    const ids = await fetchBlockedIds();
    if (ids.length === 0) { setBlockedUsers([]); return; }
    const { data } = await getSupabaseClient()
      .from('user_profiles')
      .select('id, username, email, avatar_url')
      .in('id', ids);
    setBlockedUsers((data ?? []) as any);
  };

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

  const handleDeleteAccount = () => {
    showAlert(
      isRTL ? 'حذف الحساب' : 'Delete Account',
      isRTL ? 'هل أنت متأكد من حذف حسابك نهائياً؟ سيؤدي هذا إلى مسح كافة بياناتك ولا يمكن التراجع عن هذا الإجراء.' : 'Are you sure you want to permanently delete your account? This will erase all your data and cannot be undone.',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isRTL ? 'تأكيد الحذف' : 'Confirm Delete', style: 'destructive',
          onPress: async () => {
            try {
              const supabase = getSupabaseClient();
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.access_token) return showAlert(isRTL ? 'خطأ' : 'Error', isRTL ? 'لا توجد جلسة نشطة. يرجى تسجيل الدخول مجدداً.' : 'No active session. Please sign in again.');
              const { data, error } = await supabase.functions.invoke('delete-account', { body: {}, headers: { Authorization: `Bearer ${session.access_token}` } });
              if (error) {
                let errorMessage = error.message;
                try { const text = await (error as any).context?.text?.(); if (text) { const parsed = JSON.parse(text); errorMessage = parsed?.error ?? text; } } catch { }
                return showAlert(isRTL ? 'فشل الحذف' : 'Delete Failed', errorMessage);
              }
              await supabase.auth.signOut();
              router.replace('/login');
            } catch (e: any) {
              showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to delete account.');
            }
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    try {
      const supabase = getSupabaseClient();
      const redirectTo = Platform.OS === 'web'
        ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')
        : 'souqqalqilya://auth/callback';
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
      if (error) throw error;
      showAlert(
        isRTL ? 'تم الإرسال' : 'Email Sent',
        isRTL ? `تم إرسال رابط تغيير كلمة المرور إلى ${user.email}` : `A password reset link has been sent to ${user.email}`
      );
    } catch (e: any) {
      showAlert(isRTL ? 'خطأ' : 'Error', e.message ?? 'Failed to send reset link');
    }
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE);
    Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${msg}`).catch(() => {});
  };

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  if (!user) {
    return (
      <View style={[styles.guestOuter, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.guestHeader, { backgroundColor: colors.primary }]}>
          <Text style={[styles.guestHeaderTitle, textAlign]}>{t.profileTitle}</Text>
        </View>
        <View style={styles.guestBody}>
          <View style={[styles.guestAvatarCircle, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="person-outline" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.guestTitle, { color: colors.textPrimary }]}>{t.notSignedIn}</Text>
          <Text style={[styles.guestSub, { color: colors.textMuted }]}>{t.notSignedInSub}</Text>
          <Button label={t.signInRegister} onPress={() => router.push('/login')} style={styles.guestBtn} />
        </View>
      </View>
    );
  }

  const displayName = localDisplayName ?? user.username ?? user.email?.split('@')[0] ?? 'User';
  const activeAds = ads.filter(a => a.status === 'active' || a.status === 'featured');
  const soldAds = ads.filter(a => a.status === 'sold');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── HERO ── */}
          <View style={[styles.hero, { backgroundColor: colors.primary }]}>
            <Pressable style={styles.avatarContainer} onPress={handlePickAvatar} disabled={avatarLoading}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={[styles.cameraOverlay, { backgroundColor: colors.accent }]}>
                <MaterialIcons name={avatarLoading ? 'hourglass-empty' : 'camera-alt'} size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={styles.heroName}>{displayName}</Text>
            <Text style={styles.heroEmail}>{user.email}</Text>
            {isAdmin ? (
              <View style={[styles.adminChip, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <MaterialIcons name="verified" size={13} color="#fff" />
                <Text style={styles.adminChipText}>Administrator</Text>
              </View>
            ) : null}
            {isVerified && !isAdmin ? (
              <View style={[styles.adminChip, { backgroundColor: 'rgba(37,99,235,0.3)' }]}>
                <MaterialIcons name="verified" size={13} color="#93C5FD" />
                <Text style={[styles.adminChipText, { color: '#BFDBFE' }]}>{isRTL ? 'بائع موثّق' : 'Verified Seller'}</Text>
              </View>
            ) : null}
            <View style={[styles.statsCard, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              {[
                { num: activeAds.length, label: t.active, icon: 'storefront' },
                { num: soldAds.length, label: t.sold, icon: 'check-circle-outline' },
                { num: ads.length, label: t.total, icon: 'list-alt' },
              ].map((s, i, arr) => (
                <React.Fragment key={s.label}>
                  <View style={styles.stat}>
                    <MaterialIcons name={s.icon as any} size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.statNum}>{s.num}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                  {i < arr.length - 1 ? <View style={styles.statDivider} /> : null}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* ── QUICK TILES ── */}
          <View style={[styles.tilesWrap, { backgroundColor: colors.surface }]}>
            <View style={[styles.tilesGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {[
                { icon: 'manage-accounts', label: t.editProfile, color: colors.primary, bg: colors.primaryGhost, onPress: () => setEditMode(v => !v) },
                { icon: 'add-circle-outline', label: t.postAd, color: colors.primary, bg: colors.primaryGhost, onPress: () => router.push('/(tabs)/post') },
                { icon: 'favorite-border', label: isRTL ? 'المفضلة' : 'Favorites', color: '#EF4444', bg: '#FEE2E2', onPress: () => router.push('/favorites') },
                { icon: 'help-outline', label: isRTL ? 'المساعدة' : 'Help', color: '#7C3AED', bg: '#EDE9FE', onPress: () => router.push('/faq') },
                ...(isAdmin ? [{ icon: 'admin-panel-settings', label: t.adminAccess, color: colors.accentDark, bg: colors.accentLight, onPress: () => router.push('/admin') }] : []),
              ].map((tile) => (
                <Pressable
                  key={tile.label}
                  style={({ pressed }) => [styles.tile, { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 }]}
                  onPress={tile.onPress}
                >
                  <View style={[styles.tileIcon, { backgroundColor: tile.bg }]}>
                    <MaterialIcons name={tile.icon as any} size={22} color={tile.color} />
                  </View>
                  <Text style={[styles.tileLabel, { color: colors.textSecondary }]} numberOfLines={1}>{tile.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── EDIT PROFILE ── */}
          {editMode ? (
            <View style={[styles.editCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.editCardHeader, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.editCardIconWrap, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="manage-accounts" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.editCardTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{t.editProfile}</Text>
                <Pressable onPress={() => setEditMode(false)} hitSlop={8}><MaterialIcons name="close" size={20} color={colors.textMuted} /></Pressable>
              </View>
              <Pressable style={[styles.avatarEditRow, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.background, borderColor: colors.border }]} onPress={handlePickAvatar} disabled={avatarLoading}>
                {avatarUrl ? (<Image source={{ uri: avatarUrl }} style={styles.avatarSmall} contentFit="cover" />) : (<View style={[styles.avatarSmallPlaceholder, { backgroundColor: colors.primary }]}><Text style={styles.avatarSmallText}>{displayName.charAt(0).toUpperCase()}</Text></View>)}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.avatarEditLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.changePhoto}</Text>
                  <Text style={[styles.avatarEditSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{avatarLoading ? t.loading : (isRTL ? 'اضغط لتغيير صورتك' : 'Tap to change your picture')}</Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
              </Pressable>
              <View style={styles.editFields}>
                <Text style={[styles.editFieldLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t.username}</Text>
                <TextInput style={[styles.editInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} placeholder={t.usernamePlaceholder} placeholderTextColor={colors.textMuted} value={editName} onChangeText={setEditName} />
                <Text style={[styles.editFieldLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t.profilePhone}</Text>
                <TextInput style={[styles.editInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} placeholder={t.profilePhonePlaceholder} placeholderTextColor={colors.textMuted} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              </View>
              <View style={[styles.editActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable style={[styles.cancelEditBtn, { borderColor: colors.border }]} onPress={() => setEditMode(false)}><Text style={[styles.cancelEditText, { color: colors.textSecondary }]}>{t.cancel}</Text></Pressable>
                <Pressable style={[styles.saveEditBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]} onPress={handleSaveProfile} disabled={saving}>
                  <MaterialIcons name="check" size={16} color="#fff" />
                  <Text style={styles.saveEditText}>{saving ? t.loading : t.saveChanges}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════
              SETTINGS CARD
          ══════════════════════════════════════════════ */}
          <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>

            {/* ── APPEARANCE SECTION ── */}
            <SectionHeader
              icon="palette"
              label={isRTL ? 'المظهر' : 'Appearance'}
              color={colors.primary}
              bg={colors.primaryGhost}
            />

            {/* Dark mode */}
            <View style={[styles.settingRow, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.settingIconWrap, { backgroundColor: isDark ? '#1E2A3A' : '#FFF7ED' }]}>
                <MaterialIcons name={isDark ? 'dark-mode' : 'light-mode'} size={20} color={isDark ? '#60A5FA' : '#F59E0B'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.darkMode}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{isDark ? t.darkModeActive : t.lightModeActive}</Text>
              </View>
              <AnimatedSwitch value={isDark} onValueChange={toggleTheme} colors={colors} />
            </View>

            {/* Language */}
            <View style={[styles.settingRow, { borderBottomColor: colors.borderLight, borderBottomWidth: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.settingIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="language" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.language}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.languageSub}</Text>
              </View>
              <View style={[styles.langToggle, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.background, borderColor: colors.border }]}>
                {(['en', 'ar'] as Language[]).map(lang => (
                  <Pressable key={lang} style={[styles.langOption, { backgroundColor: language === lang ? colors.primary : 'transparent' }]} onPress={() => setLanguage(lang)}>
                    <Text style={[styles.langOptionText, { color: language === lang ? '#fff' : colors.textSecondary, fontWeight: language === lang ? '700' : '500' }]}>{lang === 'en' ? 'EN' : 'ع'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* ── SECURITY & PRIVACY SECTION ── */}
            <SectionHeader
              icon="security"
              label={isRTL ? 'الأمان والخصوصية' : 'Security & Privacy'}
              color="#7C3AED"
              bg="#EDE9FE"
            />

            {/* Change Password */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={handleChangePassword}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="lock-reset" size={20} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isRTL ? 'تغيير كلمة المرور' : 'Change Password'}
                </Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isRTL ? 'إرسال رابط إعادة تعيين عبر البريد' : 'Send reset link via email'}
                </Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* Linked Accounts */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, borderBottomWidth: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => showAlert(
                isRTL ? 'ربط الحسابات' : 'Linked Accounts',
                isRTL ? 'يمكنك تسجيل الدخول بـ Google أو Apple من صفحة تسجيل الدخول في أي وقت.' : 'You can sign in with Google or Apple from the login screen at any time.'
              )}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="link" size={20} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isRTL ? 'ربط حسابات التواصل الاجتماعي' : 'Linked Accounts'}
                </Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isRTL ? 'Google · Apple' : 'Google · Apple'}
                </Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* ── HELP CENTER SECTION ── */}
            <SectionHeader
              icon="support-agent"
              label={isRTL ? 'مركز المساعدة' : 'Help Center'}
              color="#0A6E5C"
              bg={colors.primaryGhost}
            />

            {/* WhatsApp */}
            <View style={[styles.waCardWrap, { borderBottomColor: colors.borderLight }]}>
              <Pressable style={({ pressed }) => [styles.waCard, { opacity: pressed ? 0.88 : 1 }]} onPress={handleWhatsApp}>
                <View style={styles.waIconBadge}><MaterialIcons name="whatsapp" size={28} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.waCardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t.contactSupport}</Text>
                  <Text style={[styles.waCardSub, { textAlign: isRTL ? 'right' : 'left' }]}>{t.contactSupportSub}</Text>
                </View>
                <View style={styles.waArrow}><MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={18} color="#fff" /></View>
              </Pressable>
            </View>

            {/* Facebook */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => openLink(FACEBOOK_URL)}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#DBEAFE' }]}>
                <MaterialIcons name="facebook" size={20} color="#1877F2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'صفحة فيسبوك' : 'Facebook Page'}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تابعنا على فيسبوك' : 'Follow us on Facebook'}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* Instagram */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => openLink(INSTAGRAM_URL)}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#FCE7F3' }]}>
                <MaterialIcons name="photo-camera" size={20} color="#C13584" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'صفحة إنستغرام' : 'Instagram Profile'}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تابعنا على إنستغرام' : 'Follow us on Instagram'}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* FAQ */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => router.push('/faq')}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="help-outline" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'الأسئلة الشائعة' : 'FAQs'}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'إجابات على الأسئلة الشائعة' : 'Answers to common questions'}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* Bug Report Form */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, borderBottomWidth: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => router.push('/support-form')}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="bug-report" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'الإبلاغ عن مشكلة' : 'Report a Bug'}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'أرسل لقطة شاشة ووصف المشكلة' : 'Send a screenshot & issue description'}</Text>
              </View>
              <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.newBadgeText}>{isRTL ? 'جديد' : 'NEW'}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* ── ACCOUNT SECTION ── */}
            <SectionHeader
              icon="manage-accounts"
              label={isRTL ? 'الحساب' : 'Account'}
              color={colors.error}
              bg={colors.errorLight}
            />

            {/* Privacy Policy */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => router.push('/privacy')}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="privacy-tip" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.privacyPolicy}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.privacyPolicySub}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* Logout */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={handleLogout}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: colors.errorLight }]}>
                <MaterialIcons name="logout" size={20} color={colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.error, textAlign: isRTL ? 'right' : 'left' }]}>{t.signOut}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

            {/* Delete Account */}
            <Pressable
              style={[styles.settingRowPressable, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={handleDeleteAccount}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <MaterialIcons name="delete-forever" size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: '#DC2626', textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'حذف الحساب' : 'Delete Account'}</Text>
                <Text style={[styles.settingSub, { color: '#EF4444', textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'حذف نهائي لجميع البيانات' : 'Permanently removes all your data'}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color="#EF4444" />
            </Pressable>
          </View>

          {/* ── BLOCKED USERS ── */}
          {blockedUsers.length > 0 ? (
            <View style={[styles.blockedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                style={[styles.blockedHeader, { borderBottomColor: blockedExpanded ? colors.borderLight : 'transparent', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => setBlockedExpanded(v => !v)}
              >
                <View style={[styles.blockedIconWrap, { backgroundColor: '#FEE2E2' }]}><MaterialIcons name="block" size={18} color="#EF4444" /></View>
                <Text style={[styles.blockedTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'المستخدمون المحظورون' : 'Blocked Users'}</Text>
                <View style={[styles.blockedBadge, { backgroundColor: '#EF4444' }]}><Text style={styles.blockedBadgeText}>{blockedUsers.length}</Text></View>
                <MaterialIcons name={blockedExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={colors.textMuted} style={{ marginLeft: isRTL ? 0 : 4, marginRight: isRTL ? 4 : 0 }} />
              </Pressable>
              {blockedExpanded ? (
                <View style={styles.blockedList}>
                  {blockedUsers.map((bu, idx) => {
                    const buName = bu.username || bu.email?.split('@')[0] || 'User';
                    return (
                      <View key={bu.id} style={[styles.blockedItem, { borderBottomColor: colors.borderLight, borderBottomWidth: idx === blockedUsers.length - 1 ? 0 : 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                        {bu.avatar_url ? (<Image source={{ uri: bu.avatar_url }} style={styles.blockedAvatar} contentFit="cover" transition={200} />) : (<View style={[styles.blockedAvatarPlaceholder, { backgroundColor: colors.primaryGhost }]}><Text style={[styles.blockedAvatarText, { color: colors.primary }]}>{buName.charAt(0).toUpperCase()}</Text></View>)}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.blockedName, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{buName}</Text>
                          <Text style={[styles.blockedEmail, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{bu.email}</Text>
                        </View>
                        <Pressable style={[styles.unblockBtn, { backgroundColor: colors.primaryGhost, opacity: unblockingId === bu.id ? 0.5 : 1 }]} onPress={() => handleUnblock(bu.id, buName)} disabled={unblockingId === bu.id}>
                          <MaterialIcons name="lock-open" size={14} color={colors.primary} />
                          <Text style={[styles.unblockBtnText, { color: colors.primary }]}>{isRTL ? 'رفع الحظر' : 'Unblock'}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ── MY LISTINGS ── */}
          <View style={styles.listingsSection}>
            <View style={[styles.listingsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.listingsTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="storefront" size={18} color={colors.primary} />
                <Text style={[styles.listingsTitle, { color: colors.textPrimary }]}>{t.myListings}</Text>
                <View style={[styles.listingsCountBadge, { backgroundColor: colors.primaryGhost }]}><Text style={[styles.listingsCount, { color: colors.primary }]}>{ads.length}</Text></View>
              </View>
              <Pressable style={[styles.postNewBtn, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/post')}>
                <MaterialIcons name="add" size={15} color="#fff" />
                <Text style={styles.postNewText}>{t.postNew}</Text>
              </Pressable>
            </View>
            {ads.length === 0 && !loading ? (
              <View style={[styles.emptyListings, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="storefront" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyListingsTitle, { color: colors.textPrimary }]}>{t.noListingsYet}</Text>
                <Text style={[styles.emptyListingsSub, { color: colors.textMuted }]}>{t.noListingsYetSub}</Text>
              </View>
            ) : (
              ads.map(ad => (
                <View key={ad.id} style={styles.adRow}>
                  <AdCard ad={ad} />
                  <View style={[styles.adActions, { flexDirection: isRTL ? 'row' : 'row-reverse' }]}>
                    {ad.status === 'active' || ad.status === 'featured' ? (
                      <Pressable style={[styles.markSoldBtn, { backgroundColor: colors.successLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => handleMarkSold(ad.id)}>
                        <MaterialIcons name="check-circle-outline" size={15} color={colors.success} />
                        <Text style={[styles.markSoldText, { color: colors.success }]}>{t.markAsSold}</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.soldChip, { backgroundColor: colors.accentLight }]}><Text style={[styles.soldChipText, { color: colors.accentDark }]}>✓ {t.sold.toUpperCase()}</Text></View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── VERSION FOOTER ── */}
          <View style={styles.versionFooter}>
            <View style={[styles.versionDivider, { backgroundColor: colors.border }]} />
            <View style={styles.versionRow}>
              <MaterialIcons name="info-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.versionText, { color: colors.textMuted }]}>
                {isRTL ? `سوق قلقيلية · الإصدار ${APP_VERSION}` : `Souq Qalqilya · Version ${APP_VERSION}`}
              </Text>
            </View>
            <Text style={[styles.versionSub, { color: colors.border }]}>
              {isRTL ? 'بُني بـ ❤ من فريق بلانكتون' : 'Built with ❤ by Plankton Team'}
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero
  hero: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl + 8, alignItems: 'center', paddingTop: Spacing.lg },
  avatarContainer: { position: 'relative', marginBottom: Spacing.md },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  avatarPlaceholder: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 38, fontWeight: '800', color: '#fff' },
  cameraOverlay: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  heroName: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.3 },
  heroEmail: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', marginBottom: Spacing.sm },
  adminChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, marginBottom: Spacing.md },
  adminChipText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  statsCard: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: Spacing.xl, gap: Spacing.xl, width: '100%', justifyContent: 'center', marginTop: 4 },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Tiles
  tilesWrap: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginTop: 1 },
  tilesGrid: { flexWrap: 'wrap', gap: Spacing.sm },
  tile: { alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: Spacing.md, borderRadius: Radius.lg, minWidth: 64, flex: 1 },
  tileIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' },

  // Edit profile card
  editCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  editCardHeader: { alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, marginBottom: 4 },
  editCardIconWrap: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  editCardTitle: { fontSize: FontSize.md, fontWeight: '700' },
  avatarEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  avatarSmall: { width: 48, height: 48, borderRadius: 24 },
  avatarSmallPlaceholder: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: '#fff', fontWeight: '800', fontSize: FontSize.lg },
  avatarEditLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  avatarEditSub: { fontSize: FontSize.xs, marginTop: 2 },
  editFields: { gap: Spacing.sm },
  editFieldLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 4 },
  editInput: { height: 50, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.md },
  editActions: { gap: Spacing.sm, marginTop: 4 },
  cancelEditBtn: { flex: 1, height: 46, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cancelEditText: { fontSize: FontSize.md, fontWeight: '600' },
  saveEditBtn: { flex: 2, height: 46, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveEditText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  // Settings card
  settingsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  settingRow: { alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1 },
  settingRowPressable: { alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1 },
  settingIconWrap: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: FontSize.md, fontWeight: '600' },
  settingSub: { fontSize: FontSize.xs, marginTop: 2 },
  langToggle: { borderRadius: Radius.full, borderWidth: 1.5, overflow: 'hidden', flexDirection: 'row' },
  langOption: { paddingHorizontal: 14, paddingVertical: 7, minWidth: 40, alignItems: 'center' },
  langOptionText: { fontSize: FontSize.sm },
  newBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, marginRight: 4 },
  newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // WhatsApp card
  waCardWrap: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  waCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: '#25D366', borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: Spacing.md, shadowColor: '#25D366', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  waIconBadge: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  waCardTitle: { fontSize: FontSize.md, fontWeight: '700', color: '#fff', marginBottom: 2 },
  waCardSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', lineHeight: 16 },
  waArrow: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },

  // Blocked users
  blockedCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden' },
  blockedHeader: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: 1 },
  blockedIconWrap: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  blockedTitle: { fontSize: FontSize.md, fontWeight: '700' },
  blockedBadge: { borderRadius: Radius.full, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  blockedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  blockedList: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  blockedItem: { alignItems: 'center', gap: Spacing.md, paddingVertical: 12 },
  blockedAvatar: { width: 44, height: 44, borderRadius: 22 },
  blockedAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  blockedAvatarText: { fontSize: FontSize.lg, fontWeight: '800' },
  blockedName: { fontSize: FontSize.sm, fontWeight: '700' },
  blockedEmail: { fontSize: FontSize.xs, marginTop: 2 },
  unblockBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full },
  unblockBtnText: { fontSize: FontSize.xs, fontWeight: '700' },

  // Listings
  listingsSection: { padding: Spacing.lg, gap: Spacing.sm },
  listingsHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  listingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  listingsTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  listingsCountBadge: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3 },
  listingsCount: { fontSize: FontSize.xs, fontWeight: '700' },
  postNewBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full },
  postNewText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  emptyListings: { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  emptyListingsTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptyListingsSub: { fontSize: FontSize.sm, textAlign: 'center' },
  adRow: { marginBottom: Spacing.sm },
  adActions: { justifyContent: 'flex-end', paddingTop: 6 },
  markSoldBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  markSoldText: { fontSize: FontSize.sm, fontWeight: '600' },
  soldChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  soldChipText: { fontSize: FontSize.xs, fontWeight: '700' },

  // Version footer
  versionFooter: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8 },
  versionDivider: { width: 48, height: 1.5, borderRadius: 99, marginBottom: 4 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  versionText: { fontSize: FontSize.xs, fontWeight: '500' },
  versionSub: { fontSize: 10, fontWeight: '500' },

  // Guest
  guestOuter: { flex: 1 },
  guestHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  guestHeaderTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  guestBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  guestAvatarCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  guestTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  guestSub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  guestBtn: { width: '100%', marginTop: Spacing.sm },
});
