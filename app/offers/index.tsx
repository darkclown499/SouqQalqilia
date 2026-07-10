import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

// 1. أضفنا تصنيف (category) لكل عرض عشان نقدر نفلترهم
const DUMMY_OFFERS = [
  { id: '1', storeName: 'سوبرماركت التوفير', title: 'خصم 50% على المنظفات', category: 'سوبرماركت', height: 220, image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600&auto=format&fit=crop' },
  { id: '2', storeName: 'صيدلية الشفاء', title: 'عروض الفيتامينات الصيفية', category: 'صحة', height: 160, image: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?q=80&w=600&auto=format&fit=crop' },
  { id: '3', storeName: 'مطعم البيك', title: 'وجبة التوفير العائلية', category: 'مطاعم', height: 280, image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=600&auto=format&fit=crop' },
  { id: '4', storeName: 'معرض الإلكترونيات', title: 'لابتوبات بأسعار حرق', category: 'إلكترونيات', height: 180, image: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=600&auto=format&fit=crop' },
  { id: '5', storeName: 'مخبز الأمل', title: 'كعك طازج 1+1 مجاناً', category: 'مطاعم', height: 200, image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop' },
  { id: '6', storeName: 'بوتيك الأناقة', title: 'تشكيلة الصيف وصلت', category: 'ملابس', height: 240, image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=600&auto=format&fit=crop' },
];

// قائمة الفلاتر اللي رح تظهر بالشريط العلوي
const CATEGORIES = ['الكل', 'مطاعم', 'سوبرماركت', 'إلكترونيات', 'ملابس', 'صحة'];

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // 2. حالة (State) لتتبع الفلتر النشط، الافتراضي هو 'الكل'
  const [activeCategory, setActiveCategory] = useState('الكل');

  // 3. فلترة العروض بناءً على التصنيف المختار
  const filteredOffers = useMemo(() => {
    if (activeCategory === 'الكل') return DUMMY_OFFERS;
    return DUMMY_OFFERS.filter(offer => offer.category === activeCategory);
  }, [activeCategory]);

  // 4. تقسيم العروض المفلترة لعمودين عشان تصميم الـ Masonry
  const { leftCol, rightCol } = useMemo(() => {
    const left: typeof DUMMY_OFFERS = [];
    const right: typeof DUMMY_OFFERS = [];
    filteredOffers.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });
    return { leftCol: left, rightCol: right };
  }, [filteredOffers]);

  const renderBanner = (item: typeof DUMMY_OFFERS[0]) => (
    <Pressable key={item.id} style={[styles.bannerCard, { height: item.height }]}>
      <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.gradientOverlay} />
      
      <View style={styles.fireTag}>
        <Text style={styles.fireText}>🔥 لقطة</Text>
      </View>

      <View style={styles.bannerContent}>
        <Text style={styles.storeName} numberOfLines={1}>{item.storeName}</Text>
        <Text style={styles.bannerTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* الهيدر الأساسي */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="chevron-right" size={28} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>أقوى العروض 🔥</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* 5. شريط الفلاتر الأفقي */}
      <View style={styles.filtersWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.filtersScrollContent}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[styles.filterChip, isActive && styles.activeFilterChip]}
              >
                <Text style={[styles.filterText, isActive && styles.activeFilterText]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* المحتوى (شبكة العروض) */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {filteredOffers.length > 0 ? (
          <View style={styles.masonryContainer}>
            <View style={styles.column}>{leftCol.map(renderBanner)}</View>
            <View style={styles.column}>{rightCol.map(renderBanner)}</View>
          </View>
        ) : (
          /* في حال ما كان في عروض بهاد القسم */
          <View style={styles.emptyContainer}>
            <MaterialIcons name="local-offer" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>لا توجد عروض حالياً في هذا القسم</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  
  // ستايلات الفلتر
  filtersWrapper: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
  },
  filtersScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row-reverse', // عشان يبلش من اليمين لليسار
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeFilterChip: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  activeFilterText: {
    color: '#E11D48',
    fontWeight: '900',
  },

  scrollContent: {
    padding: 12,
    paddingBottom: 40,
  },
  masonryContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  column: {
    width: '48.5%', 
    gap: 12,
  },
  bannerCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: '40%', 
  },
  fireTag: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    elevation: 3,
  },
  fireText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400E',
  },
  bannerContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    alignItems: 'flex-end', 
  },
  storeName: {
    color: '#D1D5DB', 
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'right',
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'right',
  },
  
  // ستايل الحالة الفارغة
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  }
});