
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth, useAlert } from '@/template';
import { AdCard, Button, EmptyState } from '@/components';
import { useMyAds } from '@/hooks/useAds';
import { updateAdStatus } from '@/services/adsService';
import { checkIsAdmin } from '@/services/adminService';
import { getSupabaseClient } from '@/template';
import { pickImage, uploadImage } from '@/services/imageService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { SUPPORT_WHATSAPP_NUMBER, SUPPORT_WHATSAPP_MESSAGE } from '@/constants/config';
import type { Language } from '@/constants/i18n';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { showAlert } = useAlert();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { ads, loading, load } = useMyAds();

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const rtl = { flexDirection: isRTL ? ('row-reverse' as const) : ('row' as const) };
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
    }
  }, [user]);

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
      return showAlert(
        isRTL ? 'مطلوب' : 'Required',
        isRTL ? 'يرجى إدخال اسم المستخدم' : 'Please enter a display name.'
      );
    }
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('user_profiles')
        .update({ username: trimmedName, phone: editPhone.trim() || null })
        .eq('id', user.id);
      if (error) throw error;
      // Force a fresh read to confirm the write succeeded
      const { data: fresh, error: readErr } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      if (readErr || fresh?.username !== trimmedName) {
        throw new Error(readErr?.message ?? 'Save failed — please try again.');
      }
      showAlert(t.profileUpdated, t.profileUpdatedMsg);
      setEditMode(false);
      // Refresh the displayed name immediately
      setEditName(trimmedName);
    } catch (e: any) {
      showAlert('Error', e.message ?? 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleContactSupport = () => {
    const msg = encodeURIComponent(SUPPORT_WHATSAPP_MESSAGE);
    const url = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${msg}`;
    Linking.openURL(url).catch(() => showAlert('Error', 'Could not open WhatsApp.'));
  };

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

  const displayName = user.username || user.email?.split('@')[0] || 'User';
  const activeAds = ads.filter(a => a.status === 'active' || a.status === 'featured');
  const soldAds = ads.filter(a => a.status === 'sold');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── HERO ── */}
          <View style={[styles.hero, { backgroundColor: colors.primary }]}>
            {/* Avatar */}
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
                <Text style={[styles.adminChipText, { color: '#BFDBFE' }]}>
                  {isRTL ? 'بائع موثّق' : 'Verified Seller'}
                </Text>
              </View>
            ) : null}

            {/* Stats */}
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

          {/* ── QUICK ACTION TILES ── */}
          <View style={[styles.tilesWrap, { backgroundColor: colors.surface }]}>
            <View style={[styles.tilesGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {[
                { icon: 'manage-accounts', label: t.editProfile, color: colors.primary, bg: colors.primaryGhost, onPress: () => setEditMode(v => !v) },
                { icon: 'add-circle-outline', label: t.postAd, color: colors.primary, bg: colors.primaryGhost, onPress: () => router.push('/(tabs)/post') },
                { icon: 'favorite-border', label: isRTL ? 'المفضلة' : 'Favorites', color: '#EF4444', bg: '#FEE2E2', onPress: () => router.push('/favorites') },
                { icon: 'whatsapp', label: isRTL ? 'الدعم' : 'Support', color: '#25D366', bg: '#E8F5E9', onPress: handleContactSupport },
                ...(isAdmin ? [{ icon: 'admin-panel-settings', label: t.adminAccess, color: colors.accentDark, bg: colors.accentLight, onPress: () => router.push('/admin') }] : []),
                { icon: 'logout', label: t.signOut, color: colors.error, bg: colors.errorLight, onPress: handleLogout },
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

          {/* ── EDIT PROFILE PANEL ── */}
          {editMode ? (
            <View style={[styles.editCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.editCardHeader, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.editCardIconWrap, { backgroundColor: colors.primaryGhost }]}>
                  <MaterialIcons name="manage-accounts" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.editCardTitle, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{t.editProfile}</Text>
                <Pressable onPress={() => setEditMode(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Avatar shortcut */}
              <Pressable
                style={[styles.avatarEditRow, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={handlePickAvatar}
                disabled={avatarLoading}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarSmall} contentFit="cover" />
                ) : (
                  <View style={[styles.avatarSmallPlaceholder, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarSmallText}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.avatarEditLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.changePhoto}</Text>
                  <Text style={[styles.avatarEditSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                    {avatarLoading ? t.loading : (isRTL ? 'اضغط لتغيير صورتك' : 'Tap to change your picture')}
                  </Text>
                </View>
                <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
              </Pressable>

              <View style={styles.editFields}>
                <Text style={[styles.editFieldLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t.username}</Text>
                <TextInput
                  style={[styles.editInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t.usernamePlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={editName}
                  onChangeText={setEditName}
                />
                <Text style={[styles.editFieldLabel, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{t.profilePhone}</Text>
                <TextInput
                  style={[styles.editInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t.profilePhonePlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={[styles.editActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable style={[styles.cancelEditBtn, { borderColor: colors.border }]} onPress={() => setEditMode(false)}>
                  <Text style={[styles.cancelEditText, { color: colors.textSecondary }]}>{t.cancel}</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveEditBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  <MaterialIcons name="check" size={16} color="#fff" />
                  <Text style={styles.saveEditText}>{saving ? t.loading : t.saveChanges}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* ── SETTINGS CARD ── */}
          <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.settingsCardHeader, { borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name="settings" size={16} color={colors.primary} />
              <Text style={[styles.settingsCardTitle, { color: colors.primary }]}>{t.settings}</Text>
            </View>

            {/* Dark mode */}
            <View style={[styles.settingRow, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.settingIconWrap, { backgroundColor: isDark ? '#1E2A3A' : '#FFF7ED' }]}>
                <MaterialIcons name={isDark ? 'dark-mode' : 'light-mode'} size={20} color={isDark ? '#60A5FA' : '#F59E0B'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.darkMode}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isDark ? t.darkModeActive : t.lightModeActive}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
                ios_backgroundColor={colors.border}
              />
            </View>

            {/* Language */}
            <View style={[styles.settingRow, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.settingIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="language" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.language}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.languageSub}</Text>
              </View>
              <View style={[styles.langToggle, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.background, borderColor: colors.border }]}>
                {(['en', 'ar'] as Language[]).map(lang => (
                  <Pressable
                    key={lang}
                    style={[
                      styles.langOption,
                      { backgroundColor: language === lang ? colors.primary : 'transparent' },
                    ]}
                    onPress={() => setLanguage(lang)}
                  >
                    <Text style={[styles.langOptionText, { color: language === lang ? '#fff' : colors.textSecondary, fontWeight: language === lang ? '700' : '500' }]}>
                      {lang === 'en' ? 'EN' : 'ع'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Support */}
            <Pressable
              style={[styles.settingRowPressable, { borderBottomColor: colors.borderLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={handleContactSupport}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: '#E8F5E9' }]}>
                <MaterialIcons name="whatsapp" size={22} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>{t.contactSupport}</Text>
                <Text style={[styles.settingSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.contactSupportSub}</Text>
              </View>
              <MaterialIcons name={isRTL ? 'chevron-left' : 'chevron-right'} size={20} color={colors.textMuted} />
            </Pressable>

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
              style={[styles.settingRowPressable, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
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
          </View>

          {/* ── FOLLOW US CARD ── */}
          <View style={[styles.followCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Header */}
            <View style={[styles.followCardHeader, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.followCardTitle, { color: colors.primary }]}>
                {isRTL ? '🌐 تابعنا على السوشال ميديا' : '🌐 Follow Us on Social Media'}
              </Text>
            </View>

            {/* Logo */}
            <View style={[styles.followLogoWrap, { backgroundColor: colors.background }]}>
              <View style={[styles.followLogoBg, { borderColor: colors.border }]}>
                <Image
                  source={require('@/assets/images/plankton-logo.png')}
                  style={styles.followLogo}
                  contentFit="contain"
                  transition={300}
                />
              </View>
              <Text style={[styles.followLogoSub, { color: colors.textMuted }]}>
                {isRTL ? 'بتحبك يا بلانكتون 💚' : 'Built with 💚 by Plankton'}
              </Text>
            </View>

            {/* Social Buttons */}
            <View style={[styles.socialBtns, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {/* Facebook */}
              <Pressable
                style={({ pressed }) => [
                  styles.socialBtn,
                  { backgroundColor: '#1877F2', opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() =>
                  Linking.openURL('https://www.facebook.com/share/1L5KLdnkaY/').catch(() => {})
                }
              >
                <MaterialIcons name="facebook" size={22} color="#fff" />
                <Text style={styles.socialBtnText}>{isRTL ? 'فيسبوك' : 'Facebook'}</Text>
              </Pressable>

              {/* Instagram */}
              <Pressable
                style={({ pressed }) => [
                  styles.socialBtn,
                  styles.instagramBtn,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                onPress={() =>
                  Linking.openURL('https://www.instagram.com/co.plankton?igsh=MWV4Z2RncTVoYW81ZA==').catch(() => {})
                }
              >
                <MaterialIcons name="photo-camera" size={20} color="#fff" />
                <Text style={styles.socialBtnText}>{isRTL ? 'إنستغرام' : 'Instagram'}</Text>
              </Pressable>
            </View>

            <Text style={[styles.followTagline, { color: colors.textMuted }]}>
              {isRTL
                ? 'تابعنا لتبقى على اطلاع بآخر العروض والأخبار 🎉'
                : 'Follow us for the latest deals and updates 🎉'}
            </Text>
          </View>

          {/* ── MY LISTINGS ── */}
          <View style={[styles.listingsSection]}>
            <View style={[styles.listingsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.listingsTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="storefront" size={18} color={colors.primary} />
                <Text style={[styles.listingsTitle, { color: colors.textPrimary }]}>{t.myListings}</Text>
                <View style={[styles.listingsCountBadge, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={[styles.listingsCount, { color: colors.primary }]}>{ads.length}</Text>
                </View>
              </View>
              <Pressable
                style={[styles.postNewBtn, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors.primary }]}
                onPress={() => router.push('/(tabs)/post')}
              >
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
                      <Pressable
                        style={[styles.markSoldBtn, { backgroundColor: colors.successLight, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                        onPress={() => handleMarkSold(ad.id)}
                      >
                        <MaterialIcons name="check-circle-outline" size={15} color={colors.success} />
                        <Text style={[styles.markSoldText, { color: colors.success }]}>{t.markAsSold}</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.soldChip, { backgroundColor: colors.accentLight }]}>
                        <Text style={[styles.soldChipText, { color: colors.accentDark }]}>✓ {t.sold.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
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
  hero: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl + 8,
    alignItems: 'center', paddingTop: Spacing.lg,
  },
  avatarContainer: { position: 'relative', marginBottom: Spacing.md },
  avatarImg: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 38, fontWeight: '800', color: '#fff' },
  cameraOverlay: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  heroName: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', marginBottom: 4, letterSpacing: -0.3 },
  heroEmail: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', marginBottom: Spacing.sm },
  adminChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: Spacing.md,
  },
  adminChipText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  statsCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: Spacing.xl, gap: Spacing.xl,
    width: '100%', justifyContent: 'center', marginTop: 4,
  },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Quick action tiles
  tilesWrap: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, marginTop: 1 },
  tilesGrid: { flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: Spacing.md,
    borderRadius: Radius.lg, minWidth: 64, flex: 1,
  },
  tileIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' },

  // Edit profile card
  editCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md,
    gap: Spacing.sm,
  },
  editCardHeader: {
    alignItems: 'center', gap: Spacing.sm,
    paddingBottom: Spacing.sm, borderBottomWidth: 1,
    marginBottom: 4,
  },
  editCardIconWrap: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  editCardTitle: { fontSize: FontSize.md, fontWeight: '700' },
  avatarEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1,
  },
  avatarSmall: { width: 48, height: 48, borderRadius: 24 },
  avatarSmallPlaceholder: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSmallText: { color: '#fff', fontWeight: '800', fontSize: FontSize.lg },
  avatarEditLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  avatarEditSub: { fontSize: FontSize.xs, marginTop: 2 },
  editFields: { gap: Spacing.sm },
  editFieldLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 4 },
  editInput: {
    height: 50, borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, fontSize: FontSize.md,
  },
  editActions: { gap: Spacing.sm, marginTop: 4 },
  cancelEditBtn: {
    flex: 1, height: 46, borderRadius: Radius.lg, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelEditText: { fontSize: FontSize.md, fontWeight: '600' },
  saveEditBtn: {
    flex: 2, height: 46, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  saveEditText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  // Settings card
  settingsCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden',
  },
  settingsCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1,
  },
  settingsCardTitle: { fontSize: FontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  settingRow: {
    alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingRowPressable: {
    alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingIconWrap: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: FontSize.md, fontWeight: '600' },
  settingSub: { fontSize: FontSize.xs, marginTop: 2 },
  langToggle: {
    borderRadius: Radius.full, borderWidth: 1.5, overflow: 'hidden',
    flexDirection: 'row',
  },
  langOption: {
    paddingHorizontal: 14, paddingVertical: 7, minWidth: 40, alignItems: 'center',
  },
  langOptionText: { fontSize: FontSize.sm },

  // Follow Us card
  followCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden',
  },
  followCardHeader: {
    paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1,
    alignItems: 'center',
  },
  followCardTitle: { fontSize: FontSize.sm, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  followLogoWrap: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 10 },
  followLogoBg: {
    width: '88%',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
  },
  followLogo: { width: 220, height: 88 },
  followLogoSub: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 0.3 },
  socialBtns: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },
  socialBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: Radius.lg,
  },
  instagramBtn: {
    // Instagram gradient approximated as solid
    backgroundColor: '#C13584',
  },
  socialBtnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  followTagline: {
    fontSize: FontSize.xs, textAlign: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, paddingBottom: Spacing.md,
    lineHeight: 18,
  },

  // Listings section
  listingsSection: { padding: Spacing.lg, gap: Spacing.sm },
  listingsHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  listingsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  listingsTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  listingsCountBadge: { borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3 },
  listingsCount: { fontSize: FontSize.xs, fontWeight: '700' },
  postNewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full,
  },
  postNewText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  emptyListings: {
    borderRadius: Radius.xl, padding: Spacing.xxl,
    alignItems: 'center', gap: Spacing.sm,
  },
  emptyListingsTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  emptyListingsSub: { fontSize: FontSize.sm, textAlign: 'center' },
  adRow: { marginBottom: Spacing.sm },
  adActions: { justifyContent: 'flex-end', paddingTop: 6 },
  markSoldBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full,
  },
  markSoldText: { fontSize: FontSize.sm, fontWeight: '600' },
  soldChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  soldChipText: { fontSize: FontSize.xs, fontWeight: '700' },

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
