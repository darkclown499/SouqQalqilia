import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, Pressable, KeyboardAvoidingView,
  Platform, Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuth, useAlert } from '@/template';
import { Button, Input } from '@/components';
import { useCategories } from '@/hooks/useCategories';
import { createAd, saveAdImages } from '@/services/adsService';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { pickImage, pickMultipleImages, uploadImage, generateBlurhash } from '@/services/imageService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { MAX_AD_IMAGES } from '@/constants/config';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ImageItem { uri: string; base64: string; blurhash?: string | null; mimeType?: string; size?: number }
type PostMode = 'product_ad' | 'product_request';
type Condition = 'new' | 'used';

const PHONE_PREFIXES = ['+970', '+972'];
const MAX_IMAGE_SIZE_MB = 5; // 5 ميجابايت كحد أقصى

// ── Qalqilya locations ────────────────────────────────────────────────────────
const QALQILYA_CITY = 'قلقيلية المدينة';
const QALQILYA_LOCATIONS = [
  'قلقيلية المدينة', 'عزون', 'كفر قدوم', 'جيوس', 'حبلة', 'كفر ثلث',
  'عزون عتمة', 'إماتين', 'كفر لاقف', 'النبي إلياس', 'جيت', 'جينصافوط',
  'حجة', 'باقة الحطب', 'الفندق', 'راس عطية', 'راس الطيرة', 'صير',
  'فلامية', 'مغارة الضبعة', 'عزبة الطبيب', 'عزبة سلمان',
  'عزبة الأشقر', 'واد الرشا', 'المدور',
];

// ── Mode toggle button ────────────────────────────────────────────────────────
function ModeToggle({
  mode, onChange, colors, isRTL, isAr,
}: {
  mode: PostMode; onChange: (m: PostMode) => void;
  colors: any; isRTL: boolean; isAr: boolean;
}) {
  return (
    <View style={[mt.wrap, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
      <Pressable
        style={[mt.btn, mode === 'product_ad' && { backgroundColor: colors.primary, ...Shadow.sm }]}
        onPress={() => onChange('product_ad')}
      >
        <MaterialIcons name="sell" size={16} color={mode === 'product_ad' ? '#fff' : colors.textMuted} />
        <Text style={[mt.label, { color: mode === 'product_ad' ? '#fff' : colors.textSecondary, fontWeight: mode === 'product_ad' ? '700' : '500' }]}>
          {isAr ? 'إعلان عن منتج' : 'Sell Product'}
        </Text>
      </Pressable>
      <Pressable
        style={[mt.btn, mode === 'product_request' && { backgroundColor: colors.accent ?? '#F59E0B', ...Shadow.sm }]}
        onPress={() => onChange('product_request')}
      >
        <MaterialIcons name="shopping-cart" size={16} color={mode === 'product_request' ? '#fff' : colors.textMuted} />
        <Text style={[mt.label, { color: mode === 'product_request' ? '#fff' : colors.textSecondary, fontWeight: mode === 'product_request' ? '700' : '500' }]}>
          {isAr ? 'طلب منتج' : 'Request Product'}
        </Text>
      </Pressable>
    </View>
  );
}

const mt = StyleSheet.create({
  wrap: {
    flexDirection: 'row', borderRadius: Radius.xl, borderWidth: 1,
    padding: 4, gap: 4,
  },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: Radius.lg,
  },
  label: { fontSize: FontSize.sm },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function PostAdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { categories, loading: catLoading } = useCategories();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<PostMode>('product_ad');

  // ── Shared fields ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+970');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phonePrefilled, setPhonePrefilled] = useState(false);
  const [contactViaWhatsapp, setContactViaWhatsapp] = useState(false);
  const [selectedCity, setSelectedCity] = useState(QALQILYA_CITY);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Product Ad only ───────────────────────────────────────────────────────
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [condition, setCondition] = useState<Condition>('used');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // ── Product Request only ──────────────────────────────────────────────────
  const [requestStatus, setRequestStatus] = useState<'open' | 'urgent'>('open');

  const isAr = language === 'ar';
  const rtl = { flexDirection: isRTL ? ('row-reverse' as const) : ('row' as const) };
  const textAlign = { textAlign: isRTL ? ('right' as const) : ('left' as const) };

  // ── Refs for timeouts and abort ────────────────────────────────────────────
  const timeoutRefs = useRef<{ camera?: NodeJS.Timeout; gallery?: NodeJS.Timeout }>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Cleanup timeouts on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timeoutRefs.current.camera) clearTimeout(timeoutRefs.current.camera);
      if (timeoutRefs.current.gallery) clearTimeout(timeoutRefs.current.gallery);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // ── Auto-fill phone from user profile (with AbortController) ──────────────
  useEffect(() => {
    if (!user?.id || phonePrefilled) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    getSupabaseClient()
      .from('user_profiles')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.phone) {
          const raw = data.phone as string;
          const match = raw.match(/^(\+97[02])(\d+)$/);
          if (match) {
            setPhonePrefix(match[1] as '+970' | '+972');
            setPhoneLocal(match[2].replace(/^0/, ''));
          } else {
            setPhoneLocal(raw.replace(/[^0-9]/g, '').slice(0, 9));
          }
          setPhonePrefilled(true);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.warn('Failed to fetch phone:', err);
      });
    return () => {
      controller.abort();
      abortControllerRef.current = null;
    };
  }, [user?.id]);

  // ── Guest guard ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={[styles.guestContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.guestHeader, { backgroundColor: colors.primary }]}>
          <Text style={[styles.guestHeaderTitle, textAlign]}>{t.createListing}</Text>
        </View>
        <View style={[styles.guestBody, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.guestIcon, { backgroundColor: colors.surfaceTint }]}>
            <MaterialIcons name="add-business" size={44} color={colors.primary} />
          </View>
          <Text style={[styles.guestTitle, { color: colors.textPrimary }, textAlign]}>{t.signInToSell}</Text>
          <Text style={[styles.guestSub, { color: colors.textMuted }, textAlign]}>{t.signInToSellSub}</Text>
          <Button label={t.signInRegister} onPress={() => router.push('/login')} style={styles.guestBtn} />
        </View>
      </View>
    );
  }

  // ── Photo handlers (with useCallback and timeout cleanup) ─────────────────
  const handleAddImage = useCallback(() => {
    if (images.length >= MAX_AD_IMAGES) {
      return showAlert(
        isAr ? 'الصور' : 'Photos',
        isAr ? `الحد الأقصى ${MAX_AD_IMAGES} صور.` : `Max ${MAX_AD_IMAGES} photos allowed.`
      );
    }
    setPhotoModalVisible(true);
  }, [images.length, showAlert, isAr]);

  const handlePickCamera = useCallback(async () => {
    setPhotoModalVisible(false);
    if (timeoutRefs.current.camera) clearTimeout(timeoutRefs.current.camera);
    timeoutRefs.current.camera = setTimeout(async () => {
      const result = await pickImage('camera');
      if (result) {
        // ✅ التحقق من نوع الملف وحجمه
        if (result.mimeType && !result.mimeType.startsWith('image/')) {
          showAlert(isAr ? 'نوع غير مدعوم' : 'Unsupported Format', isAr ? 'يرجى اختيار صورة.' : 'Please select an image.');
          timeoutRefs.current.camera = undefined;
          return;
        }
        if (result.size && result.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
          showAlert(isAr ? 'حجم كبير' : 'File Too Large', isAr ? `الحد الأقصى ${MAX_IMAGE_SIZE_MB} ميجابايت.` : `Max size is ${MAX_IMAGE_SIZE_MB} MB.`);
          timeoutRefs.current.camera = undefined;
          return;
        }
        const newImg = { ...result, blurhash: null as string | null };
        setImages(prev => [...prev, newImg]);
        generateBlurhash(result.uri).then(blurhash => {
          setImages(prev => prev.map(img => img.uri === result.uri ? { ...img, blurhash } : img));
        }).catch(() => {});
      } else {
        showAlert(
          isAr ? 'لا يوجد إذن' : 'Permission Denied',
          isAr ? 'يرجى السماح بالوصول إلى الكاميرا من إعدادات الجهاز.' : 'Please allow camera access in your device settings.'
        );
      }
      timeoutRefs.current.camera = undefined;
    }, 300);
  }, [isAr, showAlert]);

  const handlePickGallery = useCallback(async () => {
    setPhotoModalVisible(false);
    if (timeoutRefs.current.gallery) clearTimeout(timeoutRefs.current.gallery);
    timeoutRefs.current.gallery = setTimeout(async () => {
      const remaining = MAX_AD_IMAGES - images.length;
      if (remaining <= 0) return;
      const results = await pickMultipleImages(Math.min(3, remaining));
      if (results.length > 0) {
        // ✅ فلترة الصور الصالحة فقط
        const validResults = results.filter(img => {
          if (img.mimeType && !img.mimeType.startsWith('image/')) return false;
          if (img.size && img.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            showAlert(isAr ? 'حجم كبير' : 'File Too Large', isAr ? `بعض الصور تجاوزت الحد الأقصى ${MAX_IMAGE_SIZE_MB} ميجابايت وتم تخطيها.` : `Some images exceeded ${MAX_IMAGE_SIZE_MB} MB limit and were skipped.`);
            return false;
          }
          return true;
        });
        if (validResults.length === 0) {
          showAlert(isAr ? 'تنبيه' : 'Warning', isAr ? 'لم يتم اختيار أي صورة صالحة.' : 'No valid images selected.');
          timeoutRefs.current.gallery = undefined;
          return;
        }
        const withNullHash = validResults.map(r => ({ ...r, blurhash: null as string | null }));
        setImages(prev => [...prev, ...withNullHash].slice(0, MAX_AD_IMAGES));
        withNullHash.forEach(img => {
          generateBlurhash(img.uri).then(blurhash => {
            setImages(prev => prev.map(p => p.uri === img.uri ? { ...p, blurhash } : p));
          }).catch(() => {});
        });
      }
      timeoutRefs.current.gallery = undefined;
    }, 300);
  }, [images.length, isAr, showAlert]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ✅ إضافة useCallback لـ resetForm
  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setPrice('');
    setLocation('');
    setCategoryId('');
    setImages([]);
    setPhoneLocal('');
    setCondition('used');
    setPhonePrefix('+970');
    // لا نعيد تعيين phonePrefilled لتجنب إعادة جلب الرقم
    setRequestStatus('open');
    setContactViaWhatsapp(false);
    setSelectedCity(QALQILYA_CITY);
  }, []);

  // ── AI enhancement ────────────────────────────────────────────────────────
  const handleAiImprove = useCallback(async () => {
    if (loading) return;
    if (!title.trim() && !description.trim()) {
      return showAlert(
        isAr ? 'مطلوب' : 'Required',
        isAr ? 'أدخل العنوان أو الوصف أولاً' : 'Please enter a title or description first.'
      );
    }
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('ai-copywrite', {
        body: {
          title: title.trim(),
          description: description.trim(),
          language,
          mode,
        },
      });
      if (error) {
        let errMsg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { errMsg = await error.context?.text() ?? errMsg; } catch { /* ignore */ }
        }
        return showAlert(isAr ? 'خطأ في الذكاء الاصطناعي' : 'AI Error', errMsg);
      }
      if (data?.title) setTitle(data.title);
      if (data?.description) setDescription(data.description);
      showAlert(
        isAr ? 'تم التحسين!' : 'Improved!',
        isAr ? 'تم تحسين العنوان والوصف بالذكاء الاصطناعي.' : 'Title and description enhanced by AI.'
      );
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e.message ?? 'AI failed.');
    } finally {
      setAiLoading(false);
    }
  }, [title, description, language, mode, aiLoading, loading, isAr, showAlert]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    // ✅ التحقق من حالة الإنترنت قبل الإرسال
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return showAlert(
        isAr ? 'لا يوجد اتصال' : 'No Internet',
        isAr ? 'يرجى التحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.' : 'Please check your internet connection and try again.'
      );
    }

    if (!title.trim()) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى إدخال عنوان' : 'Please enter a title.');
    if (!description.trim()) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى إدخال وصف' : 'Please enter a description.');
    if (!categoryId) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى اختيار تصنيف' : 'Please select a category.');

    if (mode === 'product_ad') {
      if (images.length === 0) return showAlert(
        isAr ? 'صورة مطلوبة' : 'Photo Required',
        isAr ? 'يجب إضافة صورة واحدة على الأقل للإعلان.' : 'At least one photo is required for your listing.'
      );
      const parsedPrice = parseFloat(price);
      if (!price.trim() || isNaN(parsedPrice) || parsedPrice <= 0) return showAlert(
        isAr ? 'مطلوب' : 'Required',
        isAr ? 'يرجى إدخال سعر صحيح (أكبر من 0)' : 'Please enter a valid price (greater than 0).'
      );
    }

    const rawPhone = phoneLocal.trim();
    if (mode === 'product_request' && !rawPhone) {
      return showAlert(
        isAr ? 'رقم الهاتف مطلوب' : 'Phone Required',
        isAr
          ? 'يجب إدخال رقم هاتف للتواصل معك في طلبات المنتجات.'
          : 'A phone number is required so sellers can contact you for requests.'
      );
    }
    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length !== 9 && digits.length !== 10) {
        return showAlert(
          isAr ? 'رقم هاتف غير صحيح' : 'Invalid Phone',
          isAr
            ? 'أدخل 9 أرقام (مثال: 599123456) أو 10 مع الصفر (مثال: 0599123456)'
            : 'Enter 9 digits (e.g. 599123456) or 10 with leading zero.'
        );
      }
      const fullNumber = `${phonePrefix}${digits}`;
      if (!fullNumber.startsWith('+970') && !fullNumber.startsWith('+972')) {
        return showAlert(
          isAr ? 'بادئة غير صحيحة' : 'Invalid Prefix',
          isAr ? 'يجب أن يبدأ الرقم بـ +970 أو +972' : 'Phone must start with +970 or +972'
        );
      }
    }

    setLoading(true);
    let adId: string | null = null;
    try {
      const supabase = getSupabaseClient();

      const rawPhoneLocal = phoneLocal.trim().replace(/^0/, '');
      const fullPhone = rawPhoneLocal ? `${phonePrefix}${rawPhoneLocal}` : '';
      const isCity = selectedCity === QALQILYA_CITY;
      const locationStr = mode === 'product_ad'
        ? `${isCity ? 'قلقيلية' : selectedCity}${location.trim() ? ` - ${location.trim()}` : ''}`
        : selectedCity;

      // ✅ استخراج معلومات التصنيف لاستخدامها في توليد صورة الطلب
      const selectedCategory = categories.find(c => c.id === categoryId);
      const posterMetadata = mode === 'product_request' && selectedCategory ? {
        category_color: selectedCategory.color || '#F59E0B',
        category_icon: selectedCategory.icon || 'shopping-cart',
        category_name: getCategoryName(selectedCategory, language),
        title: title.trim(),
        description: description.trim(),
        request_status: requestStatus,
      } : undefined;

      // ✅ إضافة requestStatus إلى بيانات الإعلان
      const adPayload: any = {
        title: title.trim(),
        description: description.trim(),
        price: mode === 'product_ad' ? parseFloat(price) : 0,
        location: locationStr,
        category_id: categoryId,
        phone_number: fullPhone,
        condition: mode === 'product_ad' ? condition : 'used',
        status: mode === 'product_request' ? 'active' : undefined,
        // ✅ إضافة حقل poster_metadata للطلب
        poster_metadata: posterMetadata,
        // ✅ إضافة request_status
        request_status: mode === 'product_request' ? requestStatus : undefined,
      };

      const { data: ad, error: adError } = await createAd(adPayload);
      if (adError || !ad) throw new Error(adError ?? 'Failed to create ad');
      adId = ad.id;

      const { error: updateError } = await supabase
        .from('ads')
        .update({
          ad_type: mode,
          contact_whatsapp: contactViaWhatsapp,
        })
        .eq('id', ad.id);
      if (updateError) throw new Error(updateError.message);

      // ── Upload images for product ads with improved error handling ──
      if (mode === 'product_ad' && images.length > 0) {
        const urls: string[] = [];
        const blurhashes: (string | null)[] = [];
        const uploadErrors: string[] = [];

        for (const img of images) {
          try {
            const { url } = await uploadImage(img.base64, user.id, ad.id, img.uri);
            if (url) {
              urls.push(url);
              blurhashes.push(img.blurhash ?? null);
            } else {
              uploadErrors.push('Upload returned no URL for one image');
            }
          } catch (uploadErr) {
            uploadErrors.push(`Failed to upload image: ${uploadErr instanceof Error ? uploadErr.message : 'unknown'}`);
          }
        }

        if (urls.length === 0) {
          // ❌ فشلت جميع الصور، نلغي الإعلان
          await supabase.from('ads').delete().eq('id', ad.id);
          throw new Error(isAr ? 'فشل رفع جميع الصور، تم إلغاء الإعلان.' : 'Failed to upload any images, ad was cancelled.');
        }

        if (uploadErrors.length > 0) {
          // ⚠️ بعض الصور فشلت، نكمل مع الناجحة ونحذر المستخدم
          console.warn('Some images failed to upload:', uploadErrors);
          showAlert(
            isAr ? 'تنبيه' : 'Warning',
            isAr
              ? `تم رفع ${urls.length} من أصل ${images.length} صورة. بعض الصور لم ترفع.`
              : `Uploaded ${urls.length} out of ${images.length} images. Some images failed.`
          );
        }

        if (urls.length > 0) {
          try {
            await saveAdImages(ad.id, urls, blurhashes);
          } catch (saveErr) {
            // ✅ في حال فشل حفظ مراجع الصور، نحذف الإعلان
            await supabase.from('ads').delete().eq('id', ad.id);
            throw new Error(`Failed to save image references: ${saveErr instanceof Error ? saveErr.message : 'unknown'}`);
          }
        }
      }

      resetForm();
      showAlert(
        mode === 'product_ad'
          ? (isAr ? 'تم نشر الإعلان!' : 'Ad Posted!')
          : (isAr ? 'تم نشر طلبك!' : 'Request Posted!'),
        mode === 'product_ad'
          ? (isAr ? 'إعلانك الآن متاح للعرض.' : 'Your listing is now live.')
          : (isAr ? 'طلبك الآن متاح ويمكن للبائعين التواصل معك.' : 'Your request is live and sellers can contact you.'),
        [
          { text: isAr ? 'عرض' : 'View', onPress: () => router.push(`/ad/${adId}`) },
          { text: isAr ? 'نشر آخر' : 'Post Another', style: 'cancel' },
        ]
      );
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [
    title, description, categoryId, mode, images, price, location, selectedCity,
    phoneLocal, phonePrefix, contactViaWhatsapp, condition, requestStatus, categories, language,
    resetForm, router, showAlert, isAr, t, user
  ]);

  // ✅ استخدام useMemo لـ accentColor
  const accentColor = useMemo(() => {
    return mode === 'product_request' ? (colors.accent ?? '#F59E0B') : colors.primary;
  }, [mode, colors]);

  // ── Stable keyExtractor and renderItem for city list ──────────────────────
  const keyExtractor = useCallback((item: string) => item, []);

  const renderCityItem = useCallback(({ item: loc }: { item: string }) => {
    const isSelected = selectedCity === loc;
    const isMainCity = loc === QALQILYA_CITY;
    return (
      <Pressable
        style={({ pressed }) => [cityS.item, { borderColor: isSelected ? accentColor : colors.borderLight, backgroundColor: isSelected ? accentColor + '18' : (pressed ? colors.surfaceTint : colors.background) }]}
        onPress={() => { setSelectedCity(loc); setCityModalVisible(false); }}
      >
        <View style={[cityS.itemIcon, { backgroundColor: isSelected ? accentColor : (isMainCity ? colors.primaryGhost : colors.surfaceTint) }]}>
          <MaterialIcons name={isMainCity ? 'location-city' : 'location-on'} size={16} color={isSelected ? '#fff' : (isMainCity ? colors.primary : colors.textMuted)} />
        </View>
        <Text style={[cityS.itemText, { color: isSelected ? accentColor : colors.textPrimary, fontWeight: isSelected ? '700' : '500' }]}>
          {loc}
        </Text>
        {isMainCity && !isSelected ? (
          <View style={[cityS.defaultBadge, { backgroundColor: colors.primaryGhost }]}>
            <Text style={[cityS.defaultText, { color: colors.primary }]}>{isAr ? 'افتراضي' : 'Default'}</Text>
          </View>
        ) : null}
        {isSelected ? <MaterialIcons name="check-circle" size={18} color={accentColor} /> : null}
      </Pressable>
    );
  }, [selectedCity, accentColor, colors, isAr]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View style={styles.headerDeco1} pointerEvents="none" />
          <View style={styles.headerDeco2} pointerEvents="none" />
          <View style={styles.headerCenter}>
            <View style={styles.headerIconCircle}>
              <MaterialIcons name="campaign" size={28} color="#fff" />
            </View>
            <Text style={styles.headerSub}>{isAr ? 'إنشاء' : 'Create'}</Text>
            <Text style={styles.headerTitle}>{isAr ? 'إعلان جديد' : 'New Listing'}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Mode Toggle ── */}
          <ModeToggle mode={mode} onChange={setMode} colors={colors} isRTL={isRTL} isAr={isAr} />

          {/* ── Mode Info Banner (✅ إصلاح RTL) ── */}
          <View style={[
            styles.modeBanner,
            {
              flexDirection: isRTL ? 'row-reverse' : 'row',
              backgroundColor: mode === 'product_request' ? '#FEF3C7' : colors.primaryGhost,
              borderColor: mode === 'product_request' ? '#F59E0B' : colors.primary + '44',
            }
          ]}>
            <MaterialIcons
              name={mode === 'product_request' ? 'shopping-cart' : 'sell'}
              size={16}
              color={mode === 'product_request' ? '#D97706' : colors.primary}
            />
            <Text style={[styles.modeBannerText, {
              color: mode === 'product_request' ? '#92400E' : colors.primary,
              textAlign: isRTL ? 'right' : 'left',
            }]}>
              {mode === 'product_request'
                ? (isAr ? 'أنت تنشر طلب شراء — سيتواصل معك البائعون المهتمون.' : 'You are posting a buy request — interested sellers will contact you.')
                : (isAr ? 'أنت تنشر إعلاناً لبيع منتج.' : 'You are posting a product listing for sale.')}
            </Text>
          </View>

          {/* ── Photos (product_ad only) ── */}
          {mode === 'product_ad' ? (
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
              <View style={[styles.sectionHeader, rtl]}>
                <MaterialIcons name="photo-camera" size={18} color={colors.primary} />
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{isAr ? 'الصور' : 'Photos'}</Text>
                <View style={[styles.sectionBadge, { backgroundColor: colors.primaryGhost }]}>
                  <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>{images.length}/{MAX_AD_IMAGES}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imgContent}>
                {images.map((img, i) => (
                  <View key={i} style={styles.imgThumb}>
                    {i === 0 ? (
                      <View style={[styles.mainLabel, { backgroundColor: colors.primary }]}>
                        <Text style={styles.mainLabelText}>{isAr ? 'رئيسية' : 'Main'}</Text>
                      </View>
                    ) : null}
                    <Image source={{ uri: img.uri }} style={styles.thumbImg} contentFit="cover" cachePolicy="memory" />
                    <Pressable style={styles.removeImg} onPress={() => handleRemoveImage(i)}>
                      <MaterialIcons name="close" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {images.length < MAX_AD_IMAGES ? (
                  <Pressable
                    style={[styles.addImg, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]}
                    onPress={handleAddImage}
                  >
                    <View style={[styles.addImgIcon, { backgroundColor: colors.primaryGhost }]}>
                      <MaterialIcons name="add-photo-alternate" size={26} color={colors.primary} />
                    </View>
                    <Text style={[styles.addImgText, { color: colors.textMuted }]}>{isAr ? 'إضافة صورة' : 'Add Photo'}</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.autoImgNote, { backgroundColor: colors.surfaceTint, borderColor: colors.border }]}>
              <MaterialIcons name="auto-awesome" size={16} color={colors.primary} />
              <Text style={[styles.autoImgText, { color: colors.textSecondary }]}>
                {isAr
                  ? 'سيتم إنشاء تصميم احترافي للطلب تلقائياً باستخدام لون وأيقونة التصنيف.'
                  : 'A visual poster will be generated automatically using category color and icon.'}
              </Text>
            </View>
          )}

          {/* ── Category ── */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="category" size={18} color={accentColor} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.category} *</Text>
            </View>
            {catLoading ? (
              <Text style={[styles.loadingCat, { color: colors.textMuted }]}>
                {isAr ? 'جاري تحميل التصنيفات...' : 'Loading categories...'}
              </Text>
            ) : categories.length === 0 ? (
              <Text style={[styles.loadingCat, { color: colors.textMuted }]}>
                {isAr ? 'لا توجد تصنيفات متاحة' : 'No categories available'}
              </Text>
            ) : (
              <View style={styles.catGrid}>
                {categories.map(cat => {
                  const catName = getCategoryName(cat, language);
                  const isSelected = categoryId === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.catOption,
                        { backgroundColor: colors.background, borderColor: isSelected ? cat.color : colors.border },
                        isSelected && { backgroundColor: cat.color + '15' },
                      ]}
                      onPress={() => setCategoryId(cat.id)}
                    >
                      <View style={[styles.catOptionIcon, { backgroundColor: isSelected ? cat.color + '20' : colors.surfaceTint }]}>
                        <MaterialIcons name={cat.icon as any} size={18} color={isSelected ? cat.color : colors.textMuted} />
                      </View>
                      <Text style={[styles.catOptionText, { color: isSelected ? cat.color : colors.textSecondary, fontWeight: isSelected ? '700' : '500' }]} numberOfLines={1}>
                        {catName}
                      </Text>
                      {isSelected ? (
                        <View style={[styles.catCheckWrap, { backgroundColor: cat.color }]}>
                          <MaterialIcons name="check" size={12} color="#fff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* ── Details (title + description + AI) ── */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="edit" size={18} color={accentColor} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.details}</Text>
            </View>
            <Input
              label={isAr ? 'العنوان *' : 'Title *'}
              placeholder={mode === 'product_request'
                ? (isAr ? 'مثال: أبحث عن آيفون 14 بحالة جيدة' : 'e.g. Looking for iPhone 14 in good condition')
                : t.titlePlaceholder}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
            <Input
              label={isAr ? 'الوصف *' : 'Description *'}
              placeholder={mode === 'product_request'
                ? (isAr ? 'اذكر المواصفات المطلوبة، الميزانية، وأي تفاصيل مهمة...' : 'Mention required specs, budget, and any important details...')
                : t.descriptionPlaceholder}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
            <Pressable
              style={[styles.aiBtn, { backgroundColor: accentColor + '18', borderColor: accentColor, opacity: (aiLoading || loading) ? 0.7 : 1 }]}
              onPress={handleAiImprove}
              disabled={aiLoading || loading}
            >
              {aiLoading
                ? <ActivityIndicator size="small" color={accentColor} />
                : <MaterialIcons name="auto-awesome" size={16} color={accentColor} />}
              <Text style={[styles.aiBtnText, { color: accentColor }]}>
                {aiLoading
                  ? (isAr ? 'جاري التحسين...' : 'Improving...')
                  : (isAr ? 'تحسين النص بالذكاء الاصطناعي' : 'Improve with AI')}
              </Text>
            </Pressable>
          </View>

          {/* ── Condition (product_ad only) ── */}
          {mode === 'product_ad' ? (
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
              <View style={[styles.sectionHeader, rtl]}>
                <MaterialIcons name="new-releases" size={18} color={colors.primary} />
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.condition}</Text>
              </View>
              <View style={[styles.conditionRow, rtl]}>
                {(['new', 'used'] as Condition[]).map(c => {
                  const isSelected = condition === c;
                  const condLabel = c === 'new' ? t.conditionNew : t.conditionUsed;
                  const condIcon = c === 'new' ? 'fiber-new' : 'recycling';
                  return (
                    <Pressable
                      key={c}
                      style={[styles.conditionBtn, { backgroundColor: isSelected ? colors.primary : colors.background, borderColor: isSelected ? colors.primary : colors.border }]}
                      onPress={() => setCondition(c)}
                    >
                      <MaterialIcons name={condIcon as any} size={18} color={isSelected ? '#fff' : colors.textMuted} />
                      <Text style={[styles.conditionText, { color: isSelected ? '#fff' : colors.textSecondary, fontWeight: isSelected ? '700' : '500' }]}>
                        {condLabel}
                      </Text>
                      {isSelected ? <MaterialIcons name="check-circle" size={16} color="#fff" style={{ marginLeft: 'auto' }} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* ── Request Status (product_request only) ── */}
          {mode === 'product_request' ? (
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
              <View style={[styles.sectionHeader, rtl]}>
                <MaterialIcons name="flag" size={18} color={accentColor} />
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                  {isAr ? 'حالة الطلب' : 'Request Status'}
                </Text>
              </View>
              <View style={[styles.conditionRow, rtl]}>
                {([
                  { key: 'open', icon: 'check-circle-outline', labelAr: 'طلب عادي', labelEn: 'Normal Request' },
                  { key: 'urgent', icon: 'priority-high', labelAr: 'طلب عاجل 🔥', labelEn: 'Urgent 🔥' },
                ] as const).map(opt => {
                  const isSelected = requestStatus === opt.key;
                  const urgentColor = '#EF4444';
                  const btnColor = isSelected ? (opt.key === 'urgent' ? urgentColor : accentColor) : colors.background;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[styles.conditionBtn, {
                        backgroundColor: btnColor,
                        borderColor: isSelected ? (opt.key === 'urgent' ? urgentColor : accentColor) : colors.border,
                      }]}
                      onPress={() => setRequestStatus(opt.key)}
                    >
                      <MaterialIcons name={opt.icon as any} size={18} color={isSelected ? '#fff' : colors.textMuted} />
                      <Text style={[styles.conditionText, { color: isSelected ? '#fff' : colors.textSecondary, fontWeight: isSelected ? '700' : '500' }]}>
                        {isAr ? opt.labelAr : opt.labelEn}
                      </Text>
                      {isSelected ? <MaterialIcons name="check-circle" size={16} color="#fff" style={{ marginLeft: 'auto' }} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* ── Pricing & Location (product_ad only) ── */}
          {mode === 'product_ad' ? (
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
              <View style={[styles.sectionHeader, rtl]}>
                <Text style={[styles.shekelIcon, { color: colors.primary }]}>₪</Text>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.priceLocation}</Text>
              </View>
              <Input
                label={isAr ? 'السعر (₪) *' : 'Price (₪) *'}
                placeholder={isAr ? 'أدخل السعر بالشيكل' : 'Enter price in ILS'}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
              <View style={[styles.priceWarningBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <MaterialIcons name="warning-amber" size={15} color="#D97706" />
                <Text style={styles.priceWarningText}>
                  {isAr
                    ? 'تحذير: إدخال سعر غير منطقي أو مضلل سيؤدي إلى حذف الإعلان فوراً دون إشعار مسبق.'
                    : 'Warning: Unrealistic or misleading price will result in immediate removal.'}
                </Text>
              </View>
              <Text style={[styles.locationLabel, { color: colors.textSecondary }, textAlign]}>
                {isAr ? 'الموقع' : 'Location'}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.citySelector, { borderColor: colors.primary, backgroundColor: pressed ? colors.primaryGhost : colors.primaryGhost + 'BB', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => setCityModalVisible(true)}
              >
                <View style={[styles.citySelectorIcon, { backgroundColor: colors.primary }]}>
                  <MaterialIcons name={selectedCity === QALQILYA_CITY ? 'location-city' : 'location-on'} size={14} color="#fff" />
                </View>
                <Text style={[styles.citySelectorText, { color: colors.primary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {selectedCity}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={18} color={colors.primary} />
              </Pressable>
              <View style={[styles.locationFieldRow, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 8 }]}>
                <View style={[styles.locationCity, { backgroundColor: colors.surfaceTint, borderColor: colors.surfaceTint }]}>
                  <MaterialIcons name="signpost" size={13} color={colors.textMuted} />
                </View>
                <View style={[styles.locationDivider, { backgroundColor: colors.border }]} />
                <Input
                  placeholder={isAr ? 'الحي أو الشارع (اختياري)' : 'Street / Neighbourhood (optional)'}
                  value={location}
                  onChangeText={setLocation}
                  containerStyle={styles.locationInputContainer}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
              <View style={[styles.sectionHeader, rtl]}>
                <MaterialIcons name="location-on" size={18} color={accentColor} />
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{isAr ? 'موقعك' : 'Your Location'}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.citySelector, { borderColor: accentColor, backgroundColor: pressed ? accentColor + '15' : accentColor + '10', flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => setCityModalVisible(true)}
              >
                <View style={[styles.citySelectorIcon, { backgroundColor: accentColor }]}>
                  <MaterialIcons name={selectedCity === QALQILYA_CITY ? 'location-city' : 'location-on'} size={14} color="#fff" />
                </View>
                <Text style={[styles.citySelectorText, { color: accentColor, flex: 1, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                  {selectedCity}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={18} color={accentColor} />
              </Pressable>
            </View>
          )}

          {/* ── Phone & Contact ── */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="phone" size={18} color={mode === 'product_request' ? '#EF4444' : accentColor} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                {mode === 'product_request'
                  ? (isAr ? 'رقم الهاتف (إجباري) *' : 'Phone Number (Required) *')
                  : (isAr ? 'رقم الهاتف (اختياري)' : 'Phone Number (Optional)')}
              </Text>
              {mode === 'product_request' ? (
                <View style={[styles.requiredBadge, { backgroundColor: '#FEE2E2' }]}>
                  <MaterialIcons name="priority-high" size={11} color="#EF4444" />
                  <Text style={[styles.requiredBadgeText, { color: '#EF4444' }]}>
                    {isAr ? 'إجباري' : 'Required'}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={[styles.phoneRow, rtl]}>
              <View style={[styles.prefixWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                {PHONE_PREFIXES.map(prefix => (
                  <Pressable
                    key={prefix}
                    style={[styles.prefixBtn, phonePrefix === prefix && { backgroundColor: accentColor }]}
                    onPress={() => setPhonePrefix(prefix)}
                  >
                    <Text style={[styles.prefixText, { color: phonePrefix === prefix ? '#fff' : colors.textSecondary }]}>
                      {prefix}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.phoneInputWrap}>
                <Input
                  placeholder="0XX-XXX-XXXX"
                  value={phoneLocal}
                  onChangeText={(val) => setPhoneLocal(val.replace(/[^0-9]/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  containerStyle={styles.phoneInputContainer}
                  maxLength={10}
                />
              </View>
            </View>

            {/* ✅ إصلاح RTL في whatsappRow */}
            <Pressable
              style={[
                styles.whatsappRow,
                {
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  borderColor: contactViaWhatsapp ? '#25D366' : colors.border,
                  backgroundColor: contactViaWhatsapp ? '#25D36618' : colors.background,
                }
              ]}
              onPress={() => setContactViaWhatsapp(v => !v)}
            >
              <View style={[styles.whatsappIcon, { backgroundColor: contactViaWhatsapp ? '#25D366' : colors.surfaceTint }]}>
                <MaterialIcons name="chat" size={18} color={contactViaWhatsapp ? '#fff' : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.whatsappLabel, { color: contactViaWhatsapp ? '#15803D' : colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isAr ? 'التواصل عبر واتساب' : 'Contact via WhatsApp'}
                </Text>
                <Text style={[styles.whatsappSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                  {isAr ? 'يتيح للمهتمين التواصل معك مباشرة عبر واتساب' : 'Lets interested buyers contact you directly via WhatsApp'}
                </Text>
              </View>
              <View style={[styles.toggleTrack, { backgroundColor: contactViaWhatsapp ? '#25D366' : colors.border }]}>
                <View style={[styles.toggleThumb, { left: contactViaWhatsapp ? 18 : 2 }]} />
              </View>
            </Pressable>
          </View>

          {/* ── Submit ── */}
          <Button
            label={mode === 'product_request'
              ? (isAr ? 'نشر الطلب' : 'Post Request')
              : t.publishListing}
            onPress={handleSubmit}
            loading={loading}
            style={[styles.submitBtn, mode === 'product_request' ? { backgroundColor: accentColor } : {}]}
            size="lg"
          />
        </ScrollView>

        {/* ── City Picker Modal ── */}
        <Modal visible={cityModalVisible} transparent animationType="slide" onRequestClose={() => setCityModalVisible(false)} statusBarTranslucent>
          <Pressable style={cityS.overlay} onPress={() => setCityModalVisible(false)}>
            <View style={[cityS.sheet, { backgroundColor: colors.surface }]} onStartShouldSetResponder={() => true}>
              <View style={[cityS.handle, { backgroundColor: colors.border }]} />
              <View style={[cityS.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="location-on" size={20} color={accentColor} />
                <Text style={[cityS.titleText, { color: colors.textPrimary }]}>
                  {isAr ? 'اختر المنطقة' : 'Select Area'}
                </Text>
              </View>
              <FlatList
                data={QALQILYA_LOCATIONS}
                keyExtractor={keyExtractor}
                renderItem={renderCityItem}
                contentContainerStyle={cityS.listContent}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </Pressable>
        </Modal>

        {/* ── Photo Source Modal ── */}
        <Modal visible={photoModalVisible} transparent animationType="slide" onRequestClose={() => setPhotoModalVisible(false)} statusBarTranslucent>
          <Pressable style={photoStyles.overlay} onPress={() => setPhotoModalVisible(false)}>
            <View style={[photoStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={[photoStyles.handle, { backgroundColor: colors.border }]} />
              <Text style={[photoStyles.sheetTitle, { color: colors.textPrimary }]}>
                {isAr ? 'إضافة صورة' : 'Add Photo'}
              </Text>
              <Text style={[photoStyles.sheetSub, { color: colors.textMuted }]}>
                {isAr ? 'اختر طريقة الإضافة' : 'Choose how to add a photo'}
              </Text>
              <Pressable style={({ pressed }) => [photoStyles.option, { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border }]} onPress={handlePickCamera}>
                <View style={[photoStyles.optionIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={photoStyles.optionEmoji}>📷</Text>
                </View>
                <View style={photoStyles.optionText}>
                  <Text style={[photoStyles.optionTitle, { color: colors.textPrimary }]}>{isAr ? 'التقط صورة' : 'Take Photo'}</Text>
                  <Text style={[photoStyles.optionSub, { color: colors.textMuted }]}>{isAr ? 'استخدم كاميرا الجهاز' : 'Use device camera'}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [photoStyles.option, { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border }]} onPress={handlePickGallery}>
                <View style={[photoStyles.optionIcon, { backgroundColor: '#F59E0B18' }]}>
                  <Text style={photoStyles.optionEmoji}>🖼️</Text>
                </View>
                <View style={photoStyles.optionText}>
                  <Text style={[photoStyles.optionTitle, { color: colors.textPrimary }]}>{isAr ? 'من المعرض' : 'Choose from Gallery'}</Text>
                  <Text style={[photoStyles.optionSub, { color: colors.textMuted }]}>{isAr ? 'اختر من صور الجهاز' : 'Select from your photos'}</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
              </Pressable>
              <Pressable style={[photoStyles.cancelBtn, { backgroundColor: colors.background }]} onPress={() => setPhotoModalVisible(false)}>
                <Text style={[photoStyles.cancelText, { color: colors.textPrimary }]}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerDeco1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -70, right: -50,
  },
  headerDeco2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, left: -20,
  },
  headerCenter: { alignItems: 'center', gap: 4 },
  headerIconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 6,
  },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500', letterSpacing: 0.5 },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  content: { padding: Spacing.lg, paddingBottom: 56, gap: Spacing.md },

  modeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.md, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  modeBannerText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600', lineHeight: 18 },

  autoImgNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  autoImgText: { flex: 1, fontSize: FontSize.sm, lineHeight: 18 },

  sectionCard: { borderRadius: Radius.lg, padding: Spacing.md },
  sectionHeader: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  sectionLabel: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  sectionBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  sectionBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  shekelIcon: { fontSize: 18, fontWeight: '800', width: 18, textAlign: 'center' },

  imgContent: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: 4 },
  imgThumb: { width: 88, height: 88, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: 88, height: 88 },
  mainLabel: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, paddingVertical: 2, alignItems: 'center' },
  mainLabelText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  removeImg: {
    position: 'absolute', top: 5, right: 5,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center',
  },
  addImg: {
    width: 88, height: 88, borderRadius: Radius.md,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addImgIcon: { width: 46, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  addImgText: { fontSize: FontSize.xs, fontWeight: '500' },

  conditionRow: { gap: Spacing.sm },
  conditionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderRadius: Radius.md, borderWidth: 1.5,
  },
  conditionText: { fontSize: FontSize.md },

  priceWarningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    borderRadius: Radius.md, borderWidth: 1.5,
    paddingHorizontal: 10, paddingVertical: 9, marginTop: 2,
  },
  priceWarningText: { fontSize: FontSize.xs, color: '#92400E', flex: 1, lineHeight: 17, fontWeight: '600' },

  locationLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 6 },
  locationFieldRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: Radius.md, overflow: 'hidden',
  },
  locationCity: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  locationDivider: { width: 1, height: 50 },
  locationInputContainer: { flex: 1, marginBottom: 0 },
  citySelector: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 11, paddingHorizontal: 12,
    marginBottom: Spacing.sm,
  },
  citySelectorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  citySelectorText: { fontSize: FontSize.md, fontWeight: '700' },

  phoneRow: { gap: Spacing.sm, alignItems: 'flex-start', marginBottom: 4 },
  prefixWrap: { borderWidth: 1.5, borderRadius: Radius.md, flexDirection: 'row', overflow: 'hidden', height: 50 },
  prefixBtn: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', height: '100%' },
  prefixText: { fontSize: FontSize.sm, fontWeight: '700' },
  phoneInputWrap: { flex: 1 },
  phoneInputContainer: { marginBottom: 0 },

  whatsappRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  whatsappIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  whatsappLabel: { fontSize: FontSize.sm, fontWeight: '700' },
  whatsappSub: { fontSize: FontSize.xs, lineHeight: 16, marginTop: 2 },
  toggleTrack: {
    width: 40, height: 22, borderRadius: 11, position: 'relative',
  },
  toggleThumb: {
    position: 'absolute', top: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff',
  },

  loadingCat: { fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },
  catGrid: { gap: Spacing.sm },
  catOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderRadius: Radius.md, borderWidth: 1.5,
  },
  catOptionIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  catOptionText: { fontSize: FontSize.sm, flex: 1 },
  catCheckWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1.5, marginTop: 6,
  },
  aiBtnText: { fontSize: 13, fontWeight: '700' },

  submitBtn: { marginTop: 4 },

  requiredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3,
  },
  requiredBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },

  guestContainer: { flex: 1 },
  guestHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  guestHeaderTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  guestBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  guestIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  guestTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  guestSub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  guestBtn: { width: '100%', marginTop: Spacing.sm },
});

const cityS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end', zIndex: 9999 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, maxHeight: '75%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  titleText: { fontSize: FontSize.lg, fontWeight: '800' },
  listContent: { paddingHorizontal: 16, paddingBottom: 60, gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5 },
  itemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: FontSize.md, flex: 1, color: '#111827' },
  defaultBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  defaultText: { fontSize: 10, fontWeight: '700' },
});

const photoStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingBottom: 36, paddingTop: 12, gap: Spacing.sm,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center' },
  sheetSub: { fontSize: FontSize.sm, textAlign: 'center', marginBottom: Spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5,
  },
  optionIcon: { width: 52, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  optionEmoji: { fontSize: 26 },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { fontSize: FontSize.md, fontWeight: '700' },
  optionSub: { fontSize: FontSize.sm },
  cancelBtn: { borderRadius: Radius.xl, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: FontSize.md, fontWeight: '700' },
});