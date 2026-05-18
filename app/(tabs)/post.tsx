import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, useAlert } from '@/template';
import { Button, Input } from '@/components';
import { useCategories } from '@/hooks/useCategories';
import { createAd, saveAdImages } from '@/services/adsService';
import { pickImage, uploadImage } from '@/services/imageService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { MAX_AD_IMAGES } from '@/constants/config';

interface ImageItem { uri: string; base64: string }

const PHONE_PREFIXES = ['+970', '+972'];
type Condition = 'new' | 'used';

export default function PostAdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { categories, loading: catLoading } = useCategories();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+970');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [condition, setCondition] = useState<Condition>('used');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  const rtl = { flexDirection: isRTL ? ('row-reverse' as const) : ('row' as const) };
  const textAlign = { textAlign: isRTL ? ('right' as const) : ('left' as const) };

  if (!user) {
    return (
      <View style={[styles.guestContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.guestHeader, { backgroundColor: colors.primary }]}>
          <Text style={[styles.guestHeaderTitle, textAlign]}>{t.createListing}</Text>
        </View>
        <View style={styles.guestBody}>
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

  const handleAddImage = () => {
    if (images.length >= MAX_AD_IMAGES) {
      return showAlert(t.photos, language === 'ar' ? `الحد الأقصى ${MAX_AD_IMAGES} صور.` : `Max ${MAX_AD_IMAGES} photos allowed.`);
    }
    setPhotoModalVisible(true);
  };

  const handlePickCamera = async () => {
    setPhotoModalVisible(false);
    // Small delay so modal closes before camera opens
    setTimeout(async () => {
      const result = await pickImage('camera');
      if (result) {
        setImages(prev => [...prev, result]);
      } else {
        showAlert(
          language === 'ar' ? 'لا يوجد إذن' : 'Permission Denied',
          language === 'ar' ? 'يرجى السماح بالوصول إلى الكاميرا من إعدادات الجهاز.' : 'Please allow camera access in your device settings.'
        );
      }
    }, 300);
  };

  const handlePickGallery = async () => {
    setPhotoModalVisible(false);
    setTimeout(async () => {
      const result = await pickImage('gallery');
      if (result) setImages(prev => [...prev, result]);
    }, 300);
  };

  const handleRemoveImage = (index: number) => setImages(prev => prev.filter((_, i) => i !== index));

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPrice('');
    setLocation('');
    setCategoryId('');
    setImages([]);
    setPhoneLocal('');
    setCondition('used');
    setPhonePrefix('+970');
  };

  const handleSubmit = async () => {
    if (!title.trim()) return showAlert(language === 'ar' ? 'مطلوب' : 'Required', language === 'ar' ? 'يرجى إدخال عنوان' : 'Please enter a title.');
    if (!description.trim()) return showAlert(language === 'ar' ? 'مطلوب' : 'Required', language === 'ar' ? 'يرجى إدخال وصف' : 'Please enter a description.');
    if (!categoryId) return showAlert(language === 'ar' ? 'مطلوب' : 'Required', language === 'ar' ? 'يرجى اختيار تصنيف' : 'Please select a category.');
    if (!location.trim()) return showAlert(language === 'ar' ? 'مطلوب' : 'Required', language === 'ar' ? 'يرجى إدخال الحي أو المنطقة' : 'Please enter your neighbourhood.');
    if (!phoneLocal.trim()) return showAlert(language === 'ar' ? 'مطلوب' : 'Required', language === 'ar' ? 'يرجى إدخال رقم الهاتف' : 'Please enter a phone number.');

    const fullPhone = `${phonePrefix}${phoneLocal.trim()}`;
    setLoading(true);
    try {
      const { data: ad, error: adError } = await createAd({
        title: title.trim(), description: description.trim(),
        price: parseFloat(price) || 0, location: `${language === 'ar' ? 'قلقيلية' : 'Qalqilya'}${location.trim() ? ` - ${location.trim()}` : ''}`,
        category_id: categoryId, phone_number: fullPhone, condition,
      });
      if (adError || !ad) throw new Error(adError ?? 'Failed to create ad');
      if (images.length > 0) {
        const urls: string[] = [];
        for (const img of images) {
          const { url } = await uploadImage(img.base64, user.id, ad.id);
          if (url) urls.push(url);
        }
        if (urls.length > 0) await saveAdImages(ad.id, urls);
      }
      resetForm();
      showAlert(
        language === 'ar' ? 'تم نشر الإعلان!' : 'Ad Posted!',
        language === 'ar' ? 'إعلانك الآن متاح للعرض.' : 'Your listing is now live.',
        [
          { text: language === 'ar' ? 'عرض الإعلان' : 'View Listing', onPress: () => router.push(`/ad/${ad.id}`) },
          { text: language === 'ar' ? 'نشر آخر' : 'Post Another', style: 'cancel' },
        ]
      );
    } catch (e: any) {
      showAlert(language === 'ar' ? 'خطأ' : 'Error', e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── Photo Source Bottom Sheet ── */}
        <Modal
          visible={photoModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPhotoModalVisible(false)}
          statusBarTranslucent
        >
          <Pressable style={photoStyles.overlay} onPress={() => setPhotoModalVisible(false)}>
            <View style={[photoStyles.sheet, { backgroundColor: colors.surface }]}>
              <View style={[photoStyles.handle, { backgroundColor: colors.border }]} />
              <Text style={[photoStyles.sheetTitle, { color: colors.textPrimary }]}>
                {language === 'ar' ? 'إضافة صورة' : 'Add Photo'}
              </Text>
              <Text style={[photoStyles.sheetSub, { color: colors.textMuted }]}>
                {language === 'ar' ? 'اختر طريقة الإضافة' : 'Choose how to add a photo'}
              </Text>

              {/* Camera option */}
              <Pressable
                style={({ pressed }) => [
                  photoStyles.option,
                  { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border },
                ]}
                onPress={handlePickCamera}
              >
                <View style={[photoStyles.optionIcon, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={photoStyles.optionEmoji}>📷</Text>
                </View>
                <View style={photoStyles.optionText}>
                  <Text style={[photoStyles.optionTitle, { color: colors.textPrimary }]}>
                    {language === 'ar' ? 'التقط صورة' : 'Take Photo'}
                  </Text>
                  <Text style={[photoStyles.optionSub, { color: colors.textMuted }]}>
                    {language === 'ar' ? 'استخدم كاميرا الجهاز' : 'Use device camera'}
                  </Text>
                </View>
                <View style={[photoStyles.optionArrow]}>
                  <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
                </View>
              </Pressable>

              {/* Gallery option */}
              <Pressable
                style={({ pressed }) => [
                  photoStyles.option,
                  { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border },
                ]}
                onPress={handlePickGallery}
              >
                <View style={[photoStyles.optionIcon, { backgroundColor: '#F59E0B18' }]}>
                  <Text style={photoStyles.optionEmoji}>🖼️</Text>
                </View>
                <View style={photoStyles.optionText}>
                  <Text style={[photoStyles.optionTitle, { color: colors.textPrimary }]}>
                    {language === 'ar' ? 'من المعرض' : 'Choose from Gallery'}
                  </Text>
                  <Text style={[photoStyles.optionSub, { color: colors.textMuted }]}>
                    {language === 'ar' ? 'اختر من صور الجهاز' : 'Select from your photos'}
                  </Text>
                </View>
                <View style={[photoStyles.optionArrow]}>
                  <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
                </View>
              </Pressable>

              <Pressable
                style={[photoStyles.cancelBtn, { backgroundColor: colors.background }]}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Text style={[photoStyles.cancelText, { color: colors.textPrimary }]}>
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View>
            <Text style={[styles.headerSub, textAlign]}>{t.create}</Text>
            <Text style={[styles.headerTitle, textAlign]}>{t.createListing}</Text>
          </View>
          <View style={styles.headerIcon}>
            <MaterialIcons name="storefront" size={26} color="rgba(255,255,255,0.7)" />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Photos */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="photo-camera" size={18} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.photos}</Text>
              <View style={[styles.sectionBadge, { backgroundColor: colors.primaryGhost }]}>
                <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>{images.length}/{MAX_AD_IMAGES}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imgContent}>
              {images.map((img, i) => (
                <View key={i} style={styles.imgThumb}>
                  {i === 0 ? (
                    <View style={[styles.mainLabel, { backgroundColor: colors.primary }]}>
                      <Text style={styles.mainLabelText}>{language === 'ar' ? 'رئيسية' : 'Main'}</Text>
                    </View>
                  ) : null}
                  <Image source={{ uri: img.uri }} style={styles.thumbImg} contentFit="cover" />
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
                  <Text style={[styles.addImgText, { color: colors.textMuted }]}>{t.addPhoto}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>

          {/* Details */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="edit" size={18} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.details}</Text>
            </View>
            <Input label={t.title} placeholder={t.titlePlaceholder} value={title} onChangeText={setTitle} maxLength={80} />
            <Input label={t.description} placeholder={t.descriptionPlaceholder} value={description} onChangeText={setDescription} multiline numberOfLines={4} />
          </View>

          {/* Condition */}
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
                    style={[
                      styles.conditionBtn,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.background,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
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

          {/* Pricing & Location */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <Text style={[styles.shekelIcon, { color: colors.primary }]}>₪</Text>
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.priceLocation}</Text>
            </View>
            <Input label={t.price} placeholder={t.pricePlaceholder} value={price} onChangeText={setPrice} keyboardType="numeric" />
            <Text style={[styles.locationLabel, { color: colors.textSecondary }, textAlign]}>
              {language === 'ar' ? 'الموقع' : 'Location'}
            </Text>
            <View style={[styles.locationFieldRow, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.locationCity, { backgroundColor: colors.primaryGhost, borderColor: colors.primaryGhost }]}>
                <MaterialIcons name="location-city" size={13} color={colors.primary} />
                <Text style={[styles.locationCityText, { color: colors.primary }]}>
                  {language === 'ar' ? 'قلقيلية' : 'Qalqilya'}
                </Text>
              </View>
              <View style={[styles.locationDivider, { backgroundColor: colors.border }]} />
              <Input
                placeholder={language === 'ar' ? 'الحي أو المنطقة' : 'Neighbourhood / Area'}
                value={location}
                onChangeText={setLocation}
                containerStyle={styles.locationInputContainer}
              />
            </View>
          </View>

          {/* Phone Number */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="phone" size={18} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.phoneNumber}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }, textAlign]}>{t.phoneNumber}</Text>
            <View style={[styles.phoneRow, rtl]}>
              <View style={[styles.prefixWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                {PHONE_PREFIXES.map(prefix => (
                  <Pressable
                    key={prefix}
                    style={[
                      styles.prefixBtn,
                      phonePrefix === prefix && { backgroundColor: colors.primary },
                    ]}
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
                  placeholder={t.phonePlaceholder}
                  value={phoneLocal}
                  onChangeText={setPhoneLocal}
                  keyboardType="phone-pad"
                  containerStyle={styles.phoneInputContainer}
                />
              </View>
            </View>
            <Text style={[styles.phoneHint, { color: colors.textMuted }, textAlign]}>
              {t.phoneNumber}: {phonePrefix}{phoneLocal || 'XXXXXXXXXX'}
            </Text>
          </View>

          {/* Category */}
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.sectionHeader, rtl]}>
              <MaterialIcons name="category" size={18} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>{t.category} *</Text>
            </View>
            {catLoading ? (
              <Text style={[styles.loadingCat, { color: colors.textMuted }]}>
                {language === 'ar' ? 'جاري تحميل التصنيفات...' : 'Loading categories...'}
              </Text>
            ) : (
              <View style={styles.catGrid}>
                {categories.map(cat => {
                  const catName = getCategoryName(cat, language);
                  return (
                    <Pressable
                      key={cat.id}
                      style={[
                        styles.catOption,
                        { backgroundColor: colors.background, borderColor: categoryId === cat.id ? cat.color : colors.border },
                        categoryId === cat.id && { backgroundColor: cat.color + '15' },
                      ]}
                      onPress={() => setCategoryId(cat.id)}
                    >
                      <View style={[styles.catOptionIcon, { backgroundColor: categoryId === cat.id ? cat.color + '20' : colors.surfaceTint }]}>
                        <MaterialIcons name={cat.icon as any} size={18} color={categoryId === cat.id ? cat.color : colors.textMuted} />
                      </View>
                      <Text
                        style={[styles.catOptionText, {
                          color: categoryId === cat.id ? cat.color : colors.textSecondary,
                          fontWeight: categoryId === cat.id ? '700' : '500',
                        }]}
                        numberOfLines={1}
                      >
                        {catName}
                      </Text>
                      {categoryId === cat.id ? (
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

          <Button label={t.publishListing} onPress={handleSubmit} loading={loading} style={styles.submitBtn} size="lg" />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  headerIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: Spacing.lg, paddingBottom: 48, gap: Spacing.md },
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
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

  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 6, letterSpacing: 0.1 },
  locationLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 6, letterSpacing: 0.1 },
  locationFieldRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm,
  },
  locationCity: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  locationCityText: { fontSize: FontSize.sm, fontWeight: '700' },
  locationDivider: { width: 1, height: 50 },
  locationInputContainer: { flex: 1, marginBottom: 0 },
  phoneRow: { gap: Spacing.sm, alignItems: 'flex-start', marginBottom: 4 },
  prefixWrap: {
    borderWidth: 1.5, borderRadius: Radius.md,
    flexDirection: 'row', overflow: 'hidden', height: 50,
  },
  prefixBtn: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', height: '100%' },
  prefixText: { fontSize: FontSize.sm, fontWeight: '700' },
  phoneInputWrap: { flex: 1 },
  phoneInputContainer: { marginBottom: 0 },
  phoneHint: { fontSize: FontSize.xs, marginTop: 2, fontStyle: 'italic' },
  loadingCat: { fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },

  catGrid: { gap: Spacing.sm },
  catOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderRadius: Radius.md, borderWidth: 1.5,
  },
  catOptionIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  catOptionText: { fontSize: FontSize.sm, flex: 1 },
  catCheckWrap: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  submitBtn: { marginTop: 4 },
  guestContainer: { flex: 1 },
  guestHeader: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  guestHeaderTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  guestBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  guestIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  guestTitle: { fontSize: FontSize.xl, fontWeight: '700' },
  guestSub: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  guestBtn: { width: '100%', marginTop: Spacing.sm },
});

const photoStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 36,
    paddingTop: 12,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSize.lg, fontWeight: '700',
    textAlign: 'center',
  },
  sheetSub: {
    fontSize: FontSize.sm, textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md, padding: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1.5,
  },
  optionIcon: {
    width: 52, height: 52, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  optionEmoji: { fontSize: 26 },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { fontSize: FontSize.md, fontWeight: '700' },
  optionSub: { fontSize: FontSize.sm },
  optionArrow: { paddingLeft: 4 },
  cancelBtn: {
    borderRadius: Radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.xs ?? 4,
  },
  cancelText: { fontSize: FontSize.md, fontWeight: '700' },
});
