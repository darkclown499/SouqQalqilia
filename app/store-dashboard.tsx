import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  FlatList, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { shortenUrl } from '@/utils/shortenUrl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchStoreProducts, StoreProduct } from '@/services/productsService';
import {
  fetchStoreCategories, getStoreCategoryEmoji, getStoreCategoryName, StoreCategory,
} from '@/services/storeCategoriesService';
import { pickImage, uploadImage } from '@/services/imageService';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import {
  getLocalCategories,
  addLocalCategory,
  deleteLocalCategory,
  LocalCategory,
} from '@/services/localCategoriesService';

// ── Add/Edit Product Modal ────────────────────────────────────────────────────
interface ProductForm {
  name_ar: string;
  description_ar: string;
  price: string;
  category_label_ar: string;
  image_url: string;
  is_available: boolean;
  position: string;
}

const EMPTY_FORM: ProductForm = {
  name_ar: '', description_ar: '',
  price: '', category_label_ar: '',
  image_url: '', is_available: true, position: '0',
};

// ── Product category map by store type ────────────────────────────────────────
const PRODUCT_CATEGORY_MAP: Record<string, string[]> = {
  'مطاعم':      ['وجبات رئيسية', 'مقبلات', 'مشروبات', 'حلويات', 'عروض'],
  'سوبرماركت':  ['مواد غذائية', 'معلبات', 'ألبان وأجبان', 'منظفات', 'تسالي'],
  'صيدليات':    ['أدوية طبية', 'عناية بالبشرة', 'عناية بالطفل', 'فيتامينات', 'مستلزمات'],
  'مخابز':      ['خبز بأنواعه', 'معجنات', 'كيك', 'بسكويت', 'عروض'],
  'كافيهات':    ['قهوة', 'مشروبات باردة', 'عصائر', 'حلويات', 'وجبات خفيفة'],
  'برجر':       ['برجر', 'وجبات', 'بطاطس', 'مشروبات', 'عروض'],
  'بيتزا':      ['بيتزا', 'باستا', 'مقبلات', 'مشروبات', 'عروض'],
  'دجاج':       ['وجبات دجاج', 'قطع مفردة', 'بروستد', 'مشروبات', 'عروض'],
  'مشويات':     ['مشويات', 'كباب', 'شاورما', 'مقبلات', 'مشروبات'],
  'فلافل':      ['فلافل', 'فول', 'سندويشات', 'مشروبات', 'وجبات'],
  'عصائر':      ['عصائر طازجة', 'سموذي', 'مشروبات باردة', 'آيس كريم', 'إضافات'],
  'حلويات':     ['حلويات شرقية', 'حلويات غربية', 'كيك', 'شوكولاتة', 'عروض'],
  'إلكترونيات': ['جوالات', 'لابتوبات', 'إكسسوارات', 'أجهزة منزلية', 'صيانة'],
  'أزياء':      ['رجالي', 'نسائي', 'ولادي', 'أحذية', 'إكسسوارات'],
  'أثاث':       ['غرف نوم', 'صالونات', 'مطابخ', 'مكتبي', 'ديكور'],
  'تجميل':      ['عناية بالبشرة', 'مكياج', 'عطور', 'شعر', 'أظافر'],
};
const DEFAULT_PRODUCT_CATEGORIES = ['قسم عام', 'عروض', 'منتجات متنوعة', 'أخرى'];

function ProductModal({
  visible, onClose, onSave, storeId, editProduct, storeCategoryNameAr, isAr, isRTL, colors,
  customCategories,
}: {
  visible: boolean; onClose: () => void;
  onSave: (product: StoreProduct) => void;
  storeId: string;
  editProduct: StoreProduct | null;
  storeCategoryNameAr: string;
  customCategories: LocalCategory[];
  isAr: boolean; isRTL: boolean; colors: any;
}) {
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [imgUri, setImgUri] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catError, setCatError] = useState(false);
  const { user } = useAuth();
  const { showAlert } = useAlert();

  // Resolve chips from the store's category – memoized
  const chips = useMemo(() => {
    return PRODUCT_CATEGORY_MAP[storeCategoryNameAr] ?? DEFAULT_PRODUCT_CATEGORIES;
  }, [storeCategoryNameAr]);

  useEffect(() => {
    if (editProduct) {
      setForm({
        name_ar: editProduct.name_ar || editProduct.name,
        description_ar: editProduct.description_ar || editProduct.description,
        price: String(editProduct.price),
        category_label_ar: editProduct.category_label_ar || editProduct.category_label,
        image_url: editProduct.image_url,
        is_available: editProduct.is_available,
        position: String(editProduct.position),
      });
      setImgUri(editProduct.image_url || null);
    } else {
      setForm(EMPTY_FORM);
      setImgUri(null);
    }
    setCatError(false);
  }, [editProduct, visible]);

  const handlePickImage = async () => {
    setImgLoading(true);
    try {
      const img = await pickImage('gallery');
      if (img && user) {
        const { url } = await uploadImage(img.base64, user.id, 'store-product');
        if (url) {
          setImgUri(url);
          setForm(f => ({ ...f, image_url: url }));
        }
      }
    } finally { setImgLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name_ar.trim()) return;
    if (!form.image_url) {
      showAlert('تنبيه', 'يجب إضافة صورة للمنتج');
      return;
    }
    if (!form.category_label_ar) {
      setCatError(true);
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const payload = {
        store_id: storeId,
        name: form.name_ar.trim(),
        name_ar: form.name_ar.trim(),
        description: form.description_ar.trim(),
        description_ar: form.description_ar.trim(),
        price: parseFloat(form.price) || 0,
        category_label: form.category_label_ar,
        category_label_ar: form.category_label_ar,
        custom_category_id: customCategories.find(c => (isAr ? c.name_ar : c.name) === form.category_label_ar)?.id || null,
        image_url: form.image_url,
        is_available: form.is_available,
        position: parseInt(form.position) || 0,
      };
      let result;
      if (editProduct) {
        const { data, error } = await supabase
          .from('store_products')
          .update(payload)
          .eq('id', editProduct.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('store_products')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      onSave(result as StoreProduct);
      onClose();
    } catch (e: any) {
      showAlert('خطأ', e?.message || 'حدث خطأ أثناء الحفظ');
    } finally { setSaving(false); }
  };

  const textAlign = 'right' as const;
  const rtl = isRTL ? 'row-reverse' as const : 'row' as const;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={pm.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[pm.sheet, { backgroundColor: colors.surface }]}>
            <View style={[pm.handle, { backgroundColor: colors.border }]} />
            <View style={[pm.titleRow, { flexDirection: rtl, borderBottomColor: colors.borderLight }]}>
              <MaterialIcons name={editProduct ? 'edit' : 'add-box'} size={22} color={colors.primary} />
              <Text style={[pm.titleText, { color: colors.textPrimary, flex: 1, textAlign }]}>
                {editProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <MaterialIcons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={pm.content}>
              {/* ── Product image (mandatory) ── */}
              <View style={pm.field}>
                <Text style={[pm.fieldLabel, { color: colors.textSecondary, textAlign }]}>
                  {'صورة المنتج (إجباري *)'}
                </Text>
                <Pressable
                  style={[pm.imgArea, { borderColor: form.image_url ? colors.primary : colors.border, backgroundColor: colors.background }]}
                  onPress={handlePickImage}
                  disabled={imgLoading}
                >
                  {imgUri ? (
                    <>
                      <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                      <View style={pm.imgOverlay} />
                      <View style={pm.imgEditBadge}>
                        <MaterialIcons name="edit" size={16} color="#fff" />
                        <Text style={pm.imgEditText}>{'تغيير'}</Text>
                      </View>
                    </>
                  ) : imgLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <View style={[pm.imgIcon, { backgroundColor: colors.primaryGhost }]}>
                        <MaterialIcons name="add-photo-alternate" size={28} color={colors.primary} />
                      </View>
                      <Text style={[pm.imgHint, { color: colors.textMuted }]}>{'اضغط لإضافة صورة'}</Text>
                      <Text style={[pm.imgRequired, { color: '#EF4444' }]}>{'* إجباري'}</Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* ── Product name (Arabic) ── */}
              <View style={pm.field}>
                <Text style={[pm.fieldLabel, { color: colors.textSecondary, textAlign }]}>{'اسم المنتج *'}</Text>
                <TextInput
                  style={[pm.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign }]}
                  placeholder="أدخل اسم المنتج"
                  placeholderTextColor={colors.textMuted}
                  value={form.name_ar}
                  onChangeText={v => setForm(f => ({ ...f, name_ar: v }))}
                  autoFocus
                />
              </View>

              {/* ── Description (Arabic) ── */}
              <View style={pm.field}>
                <Text style={[pm.fieldLabel, { color: colors.textSecondary, textAlign }]}>{'الوصف'}</Text>
                <TextInput
                  style={[pm.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign, minHeight: 78 }]}
                  placeholder="وصف المنتج (اختياري)"
                  placeholderTextColor={colors.textMuted}
                  value={form.description_ar}
                  onChangeText={v => setForm(f => ({ ...f, description_ar: v }))}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* ── Category chips ── */}
              <View style={pm.field}>
                <Text style={[pm.fieldLabel, { color: catError ? '#EF4444' : colors.textSecondary, textAlign }]}>
                  {catError ? 'التصنيف مطلوب *' : 'تصنيف المنتج *'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[pm.chipsScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                >
                  {customCategories.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: FontSize.sm, paddingVertical: 8 }}>
                      {isAr ? '⚠️ لا توجد تصنيفات. أضف تصنيفاً أولاً في لوحة التحكم.' : '⚠️ No categories. Add one in dashboard first.'}
                    </Text>
                  ) : (
                    customCategories.map(cat => {
                      const catName = isAr ? cat.name_ar : cat.name;
                      const selected = form.category_label_ar === catName;
                      return (
                        <Pressable
                          key={cat.id}
                          style={[pm.chip, {
                            backgroundColor: selected ? colors.primary : colors.background,
                            borderColor: selected ? colors.primary : (catError ? '#EF4444' : colors.border),
                          }]}
                          onPress={() => { setForm(f => ({ ...f, category_label_ar: catName })); setCatError(false); }}
                        >
                          {selected ? <MaterialIcons name="check" size={13} color="#fff" /> : null}
                          <Text style={[pm.chipText, { color: selected ? '#fff' : colors.textPrimary }]}>{catName}</Text>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>

              {/* ── Price ── */}
              <View style={pm.field}>
                <Text style={[pm.fieldLabel, { color: colors.textSecondary, textAlign }]}>{'السعر (₪)'}</Text>
                <TextInput
                  style={[pm.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={form.price}
                  onChangeText={v => setForm(f => ({ ...f, price: v }))}
                  keyboardType="numeric"
                />
              </View>

              {/* ── Available toggle ── */}
              <Pressable
                style={[pm.toggleRow, { flexDirection: rtl, borderColor: form.is_available ? colors.primary : colors.border, backgroundColor: form.is_available ? colors.primaryGhost : colors.background }]}
                onPress={() => setForm(f => ({ ...f, is_available: !f.is_available }))}
              >
                <MaterialIcons
                  name={form.is_available ? 'check-circle' : 'cancel'}
                  size={22}
                  color={form.is_available ? colors.primary : colors.textMuted}
                />
                <Text style={[pm.toggleLabel, { color: form.is_available ? colors.primary : colors.textSecondary, fontWeight: form.is_available ? '700' : '500' }]}>
                  {form.is_available ? 'متاح للطلب' : 'غير متاح حالياً'}
                </Text>
              </Pressable>
            </ScrollView>

            <Pressable
              style={[pm.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="check" size={20} color="#fff" />}
              <Text style={pm.saveBtnText}>{saving ? 'جاري الحفظ...' : 'حفظ المنتج'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 36, maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, marginBottom: 4,
  },
  titleText: { fontSize: FontSize.lg, fontWeight: '700' },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 16, gap: 12 },
  imgArea: {
    height: 140, borderWidth: 1.5, borderStyle: 'dashed',
    borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center',
    gap: 6, overflow: 'hidden',
  },
  imgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.32)' },
  imgIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  imgHint: { fontSize: FontSize.sm, fontWeight: '600' },
  imgRequired: { fontSize: FontSize.xs, fontWeight: '700' },
  imgEditBadge: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  imgEditText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  chipsScroll: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0,
  },
  chipText: { fontSize: FontSize.sm, fontWeight: '700' },
  field: { gap: 4 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: FontSize.sm, minHeight: 46,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md,
  },
  toggleLabel: { fontSize: FontSize.md },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    height: 52, borderRadius: Radius.full,
    ...Shadow.colored,
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});

// ── Product card for dashboard ────────────────────────────────────────────────
function DashboardProductCard({
  product, onEdit, onDelete, isAr, isRTL, colors,
}: {
  product: StoreProduct; onEdit: () => void; onDelete: () => void;
  isAr: boolean; isRTL: boolean; colors: any;
}) {
  const name = isAr ? (product.name_ar || product.name) : product.name;
  return (
    <View style={[dpc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={dpc.img} contentFit="cover" transition={200} cachePolicy="disk" />
      ) : (
        <View style={[dpc.imgPh, { backgroundColor: colors.surfaceTint }]}>
          <MaterialIcons name="fastfood" size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={[dpc.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <Text style={[dpc.name, { color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{name}</Text>
        <Text style={[dpc.price, { color: colors.primary }]}>
          {product.price > 0 ? `${product.price}₪` : (isAr ? 'مجاني' : 'Free')}
        </Text>
        <View style={[dpc.badge, { backgroundColor: product.is_available ? '#D1FAE5' : '#FEE2E2' }]}>
          <View style={[dpc.dot, { backgroundColor: product.is_available ? '#16a34a' : '#EF4444' }]} />
          <Text style={[dpc.badgeText, { color: product.is_available ? '#15803d' : '#B91C1C' }]}>
            {product.is_available ? (isAr ? 'متاح' : 'Available') : (isAr ? 'غير متاح' : 'Unavailable')}
          </Text>
        </View>
      </View>
      <View style={[dpc.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable style={[dpc.btn, { backgroundColor: colors.primaryGhost, borderColor: colors.primary }]} onPress={onEdit} hitSlop={4}>
          <MaterialIcons name="edit" size={14} color={colors.primary} />
        </Pressable>
        <Pressable style={[dpc.btn, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]} onPress={onDelete} hitSlop={4}>
          <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
        </Pressable>
      </View>
    </View>
  );
}

const dpc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Radius.xl, borderWidth: 1, padding: 12,
    ...Shadow.xs,
  },
  img: { width: 64, height: 64, borderRadius: Radius.md, flexShrink: 0 },
  imgPh: {
    width: 64, height: 64, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  info: { flex: 1, gap: 4 },
  name: { fontSize: FontSize.sm, fontWeight: '700', lineHeight: 18 },
  price: { fontSize: FontSize.md, fontWeight: '800' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  actions: { gap: 8, flexShrink: 0 },
  btn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});

// ── Main dashboard screen ─────────────────────────────────────────────────────
export default function StoreDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';

  const [store, setStore] = useState<any>(null);
  const [storeCategory, setStoreCategory] = useState<StoreCategory | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productModalVisible, setProductModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'products'>('overview');
  const [shareLoading, setShareLoading] = useState(false);

  const textAlign = isRTL ? 'right' as const : 'left' as const;
  const rtl = isRTL ? 'row-reverse' as const : 'row' as const;

  // ── Custom categories state ──
  const [customCategories, setCustomCategories] = useState<LocalCategory[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryNameAr, setNewCategoryNameAr] = useState('');

  // ── Add custom category (memoized) ──
  const handleAddCategory = useCallback(async () => {
    if (!store?.id || !newCategoryName.trim() || !newCategoryNameAr.trim()) {
      showAlert(isAr ? 'مطلوب' : 'Required', isAr ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    try {
      const newCat = await addLocalCategory(
        store.id,
        newCategoryName.trim(),
        newCategoryNameAr.trim(),
        'category',
        '#6B7280'
      );
      if (newCat) {
        setCustomCategories(prev => [...prev, newCat]);
        setNewCategoryName('');
        setNewCategoryNameAr('');
        setShowCategoryForm(false);
        showAlert(isAr ? 'تم' : 'Done', isAr ? 'تم إضافة التصنيف' : 'Category added');
      } else {
        throw new Error('Failed to add category');
      }
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e?.message || isAr ? 'تعذر إضافة التصنيف' : 'Could not add category');
    }
  }, [store?.id, newCategoryName, newCategoryNameAr, isAr, showAlert]);

  // ── Delete custom category (memoized) ──
  const handleDeleteCategory = useCallback((id: string) => {
    showAlert(
      isAr ? 'تأكيد الحذف' : 'Confirm Delete',
      isAr ? 'هل تريد حذف هذا التصنيف؟' : 'Delete this category?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (store?.id) {
              try {
                const success = await deleteLocalCategory(store.id, id);
                if (success) {
                  setCustomCategories(prev => prev.filter(c => c.id !== id));
                } else {
                  throw new Error('Delete failed');
                }
              } catch (e: any) {
                showAlert(isAr ? 'خطأ' : 'Error', e?.message || isAr ? 'تعذر حذف التصنيف' : 'Could not delete category');
              }
            }
          },
        },
      ]
    );
  }, [store?.id, isAr, showAlert]);

  // ── Load data with AbortController ──
  const loadData = useCallback(async () => {
    if (!user) return;
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    let isMounted = true;

    try {
      const supabase = getSupabaseClient();
      // Fetch store
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('*, store_categories(id, name, name_ar, icon, color, slug, position, is_active, image_url, created_at)')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (storeError) throw storeError;
      if (!isMounted) return;

      setStore(storeData);
      if (storeData?.store_categories) {
        setStoreCategory(storeData.store_categories as StoreCategory);
      } else if (storeData?.store_category_id) {
        // Fallback fetch
        const { data: cats } = await fetchStoreCategories();
        const cat = cats.find(c => c.id === storeData.store_category_id);
        if (cat && isMounted) setStoreCategory(cat);
      }

      if (storeData && isMounted) {
        const { data: prods, error: prodError } = await fetchStoreProducts(storeData.id, true);
        if (prodError) throw prodError;
        if (isMounted) setProducts(prods || []);
      }
    } catch (e: any) {
      if (isMounted) {
        setError(e?.message || 'Failed to load store data');
      }
    } finally {
      if (isMounted) setLoading(false);
    }
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [user]);

  // ── Load local categories when store changes ──
  useEffect(() => {
    if (store?.id) {
      getLocalCategories(store.id).then(setCustomCategories);
    }
  }, [store?.id]);

  // ── Trigger loadData on user change ──
  useEffect(() => {
    const cleanup = loadData();
    return () => {
      if (cleanup) cleanup();
    };
  }, [loadData]);

  // ── Delete product (memoized) ──
  const handleDeleteProduct = useCallback((product: StoreProduct) => {
    showAlert(
      isAr ? 'حذف المنتج' : 'Delete Product',
      isAr ? `هل تريد حذف "${product.name_ar || product.name}"؟` : `Delete "${product.name}"?`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'حذف' : 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await getSupabaseClient()
                .from('store_products')
                .delete()
                .eq('id', product.id);
              if (error) throw error;
              setProducts(prev => prev.filter(p => p.id !== product.id));
            } catch (e: any) {
              showAlert(
                isAr ? 'خطأ في الحذف' : 'Delete Failed',
                e?.message ?? (isAr ? 'تعذّر حذف المنتج' : 'Could not delete the product.')
              );
            }
          },
        },
      ]
    );
  }, [isAr, showAlert]);

  // ── Share store (memoized) ──
  const handleShareStore = useCallback(async () => {
    if (!store || shareLoading) return;
    setShareLoading(true);
    try {
      const name = isAr ? (store.name_ar || store.name) : store.name;
      const longUrl = `https://dmyjmmpytwppyfsjdmyj.backend.onspace.ai/store/${store.id}`;
      const shortLink = await shortenUrl(longUrl);
      await Share.share({
        message: isAr
          ? `مرحباً! تسوقوا من متجري "${name}" عبر تطبيق سوق قلقيلية 🛒✨\n\nاضغط على الرابط هنا: ${shortLink}`
          : `Shop at "${name}" on Souq Qalqilya! 🛒✨\n\n${shortLink}`,
        url: shortLink,
      });
    } catch (e: any) {
      showAlert(isAr ? 'خطأ' : 'Error', e?.message || isAr ? 'تعذر المشاركة' : 'Could not share');
    } finally { setShareLoading(false); }
  }, [store, isAr, shareLoading, showAlert]);

  // ── Save product (memoized) ──
  const handleSaveProduct = useCallback((saved: StoreProduct) => {
    setProducts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  }, []);

  // ── Memoized values ──
  const storeName = useMemo(() => isAr ? (store?.name_ar || store?.name) : store?.name, [store, isAr]);
  const availableCount = useMemo(() => products.filter(p => p.is_available).length, [products]);

  if (loading) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="error-outline" size={48} color={colors.error} />
        <Text style={[s.noStoreText, { color: colors.error }]}>{error}</Text>
        <Pressable style={[s.registerBtn, { backgroundColor: colors.primary }]} onPress={() => { setError(null); loadData(); }}>
          <Text style={s.registerBtnText}>{isAr ? 'إعادة المحاولة' : 'Retry'}</Text>
        </Pressable>
      </View>
    );
  }

  if (!store) {
    return (
      <View style={[s.loadingScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <MaterialIcons name="store" size={48} color={colors.textMuted} />
        <Text style={[s.noStoreText, { color: colors.textMuted }]}>
          {isAr ? 'لا يوجد متجر مرتبط بحسابك' : 'No store linked to your account'}
        </Text>
        <Pressable style={[s.registerBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/register-store' as any)}>
          <Text style={s.registerBtnText}>{isAr ? 'تسجيل متجر' : 'Register Store'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.primary }]}>
        <View style={s.headerDeco} pointerEvents="none" />
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color="#fff" />
        </Pressable>
        <View style={[s.headerContent, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[s.headerSub, { textAlign }]}>{isAr ? 'لوحة تحكم' : 'Store Dashboard'}</Text>
          <Text style={[s.headerTitle, { textAlign }]} numberOfLines={1}>{storeName}</Text>
          <View style={[s.statusBadge, { backgroundColor: store.is_approved ? '#D1FAE5' : '#FEF3C7', flexDirection: rtl }]}>
            <MaterialIcons
              name={store.is_approved ? 'check-circle' : 'access-time'}
              size={13}
              color={store.is_approved ? '#15803d' : '#D97706'}
            />
            <Text style={[s.statusText, { color: store.is_approved ? '#15803d' : '#D97706' }]}>
              {store.is_approved ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'قيد المراجعة' : 'Under Review')}
            </Text>
          </View>
        </View>
        {store.logo_url ? (
          <Image source={{ uri: store.logo_url }} style={s.storeLogo} contentFit="cover" />
        ) : (
          <View style={[s.storeLogo, { backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialIcons name="storefront" size={28} color="#fff" />
          </View>
        )}
      </View>

      {/* ── Stats row ── */}
      <View style={[s.statsRow, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}>
        {[
          { icon: 'inventory-2', num: products.length, label: isAr ? 'منتجات' : 'Products', color: colors.primary },
          { icon: 'check-circle-outline', num: availableCount, label: isAr ? 'متاح' : 'Available', color: '#16a34a' },
          { icon: 'visibility', num: store.views_count ?? 0, label: isAr ? 'مشاهدة' : 'Views', color: '#7C3AED' },
          { icon: 'chat', num: store.whatsapp_clicks_count ?? 0, label: isAr ? 'طلب واتساب' : 'WA Orders', color: '#25D366' },
        ].map((st, i) => (
          <View key={i} style={s.statItem}>
            <MaterialIcons name={st.icon as any} size={18} color={st.color} />
            <Text style={[s.statNum, { color: colors.textPrimary }]}>{st.num}</Text>
            <Text style={[s.statLabel, { color: colors.textMuted }]}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Tab bar ── */}
      <View style={[s.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}>
        {([
          { key: 'overview', icon: 'dashboard', labelAr: 'نظرة عامة', labelEn: 'Overview' },
          { key: 'products', icon: 'inventory-2', labelAr: 'المنتجات', labelEn: 'Products' },
        ] as const).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[s.tabBtn, isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2.5 }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <MaterialIcons name={tab.icon as any} size={18} color={isActive ? colors.primary : colors.textMuted} />
              <Text style={[s.tabBtnText, { color: isActive ? colors.primary : colors.textMuted, fontWeight: isActive ? '700' : '500' }]}>
                {isAr ? tab.labelAr : tab.labelEn}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.tabContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── إدارة التصنيفات المخصصة ── */}
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: Spacing.md }]}>
            <View style={{ flexDirection: rtl, justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[s.catBadgeText, { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' }]}>
                {isAr ? 'تصنيفات المتجر المخصصة' : 'Custom Categories'}
              </Text>
              <Pressable onPress={() => setShowCategoryForm(!showCategoryForm)} style={{ flexDirection: rtl, alignItems: 'center', gap: 4 }}>
                <MaterialIcons name={showCategoryForm ? 'remove-circle-outline' : 'add-circle-outline'} size={22} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: FontSize.sm, fontWeight: '600' }}>
                  {showCategoryForm ? (isAr ? 'إلغاء' : 'Cancel') : (isAr ? 'إضافة' : 'Add')}
                </Text>
              </Pressable>
            </View>

            {showCategoryForm && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <TextInput
                  style={[pm.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}
                  placeholderTextColor={colors.textMuted}
                  value={newCategoryNameAr}
                  onChangeText={setNewCategoryNameAr}
                />
                <TextInput
                  style={[pm.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}
                  placeholderTextColor={colors.textMuted}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                />
                <Pressable
                  style={[pm.saveBtn, { backgroundColor: colors.primary, paddingVertical: 10, borderRadius: Radius.lg }]}
                  onPress={handleAddCategory}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{isAr ? 'حفظ التصنيف' : 'Save Category'}</Text>
                </Pressable>
              </View>
            )}

            {customCategories.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: FontSize.sm, marginTop: 8, textAlign }}>
                {isAr ? 'لا توجد تصنيفات مخصصة بعد' : 'No custom categories yet'}
              </Text>
            ) : (
              <View style={{ marginTop: 8, gap: 6 }}>
                {customCategories.map(cat => (
                  <View key={cat.id} style={{ flexDirection: rtl, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                    <Text style={{ color: colors.textPrimary, fontSize: FontSize.sm }}>
                      {isAr ? cat.name_ar : cat.name}
                    </Text>
                    <Pressable onPress={() => handleDeleteCategory(cat.id)} hitSlop={8}>
                      <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Store info card */}
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {storeCategory ? (
              <View style={[s.infoRow, { flexDirection: rtl }]}>
                <View style={[s.catBadge, { backgroundColor: storeCategory.color + '18' }]}>
                  {getStoreCategoryEmoji(storeCategory.slug) ? (
                    <Text style={{ fontSize: 16 }}>{getStoreCategoryEmoji(storeCategory.slug)}</Text>
                  ) : (
                    <MaterialIcons name={storeCategory.icon as any} size={16} color={storeCategory.color} />
                  )}
                  <Text style={[s.catBadgeText, { color: storeCategory.color }]}>
                    {getStoreCategoryName(storeCategory, language)}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={[s.infoRow, { flexDirection: rtl }]}>
              <MaterialIcons name="location-on" size={16} color={colors.primary} />
              <Text style={[s.infoText, { color: colors.textPrimary, flex: 1, textAlign }]}>{store.address || (isAr ? 'لا يوجد عنوان' : 'No address')}</Text>
            </View>
            <View style={[s.infoRow, { flexDirection: rtl }]}>
              <MaterialIcons name="schedule" size={16} color={colors.primary} />
              <Text style={[s.infoText, { color: colors.textPrimary, textAlign }]}>
                {store.opening_time} – {store.closing_time}
              </Text>
            </View>
            <View style={[s.infoRow, { flexDirection: rtl }]}>
              <MaterialIcons name="chat" size={16} color="#25D366" />
              <Text style={[s.infoText, { color: colors.textPrimary, textAlign }]}>{store.owner_whatsapp || store.whatsapp || (isAr ? 'لم يُضَف' : 'Not added')}</Text>
            </View>
          </View>

          {/* Share My Store button */}
          <Pressable
            style={[s.shareStoreBtn, { borderColor: colors.primary, backgroundColor: colors.primaryGhost, opacity: shareLoading ? 0.7 : 1 }]}
            onPress={handleShareStore}
            disabled={shareLoading}
          >
            {shareLoading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <MaterialIcons name="share" size={20} color={colors.primary} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.shareStoreBtnTitle, { color: colors.primary }]}>
                {shareLoading ? (isAr ? 'جاري تحضير الرابط...' : 'Preparing link...') : (isAr ? 'مشاركة متجري 📤' : 'Share My Store 📤')}
              </Text>
              <Text style={[s.shareStoreBtnSub, { color: colors.textMuted }]}>
                {isAr ? 'شارك رابط متجرك مع عملائك' : 'Share your store link with customers'}
              </Text>
            </View>
            <MaterialIcons name="chevron-left" size={20} color={colors.primary} />
          </Pressable>

          {/* Approval message */}
          {!store.is_approved ? (
            <View style={[s.pendingCard, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
              <MaterialIcons name="access-time" size={22} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={[s.pendingTitle, { textAlign }]}>{isAr ? 'طلبك قيد المراجعة ⏳' : 'Your request is under review ⏳'}</Text>
                <Text style={[s.pendingSub, { textAlign }]}>{isAr ? 'سيتم تفعيل متجرك خلال 24 ساعة بعد مراجعة الإدارة.' : 'Your store will be activated within 24 hours after admin review.'}</Text>
              </View>
            </View>
          ) : (
            <View style={[s.pendingCard, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]}>
              <MaterialIcons name="verified" size={22} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={[s.pendingTitle, { textAlign, color: '#15803d' }]}>{isAr ? 'متجرك مفعّل ✓' : 'Your store is live ✓'}</Text>
                <Text style={[s.pendingSub, { textAlign, color: '#166534' }]}>{isAr ? 'متجرك يظهر الآن للمتسوقين في التطبيق.' : 'Your store is now visible to shoppers in the app.'}</Text>
              </View>
            </View>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      ) : null}

      {/* ── Products tab ── */}
      {activeTab === 'products' ? (
        <FlatList
          data={products}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <DashboardProductCard
              product={item}
              onEdit={() => { setEditingProduct(item); setProductModalVisible(true); }}
              onDelete={() => handleDeleteProduct(item)}
              isAr={isAr}
              isRTL={isRTL}
              colors={colors}
            />
          )}
          contentContainerStyle={[s.tabContent, { gap: Spacing.sm }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <MaterialIcons name="inventory-2" size={44} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textMuted }]}>
                {isAr ? 'لا توجد منتجات بعد. أضف منتجك الأول!' : 'No products yet. Add your first!'}
              </Text>
            </View>
          }
        />
      ) : null}

      {/* ── FAB: Add product ── */}
      {activeTab === 'products' ? (
        <Pressable
          style={[s.fab, { backgroundColor: colors.primary }]}
          onPress={() => { setEditingProduct(null); setProductModalVisible(true); }}
        >
          <MaterialIcons name="add" size={26} color="#fff" />
          <Text style={s.fabText}>{isAr ? 'إضافة منتج' : 'Add Product'}</Text>
        </Pressable>
      ) : null}

      {/* Product modal */}
      {store ? (
        <ProductModal
          visible={productModalVisible}
          onClose={() => { setProductModalVisible(false); setEditingProduct(null); }}
          onSave={handleSaveProduct}
          storeId={store.id}
          editProduct={editingProduct}
          storeCategoryNameAr={storeCategory?.name_ar || storeCategory?.name || ''}
          customCategories={customCategories}
          isAr={isAr}
          isRTL={isRTL}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  noStoreText: { fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },
  registerBtn: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.full,
    marginTop: 8,
  },
  registerBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },

  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, paddingTop: Spacing.sm,
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md, overflow: 'hidden',
  },
  headerDeco: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -40,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, flexShrink: 0,
  },
  headerContent: { flex: 1, gap: 4 },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  storeLogo: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.4)', flexShrink: 0, marginBottom: 4 },

  statsRow: {
    flexDirection: 'row', borderBottomWidth: 1,
    paddingVertical: 12,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 3 },
  statNum: { fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row', borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabBtnText: { fontSize: FontSize.sm },

  tabContent: { padding: Spacing.lg, paddingBottom: 100 },

  infoCard: {
    borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: 10, ...Shadow.xs,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: FontSize.sm, fontWeight: '500', lineHeight: 20 },
  catBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6,
  },
  catBadgeText: { fontSize: FontSize.sm, fontWeight: '700' },

  shareStoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: Radius.xl, borderWidth: 1.5,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  shareStoreBtnTitle: { fontSize: FontSize.md, fontWeight: '700' },
  shareStoreBtnSub: { fontSize: FontSize.xs, marginTop: 2 },
  pendingCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md, marginTop: Spacing.md,
  },
  pendingTitle: { fontSize: FontSize.md, fontWeight: '700', color: '#92400E', marginBottom: 3 },
  pendingSub: { fontSize: FontSize.sm, color: '#78350F', lineHeight: 19 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyText: { fontSize: FontSize.md, fontWeight: '600', textAlign: 'center', lineHeight: 22 },

  fab: {
    position: 'absolute', bottom: 24, left: Spacing.lg, right: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, borderRadius: Radius.full,
    ...Shadow.colored,
  },
  fabText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});