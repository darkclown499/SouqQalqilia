import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { Button, Input } from '@/components';
import { useCategories } from '@/hooks/useCategories';
import { fetchAdById, updateAdStatus, updateAd, Ad } from '@/services/adsService';
import { pickImage, uploadImage } from '@/services/imageService';
import { getCategoryName } from '@/services/categoriesService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { MAX_AD_IMAGES } from '@/constants/config';

interface ImageItem { uri: string; base64: string }
type Condition = 'new' | 'used';
const PHONE_PREFIXES = ['+970', '+972'];

export default function EditAdScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const { categories } = useCategories();
  const isAr = language === 'ar';

  const [ad, setAd] = useState<Ad | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<Condition>('used');
  const [phonePrefix, setPhonePrefix] = useState('+970');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [existingImages, setExistingImages] = useState<{ id: string; url: string; position: number }[]>([]);
  const [newImages, setNewImages] = useState<ImageItem[]>([]);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);

  const rtl = { flexDirection: isRTL ? ('row-reverse' as const) : ('row' as const) };
  const textAlign = { textAlign: isRTL ? ('right' as const) : ('left' as const) };

  useEffect(() => {
    if (!id) return;
    fetchAdById(id).then(({ data }) => {
      if (!data) { setLoading(false); return; }
      setAd(data);
      setTitle(data.title);
      setDescription(data.description);
      setPrice(data.price.toString());
      // Extract location neighbourhood (remove "قلقيلية - " prefix if present)
      const loc = data.location.replace(/^قلقيلية\s*-\s*/, '').replace(/^Qalqilya\s*-\s*/, '');
      setLocation(loc);
      setCategoryId(data.category_id);
      setCondition(data.condition);
      const phone = data.phone_number ?? '';
      const match = phone.match(/^(\+97[02])(\d+)$/);
      if (match) { setPhonePrefix(match[1]); setPhoneLocal(match[2]); }
      else if (phone) setPhoneLocal(phone.replace(/[^0-9]/g, '').slice(0, 9));
      setExistingImages((data.ad_images ?? []).sort((a, b) => a.position - b.position));
      setLoading(false);
    });
  }, [id]);

  const totalImages = existingImages.filter(img => !deletedImageIds.includes(img.id)).length + newImages.length;

  const handleAddImage = () => {
    if (totalImages >= MAX_AD_IMAGES) {
      return showAlert(isAr ? 'الصور' : 'Photos', isAr ? `الحد الأقصى ${MAX_AD_IMAGES} صور.` : `Max ${MAX_AD_IMAGES} photos allowed.`);
    }
    setPhotoModalVisible(true);
  };

  const handlePickCamera = async () => {
    setPhotoModalVisible(false);
    setTimeout(async () => {
      const result = await pickImage('camera');
      if (result) setNewImages(prev => [...prev, result]);
    }, 300);
  };

  const handlePickGallery = async () => {
    setPhotoModalVisible(false);
    setTimeout(async () => {
      const result = await pickImage('gallery');
      if (result) setNewImages(prev => [...prev, result]);
    }, 300);
  };

  const handleRemoveExisting = (imgId: string) => {
    setDeletedImageIds(prev => [...prev, imgId]);
  };

  const handleRemoveNew = (index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!id || !user || !ad) return;
    if (!title.trim()) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى إدخال عنوان' : 'Please enter a title.');
    if (!description.trim()) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى إدخال وصف' : 'Please enter a description.');
    if (!categoryId) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى اختيار تصنيف' : 'Please select a category.');
    if (!location.trim()) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى إدخال الموقع' : 'Please enter location.');
    const parsedPrice = parseFloat(price);
    if (!price.trim() || isNaN(parsedPrice) || parsedPrice < 0) return showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'يرجى إدخال سعر صحيح' : 'Please enter a valid price.');
    if (phoneLocal.trim() && phoneLocal.trim().length !== 9) {
      return showAlert(isAr ? 'رقم غير صحيح' : 'Invalid Phone', isAr ? 'رقم الهاتف يجب أن يكون 9 أرقام' : 'Phone must be 9 digits.');
    }

    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const fullPhone = phoneLocal.trim() ? `${phonePrefix}${phoneLocal.trim()}` : '';
      const fullLocation = `${isAr ? 'قلقيلية' : 'Qalqilya'}${location.trim() ? ` - ${location.trim()}` : ''}`;

      // Update ad fields via service (also clears cache)
      const { error: updateErr } = await updateAd(id, {
        title: title.trim(),
        description: description.trim(),
        price: parsedPrice,
        location: fullLocation,
        category_id: categoryId,
        condition,
        phone_number: fullPhone,
      });

      if (updateErr) throw new Error(updateErr);

      // Delete removed images
      if (deletedImageIds.length > 0) {
        await supabase.from('ad_images').delete().in('id', deletedImageIds);
      }

      // Upload and save new images
      if (newImages.length > 0) {
        const remaining = existingImages.filter(img => !deletedImageIds.includes(img.id));
        const startPosition = remaining.length;
        const urls: string[] = [];
        for (const img of newImages) {
          const { url } = await uploadImage(img.base64, user.id, id);
          if (url) urls.push(url);
        }
        if (urls.length > 0) {
          const rows = urls.map((url, i) => ({ ad_id: id, url, position: startPosition + i }));
          await supabase.from('ad_images').insert(rows);
        }
      }

      showAlert(
        isAr ? 'تم الحفظ!' : 'Saved!',
        isAr ? 'تم تحديث إعلانك بنجاح.' : 'Your listing has been updated.',
        [{ text: isAr ? 'عرض الإعلان' : 'View Listing', onPress: () => router.replace(`/ad/${id}`) }]
      );
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!ad || ad.user_id !== user?.id) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="error-outline" size={52} color={colors.textMuted} />
        <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>
          {isAr ? 'الإعلان غير موجود' : 'Ad not found'}
        </Text>
        <Button label={isAr ? 'رجوع' : 'Go Back'} variant="outline" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const activeExisting = existingImages.filter(img => !deletedImageIds.includes(img.id));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* Photo Source Modal */}
        <Modal visible={photoModalVisible} transparent animationType="slide" onRequestClose={() => setPhotoModalVisible(false)} statusBarTranslucent>
          <Pressable style={photoS.overlay} onPress={() => setPhotoModalVisible(false)}>
            <View style={[photoS.sheet, { backgroundColor: colors.surface }]}>
              <View style={[photoS.handle, { backgroundColor: colors.border }]} />
              <Text style={[photoS.title, { color: colors.textPrimary }]}>{isAr ? 'إضافة صورة' : 'Add Photo'}</Text>
              <Pressable style={({ pressed }) => [photoS.option, { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border }]} onPress={handlePickCamera}>
                <Text style={photoS.emoji}>📷</Text>
                <Text style={[photoS.optLabel, { color: colors.textPrimary }]}>{isAr ? 'التقط صورة' : 'Take Photo'}</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [photoS.option, { backgroundColor: pressed ? colors.primaryGhost : colors.background, borderColor: colors.border }]} onPress={handlePickGallery}>
                <Text style={photoS.emoji}>🖼️</Text>
                <Text style={[photoS.optLabel, { color: colors.textPrimary }]}>{isAr ? 'من المعرض' : 'Gallery'}</Text>
              </Pressable>
              <Pressable style={[photoS.cancel, { backgroundColor: colors.background }]} onPress={() => setPhotoModalVisible(false)}>
                <Text style={[photoS.cancelText, { color: colors.textPrimary }]}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={20} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSub, textAlign]}>{isAr ? 'تحرير' : 'Edit'}</Text>
            <Text style={[styles.headerTitle, textAlign]}>{isAr ? 'تعديل الإعلان' : 'Edit Listing'}</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <MaterialIcons name="edit" size={22} color="#fff" />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          {/* Photos */}
          <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.cardHead, rtl]}>
              <MaterialIcons name="photo-camera" size={18} color={colors.primary} />
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{isAr ? 'الصور' : 'Photos'}</Text>
              <View style={[styles.badge, { backgroundColor: colors.primaryGhost }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>{totalImages}/{MAX_AD_IMAGES}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imgRow}>
              {activeExisting.map(img => (
                <View key={img.id} style={styles.imgThumb}>
                  <Image source={{ uri: img.url }} style={styles.thumbImg} contentFit="cover" />
                  <Pressable style={styles.removeImg} onPress={() => handleRemoveExisting(img.id)}>
                    <MaterialIcons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {newImages.map((img, i) => (
                <View key={`new_${i}`} style={styles.imgThumb}>
                  <Image source={{ uri: img.uri }} style={styles.thumbImg} contentFit="cover" />
                  <Pressable style={styles.removeImg} onPress={() => handleRemoveNew(i)}>
                    <MaterialIcons name="close" size={12} color="#fff" />
                  </Pressable>
                  <View style={[styles.newLabel, { backgroundColor: colors.accent }]}>
                    <Text style={styles.newLabelText}>{isAr ? 'جديد' : 'New'}</Text>
                  </View>
                </View>
              ))}
              {totalImages < MAX_AD_IMAGES ? (
                <Pressable style={[styles.addImg, { borderColor: colors.border, backgroundColor: colors.surfaceTint }]} onPress={handleAddImage}>
                  <MaterialIcons name="add-photo-alternate" size={26} color={colors.primary} />
                  <Text style={[styles.addImgText, { color: colors.textMuted }]}>{isAr ? 'إضافة' : 'Add'}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>

          {/* Details */}
          <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.cardHead, rtl]}>
              <MaterialIcons name="edit" size={18} color={colors.primary} />
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{isAr ? 'التفاصيل' : 'Details'}</Text>
            </View>
            <Input label={isAr ? 'العنوان *' : 'Title *'} placeholder={isAr ? 'ماذا تبيع؟' : 'What are you selling?'} value={title} onChangeText={setTitle} maxLength={80} />
            <Input label={isAr ? 'الوصف *' : 'Description *'} placeholder={isAr ? 'صف منتجك...' : 'Describe your item...'} value={description} onChangeText={setDescription} multiline numberOfLines={4} />
          </View>

          {/* Condition */}
          <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.cardHead, rtl]}>
              <MaterialIcons name="new-releases" size={18} color={colors.primary} />
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{isAr ? 'الحالة *' : 'Condition *'}</Text>
            </View>
            <View style={[styles.condRow, rtl]}>
              {(['new', 'used'] as Condition[]).map(c => {
                const isSel = condition === c;
                return (
                  <Pressable key={c} style={[styles.condBtn, { backgroundColor: isSel ? colors.primary : colors.background, borderColor: isSel ? colors.primary : colors.border }]} onPress={() => setCondition(c)}>
                    <MaterialIcons name={c === 'new' ? 'fiber-new' : 'recycling'} size={18} color={isSel ? '#fff' : colors.textMuted} />
                    <Text style={[styles.condText, { color: isSel ? '#fff' : colors.textSecondary, fontWeight: isSel ? '700' : '500' }]}>
                      {c === 'new' ? (isAr ? 'جديد' : 'New') : (isAr ? 'مستعمل' : 'Used')}
                    </Text>
                    {isSel ? <MaterialIcons name="check-circle" size={16} color="#fff" style={{ marginLeft: 'auto' }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Price & Location */}
          <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.cardHead, rtl]}>
              <Text style={[styles.shekelIcon, { color: colors.primary }]}>₪</Text>
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{isAr ? 'السعر والموقع' : 'Price & Location'}</Text>
            </View>
            <Input label={isAr ? 'السعر (₪) *' : 'Price (₪) *'} placeholder={isAr ? 'أدخل السعر' : 'Enter price'} value={price} onChangeText={setPrice} keyboardType="numeric" />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }, textAlign]}>{isAr ? 'الحي أو المنطقة *' : 'Neighbourhood *'}</Text>
            <View style={[styles.locationRow, { borderColor: colors.border, backgroundColor: colors.background, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.cityTag, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="location-city" size={13} color={colors.primary} />
                <Text style={[styles.cityText, { color: colors.primary }]}>{isAr ? 'قلقيلية' : 'Qalqilya'}</Text>
              </View>
              <View style={[styles.locationDivider, { backgroundColor: colors.border }]} />
              <Input placeholder={isAr ? 'الحي أو المنطقة' : 'Neighbourhood / Area'} value={location} onChangeText={setLocation} containerStyle={styles.locationInput} />
            </View>
          </View>

          {/* Phone */}
          <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.cardHead, rtl]}>
              <MaterialIcons name="phone" size={18} color={colors.primary} />
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{isAr ? 'رقم الهاتف (اختياري)' : 'Phone (Optional)'}</Text>
            </View>
            <View style={[styles.phoneRow, rtl]}>
              <View style={[styles.prefixWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                {PHONE_PREFIXES.map(p => (
                  <Pressable key={p} style={[styles.prefixBtn, phonePrefix === p && { backgroundColor: colors.primary }]} onPress={() => setPhonePrefix(p)}>
                    <Text style={[styles.prefixText, { color: phonePrefix === p ? '#fff' : colors.textSecondary }]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                <Input placeholder="XX-XXX-XXXX" value={phoneLocal} onChangeText={val => setPhoneLocal(val.replace(/[^0-9]/g, '').slice(0, 9))} keyboardType="number-pad" containerStyle={styles.phoneInput} maxLength={9} />
              </View>
            </View>
          </View>

          {/* Category */}
          <View style={[styles.card, { backgroundColor: colors.surface, ...Shadow.xs }]}>
            <View style={[styles.cardHead, rtl]}>
              <MaterialIcons name="category" size={18} color={colors.primary} />
              <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>{isAr ? 'التصنيف *' : 'Category *'}</Text>
            </View>
            <View style={styles.catGrid}>
              {categories.map(cat => {
                const isSel = categoryId === cat.id;
                return (
                  <Pressable key={cat.id} style={[styles.catOption, { backgroundColor: isSel ? cat.color + '15' : colors.background, borderColor: isSel ? cat.color : colors.border }]} onPress={() => setCategoryId(cat.id)}>
                    <View style={[styles.catIcon, { backgroundColor: isSel ? cat.color + '20' : colors.surfaceTint }]}>
                      <MaterialIcons name={cat.icon as any} size={18} color={isSel ? cat.color : colors.textMuted} />
                    </View>
                    <Text style={[styles.catName, { color: isSel ? cat.color : colors.textSecondary, fontWeight: isSel ? '700' : '500' }]} numberOfLines={1}>
                      {getCategoryName(cat, language)}
                    </Text>
                    {isSel ? <View style={[styles.catCheck, { backgroundColor: cat.color }]}><MaterialIcons name="check" size={12} color="#fff" /></View> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button label={saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ التعديلات' : 'Save Changes')} onPress={handleSave} loading={saving} style={styles.saveBtn} size="lg" />

          {/* ── Delete listing button ── */}
          <Pressable
            style={[styles.deleteBtn, { borderColor: '#EF4444' }]}
            onPress={() =>
              showAlert(
                isAr ? 'حذف الإعلان' : 'Delete Listing',
                isAr ? `هل أنت متأكد من حذف "${ad.title}"؟ لا يمكن التراجع عن هذا.` : `Delete "${ad.title}"? This cannot be undone.`,
                [
                  { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
                  {
                    text: isAr ? 'حذف نهائياً' : 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      const { error } = await updateAdStatus(id!, 'deleted');
                      if (error) return showAlert(isAr ? 'خطأ' : 'Error', error);
                      router.replace('/(tabs)/profile');
                    },
                  },
                ]
              )
            }
          >
            <MaterialIcons name="delete-forever" size={18} color="#EF4444" />
            <Text style={styles.deleteBtnText}>{isAr ? 'حذف الإعلان' : 'Delete Listing'}</Text>
          </Pressable>

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontSize: FontSize.lg, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.lg, gap: Spacing.md },
  card: { borderRadius: Radius.lg, padding: Spacing.md },
  cardHead: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  cardLabel: { fontSize: FontSize.md, fontWeight: '700', flex: 1 },
  badge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  shekelIcon: { fontSize: 18, fontWeight: '800', width: 18, textAlign: 'center' },
  imgRow: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: 4 },
  imgThumb: { width: 88, height: 88, borderRadius: Radius.md, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: 88, height: 88 },
  removeImg: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  newLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingVertical: 2 },
  newLabelText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  addImg: { width: 88, height: 88, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addImgText: { fontSize: FontSize.xs, fontWeight: '500' },
  condRow: { gap: Spacing.sm },
  condBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1.5 },
  condText: { fontSize: FontSize.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.sm },
  cityTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 14 },
  cityText: { fontSize: FontSize.sm, fontWeight: '700' },
  locationDivider: { width: 1, height: 50 },
  locationInput: { flex: 1, marginBottom: 0 },
  phoneRow: { gap: Spacing.sm, alignItems: 'flex-start' },
  prefixWrap: { borderWidth: 1.5, borderRadius: Radius.md, flexDirection: 'row', overflow: 'hidden', height: 50 },
  prefixBtn: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', height: '100%' },
  prefixText: { fontSize: FontSize.sm, fontWeight: '700' },
  phoneInput: { marginBottom: 0 },
  catGrid: { gap: Spacing.sm },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5 },
  catIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: FontSize.sm, flex: 1 },
  catCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { marginTop: 4 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: Radius.xl,
    borderWidth: 1.5, marginTop: 4, backgroundColor: '#FEE2E2',
  },
  deleteBtnText: { color: '#EF4444', fontSize: FontSize.md, fontWeight: '700' },
});

const photoS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.lg, paddingBottom: 36, paddingTop: 12, gap: Spacing.sm },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  title: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center', marginBottom: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5 },
  emoji: { fontSize: 26 },
  optLabel: { fontSize: FontSize.md, fontWeight: '700' },
  cancel: { borderRadius: Radius.xl, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { fontSize: FontSize.md, fontWeight: '700' },
});
