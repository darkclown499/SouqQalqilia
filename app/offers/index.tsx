import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// بيانات وهمية للعروض (بأطوال مختلفة لمحاكاة التصميم)
const DUMMY_OFFERS = [
  { id: '1', storeName: 'سوبرماركت التوفير', title: 'خصم 50% على المنظفات', height: 220, image: 'https://images.unsplash.com/photo-1584473457406-6240486418e9?auto=format&fit=crop&q=80&w=400' },
  { id: '2', storeName: 'صيدلية الشفاء', title: 'عروض الفيتامينات', height: 160, image: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?auto=format&fit=crop&q=80&w=400' },
  { id: '3', storeName: 'مطعم البيك', title: 'وجبة التوفير العائلية', height: 260, image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&q=80&w=400' },
  { id: '4', storeName: 'معرض الإلكترونيات', title: 'لابتوبات بأسعار حرق', height: 180, image: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?auto=format&fit=crop&q=80&w=400' },
  { id: '5', storeName: 'مخبز الأمل', title: 'كعك طازج 1+1 مجاناً', height: 200, image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400' },
  { id: '6', storeName: 'بوتيك الأناقة', title: 'تشكيلة الصيف', height: 240, image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=80&w=400' },
];

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // تقسيم العروض لعمودين (يمين ويسار) لعمل شكل الـ Masonry
  const { leftCol, rightCol } = useMemo(() => {
    const left: typeof DUMMY_OFFERS = [];
    const right: typeof DUMMY_OFFERS = [];
    DUMMY_OFFERS.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });
    return { leftCol: left, rightCol: right };
  }, []);

  // دالة لرسم كرت العرض
  const renderBanner = (item: typeof DUMMY_OFFERS[0]) => (
    <Pressable 
      key={item.id} 
      style={[styles.bannerCard, { height: item.height }]}
      onPress={() => console.log('الذهاب لعرض:', item.id)} // تقدر تربطها بصفحة المتجر بعدين
    >
      <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      {/* طبقة تظليل عشان النص يكون واضح */}
      <View style={styles.overlay} />
      
      <View style={styles.bannerContent}>
        <View style={styles.fireTag}>
          <Text style={styles.fireText}>🔥 لقطة</Text>
        </View>
        <Text style={styles.storeName} numberOfLines={1}>{item.storeName}</Text>
        <Text style={styles.bannerTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* الهيدر */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="chevron-right" size={28} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>أقوى العروض 🔥</Text>
        <View style={{ width: 28 }} /> {/* عشان نوسط العنوان */}
      </View>

      {/* المحتوى (البنرات) */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.masonryContainer}>
          {/* العمود الأول (يمين) */}
          <View style={styles.column}>
            {leftCol.map(renderBanner)}
          </View>
          
          {/* العمود الثاني (يسار) */}
          <View style={styles.column}>
            {rightCol.map(renderBanner)}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // خلفية مريحة للعين
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 40,
  },
  masonryContainer: {
    flexDirection: 'row-reverse', // عشان نبلش من اليمين
    justifyContent: 'space-between',
  },
  column: {
    width: '48%', // كل عمود بياخذ أقل من النص بشوي عشان الفراغ اللّي بالنص
    gap: 12,      // الفراغ العمودي بين البنرات
  },
  bannerCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    // الظل (Shadow)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)', // تظليل خفيف
  },
  bannerContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  fireTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF08A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  fireText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  storeName: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
  },
});