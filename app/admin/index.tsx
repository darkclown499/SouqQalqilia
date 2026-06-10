import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAlert } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import {
  adminFetchAllAds, adminDeleteAd, adminUpdateAd,
  adminSetAdFeatured, adminFetchAllUsers, adminSetUserBlocked,
  adminBoostAd, adminSetUserAdmin, adminSetUserVerified, UserProfile,
} from '@/services/adminService';
import {
  fetchAllBanners, createBanner, deleteBanner, toggleBannerActive, updateBanner, Banner,
} from '@/services/bannersService';
import {
  fetchAllInterstitials, createInterstitial, updateInterstitial, deleteInterstitial, InterstitialAd,
} from '@/services/interstitialService';
import {
  adminFetchAllStores, adminCreateStore, adminUpdateStore, adminDeleteStore, Store,
} from '@/services/storesService';
import { pickImage, uploadImage } from '@/services/imageService';
import { Image } from 'expo-image';
import { useCategories } from '@/hooks/useCategories';
import { getCategoryName } from '@/services/categoriesService';
import { Ad } from '@/services/adsService';

type Tab = 'ads' | 'users' | 'banners' | 'interstitials' | 'stores';

// ── Broadcast Notification Modal ──
interface BroadcastModalProps {
  visible: boolean;
  onClose: () => void;
  isAr: boolean;
  colors: any;
}
function BroadcastModal({ visible, onClose, isAr, colors }: BroadcastModalProps) {
  const { showAlert } = useAlert();
  const [bTitle, setBTitle] = useState('');
  const [bMessage, setBMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const reset = () => { setBTitle(''); setBMessage(''); setResult(null); };

  const handleSend = async () => {
    if (!bTitle.trim() || !bMessage.trim()) {
      return showAlert(
        isAr ? 'مطلوب' : 'Required',
        isAr ? 'العنوان والرسالة مطلوبان' : 'Title and message are required.'
      );
    }
    showAlert(
      isAr ? 'تأكيد الإرسال' : 'Confirm Broadcast',
      isAr
        ? `سيتم إرسال هذا الإشعار لجميع المستخدمين. هل أنت متأكد؟`
        : `This notification will be sent to all users. Are you sure?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'إرسال الآن' : 'Send Now',
          onPress: async () => {
            setSending(true);
            setResult(null);
            try {
              const { getSupabaseClient } = require('@/template');
              const supabase = getSupabaseClient();
              const { data: { session } } = await supabase.auth.getSession();
              const { FunctionsHttpError } = await import('@supabase/supabase-js');
              const { data, error } = await supabase.functions.invoke('push-notify', {
                body: { action: 'broadcast', title: bTitle.trim(), message: bMessage.trim() },
                headers: session?.access_token
                  ? { Authorization: `Bearer ${session.access_token}` }
                  : undefined,
              });
              if (error) {
                let msg = error.message;
                if (error instanceof FunctionsHttpError) {
                  try { msg = await error.context?.text() || msg; } catch {}
                }
                throw new Error(msg);
              }
              setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, total: data.total ?? 0 });
            } catch (e: any) {
              showAlert(isAr ? 'خطأ' : 'Error', e?.message ?? 'Failed to send broadcast');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={bcastS.overlay} onPress={() => { reset(); onClose(); }}>
        <Pressable style={[bcastS.sheet, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
          <View style={[bcastS.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={[bcastS.header, { borderBottomColor: colors.borderLight }]}>
            <View style={[bcastS.headerIcon, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="campaign" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[bcastS.headerTitle, { color: colors.textPrimary }]}>
                {isAr ? 'إشعار جماعي' : 'Broadcast Notification'}
              </Text>
              <Text style={[bcastS.headerSub, { color: colors.textMuted }]}>
                {isAr ? 'إرسال لجميع المستخدمين الذين لديهم الإشعارات مفعّلة' : 'Send to all users with push notifications enabled'}
              </Text>
            </View>
            <Pressable onPress={() => { reset(); onClose(); }} hitSlop={8}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Success result */}
          {result ? (
            <View style={[bcastS.resultBox, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
              <MaterialIcons name="check-circle" size={32} color={colors.success} />
              <Text style={[bcastS.resultTitle, { color: colors.success }]}>
                {isAr ? 'تم الإرسال!' : 'Broadcast sent!'}
              </Text>
              <Text style={[bcastS.resultSub, { color: colors.textSecondary }]}>
                {isAr
                  ? `✅ ${result.sent} وصل • ⚠️ ${result.failed} فشل • 📱 ${result.total} جهاز`
                  : `✅ ${result.sent} delivered • ⚠️ ${result.failed} failed • 📱 ${result.total} devices`}
              </Text>
              <Pressable
                style={[bcastS.resetBtn, { backgroundColor: colors.primary }]}
                onPress={reset}
              >
                <Text style={bcastS.resetBtnText}>{isAr ? 'إرسال آخر' : 'Send another'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={bcastS.body}>
              <View style={bcastS.field}>
                <Text style={[bcastS.fieldLabel, { color: colors.textSecondary }]}>
                  {isAr ? 'عنوان الإشعار *' : 'Notification Title *'}
                </Text>
                <TextInput
                  style={[bcastS.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
                  value={bTitle}
                  onChangeText={setBTitle}
                  placeholder={isAr ? 'مثال: عروض حصرية اليوم' : 'e.g. Exclusive deals today'}
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                />
              </View>
              <View style={bcastS.field}>
                <Text style={[bcastS.fieldLabel, { color: colors.textSecondary }]}>
                  {isAr ? 'نص الرسالة *' : 'Message *'}
                </Text>
                <TextInput
                  style={[bcastS.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
                  value={bMessage}
                  onChangeText={setBMessage}
                  placeholder={isAr ? 'اكتب رسالتك هنا...' : 'Write your message here...'}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={250}
                />
                <Text style={[bcastS.charCount, { color: colors.textMuted }]}>{bMessage.length}/250</Text>
              </View>

              {/* Preview card */}
              {(bTitle.trim() || bMessage.trim()) ? (
                <View style={[bcastS.preview, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
                  <View style={bcastS.previewHeader}>
                    <MaterialIcons name="notifications" size={14} color={colors.primary} />
                    <Text style={[bcastS.previewApp, { color: colors.primary }]}>سوق قلقيلية</Text>
                    <Text style={[bcastS.previewTime, { color: colors.textMuted }]}>now</Text>
                  </View>
                  <Text style={[bcastS.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {bTitle || (isAr ? '...' : '...')}
                  </Text>
                  <Text style={[bcastS.previewBody, { color: colors.textSecondary }]} numberOfLines={2}>
                    {bMessage || (isAr ? '...' : '...')}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[bcastS.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 }]}
                onPress={handleSend}
                disabled={sending}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialIcons name="send" size={18} color="#fff" />
                }
                <Text style={bcastS.sendBtnText}>
                  {sending
                    ? (isAr ? 'جاري الإرسال...' : 'Sending...')
                    : (isAr ? 'إرسال لجميع المستخدمين' : 'Send to All Users')
                  }
                </Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const bcastS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2 },
  body: { padding: 20, gap: 16 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: -2 },
  preview: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 3 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  previewApp: { fontSize: 11, fontWeight: '700', flex: 1 },
  previewTime: { fontSize: 11 },
  previewTitle: { fontSize: 14, fontWeight: '700' },
  previewBody: { fontSize: 13, lineHeight: 18 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 16,
    marginTop: 4,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  resultBox: {
    margin: 20, borderRadius: 16, borderWidth: 1,
    padding: 24, alignItems: 'center', gap: 8,
  },
  resultTitle: { fontSize: 18, fontWeight: '800' },
  resultSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  resetBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
  resetBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

// ── Full Edit Modal ──
interface AdEditModalProps {
  ad: Ad | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: string, updates: any) => Promise<void>;
  isAr: boolean;
  colors: any;
}
function AdEditModal({ ad, visible, onClose, onSave, isAr, colors }: AdEditModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [condition, setCondition] = useState<'new' | 'used'>('used');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ad) {
      setTitle(ad.title ?? '');
      setDescription(ad.description ?? '');
      setPrice(String(ad.price ?? 0));
      setLocation(ad.location ?? '');
      setCondition((ad.condition as any) ?? 'used');
    }
  }, [ad]);

  const handleSave = async () => {
    if (!ad) return;
    setSaving(true);
    await onSave(ad.id, {
      title: title.trim(),
      description: description.trim(),
      price: parseFloat(price) || 0,
      location: location.trim(),
      condition,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={editModal.overlay}>
        <View style={[editModal.sheet, { backgroundColor: colors.surface }]}>
          <View style={[editModal.handle, { backgroundColor: colors.border }]} />
          <View style={[editModal.header, { borderBottomColor: colors.borderLight }]}>
            <MaterialIcons name="edit" size={20} color={colors.primary} />
            <Text style={[editModal.title, { color: colors.textPrimary }]}>
              {isAr ? 'تعديل الإعلان' : 'Edit Listing'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={editModal.content}>
            {[
              { label: isAr ? 'العنوان' : 'Title', value: title, onChange: setTitle },
              { label: isAr ? 'الوصف' : 'Description', value: description, onChange: setDescription, multiline: true },
              { label: isAr ? 'السعر ₪' : 'Price ₪', value: price, onChange: setPrice, numeric: true },
              { label: isAr ? 'الموقع' : 'Location', value: location, onChange: setLocation },
            ].map(f => (
              <View key={f.label} style={editModal.field}>
                <Text style={[editModal.label, { color: colors.textSecondary }]}>{f.label}</Text>
                <TextInput
                  style={[editModal.input, {
                    borderColor: colors.border, backgroundColor: colors.background,
                    color: colors.textPrimary, height: f.multiline ? 90 : 48,
                    textAlignVertical: f.multiline ? 'top' : 'center',
                  }]}
                  value={f.value}
                  onChangeText={f.onChange}
                  multiline={f.multiline}
                  keyboardType={f.numeric ? 'numeric' : 'default'}
                />
              </View>
            ))}

            <Text style={[editModal.label, { color: colors.textSecondary, marginBottom: 8 }]}>
              {isAr ? 'الحالة' : 'Condition'}
            </Text>
            <View style={editModal.condRow}>
              {(['new', 'used'] as const).map(c => (
                <Pressable
                  key={c}
                  style={[editModal.condBtn, {
                    backgroundColor: condition === c ? colors.primary : colors.background,
                    borderColor: condition === c ? colors.primary : colors.border,
                    flex: 1,
                  }]}
                  onPress={() => setCondition(c)}
                >
                  <Text style={[editModal.condText, { color: condition === c ? '#fff' : colors.textSecondary }]}>
                    {c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={editModal.actions}>
            <Pressable style={[editModal.cancelBtn, { borderColor: colors.border }]} onPress={onClose}>
              <Text style={[editModal.cancelText, { color: colors.textSecondary }]}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
            </Pressable>
            <Pressable
              style={[editModal.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <MaterialIcons name="check" size={16} color="#fff" />
              <Text style={editModal.saveText}>{saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const editModal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, maxHeight: '90%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, paddingTop: Spacing.sm, borderBottomWidth: 1,
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },
  field: { gap: 4 },
  label: { fontSize: FontSize.sm, fontWeight: '700' },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.md,
  },
  condRow: { flexDirection: 'row', gap: Spacing.sm },
  condBtn: {
    paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5,
    alignItems: 'center',
  },
  condText: { fontSize: FontSize.sm, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: Radius.lg, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: FontSize.md, fontWeight: '600' },
  saveBtn: {
    flex: 2, height: 50, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  saveText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const isAr = language === 'ar';

  const { categories } = useCategories();
  const [tab, setTab] = useState<Tab>('ads');
  const [ads, setAds] = useState<Ad[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [interstitials, setInterstitials] = useState<InterstitialAd[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [adSearch, setAdSearch] = useState('');

  // Store form state
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [stName, setStName] = useState('');
  const [stNameAr, setStNameAr] = useState('');
  const [stDesc, setStDesc] = useState('');
  const [stDescAr, setStDescAr] = useState('');
  const [stLogoUrl, setStLogoUrl] = useState('');
  const [stPhone, setStPhone] = useState('');
  const [stWhatsapp, setStWhatsapp] = useState('');
  const [stAddress, setStAddress] = useState('');
  const [stCategoryId, setStCategoryId] = useState('');
  const [stSaving, setStSaving] = useState(false);
  const [stLogoUploading, setStLogoUploading] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [broadcastVisible, setBroadcastVisible] = useState(false);

  // Banner form
  const [showBannerForm, setShowBannerForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bnTitle, setBnTitle] = useState('');
  const [bnSubtitle, setBnSubtitle] = useState('');
  const [bnImageUrl, setBnImageUrl] = useState('');
  const [bnLinkUrl, setBnLinkUrl] = useState('');
  const [bnSaving, setBnSaving] = useState(false);

  // Interstitial form
  const [showInterForm, setShowInterForm] = useState(false);
  const [editingInter, setEditingInter] = useState<InterstitialAd | null>(null);
  const [inTitle, setInTitle] = useState('');
  const [inMediaUrl, setInMediaUrl] = useState('');
  const [inMediaType, setInMediaType] = useState<'image' | 'video' | 'gif'>('image');
  const [inDuration, setInDuration] = useState('6');
  const [inSkipAfter, setInSkipAfter] = useState('3');
  const [inShowAfter, setInShowAfter] = useState('60');
  const [inSaving, setInSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (tab === 'stores') {
      const { data } = await adminFetchAllStores();
      setStores(data);
    } else if (tab === 'ads') {
      const { data } = await adminFetchAllAds();
      setAds(data);
    } else if (tab === 'users') {
      const { data } = await adminFetchAllUsers();
      setUsers(data);
    } else if (tab === 'banners') {
      const { data } = await fetchAllBanners();
      setBanners(data);
    } else if (tab === 'banners') {
      const { data } = await fetchAllBanners();
      setBanners(data);
    } else {
      const { data } = await fetchAllInterstitials();
      setInterstitials(data);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredAds = adSearch.trim()
    ? ads.filter(a =>
        a.title.toLowerCase().includes(adSearch.toLowerCase()) ||
        String(a.serial_number ?? '').includes(adSearch) ||
        a.id.toLowerCase().includes(adSearch.toLowerCase())
      )
    : ads;

  // ── Ad handlers ──
  const handleDeleteAd = (adId: string, title: string) => {
    showAlert(t.deleteAd, `"${title}"`, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive', onPress: async () => {
          const { error } = await adminDeleteAd(adId);
          if (error) showAlert('Error', error);
          else loadData();
        },
      },
    ]);
  };

  const openEditAd = (ad: Ad) => {
    setEditingAd(ad);
    setEditModalVisible(true);
  };

  const handleSaveAdEdit = async (id: string, updates: any) => {
    const { error } = await adminUpdateAd(id, updates);
    if (error) showAlert('Error', error);
    else loadData();
  };

  const handleToggleFeatured = async (ad: Ad) => {
    const isFeatured = ad.status === 'featured';
    const { error } = await adminSetAdFeatured(ad.id, !isFeatured);
    if (error) showAlert('Error', error);
    else loadData();
  };

  const handleToggleBoost = (ad: Ad) => {
    const isBoosted = ad.boosted_until && new Date(ad.boosted_until).getTime() > Date.now();
    showAlert(
      isBoosted ? t.removeboost : t.boostAd, isBoosted ? '' : t.boostAdConfirm,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isBoosted ? t.removeboost : t.boost,
          onPress: async () => {
            const { error } = await adminBoostAd(ad.id, !isBoosted);
            if (error) showAlert('Error', error);
            else loadData();
          },
        },
      ]
    );
  };

  // ── User handlers ──
  const handleToggleBlock = (u: UserProfile) => {
    const isBlocked = u.is_blocked;
    showAlert(isBlocked ? t.unblockUser : t.blockUser, '', [
      { text: t.cancel, style: 'cancel' },
      {
        text: isBlocked ? t.unblock : t.block,
        style: isBlocked ? 'default' : 'destructive',
        onPress: async () => {
          const { error } = await adminSetUserBlocked(u.id, !isBlocked);
          if (error) showAlert('Error', error);
          else loadData();
        },
      },
    ]);
  };

  const handleToggleVerified = (u: UserProfile) => {
    const makeVerified = !u.is_verified;
    showAlert(
      makeVerified ? (isAr ? 'منح توثيق البائع' : 'Verify Seller') : (isAr ? 'إلغاء التوثيق' : 'Remove Verification'),
      '',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isAr ? 'تأكيد' : 'Confirm',
          onPress: async () => {
            const { error } = await adminSetUserVerified(u.id, makeVerified);
            if (error) showAlert('Error', error);
            else loadData();
          },
        },
      ]
    );
  };

  const handleToggleAdmin = (u: UserProfile) => {
    const makeAdmin = !u.is_admin;
    showAlert(
      makeAdmin ? (isAr ? 'منح صلاحية مدير' : 'Grant Admin') : (isAr ? 'إلغاء صلاحية مدير' : 'Revoke Admin'),
      '',
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: isAr ? 'تأكيد' : 'Confirm',
          onPress: async () => {
            const { error } = await adminSetUserAdmin(u.id, makeAdmin);
            if (error) showAlert('Error', error);
            else loadData();
          },
        },
      ]
    );
  };

  // ── Store handlers ──
  const openStoreForm = (store?: Store) => {
    if (store) {
      setEditingStore(store);
      setStName(store.name);
      setStNameAr(store.name_ar);
      setStDesc(store.description);
      setStDescAr(store.description_ar);
      setStLogoUrl(store.logo_url);
      setStPhone(store.phone);
      setStWhatsapp(store.whatsapp);
      setStAddress(store.address);
      setStCategoryId(store.category_id);
    } else {
      setEditingStore(null);
      setStName(''); setStNameAr(''); setStDesc(''); setStDescAr('');
      setStLogoUrl(''); setStPhone(''); setStWhatsapp(''); setStAddress('');
      setStCategoryId(categories[0]?.id ?? '');
    }
    setShowStoreForm(true);
  };

  const handlePickStoreLogo = async () => {
    setStLogoUploading(true);
    try {
      const result = await pickImage('gallery');
      if (result) {
        const storeId = editingStore?.id ?? `tmp_${Date.now()}`;
        const { url } = await uploadImage(result.base64, 'store', storeId);
        if (url) setStLogoUrl(url);
      }
    } catch (_) {}
    setStLogoUploading(false);
  };

  const handleSaveStore = async () => {
    if (!stName.trim()) {
      return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'اسم المتجر مطلوب' : 'Store name is required.');
    }
    if (!stCategoryId) {
      return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى اختيار التصنيف' : 'Please select a category.');
    }
    setStSaving(true);
    const payload = {
      name: stName.trim(),
      name_ar: stNameAr.trim(),
      description: stDesc.trim(),
      description_ar: stDescAr.trim(),
      logo_url: stLogoUrl.trim(),
      phone: stPhone.trim(),
      whatsapp: stWhatsapp.trim(),
      address: stAddress.trim(),
      category_id: stCategoryId,
      is_active: true,
      position: stores.length,
    };
    const { error } = editingStore
      ? await adminUpdateStore(editingStore.id, payload)
      : await adminCreateStore(payload);
    setStSaving(false);
    if (error) { showAlert('Error', error); return; }
    setShowStoreForm(false);
    loadData();
  };

  const handleDeleteStore = (id: string, name: string) => {
    showAlert(
      isAr ? 'حذف المتجر' : 'Delete Store',
      isAr ? `حذف "${name}"؟` : `Delete "${name}"?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete, style: 'destructive', onPress: async () => {
            const { error } = await adminDeleteStore(id);
            if (error) showAlert('Error', error);
            else loadData();
          },
        },
      ]
    );
  };

  // ── Banner handlers ──
  const openBannerForm = (banner?: Banner) => {
    if (banner) {
      setEditingBanner(banner);
      setBnTitle(banner.title);
      setBnSubtitle(banner.subtitle);
      setBnImageUrl(banner.image_url);
      setBnLinkUrl(banner.link_url);
    } else {
      setEditingBanner(null);
      setBnTitle(''); setBnSubtitle(''); setBnImageUrl(''); setBnLinkUrl('');
    }
    setShowBannerForm(true);
  };

  const handleSaveBanner = async () => {
    if (!bnTitle.trim() || !bnImageUrl.trim()) {
      return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'العنوان ورابط الصورة مطلوبان' : 'Title and Image URL are required.');
    }
    setBnSaving(true);
    const input = { title: bnTitle.trim(), subtitle: bnSubtitle.trim(), image_url: bnImageUrl.trim(), link_url: bnLinkUrl.trim() };
    const { error } = editingBanner
      ? await updateBanner(editingBanner.id, input)
      : await createBanner(input);
    setBnSaving(false);
    if (error) { showAlert('Error', error); return; }
    setShowBannerForm(false);
    loadData();
  };

  const handleDeleteBanner = (id: string) => {
    showAlert(t.deleteBanner, t.deleteBannerConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive', onPress: async () => {
          const { error } = await deleteBanner(id);
          if (error) showAlert('Error', error);
          else loadData();
        },
      },
    ]);
  };

  // ── Interstitial handlers ──
  const openInterForm = (inter?: InterstitialAd) => {
    if (inter) {
      setEditingInter(inter);
      setInTitle(inter.title);
      setInMediaUrl(inter.media_url);
      setInMediaType(inter.media_type);
      setInDuration(String(inter.duration_seconds));
      setInSkipAfter(String(inter.skip_after_seconds));
      setInShowAfter(String(inter.show_after_seconds));
    } else {
      setEditingInter(null);
      setInTitle(''); setInMediaUrl(''); setInMediaType('image');
      setInDuration('6'); setInSkipAfter('3'); setInShowAfter('60');
    }
    setShowInterForm(true);
  };

  const handleSaveInter = async () => {
    if (!inMediaUrl.trim()) {
      return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'رابط الوسائط مطلوب' : 'Media URL is required.');
    }
    setInSaving(true);
    const payload = {
      title: inTitle.trim(),
      media_url: inMediaUrl.trim(),
      media_type: inMediaType,
      duration_seconds: parseInt(inDuration) || 6,
      skip_after_seconds: parseInt(inSkipAfter) || 3,
      show_after_seconds: parseInt(inShowAfter) || 60,
      is_active: true,
      position: interstitials.length,
    };
    const { error } = editingInter
      ? await updateInterstitial(editingInter.id, payload)
      : await createInterstitial(payload);
    setInSaving(false);
    if (error) { showAlert('Error', error); return; }
    setShowInterForm(false);
    loadData();
  };

  const handleDeleteInter = (id: string) => {
    showAlert(isAr ? 'حذف الإعلان' : 'Delete Ad', isAr ? 'هل تريد حذف هذا الإعلان؟' : 'Delete this interstitial ad?', [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive', onPress: async () => {
          const { error } = await deleteInterstitial(id);
          if (error) showAlert('Error', error);
          else loadData();
        },
      },
    ]);
  };

  // ── Render items ──
  const renderAdItem = ({ item }: { item: Ad }) => {
    const isFeatured = item.status === 'featured';
    const isBoosted = !!(item.boosted_until && new Date(item.boosted_until).getTime() > Date.now());
    const ownerName = (item as any).user_profiles?.username || (item as any).user_profiles?.email?.split('@')[0] || '?';
    const serialLabel = item.serial_number ? `SQ-${1000 + Number(item.serial_number)}` : null;
    const statusColor = item.status === 'active' ? colors.success
      : item.status === 'featured' ? colors.accentDark : colors.textMuted;
    const condLabel = item.condition === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used');

    return (
      <View style={[styles.card, {
        backgroundColor: colors.surface,
        borderColor: isBoosted ? colors.accent : colors.border,
        borderLeftWidth: isBoosted ? 3 : 1,
        borderLeftColor: isBoosted ? colors.accent : colors.border,
        ...Shadow.xs,
      }]}>
        {/* ── Card Header: title left, ID right ── */}
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
            {item.title}
          </Text>
          {serialLabel ? (
            <Text style={[styles.serialInline, { color: colors.textMuted }]}>#{serialLabel}</Text>
          ) : null}
        </View>

        {/* ── Description ── */}
        {item.description ? (
          <Text style={[styles.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        {/* ── Row 1: Price · Condition · Boost badge ── */}
        <View style={styles.cardInfoRow}>
          <Text style={[styles.cardPrice, { color: colors.primary }]}>₪{item.price.toLocaleString()}</Text>
          <View style={styles.infoDot} />
          <MaterialIcons
            name={item.condition === 'new' ? 'fiber-new' : 'recycling'}
            size={13}
            color={colors.textMuted}
          />
          <Text style={[styles.cardInfoText, { color: colors.textSecondary }]}>{condLabel}</Text>
          {isBoosted ? (
            <>
              <View style={styles.infoDot} />
              <MaterialIcons name="bolt" size={13} color={colors.accentDark} />
              <Text style={[styles.cardInfoText, { color: colors.accentDark, fontWeight: '700' }]}>
                {isAr ? 'معزّز' : 'Boosted'}
              </Text>
            </>
          ) : null}
          {isFeatured ? (
            <>
              <View style={styles.infoDot} />
              <MaterialIcons name="star" size={13} color="#D97706" />
              <Text style={[styles.cardInfoText, { color: '#D97706', fontWeight: '700' }]}>
                {isAr ? 'مميّز' : 'Featured'}
              </Text>
            </>
          ) : null}
        </View>

        {/* ── Row 2: Owner · Status dot · Location ── */}
        <View style={styles.cardInfoRow}>
          <MaterialIcons name="person-outline" size={13} color={colors.textMuted} />
          <Text style={[styles.cardInfoText, { color: colors.textSecondary }]} numberOfLines={1}>{ownerName}</Text>
          <View style={styles.infoDot} />
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.cardInfoText, { color: statusColor, fontWeight: '600' }]}>{item.status}</Text>
          {item.location ? (
            <>
              <View style={styles.infoDot} />
              <MaterialIcons name="location-on" size={12} color={colors.textMuted} />
              <Text style={[styles.cardInfoText, { color: colors.textMuted }]} numberOfLines={1}>
                {item.location}
              </Text>
            </>
          ) : null}
        </View>

        {/* ── Action icon strip ── */}
        <View style={[styles.iconStrip, { borderTopColor: colors.borderLight }]}>
          {/* Edit */}
          <Pressable style={[styles.iconStripBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => openEditAd(item)} hitSlop={4}>
            <MaterialIcons name="edit" size={16} color={colors.primary} />
          </Pressable>
          {/* Feature toggle */}
          <Pressable
            style={[styles.iconStripBtn, { backgroundColor: isFeatured ? '#FEF9C3' : colors.borderLight }]}
            onPress={() => handleToggleFeatured(item)}
            hitSlop={4}
          >
            <MaterialIcons name={isFeatured ? 'star' : 'star-border'} size={16} color={isFeatured ? '#D97706' : colors.textMuted} />
          </Pressable>
          {/* Boost toggle */}
          <Pressable
            style={[styles.iconStripBtn, { backgroundColor: isBoosted ? colors.accentLight : colors.borderLight }]}
            onPress={() => handleToggleBoost(item)}
            hitSlop={4}
          >
            <MaterialIcons name="bolt" size={16} color={isBoosted ? colors.accentDark : colors.textMuted} />
          </Pressable>
          {/* Spacer */}
          <View style={{ flex: 1 }} />
          {/* Delete — right-aligned, red */}
          <Pressable
            style={[styles.iconStripBtn, { backgroundColor: colors.errorLight }]}
            onPress={() => handleDeleteAd(item.id, item.title)}
            hitSlop={4}
          >
            <MaterialIcons name="delete-outline" size={16} color={colors.error} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderUserItem = ({ item }: { item: UserProfile }) => (
    <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.xs }]}>
      <View style={[styles.userAvatar, { backgroundColor: item.is_admin ? colors.primary : colors.surfaceTint }]}>
        <Text style={[styles.userAvatarText, { color: item.is_admin ? '#fff' : colors.textMuted }]}>
          {(item.username || item.email).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.username || item.email.split('@')[0]}
          </Text>
          {item.is_admin ? (
            <View style={[styles.adminBadge, { backgroundColor: colors.primary }]}>
              <MaterialIcons name="verified" size={10} color="#fff" />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          ) : null}
          {item.is_verified ? (
            <View style={[styles.adminBadge, { backgroundColor: '#2563EB' }]}>
              <MaterialIcons name="verified" size={10} color="#fff" />
              <Text style={styles.adminBadgeText}>{isAr ? 'موثّق' : 'Verified'}</Text>
            </View>
          ) : null}
          {item.is_blocked ? (
            <View style={[styles.adminBadge, { backgroundColor: colors.error }]}>
              <MaterialIcons name="block" size={10} color="#fff" />
              <Text style={styles.adminBadgeText}>{t.blocked}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.userEmail, { color: colors.textMuted }]} numberOfLines={1}>{item.email}</Text>
        {item.phone ? <Text style={[styles.userEmail, { color: colors.textMuted }]}>{item.phone}</Text> : null}
      </View>
      <View style={styles.userBtns}>
        {!item.is_admin && (
          <Pressable
            style={[styles.blockBtn, { backgroundColor: item.is_blocked ? colors.successLight : colors.errorLight }]}
            onPress={() => handleToggleBlock(item)}
          >
            <MaterialIcons
              name={item.is_blocked ? 'lock-open' : 'block'}
              size={15}
              color={item.is_blocked ? colors.success : colors.error}
            />
          </Pressable>
        )}
        <Pressable
          style={[styles.blockBtn, { backgroundColor: item.is_verified ? '#DBEAFE' : colors.borderLight }]}
          onPress={() => handleToggleVerified(item)}
        >
          <MaterialIcons
            name="verified"
            size={15}
            color={item.is_verified ? '#2563EB' : colors.textMuted}
          />
        </Pressable>
        <Pressable
          style={[styles.blockBtn, { backgroundColor: item.is_admin ? colors.accentLight : colors.primaryGhost }]}
          onPress={() => handleToggleAdmin(item)}
        >
          <MaterialIcons
            name="admin-panel-settings"
            size={15}
            color={item.is_admin ? colors.accentDark : colors.primary}
          />
        </Pressable>
      </View>
    </View>
  );

  const renderBannerItem = ({ item }: { item: Banner }) => (
    <View style={[styles.bannerCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.xs }]}>
      <View style={styles.bannerPreview}>
        <View style={[styles.bannerImgWrap, { backgroundColor: colors.surfaceTint }]}>
          <MaterialIcons name="image" size={24} color={colors.textMuted} />
        </View>
        <View style={styles.bannerInfo}>
          <Text style={[styles.bannerName, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.bannerSub, { color: colors.textMuted }]} numberOfLines={1}>{item.subtitle || '—'}</Text>
          <Text style={[styles.bannerUrl, { color: colors.primary }]} numberOfLines={1}>{item.image_url}</Text>
        </View>
        <View style={[styles.bannerStatus, { backgroundColor: item.is_active ? colors.successLight : colors.borderLight }]}>
          <Text style={[styles.bannerStatusText, { color: item.is_active ? colors.success : colors.textMuted }]}>
            {item.is_active ? t.bannerActive : t.bannerInactive}
          </Text>
        </View>
      </View>
      <View style={[styles.cardActions, { borderTopColor: colors.borderLight }]}>
        <Pressable style={[styles.actionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => openBannerForm(item)}>
          <MaterialIcons name="edit" size={14} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t.edit}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: item.is_active ? colors.borderLight : colors.successLight }]}
          onPress={() => toggleBannerActive(item.id, !item.is_active).then(() => loadData())}
        >
          <MaterialIcons name={item.is_active ? 'visibility-off' : 'visibility'} size={14} color={item.is_active ? colors.textMuted : colors.success} />
          <Text style={[styles.actionBtnText, { color: item.is_active ? colors.textMuted : colors.success }]}>{t.toggleBanner}</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: colors.errorLight }]} onPress={() => handleDeleteBanner(item.id)}>
          <MaterialIcons name="delete-outline" size={14} color={colors.error} />
          <Text style={[styles.actionBtnText, { color: colors.error }]}>{t.delete}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderInterItem = ({ item }: { item: InterstitialAd }) => (
    <View style={[styles.bannerCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.xs }]}>
      <View style={styles.bannerPreview}>
        <View style={[styles.bannerImgWrap, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name="play-circle-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.bannerInfo}>
          <Text style={[styles.bannerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title || (isAr ? 'بدون عنوان' : 'No title')}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.metaChip, { backgroundColor: colors.primaryGhost }]}>
              <MaterialIcons name="timer" size={10} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.primary }]}>{item.duration_seconds}s</Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: colors.borderLight }]}>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {isAr ? 'تخطي بعد' : 'Skip'} {item.skip_after_seconds}s
              </Text>
            </View>
            <View style={[styles.metaChip, { backgroundColor: colors.borderLight }]}>
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                {isAr ? 'يظهر بعد' : 'Show after'} {item.show_after_seconds}s
              </Text>
            </View>
          </View>
          <Text style={[styles.bannerUrl, { color: colors.primary }]} numberOfLines={1}>{item.media_url}</Text>
        </View>
        <View style={[styles.bannerStatus, { backgroundColor: item.is_active ? colors.successLight : colors.borderLight }]}>
          <Text style={[styles.bannerStatusText, { color: item.is_active ? colors.success : colors.textMuted }]}>
            {item.is_active ? t.bannerActive : t.bannerInactive}
          </Text>
        </View>
      </View>
      <View style={[styles.cardActions, { borderTopColor: colors.borderLight }]}>
        <Pressable style={[styles.actionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => openInterForm(item)}>
          <MaterialIcons name="edit" size={14} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t.edit}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: item.is_active ? colors.borderLight : colors.successLight }]}
          onPress={() => updateInterstitial(item.id, { is_active: !item.is_active }).then(() => loadData())}
        >
          <MaterialIcons name={item.is_active ? 'visibility-off' : 'visibility'} size={14} color={item.is_active ? colors.textMuted : colors.success} />
          <Text style={[styles.actionBtnText, { color: item.is_active ? colors.textMuted : colors.success }]}>{t.toggleBanner}</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: colors.errorLight }]} onPress={() => handleDeleteInter(item.id)}>
          <MaterialIcons name="delete-outline" size={14} color={colors.error} />
          <Text style={[styles.actionBtnText, { color: colors.error }]}>{t.delete}</Text>
        </Pressable>
      </View>
    </View>
  );

  const TABS: { key: Tab; icon: string; label: string; count: number }[] = [
    { key: 'ads', icon: 'storefront', label: t.allAds, count: ads.length },
    { key: 'users', icon: 'people', label: t.allUsers, count: users.length },
    { key: 'banners', icon: 'view-carousel', label: t.manageBanners, count: banners.length },
    { key: 'interstitials', icon: 'play-circle-outline', label: isAr ? 'إعلانات' : 'Full-Screen', count: interstitials.length },
    { key: 'stores', icon: 'store', label: isAr ? 'المتاجر' : 'Stores', count: stores.length },
  ];

  // ── Store form inline component ──
  const StoreForm = () => {
    const selectedCat = categories.find(c => c.id === stCategoryId);
    return (
      <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.inlineFormHeader}>
          <MaterialIcons name="store" size={18} color={colors.primary} />
          <Text style={[styles.inlineFormTitle, { color: colors.textPrimary, flex: 1 }]}>
            {editingStore ? (isAr ? 'تعديل المتجر' : 'Edit Store') : (isAr ? 'إضافة متجر' : 'Add Store')}
          </Text>
          <Pressable onPress={() => setShowStoreForm(false)} hitSlop={8}>
            <MaterialIcons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Logo Upload */}
        <Text style={[styles.inlineFieldLabel, { color: colors.textSecondary }]}>
          {isAr ? 'شعار المتجر' : 'Store Logo'}
        </Text>
        <View style={[storeFormS.logoRow]}>
          {stLogoUrl ? (
            <Image source={{ uri: stLogoUrl }} style={storeFormS.logoPreview} contentFit="cover" />
          ) : (
            <View style={[storeFormS.logoPlaceholder, { backgroundColor: colors.surfaceTint }]}>
              <MaterialIcons name="store" size={28} color={colors.textMuted} />
            </View>
          )}
          <Pressable
            style={[storeFormS.logoPickBtn, { borderColor: colors.primary, backgroundColor: colors.primaryGhost }]}
            onPress={handlePickStoreLogo}
            disabled={stLogoUploading}
          >
            {stLogoUploading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <MaterialIcons name="add-photo-alternate" size={18} color={colors.primary} />
            }
            <Text style={[storeFormS.logoPickBtnText, { color: colors.primary }]}>
              {stLogoUploading
                ? (isAr ? 'جاري الرفع...' : 'Uploading...')
                : (isAr ? 'رفع صورة' : 'Upload Image')
              }
            </Text>
          </Pressable>
          {stLogoUrl ? (
            <Pressable onPress={() => setStLogoUrl('')} hitSlop={8}>
              <MaterialIcons name="delete" size={20} color={colors.error} />
            </Pressable>
          ) : null}
        </View>

        {/* Or enter URL manually */}
        <View style={styles.inlineField}>
          <Text style={[styles.inlineFieldLabel, { color: colors.textMuted }]}>
            {isAr ? 'أو أدخل رابط الصورة يدوياً' : 'Or enter image URL manually'}
          </Text>
          <TextInput
            style={[styles.inlineInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
            value={stLogoUrl}
            onChangeText={setStLogoUrl}
            placeholder="https://..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </View>

        {/* Names */}
        {[
          { label: isAr ? 'اسم المتجر (إنجليزي) *' : 'Store Name (English) *', value: stName, onChange: setStName },
          { label: isAr ? 'اسم المتجر (عربي)' : 'Store Name (Arabic)', value: stNameAr, onChange: setStNameAr },
          { label: isAr ? 'الوصف (إنجليزي)' : 'Description (English)', value: stDesc, onChange: setStDesc },
          { label: isAr ? 'الوصف (عربي)' : 'Description (Arabic)', value: stDescAr, onChange: setStDescAr },
          { label: isAr ? 'رقم الهاتف' : 'Phone', value: stPhone, onChange: setStPhone },
          { label: isAr ? 'واتساب' : 'WhatsApp', value: stWhatsapp, onChange: setStWhatsapp },
          { label: isAr ? 'العنوان' : 'Address', value: stAddress, onChange: setStAddress },
        ].map(f => (
          <View key={f.label} style={styles.inlineField}>
            <Text style={[styles.inlineFieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
            <TextInput
              style={[styles.inlineInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              value={f.value}
              onChangeText={f.onChange}
              placeholder=""
              placeholderTextColor={colors.textMuted}
            />
          </View>
        ))}

        {/* Category selector */}
        <Text style={[styles.inlineFieldLabel, { color: colors.textSecondary }]}>
          {isAr ? 'التصنيف *' : 'Category *'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={storeFormS.catRow}>
          {categories.map(cat => {
            const isSel = stCategoryId === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[storeFormS.catChip, {
                  backgroundColor: isSel ? cat.color + '20' : colors.background,
                  borderColor: isSel ? cat.color : colors.border,
                }]}
                onPress={() => setStCategoryId(cat.id)}
              >
                <MaterialIcons name={cat.icon as any} size={14} color={isSel ? cat.color : colors.textMuted} />
                <Text style={[storeFormS.catChipText, { color: isSel ? cat.color : colors.textSecondary, fontWeight: isSel ? '700' : '500' }]}>
                  {getCategoryName(cat, language)}
                </Text>
                {isSel ? <MaterialIcons name="check-circle" size={13} color={cat.color} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          style={[styles.formSaveBtn, { backgroundColor: colors.primary, opacity: stSaving ? 0.7 : 1 }]}
          onPress={handleSaveStore}
          disabled={stSaving}
        >
          <MaterialIcons name="check" size={16} color="#fff" />
          <Text style={styles.formSaveBtnText}>
            {stSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (editingStore ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إضافة المتجر' : 'Add Store'))}
          </Text>
        </Pressable>
      </View>
    );
  };

  // ── Banner / Interstitial inline form renderer ──
  const BannerForm = () => (
    <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.inlineFormHeader}>
        <Text style={[styles.inlineFormTitle, { color: colors.textPrimary }]}>
          {editingBanner ? (isAr ? 'تعديل البانر' : 'Edit Banner') : t.addBanner}
        </Text>
        <Pressable onPress={() => setShowBannerForm(false)} hitSlop={8}>
          <MaterialIcons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {[
        { label: t.bannerTitle, value: bnTitle, onChange: setBnTitle, placeholder: 'e.g. Great Deals' },
        { label: t.bannerSubtitle, value: bnSubtitle, onChange: setBnSubtitle, placeholder: 'e.g. Browse now' },
        { label: t.bannerImageUrl, value: bnImageUrl, onChange: setBnImageUrl, placeholder: 'https://...' },
        { label: t.bannerLinkUrl, value: bnLinkUrl, onChange: setBnLinkUrl, placeholder: 'https://... (optional)' },
      ].map(f => (
        <View key={f.label} style={styles.inlineField}>
          <Text style={[styles.inlineFieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
          <TextInput
            style={[styles.inlineInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
            value={f.value}
            onChangeText={f.onChange}
            placeholder={f.placeholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
        </View>
      ))}
      <Pressable
        style={[styles.formSaveBtn, { backgroundColor: colors.primary, opacity: bnSaving ? 0.7 : 1 }]}
        onPress={handleSaveBanner}
        disabled={bnSaving}
      >
        <MaterialIcons name="check" size={16} color="#fff" />
        <Text style={styles.formSaveBtnText}>{bnSaving ? t.loading : (editingBanner ? t.saveEdit : t.addBanner)}</Text>
      </Pressable>
    </View>
  );

  const InterstitialForm = () => (
    <View style={[styles.inlineForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.inlineFormHeader}>
        <Text style={[styles.inlineFormTitle, { color: colors.textPrimary }]}>
          {editingInter ? (isAr ? 'تعديل الإعلان' : 'Edit Ad') : (isAr ? 'إضافة إعلان' : 'Add Full-Screen Ad')}
        </Text>
        <Pressable onPress={() => setShowInterForm(false)} hitSlop={8}>
          <MaterialIcons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {[
        { label: isAr ? 'العنوان (اختياري)' : 'Title (optional)', value: inTitle, onChange: setInTitle, placeholder: '' },
        { label: isAr ? 'رابط الوسائط' : 'Media URL (image/gif/video)', value: inMediaUrl, onChange: setInMediaUrl, placeholder: 'https://...' },
        { label: isAr ? 'المدة (ثانية)' : 'Duration (seconds)', value: inDuration, onChange: setInDuration, placeholder: '6', numeric: true },
        { label: isAr ? 'التخطي بعد (ثانية)' : 'Skip after (seconds)', value: inSkipAfter, onChange: setInSkipAfter, placeholder: '3', numeric: true },
        { label: isAr ? 'يظهر بعد (ثانية في التطبيق)' : 'Show after (seconds in app)', value: inShowAfter, onChange: setInShowAfter, placeholder: '60', numeric: true },
      ].map(f => (
        <View key={f.label} style={styles.inlineField}>
          <Text style={[styles.inlineFieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
          <TextInput
            style={[styles.inlineInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
            value={f.value}
            onChangeText={f.onChange}
            placeholder={f.placeholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType={(f as any).numeric ? 'numeric' : 'default'}
          />
        </View>
      ))}
      <Text style={[styles.inlineFieldLabel, { color: colors.textSecondary, marginBottom: 6 }]}>
        {isAr ? 'نوع الوسائط' : 'Media Type'}
      </Text>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
        {(['image', 'gif', 'video'] as const).map(mt => (
          <Pressable
            key={mt}
            style={[styles.mediaTypeBtn, {
              backgroundColor: inMediaType === mt ? colors.primary : colors.background,
              borderColor: inMediaType === mt ? colors.primary : colors.border,
              flex: 1,
            }]}
            onPress={() => setInMediaType(mt)}
          >
            <Text style={[styles.mediaTypeBtnText, { color: inMediaType === mt ? '#fff' : colors.textSecondary }]}>{mt}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[styles.formSaveBtn, { backgroundColor: colors.primary, opacity: inSaving ? 0.7 : 1 }]}
        onPress={handleSaveInter}
        disabled={inSaving}
      >
        <MaterialIcons name="check" size={16} color="#fff" />
        <Text style={styles.formSaveBtnText}>{inSaving ? t.loading : (editingInter ? t.saveEdit : (isAr ? 'إضافة' : 'Add Ad'))}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      {/* Broadcast Modal */}
      <BroadcastModal
        visible={broadcastVisible}
        onClose={() => setBroadcastVisible(false)}
        isAr={isAr}
        colors={colors}
      />

      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t.adminPanel}</Text>
          <Text style={styles.headerSub}>{t.adminPanelSub}</Text>
        </View>
        <Pressable
          style={[styles.broadcastBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}
          onPress={() => setBroadcastVisible(true)}
          hitSlop={4}
        >
          <MaterialIcons name="campaign" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* ── Tabs: horizontal scrollable pill bar ── */}
      <View style={[styles.tabBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map(tabItem => {
            const isActive = tab === tabItem.key;
            return (
              <Pressable
                key={tabItem.key}
                style={[
                  styles.tabPill,
                  isActive
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.surfaceTint },
                ]}
                onPress={() => setTab(tabItem.key)}
              >
                <MaterialIcons
                  name={tabItem.icon as any}
                  size={14}
                  color={isActive ? '#fff' : colors.textMuted}
                />
                <Text style={[styles.tabPillText, { color: isActive ? '#fff' : colors.textSecondary, fontWeight: isActive ? '700' : '500' }]}>
                  {tabItem.label}
                </Text>
                {tabItem.count > 0 ? (
                  <View style={[styles.tabPillBadge, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : colors.border }]}>
                    <Text style={[styles.tabPillBadgeText, { color: isActive ? '#fff' : colors.textMuted }]}>
                      {tabItem.count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : tab === 'ads' ? (
        <FlatList
          data={filteredAds}
          keyExtractor={item => item.id}
          renderItem={renderAdItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={[styles.searchBarWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialIcons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder={isAr ? 'ابحث بالعنوان أو الرقم...' : 'Search by title or #SQ...'}
                placeholderTextColor={colors.textMuted}
                value={adSearch}
                onChangeText={setAdSearch}
                autoCapitalize="none"
              />
              {adSearch ? (
                <Pressable onPress={() => setAdSearch('')} hitSlop={8}>
                  <MaterialIcons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="storefront" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t.noAdsToManage}</Text>
            </View>
          }
        />
      ) : tab === 'users' ? (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="people" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t.noUsersToManage}</Text>
            </View>
          }
        />
      ) : tab === 'banners' ? (
        <FlatList
          data={banners}
          keyExtractor={item => item.id}
          renderItem={renderBannerItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <Pressable
                style={[styles.addBtn, { backgroundColor: showBannerForm ? colors.border : colors.primary }]}
                onPress={() => openBannerForm()}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{t.addBanner}</Text>
              </Pressable>
              {showBannerForm ? <BannerForm /> : null}
            </>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="view-carousel" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t.noBanners}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={interstitials}
          keyExtractor={item => item.id}
          renderItem={renderInterItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={[styles.interHint, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '30' }]}>
                <MaterialIcons name="info-outline" size={16} color={colors.primary} />
                <Text style={[styles.interHintText, { color: colors.primary }]}>
                  {isAr
                    ? 'تظهر هذه الإعلانات بملء الشاشة بعد مرور المستخدم على التطبيق لفترة محددة.'
                    : 'These ads appear full-screen after the user has been in the app for the configured duration.'}
                </Text>
              </View>
              <Pressable
                style={[styles.addBtn, { backgroundColor: showInterForm ? colors.border : colors.primary }]}
                onPress={() => openInterForm()}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{isAr ? 'إضافة إعلان' : 'Add Full-Screen Ad'}</Text>
              </Pressable>
              {showInterForm ? <InterstitialForm /> : null}
            </>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="play-circle-outline" size={44} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {isAr ? 'لا توجد إعلانات بملء الشاشة' : 'No full-screen ads yet'}
              </Text>
            </View>
          }
        />
      )}

      {tab === 'stores' ? (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const cat = categories.find(c => c.id === item.category_id);
            const catLabel = cat ? getCategoryName(cat, language) : '';
            return (
              <View style={[styles.bannerCard, { backgroundColor: colors.surface, borderColor: colors.border, ...Shadow.xs }]}>
                <View style={styles.bannerPreview}>
                  {item.logo_url ? (
                    <Image source={{ uri: item.logo_url }} style={[styles.bannerImgWrap, { borderRadius: Radius.md }]} contentFit="cover" />
                  ) : (
                    <View style={[styles.bannerImgWrap, { backgroundColor: colors.primaryGhost, alignItems: 'center', justifyContent: 'center' }]}>
                      <MaterialIcons name="store" size={22} color={colors.primary} />
                    </View>
                  )}
                  <View style={styles.bannerInfo}>
                    <Text style={[styles.bannerName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.name_ar ? `${item.name} / ${item.name_ar}` : item.name}
                    </Text>
                    {catLabel ? (
                      <View style={[styles.metaChip, { backgroundColor: (cat?.color ?? colors.primary) + '15', alignSelf: 'flex-start' }]}>
                        <MaterialIcons name={(cat?.icon as any) ?? 'category'} size={11} color={cat?.color ?? colors.primary} />
                        <Text style={[styles.metaText, { color: cat?.color ?? colors.primary }]}>{catLabel}</Text>
                      </View>
                    ) : null}
                    {item.phone ? <Text style={[styles.bannerSub, { color: colors.textMuted }]}>{item.phone}</Text> : null}
                    {item.address ? <Text style={[styles.bannerUrl, { color: colors.textMuted }]} numberOfLines={1}>{item.address}</Text> : null}
                  </View>
                  <View style={[styles.bannerStatus, { backgroundColor: item.is_active ? colors.successLight : colors.borderLight }]}>
                    <Text style={[styles.bannerStatusText, { color: item.is_active ? colors.success : colors.textMuted }]}>
                      {item.is_active ? t.bannerActive : t.bannerInactive}
                    </Text>
                  </View>
                </View>
                <View style={[styles.cardActions, { borderTopColor: colors.borderLight }]}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: colors.primaryGhost }]} onPress={() => openStoreForm(item)}>
                    <MaterialIcons name="edit" size={14} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t.edit}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: item.is_active ? colors.borderLight : colors.successLight }]}
                    onPress={() => adminUpdateStore(item.id, { is_active: !item.is_active }).then(() => loadData())}
                  >
                    <MaterialIcons name={item.is_active ? 'visibility-off' : 'visibility'} size={14} color={item.is_active ? colors.textMuted : colors.success} />
                    <Text style={[styles.actionBtnText, { color: item.is_active ? colors.textMuted : colors.success }]}>
                      {item.is_active ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: colors.errorLight }]} onPress={() => handleDeleteStore(item.id, item.name)}>
                    <MaterialIcons name="delete-outline" size={14} color={colors.error} />
                    <Text style={[styles.actionBtnText, { color: colors.error }]}>{t.delete}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <Pressable
                style={[styles.addBtn, { backgroundColor: showStoreForm ? colors.border : colors.primary }]}
                onPress={() => openStoreForm()}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{isAr ? 'إضافة متجر جديد' : 'Add New Store'}</Text>
              </Pressable>
              {showStoreForm ? <StoreForm /> : null}
            </>
          }
          ListEmptyComponent={
            !showStoreForm ? (
              <View style={styles.center}>
                <MaterialIcons name="store" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {isAr ? 'لا توجد متاجر بعد' : 'No stores yet'}
                </Text>
              </View>
            ) : null
          }
        />
      ) : null}

      {/* Full Edit Modal */}
      <AdEditModal
        ad={editingAd}
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        onSave={handleSaveAdEdit}
        isAr={isAr}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    paddingBottom: Spacing.lg, gap: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  broadcastBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // ── Tab bar ──
  tabBarWrap: { borderBottomWidth: 1 },
  tabBarContent: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, height: 34, borderRadius: 17,
  },
  tabPillText: { fontSize: FontSize.xs },
  tabPillBadge: { borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabPillBadgeText: { fontSize: 9, fontWeight: '700' },
  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyText: { fontSize: FontSize.md, fontWeight: '500' },
  searchBarWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.lg, borderWidth: 1.5,
    paddingHorizontal: Spacing.md, height: 48, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, fontSize: FontSize.md },
  // ── Ad card ──
  card: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', padding: Spacing.md, gap: 6 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', lineHeight: 20 },
  serialInline: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  cardDesc: { fontSize: FontSize.xs, lineHeight: 16, color: '#888' },
  cardInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  cardPrice: { fontSize: FontSize.sm, fontWeight: '800' },
  cardInfoText: { fontSize: FontSize.xs, fontWeight: '500' },
  infoDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  // ── Icon action strip ──
  iconStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, paddingTop: Spacing.sm, marginTop: 4,
  },
  iconStripBtn: {
    width: 34, height: 34, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  // ── Legacy meta chips (used in banner/interstitial cards) ──
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full,
  },
  metaText: { fontSize: FontSize.xs, fontWeight: '600' },
  priceTag: { fontSize: FontSize.xs, fontWeight: '600' },
  cardActions: {
    flexDirection: 'row', padding: Spacing.sm, gap: Spacing.sm,
    borderTopWidth: 1, flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 7, borderRadius: Radius.md,
  },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  userAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: FontSize.lg, fontWeight: '800' },
  userInfo: { flex: 1, gap: 2 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userName: { fontSize: FontSize.md, fontWeight: '600' },
  userEmail: { fontSize: FontSize.xs },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full,
  },
  adminBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  userBtns: { flexDirection: 'row', gap: 6 },
  blockBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  bannerCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  bannerPreview: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.md, alignItems: 'center' },
  bannerImgWrap: { width: 52, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  bannerInfo: { flex: 1, gap: 2 },
  bannerName: { fontSize: FontSize.md, fontWeight: '600' },
  bannerSub: { fontSize: FontSize.xs },
  bannerUrl: { fontSize: 10 },
  bannerStatus: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  bannerStatusText: { fontSize: FontSize.xs, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.lg, paddingVertical: 14, marginBottom: Spacing.md,
  },
  addBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  inlineForm: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
    gap: Spacing.sm, marginBottom: Spacing.md,
  },
  inlineFormHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  inlineFormTitle: { fontSize: FontSize.md, fontWeight: '700' },
  inlineField: { gap: 4 },
  inlineFieldLabel: { fontSize: FontSize.xs, fontWeight: '700' },
  inlineInput: {
    height: 46, borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, fontSize: FontSize.md,
  },
  formSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, borderRadius: Radius.lg, paddingVertical: 14, marginTop: 4,
  },
  formSaveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  interHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md,
  },
  interHintText: { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },
  mediaTypeBtn: {
    paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, alignItems: 'center',
  },
  mediaTypeBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
});

const storeFormS = StyleSheet.create({
  logoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  logoPreview: {
    width: 72, height: 72, borderRadius: Radius.md,
  },
  logoPlaceholder: {
    width: 72, height: 72, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  logoPickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderRadius: Radius.lg, borderWidth: 1.5,
  },
  logoPickBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  catRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingBottom: Spacing.sm, marginBottom: Spacing.sm,
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  catChipText: { fontSize: FontSize.sm },
});
