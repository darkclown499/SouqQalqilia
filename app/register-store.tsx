import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, Pressable, TextInput,
  KeyboardAvoidingView, Platform, Modal, ActivityIndicator, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import {
  fetchStoreCategories, getStoreCategoryEmoji, getStoreCategoryName, StoreCategory,
} from '@/services/storeCategoriesService';
import { pickImage, uploadImage } from '@/services/imageService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';

const ADMIN_WHATSAPP = '972559886886';

// ── ثابت لتجنب إعادة الإنشاء ────────────────────────────────────────────────────
const ABSOLUTE_FILL = StyleSheet.absoluteFill;

// ── Qalqilya region locations ─────────────────────────────────────────────────
const QALQILYA_LOCATIONS = [
  'مدينة قلقيلية', 'عزون', 'كفر لاقف', 'كفر ثلث', 'النبي إلياس',
  'عسلة', 'صير', 'جيوس', 'فلامية', 'حبلة', 'رأس عطية', 'رأس طيرة',
  'عزبة سلمان', 'المدور', 'خربة الأشقر', 'مغارة الضبعة', 'حجة',
  'باقة الحطب', 'إماتين', 'فرعطة', 'كفر قدوم', 'جيت', 'عزبة جلعود',
  'جينصافوط', 'سنيريا', 'عزون عتمة', 'بيت أمين', 'واد الرشا', 'الفندق',
];

// ── Time picker ───────────────────────────────────────────────────────────────
function TimeInput({
  label, value, onChange, colors, isRTL,
}: { label: string; value: string; onChange: (v: string) => void; colors: any; isRTL: boolean }) {
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length === 0) { onChange(''); return; }
    if (digits.length <= 2) {
      const h = parseInt(digits, 10);
      if (h > 23) return;
      onChange(digits);
      return;
    }
    const h = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2, 4), 10);
    if (h > 23 || m > 59) return;
    onChange(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  };
  return (
    <View style={ti.wrap}>
      <Text style={[ti.label, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <View style={[ti.inputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <MaterialIcons name="access-time" size={16} color={colors.primary} />
        <TextInput
          style={[ti.input, { color: colors.textPrimary }]}
          value={value} onChangeText={handleChange}
          placeholder="HH:MM" placeholderTextColor={colors.textMuted}
          keyboardType="number-pad" maxLength={5}
        />
      </View>
    </View>
  );
}
const ti = StyleSheet.create({
  wrap: { flex: 1, gap: 4 },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 12, height: 48,
  },
  input: { flex: 1, fontSize: FontSize.md },
});

// ── Image picker tile ─────────────────────────────────────────────────────────
function ImagePickerTile({ label, icon, uri, loading, onPress, colors, isRTL }: {
  label: string; icon: string; uri: string | null; loading: boolean;
  onPress: () => void; colors: any; isRTL: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [ipt.wrap, { borderColor: uri ? colors.primary : colors.border, backgroundColor: colors.background, opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress} disabled={loading}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={ABSOLUTE_FILL} contentFit="cover" transition={200} />
          <View style={ipt.overlay} />
          <View style={ipt.editBadge}><MaterialIcons name="edit" size={14} color="#fff" /></View>
        </>
      ) : (
        <View style={ipt.inner}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <View style={[ipt.iconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name={icon as any} size={26} color={colors.primary} />
              </View>
              <Text style={[ipt.label, { color: colors.textSecondary }]}>{label}</Text>
              <Text style={[ipt.sub, { color: colors.textMuted }]}>{isRTL ? 'اضغط للإضافة' : 'Tap to add'}</Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}
const ipt = StyleSheet.create({
  wrap: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.xl, overflow: 'hidden', height: 120 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  editBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.full, padding: 6 },
  iconWrap: { width: 52, height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: FontSize.sm, fontWeight: '700' },
  sub: { fontSize: FontSize.xs },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function RegisterStoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const isMounted = useRef(true);

  // ── Store categories ──────────────────────────────────────────────────────
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catsError, setCatsError] = useState<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    const signal = controller.signal;

    setCatsLoading(true);
    fetchStoreCategories({ signal })
      .then(res => {
        if (!isMounted.current) return;
        setStoreCategories(res.data);
        setCatsError(null);
      })
      .catch(err => {
        if (!isMounted.current) return;
        if (err.name === 'AbortError') return;
        console.error('Error loading categories:', err);
        setCatsError(isAr ? 'فشل تحميل التصنيفات' : 'Failed to load categories');
      })
      .finally(() => {
        if (isMounted.current) setCatsLoading(false);
      });

    return () => {
      isMounted.current = false;
      controller.abort();
    };
  }, [isAr]);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [nameAr, setNameAr] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [locationModalVisible, setLocationModalVisible] = useState(false);

  const [openingTime, setOpeningTime] = useState('08:00');
  const [closingTime, setClosingTime] = useState('22:00');
  const [storeCategoryId, setStoreCategoryId] = useState('');
  const [catModalVisible, setCatModalVisible] = useState(false);

  // ── WhatsApp (new: prefix + number) ─────────────────────────────────────────
  const [whatsappPrefix, setWhatsappPrefix] = useState('972'); // '972' or '970'
  const [whatsappNumber, setWhatsappNumber] = useState(''); // digits only, without prefix

  // ── Images ──────────────────────────────────────────────────────────────────
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [bannerUri, setBannerUri] = useState<string | null>(null);
  const [bannerBase64, setBannerBase64] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(false);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [submittedStore, setSubmittedStore] = useState<{ name: string; whatsapp: string } | null>(null);

  const textAlign = isRTL ? 'right' as const : 'left' as const;
  const rtl = isRTL ? 'row-reverse' as const : 'row' as const;

  const selectedCat = storeCategories.find(c => c.id === storeCategoryId);

  // ✅ استخدام useMemo لحساب العنوان النهائي
  const finalAddress = useMemo(() => {
    return selectedLocation
      ? (locationDetail.trim() ? `${selectedLocation} - ${locationDetail.trim()}` : selectedLocation)
      : '';
  }, [selectedLocation, locationDetail]);

  // ✅ دالة لتنظيف الرقم (إزالة كل ما ليس رقم، وإزالة الأصفار الزائدة من البداية)
  const cleanWhatsAppNumber = useCallback((text: string) => {
    return text.replace(/[^0-9]/g, '').replace(/^0+/, '');
  }, []);

  // ── معالجات اختيار الصور ─────────────────────────────────────────────────
  const handlePickLogo = useCallback(async () => {
    setLogoLoading(true);
    try {
      const img = await pickImage('gallery', [1, 1]);
      if (img) { setLogoUri(img.uri); setLogoBase64(img.base64); }
    } finally { setLogoLoading(false); }
  }, []);

  const handlePickBanner = useCallback(async () => {
    setBannerLoading(true);
    try {
      const img = await pickImage('gallery', [2, 1]);
      if (img) { setBannerUri(img.uri); setBannerBase64(img.base64); }
    } finally { setBannerLoading(false); }
  }, []);

  // ✅ دالة renderItem للمناطق
  const renderLocationItem = useCallback(({ item: loc }: { item: string }) => {
    const isSel = loc === selectedLocation;
    return (
      <Pressable
        style={({ pressed }) => [cm.item, {
          borderColor: isSel ? colors.primary : colors.borderLight,
          backgroundColor: isSel ? colors.primary + '12' : (pressed ? colors.surfaceTint : colors.background),
          flexDirection: rtl,
        }]}
        onPress={() => { setSelectedLocation(loc); setLocationModalVisible(false); }}
      >
        <View style={[cm.icon, { backgroundColor: isSel ? colors.primary + '20' : colors.surfaceTint }]}>
          <MaterialIcons name="location-on" size={20} color={isSel ? colors.primary : colors.textMuted} />
        </View>
        <Text style={[cm.itemText, { color: isSel ? colors.primary : colors.textPrimary, fontWeight: isSel ? '700' : '500', flex: 1, textAlign: 'right' }]}>
          {loc}
        </Text>
        {isSel ? <MaterialIcons name="check-circle" size={20} color={colors.primary} /> : null}
      </Pressable>
    );
  }, [selectedLocation, colors, rtl]);

  // ✅ دالة renderItem للتصنيفات
  const renderCategoryItem = useCallback(({ item: cat }: { item: StoreCategory }) => {
    const isSel = cat.id === storeCategoryId;
    const emoji = getStoreCategoryEmoji(cat.slug);
    return (
      <Pressable
        style={({ pressed }) => [cm.item, {
          borderColor: isSel ? cat.color : colors.borderLight,
          backgroundColor: isSel ? cat.color + '15' : (pressed ? colors.surfaceTint : colors.background),
          flexDirection: rtl,
        }]}
        onPress={() => { setStoreCategoryId(cat.id); setCatModalVisible(false); }}
      >
        <View style={[cm.icon, { backgroundColor: isSel ? cat.color + '25' : colors.surfaceTint }]}>
          {emoji ? <Text style={{ fontSize: 22 }}>{emoji}</Text> : <MaterialIcons name={cat.icon as any} size={22} color={isSel ? cat.color : colors.textMuted} />}
        </View>
        <Text style={[cm.itemText, { color: isSel ? cat.color : colors.textPrimary, fontWeight: isSel ? '700' : '500', flex: 1, textAlign }]}>
          {getStoreCategoryName(cat, language)}
        </Text>
        {isSel ? <MaterialIcons name="check-circle" size={20} color={cat.color} /> : null}
      </Pressable>
    );
  }, [storeCategoryId, colors, rtl, textAlign, language]);

  // ✅ التحقق من صحة الوقت
  const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  const isTimeValid = useMemo(() => {
    if (!isValidTime(openingTime) || !isValidTime(closingTime)) return false;
    const [oh, om] = openingTime.split(':').map(Number);
    const [ch, cm] = closingTime.split(':').map(Number);
    const openMinutes = oh * 60 + om;
    const closeMinutes = ch * 60 + cm;
    return openMinutes < closeMinutes;
  }, [openingTime, closingTime]);

  // ── دالة الإرسال ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!user) {
      showAlert(isAr ? 'خطأ' : 'Error', isAr ? 'يجب تسجيل الدخول أولاً' : 'Please login first');
      return;
    }
    const storeName = nameAr.trim();
    if (!storeName) return showAlert('مطلوب', 'يرجى إدخال اسم المتجر بالعربية');
    if (!storeCategoryId) return showAlert('مطلوب', 'يرجى اختيار نوع المتجر');
    if (!selectedLocation) return showAlert('مطلوب', 'يرجى اختيار المنطقة / البلدة');

    // ✅ التحقق من رقم واتساب
    const localNumber = whatsappNumber.trim();
    if (!localNumber) return showAlert('مطلوب', 'يرجى إدخال رقم الهاتف المحلي');
    if (localNumber.length < 9) {
      return showAlert(
        isAr ? 'رقم غير صحيح' : 'Invalid Number',
        isAr ? 'يجب أن يحتوي الرقم المحلي على 9 أرقام على الأقل' : 'Local number must have at least 9 digits'
      );
    }
    const fullWhatsApp = `+${whatsappPrefix}${localNumber}`;

    if (!logoUri) return showAlert('مطلوب', 'يرجى إضافة شعار المتجر (إجباري)');
    if (!bannerUri) return showAlert('مطلوب', 'يرجى إضافة صورة غلاف المتجر (إجباري)');

    if (!isValidTime(openingTime) || !isValidTime(closingTime)) {
      return showAlert('توقيت غير صحيح', 'يرجى إدخال التوقيت بصيغة HH:MM (مثال: 08:00)');
    }

    if (!isTimeValid) {
      return showAlert(
        isAr ? 'توقيت غير صحيح' : 'Invalid Time',
        isAr ? 'يجب أن يكون وقت الإغلاق بعد وقت الفتح' : 'Closing time must be after opening time'
      );
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      let logoUrl = '';
      let bannerUrl = '';

      // ✅ رفع الصور بالتوازي
      const uploadPromises: Promise<void>[] = [];

      if (logoBase64 && logoUri) {
        uploadPromises.push(
          (async () => {
            const res = await uploadImage(logoBase64, user.id, 'store-logo', logoUri);
            if (res.error) throw new Error(res.error);
            if (!res.url) throw new Error(isAr ? 'فشل رفع شعار المتجر' : 'Failed to upload logo');
            logoUrl = res.url;
          })()
        );
      }

      if (bannerBase64 && bannerUri) {
        uploadPromises.push(
          (async () => {
            const res = await uploadImage(bannerBase64, user.id, 'store-banner', bannerUri);
            if (res.error) throw new Error(res.error);
            if (!res.url) throw new Error(isAr ? 'فشل رفع غلاف المتجر' : 'Failed to upload banner');
            bannerUrl = res.url;
          })()
        );
      }

      await Promise.all(uploadPromises);

      const { data: storeData, error } = await supabase
        .from('stores')
        .insert({
          name: nameAr.trim(),
          name_ar: nameAr.trim(),
          description: '',
          description_ar: '',
          address: finalAddress,
          whatsapp: fullWhatsApp,
          owner_whatsapp: fullWhatsApp,
          phone: fullWhatsApp,
          opening_time: openingTime,
          closing_time: closingTime,
          store_category_id: storeCategoryId,
          category_id: null,
          logo_url: logoUrl,
          banner_url: bannerUrl,
          owner_id: user.id,
          is_approved: false,
          is_active: true,
          is_featured: false,
          position: 999,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (!storeData) throw new Error(isAr ? 'فشل إنشاء المتجر' : 'Failed to create store');

      const finalName = storeData.name_ar || storeData.name || storeName;
      setSubmittedStore({ name: finalName, whatsapp: fullWhatsApp });
      setSuccessVisible(true);
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e.message ?? (isAr ? 'فشل الإرسال' : 'Submission failed'));
    } finally {
      setLoading(false);
    }
  }, [user, nameAr, storeCategoryId, selectedLocation, finalAddress, whatsappPrefix, whatsappNumber, openingTime, closingTime, logoBase64, logoUri, bannerBase64, bannerUri, isAr, showAlert, isTimeValid, isValidTime]);

  const handleSuccessWhatsApp = useCallback(() => {
    if (!submittedStore || !user) return;
    const displayName = user.username || user.email?.split('@')[0] || 'عميل';
    const msg = `مرحباً إدارة سوق قلقيلية، أنا ${displayName}. لقد قمت للتو بتقديم طلب لإضافة متجري (${submittedStore.name}) وهو الآن قيد المراجعة في النظام. رقمي للتواصل: ${submittedStore.whatsapp}.`;
    Linking.openURL(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(msg)}`).catch(() => {});
  }, [submittedStore, user]);

  const handleSuccessClose = useCallback(() => {
    setSuccessVisible(false);
    router.back();
  }, [router]);

  // ── keyExtractor للمناطق والتصنيفات ─────────────────────────────────────
  const locationKeyExtractor = useCallback((item: string) => item, []);
  const categoryKeyExtractor = useCallback((item: StoreCategory) => item.id, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={[s.header, { backgroundColor: colors.primary }]}>
          <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#fff" />
          </Pressable>
          <View style={s.headerDeco1} pointerEvents="none" />
          <View style={[s.headerTextBlock, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <Text style={[s.headerSub, { textAlign }]}>{isAr ? 'أطلق علامتك التجارية' : 'Launch your brand'}</Text>
            <Text style={[s.headerTitle, { textAlign }]}>{isAr ? 'تسجيل متجرك' : 'Register Your Store'}</Text>
          </View>
          <View style={s.headerBadge}>
            <MaterialIcons name="storefront" size={24} color="#fff" />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>

          {/* ── Intro card ── */}
          <View style={[s.introCard, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '44' }]}>
            <MaterialIcons name="info-outline" size={18} color={colors.primary} />
            <Text style={[s.introText, { color: colors.primary, textAlign }]}>
              {isAr
                ? 'بعد تقديم الطلب سيتم مراجعته من قِبَل الإدارة. سيتم تفعيل متجرك خلال 24 ساعة.'
                : 'After submission, your request will be reviewed by admin. Your store will be activated within 24 hours.'}
            </Text>
          </View>

          {/* ── Images (mandatory) ── */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={[s.sectionHead, { flexDirection: rtl }]}>
              <MaterialIcons name="photo-camera" size={18} color={colors.primary} />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{'صور المتجر'}</Text>
              <Text style={[s.sectionSub, { color: '#EF4444' }]}>{'(إجباري *)'}</Text>
            </View>
            <View style={[s.imageRow, { flexDirection: rtl, gap: Spacing.md }]}>
              <View style={{ width: '48%' }}>
                <Text style={[s.imgLabel, { color: colors.textSecondary, textAlign: 'right' }]}>{'الشعار *'}</Text>
                <ImagePickerTile
                  label={'شعار المتجر'} icon="store"
                  uri={logoUri} loading={logoLoading}
                  onPress={handlePickLogo} colors={colors} isRTL={isRTL}
                />
                <Text style={[s.imgDimHint, { color: colors.textMuted }]}>{'المقاس الموصى به: 500×500'}</Text>
              </View>
              <View style={{ width: '48%' }}>
                <Text style={[s.imgLabel, { color: colors.textSecondary, textAlign: 'right' }]}>{'الغلاف *'}</Text>
                <ImagePickerTile
                  label={'غلاف المتجر'} icon="panorama"
                  uri={bannerUri} loading={bannerLoading}
                  onPress={handlePickBanner} colors={colors} isRTL={isRTL}
                />
                <Text style={[s.imgDimHint, { color: colors.textMuted }]}>{'المقاس الموصى به: 1000×500'}</Text>
              </View>
            </View>
          </View>

          {/* ── Store Name (Arabic only) ── */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={[s.sectionHead, { flexDirection: rtl }]}>
              <MaterialIcons name="drive-file-rename-outline" size={18} color={colors.primary} />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{'اسم المتجر *'}</Text>
            </View>
            <Text style={[s.fieldLabel, { color: colors.textSecondary, textAlign: 'right' }]}>{'الاسم بالعربية'}</Text>
            <TextInput
              style={[s.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: 'right' }]}
              placeholder="اسم المتجر بالعربية" placeholderTextColor={colors.textMuted}
              value={nameAr} onChangeText={setNameAr} maxLength={60}
            />
          </View>

          {/* ── Store Category ── */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={[s.sectionHead, { flexDirection: rtl }]}>
              <MaterialIcons name="category" size={18} color={colors.primary} />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{isAr ? 'نوع المتجر' : 'Store Type'} *</Text>
            </View>
            <Text style={[s.fieldHint, { color: colors.textMuted, textAlign }]}>
              {isAr ? 'اختر التصنيف المناسب لنشاطك التجاري' : 'Select the category that matches your business'}
            </Text>
            {catsLoading ? (
              <View style={s.catsLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[s.catsLoadingText, { color: colors.textMuted }]}>
                  {isAr ? 'جارٍ التحميل...' : 'Loading...'}
                </Text>
              </View>
            ) : catsError ? (
              <View style={[s.catsLoading, { backgroundColor: '#FEE2E2', padding: 10, borderRadius: Radius.md }]}>
                <MaterialIcons name="error-outline" size={18} color="#EF4444" />
                <Text style={[s.catsLoadingText, { color: '#EF4444', flex: 1 }]}>{catsError}</Text>
              </View>
            ) : (
              <Pressable
                style={[s.catSelector, { borderColor: storeCategoryId ? colors.primary : colors.border, backgroundColor: colors.background, flexDirection: rtl }]}
                onPress={() => setCatModalVisible(true)}
              >
                {selectedCat ? (
                  <>
                    <View style={[s.catIconCircle, { backgroundColor: selectedCat.color + '20' }]}>
                      {getStoreCategoryEmoji(selectedCat.slug) ? (
                        <Text style={{ fontSize: 20 }}>{getStoreCategoryEmoji(selectedCat.slug)}</Text>
                      ) : (
                        <MaterialIcons name={selectedCat.icon as any} size={18} color={selectedCat.color} />
                      )}
                    </View>
                    <Text style={[s.catSelectorText, { color: colors.textPrimary, flex: 1, textAlign }]}>
                      {getStoreCategoryName(selectedCat, language)}
                    </Text>
                    <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                  </>
                ) : (
                  <>
                    <MaterialIcons name="add-circle-outline" size={20} color={colors.textMuted} />
                    <Text style={[s.catSelectorText, { color: colors.textMuted, flex: 1, textAlign }]}>
                      {isAr ? 'اختر نوع المتجر' : 'Select store type'}
                    </Text>
                    <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textMuted} />
                  </>
                )}
              </Pressable>
            )}
          </View>

          {/* ── Location ── */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={[s.sectionHead, { flexDirection: rtl }]}>
              <MaterialIcons name="location-on" size={18} color={colors.primary} />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{'المنطقة / البلدة *'}</Text>
            </View>

            <Pressable
              style={[s.catSelector, { borderColor: selectedLocation ? colors.primary : colors.border, backgroundColor: colors.background, flexDirection: rtl }]}
              onPress={() => setLocationModalVisible(true)}
            >
              {selectedLocation ? (
                <>
                  <MaterialIcons name="location-on" size={18} color={colors.primary} />
                  <Text style={[s.catSelectorText, { color: colors.textPrimary, flex: 1, textAlign: 'right' }]}>
                    {selectedLocation}
                  </Text>
                  <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                </>
              ) : (
                <>
                  <MaterialIcons name="add-location-alt" size={20} color={colors.textMuted} />
                  <Text style={[s.catSelectorText, { color: colors.textMuted, flex: 1, textAlign: 'right' }]}>
                    {'اختر المنطقة أو البلدة'}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textMuted} />
                </>
              )}
            </Pressable>

            <Text style={[s.fieldLabel, { color: colors.textSecondary, textAlign: 'right', marginTop: 4 }]}>
              {'تفاصيل العنوان (اختياري)'}
            </Text>
            <TextInput
              style={[s.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: 'right' }]}
              placeholder={'مثال: شارع الرئيسي، بجانب البنك'}
              placeholderTextColor={colors.textMuted}
              value={locationDetail}
              onChangeText={setLocationDetail}
              maxLength={100}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* ── Working Hours ── */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={[s.sectionHead, { flexDirection: rtl }]}>
              <MaterialIcons name="schedule" size={18} color={colors.primary} />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{isAr ? 'ساعات العمل' : 'Working Hours'}</Text>
            </View>
            <View style={[s.timeRow, { flexDirection: rtl }]}>
              <TimeInput label={isAr ? 'وقت الفتح' : 'Opening'} value={openingTime} onChange={setOpeningTime} colors={colors} isRTL={isRTL} />
              <View style={[s.timeDivider, { backgroundColor: colors.border }]} />
              <TimeInput label={isAr ? 'وقت الإغلاق' : 'Closing'} value={closingTime} onChange={setClosingTime} colors={colors} isRTL={isRTL} />
            </View>
            <Text style={[s.timeHint, { color: colors.textMuted, textAlign }]}>
              {isAr ? 'استخدم نظام 24 ساعة — مثال: 08:00 للثامنة صباحاً' : 'Use 24h format — e.g. 08:00 for 8am, 22:00 for 10pm'}
            </Text>
            {!isTimeValid && openingTime && closingTime && (
              <View style={[s.timeWarning, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <MaterialIcons name="warning" size={14} color="#D97706" />
                <Text style={s.timeWarningText}>
                  {isAr ? '⚠️ وقت الإغلاق يجب أن يكون بعد وقت الفتح' : '⚠️ Closing time must be after opening time'}
                </Text>
              </View>
            )}
          </View>

          {/* ── WhatsApp (مع أزرار البادئة) ── */}
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={[s.sectionHead, { flexDirection: rtl }]}>
              <MaterialIcons name="chat" size={18} color="#25D366" />
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{'رقم واتساب للتواصل *'}</Text>
            </View>

            {/* أزرار اختيار البادئة */}
            <View style={{ flexDirection: rtl, gap: 12, marginBottom: 8 }}>
              {['972', '970'].map(prefix => {
                const selected = whatsappPrefix === prefix;
                return (
                  <Pressable
                    key={prefix}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: Radius.full,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primaryGhost : colors.background,
                    }}
                    onPress={() => setWhatsappPrefix(prefix)}
                  >
                    <Text style={{ fontWeight: '700', color: selected ? colors.primary : colors.textSecondary }}>
                      +{prefix}
                    </Text>
                    {selected && <MaterialIcons name="check-circle" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </View>

            {/* حقل الرقم المحلي */}
            <Text style={[s.fieldLabel, { color: colors.textSecondary, textAlign: 'right' }]}>
              {'رقم الهاتف المحلي (بدون بادئة)'}
            </Text>
            <TextInput
              style={[s.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: 'left' }]}
              placeholder={'مثال: 52324302'}
              placeholderTextColor={colors.textMuted}
              value={whatsappNumber}
              onChangeText={(text) => setWhatsappNumber(cleanWhatsAppNumber(text))}
              keyboardType="number-pad"
              maxLength={12}
            />

            <View style={[s.waHintRow, { flexDirection: rtl }]}>
              <MaterialIcons name="info-outline" size={13} color={colors.textMuted} />
              <Text style={[s.timeHint, { color: colors.textMuted, flex: 1, textAlign: 'right' }]}>
                {'سيتم حفظ الرقم بالصيغة: +' + whatsappPrefix + 'xxxxxxxxx'}
              </Text>
            </View>
          </View>

          {/* ── Submit ── */}
          <Pressable
            style={[s.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.75 : 1 }]}
            onPress={handleSubmit} disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="#fff" />
                <Text style={s.submitText}>{isAr ? 'إرسال طلب التسجيل' : 'Submit Registration'}</Text>
              </>
            )}
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>

        {/* ── Location Picker Modal ── */}
        <Modal visible={locationModalVisible} transparent animationType="slide" onRequestClose={() => setLocationModalVisible(false)} statusBarTranslucent>
          <Pressable style={cm.overlay} onPress={() => setLocationModalVisible(false)}>
            <View style={[cm.sheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
              <View style={[cm.handle, { backgroundColor: colors.border }]} />
              <View style={[cm.titleRow, { flexDirection: rtl }]}>
                <MaterialIcons name="location-on" size={20} color={colors.primary} />
                <Text style={[cm.titleText, { color: colors.textPrimary }]}>{'اختر المنطقة / البلدة'}</Text>
                <Pressable onPress={() => setLocationModalVisible(false)} hitSlop={10}>
                  <MaterialIcons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[cm.subtitle, { color: colors.textMuted, textAlign: 'right' }]}>
                {'محافظة قلقيلية — اختر البلدة التي يقع فيها متجرك'}
              </Text>
              <FlatList
                data={QALQILYA_LOCATIONS}
                keyExtractor={locationKeyExtractor}
                contentContainerStyle={cm.list}
                renderItem={renderLocationItem}
              />
            </View>
          </Pressable>
        </Modal>

        {/* ── Store Category Picker Modal ── */}
        <Modal visible={catModalVisible} transparent animationType="slide" onRequestClose={() => setCatModalVisible(false)} statusBarTranslucent>
          <Pressable style={cm.overlay} onPress={() => setCatModalVisible(false)}>
            <View style={[cm.sheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
              <View style={[cm.handle, { backgroundColor: colors.border }]} />
              <View style={[cm.titleRow, { flexDirection: rtl }]}>
                <MaterialIcons name="storefront" size={20} color={colors.primary} />
                <Text style={[cm.titleText, { color: colors.textPrimary }]}>
                  {isAr ? 'اختر نوع المتجر' : 'Select Store Type'}
                </Text>
                <Pressable onPress={() => setCatModalVisible(false)} hitSlop={10}>
                  <MaterialIcons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[cm.subtitle, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                {isAr ? 'هذه التصنيفات خاصة بأنواع المتاجر فقط' : 'These are store-specific business types'}
              </Text>
              <FlatList
                data={storeCategories}
                keyExtractor={categoryKeyExtractor}
                contentContainerStyle={cm.list}
                renderItem={renderCategoryItem}
              />
            </View>
          </Pressable>
        </Modal>

        {/* ── Success Modal ── */}
        <Modal visible={successVisible} transparent animationType="fade" onRequestClose={handleSuccessClose}>
          <View style={sm.overlay}>
            <View style={[sm.card, { backgroundColor: colors.surface }]}>
              <View style={sm.iconWrap}>
                <View style={[sm.iconOuter, { backgroundColor: '#D1FAE5' }]}>
                  <MaterialIcons name="check-circle" size={44} color="#16a34a" />
                </View>
              </View>
              <Text style={[sm.title, { color: '#16a34a' }]}>
                {isAr ? 'تم إرسال الطلب بنجاح! 🎉' : 'Request Submitted! 🎉'}
              </Text>
              <Text style={[sm.sub, { color: colors.textSecondary }]}>
                {isAr
                  ? 'تم إرسال طلب متجرك بنجاح. وهو الآن قيد المراجعة من قِبَل الإدارة. سيتم التواصل معك خلال 24 ساعة.'
                  : 'Your store request was submitted. It is now under review by our admin. We will contact you within 24 hours.'}
              </Text>
              {submittedStore ? (
                <View style={[sm.storeBadge, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '44' }]}>
                  <MaterialIcons name="storefront" size={16} color={colors.primary} />
                  <Text style={[sm.storeName, { color: colors.primary }]}>{submittedStore.name}</Text>
                </View>
              ) : null}
              <Pressable style={[sm.waBtn, { backgroundColor: '#25D366' }]} onPress={handleSuccessWhatsApp}>
                <MaterialIcons name="chat" size={18} color="#fff" />
                <Text style={sm.waBtnText}>{isAr ? 'إشعار الإدارة عبر واتساب' : 'Notify Admin via WhatsApp'}</Text>
              </Pressable>
              <Pressable style={[sm.closeBtn, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={handleSuccessClose}>
                <Text style={[sm.closeBtnText, { color: colors.textSecondary }]}>{isAr ? 'إغلاق' : 'Close'}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, paddingTop: Spacing.sm,
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md, overflow: 'hidden',
  },
  headerDeco1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -40 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  headerTextBlock: { flex: 1, gap: 2 },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  headerBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },

  content: { padding: Spacing.lg, gap: Spacing.md },

  introCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md },
  introText: { flex: 1, fontSize: FontSize.sm, lineHeight: 20, fontWeight: '600' },

  section: { borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.sm, ...Shadow.xs },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  sectionSub: { fontSize: FontSize.xs },

  fieldHint: { fontSize: FontSize.xs, lineHeight: 17, marginTop: -4 },

  imageRow: { gap: Spacing.md },
  imgLabel: { fontSize: FontSize.xs, fontWeight: '600', marginBottom: 6 },
  imgDimHint: { fontSize: 10, fontWeight: '500', textAlign: 'center', marginTop: 5, lineHeight: 14 },
  waHintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 2 },

  fieldGap: { gap: Spacing.sm },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, minHeight: 48,
  },

  catsLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  catsLoadingText: { fontSize: FontSize.sm },

  catSelector: {
    borderWidth: 1.5, borderRadius: Radius.lg,
    paddingVertical: 12, paddingHorizontal: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  catIconCircle: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catSelectorText: { fontSize: FontSize.md, fontWeight: '600' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  timeDivider: { width: 1, height: 40, borderRadius: 99 },
  timeHint: { fontSize: FontSize.xs, lineHeight: 17 },
  timeWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    padding: 10, borderRadius: Radius.md, borderWidth: 1.5,
    marginTop: 4,
  },
  timeWarningText: { flex: 1, fontSize: FontSize.xs, lineHeight: 17, fontWeight: '600', color: '#92400E' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: Radius.full, marginTop: 4,
    ...Shadow.colored,
  },
  submitText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '700' },
});

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 9999 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, height: 500 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 4 },
  titleText: { fontSize: 18, fontWeight: '700', flex: 1 },
  subtitle: { fontSize: 12, paddingHorizontal: 20, marginBottom: 10 },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 60 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 16, color: '#111827' },
});

const sm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  card: { width: '100%', borderRadius: 28, padding: Spacing.xl, gap: Spacing.md, alignItems: 'center', ...Shadow.lg },
  iconWrap: { marginBottom: 4 },
  iconOuter: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#6ee7b7' },
  title: { fontSize: FontSize.xl, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  sub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
  storeBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.full, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 8, width: '100%', justifyContent: 'center' },
  storeName: { fontSize: FontSize.md, fontWeight: '700' },
  waBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.full, shadowColor: '#25D366', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  waBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  closeBtn: { width: '100%', paddingVertical: 13, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: FontSize.md, fontWeight: '600' },
});