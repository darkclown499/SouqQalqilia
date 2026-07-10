import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, ActivityIndicator, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser'; // 🌟 أضفنا مكتبة المتصفح الداخلي

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIP_WIDTH = SCREEN_WIDTH - 24; 

// 🌟 لاحظ كيف نوعنا بالروابط بين واتساب ومواقع ويب عادية
const VIP_OFFERS = [
  {
    id: 'vip-1',
    storeName: 'الراعي الرسمي',
    title: 'مهرجان تحطيم الأسعار - خصومات تصل لـ 70% على كل الأقسام!',
    image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=1000&auto=format&fit=crop',
    url: 'whatsapp://send?phone=+970590000000&text=مرحبا، شفت عرض الـ VIP بسوق قلقيلية وبدي أستفسر!' // 👈 رابط واتساب مع رسالة جاهزة
  },
  {
    id: 'vip-2',
    storeName: 'معرض الإلكترونيات',
    title: 'أقوى أجهزة اللابتوب بأسعار حصرية لفترة محدودة 💻',
    image: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=1000&auto=format&fit=crop',
    url: 'https://www.apple.com' // 👈 موقع ويب عادي
  },
  {
    id: 'vip-3',
    storeName: 'بوتيك الأناقة',
    title: 'اشتري قطعة واحصل على الثانية مجاناً الآن 🎁',
    image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=1000&auto=format&fit=crop',
    url: 'https://www.zara.com'
  }
];

const DUMMY_OFFERS = [
  { id: '1', storeName: 'سوبرماركت التوفير', title: 'خصم 50% على المنظفات', category: 'سوبرماركت', height: 220, image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600&auto=format&fit=crop', url: 'whatsapp://send?phone=+970590000000' },
  { id: '2', storeName: 'صيدلية الشفاء', title: 'عروض الفيتامينات الصيفية', category: 'صحة', height: 160, image: 'https://images.unsplash.com/photo-1584308666744-24d5e4a778fc?q=80&w=600&auto=format&fit=crop', url: 'https://example.com' },
  { id: '3', storeName: 'مطعم البيك', title: 'وجبة التوفير العائلية', category: 'مطاعم', height: 280, image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=600&auto=format&fit=crop', url: 'whatsapp://send?phone=+970590000000' },
  { id: '4', storeName: 'معرض الإلكترونيات', title: 'لابتوبات بأسعار حرق', category: 'إلكترونيات', height: 180, image: 'https://images.unsplash.com/photo-1531297172868-942cece06ac1?q=80&w=600&auto=format&fit=crop', url: 'https://example.com' },
  { id: '5', storeName: 'مخبز الأمل', title: 'كعك طازج 1+1 مجاناً', category: 'مطاعم', height: 200, image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop', url: 'https://example.com' },
  { id: '6', storeName: 'بوتيك الأناقة', title: 'تشكيلة الصيف وصلت', category: 'ملابس', height: 240, image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=600&auto=format&fit=crop', url: 'https://example.com' },
];

const CATEGORIES = ['الكل', 'مطاعم', 'سوبرماركت', 'إلكترونيات', 'ملابس', 'صحة'];

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const [currentVipIndex, setCurrentVipIndex] = useState(0);

  // 🌟 دالة فتح الروابط الذكية (In-App Browser & WhatsApp)
  const handleOpenLink = async (url: string) => {
    if (!url) return;
    try {
      // 1. إذا كان الرابط موقع ويب عادي (http أو https)، افتحه جوا التطبيق
      if (url.toLowerCase().startsWith('http')) {
        await WebBrowser.openBrowserAsync(url, {
          toolbarColor: '#E11D48', // 👈 لون شريط المتصفح رح يكون أحمر زي هوية تطبيقك
          enableBarCollapsing: true, // 👈 إخفاء الشريط عند النزول لتحت لزيادة مساحة الشاشة
        });
      } 
      // 2. إذا كان الرابط واتساب، اتصال، أو غيره، افتحه بالتطبيق المخصص له
      else {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          console.log("تطبيق غير متوفر لفتح هذا الرابط (قد يكون الواتساب غير مثبت):", url);
        }
      }
    } catch (error) {
      console.error("حدث خطأ أثناء فتح الرابط:", error);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (currentVipIndex + 1) % VIP_OFFERS.length;
      scrollViewRef.current?.scrollTo({
        x: nextIndex * (VIP_WIDTH + 12), 
        animated: true,
      });
      setCurrentVipIndex(nextIndex);
    }, 3500);
    return () => clearInterval(interval); 
  }, [currentVipIndex]); 

  const handleScrollEnd = (event: any) => {
    const contentOffsetX = Math.abs(event.nativeEvent.contentOffset.x);
    const newIndex = Math.round(contentOffsetX / (VIP_WIDTH + 12));
    setCurrentVipIndex(newIndex);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const filteredOffers = useMemo(() => {
    if (activeCategory === 'الكل') return DUMMY_OFFERS;
    return DUMMY_OFFERS.filter(offer => offer.category === activeCategory);
  }, [activeCategory]);

  const { leftCol, rightCol } = useMemo(() => {
    const left: typeof DUMMY_OFFERS = [];
    const right: typeof DUMMY_OFFERS = [];
    filteredOffers.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });
    return { leftCol: left, rightCol: right };
  }, [filteredOffers]);

  // الإعلانات العادية (ضغط على كامل الكرت)
  const renderBanner = (item: typeof DUMMY_OFFERS[0]) => (
    <Pressable 
      key={item.id} 
      style={[styles.bannerCard, { height: item.height }]}
      onPress={() => handleOpenLink(item.url)}
    >
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
      
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <MaterialIcons name="chevron-right" size={28} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>أقوى العروض 🔥</Text>
        <Pressable onPress={handleRefresh} disabled={isRefreshing} style={[styles.headerBtn, styles.refreshBtn]}>
          {isRefreshing ? <ActivityIndicator size="small" color="#E11D48" /> : <MaterialIcons name="refresh" size={22} color="#111827" />}
        </Pressable>
      </View>

      <View style={styles.filtersWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rtlScrollView} contentContainerStyle={styles.filtersScrollContent}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setActiveCategory(cat)}
              style={[styles.filterChip, activeCategory === cat && styles.activeFilterChip, styles.rtlItem]}
            >
              <Text style={[styles.filterText, activeCategory === cat && styles.activeFilterText]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.vipSliderWrapper}>
          <ScrollView
            ref={scrollViewRef} 
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={VIP_WIDTH + 12}
            decelerationRate="fast"
            onMomentumScrollEnd={handleScrollEnd} 
            style={styles.rtlScrollView}
            contentContainerStyle={styles.vipSliderContent}
          >
            {VIP_OFFERS.map((offer) => (
              <View key={offer.id} style={[styles.vipBannerContainer, styles.rtlItem]}>
                <Image source={{ uri: offer.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.95)']} style={StyleSheet.absoluteFill} />
                
                <View style={styles.vipTag}>
                  <FontAwesome5 name="crown" size={12} color="#B45309" />
                  <Text style={styles.vipTagText}>عرض VIP</Text>
                </View>
                
                <View style={styles.vipContent}>
                  <Text style={styles.vipStoreName}>{offer.storeName}</Text>
                  <Text style={styles.vipTitle}>{offer.title}</Text>
                  
                  {/* الضغط فقط على الزر كما طلبت */}
                  <Pressable 
                    style={styles.vipButton}
                    onPress={() => handleOpenLink(offer.url)}
                  >
                    <Text style={styles.vipButtonText}>اكتشف العرض الآن</Text>
                    <MaterialIcons name="local-activity" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.paginationContainer}>
            {VIP_OFFERS.map((_, index) => (
              <View key={index} style={[styles.dot, currentVipIndex === index && styles.activeDot]} />
            ))}
          </View>
        </View>

        {filteredOffers.length > 0 ? (
          <View style={styles.masonryContainer}>
            <View style={styles.column}>{leftCol.map(renderBanner)}</View>
            <View style={styles.column}>{rightCol.map(renderBanner)}</View>
          </View>
        ) : (
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  refreshBtn: { backgroundColor: '#F3F4F6' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  
  filtersWrapper: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 10 },
  rtlScrollView: { transform: [{ scaleX: -1 }] },
  rtlItem: { transform: [{ scaleX: -1 }] },
  filtersScrollContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: 'transparent' },
  activeFilterChip: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  activeFilterText: { color: '#E11D48', fontWeight: '900' },
  
  scrollContent: { padding: 12, paddingBottom: 40 },
  
  vipSliderWrapper: { marginBottom: 16 },
  vipSliderContent: { gap: 12, flexDirection: 'row' },
  vipBannerContainer: { width: VIP_WIDTH, height: 260, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1F2937', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  vipTag: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 6 },
  vipTagText: { fontSize: 12, fontWeight: '900', color: '#B45309' },
  vipContent: { flex: 1, justifyContent: 'flex-end', padding: 16, alignItems: 'flex-end' },
  vipStoreName: { color: '#FCD34D', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  vipTitle: { color: '#ffffff', fontSize: 18, fontWeight: '900', textAlign: 'right', lineHeight: 26, marginBottom: 12 },
  vipButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E11D48', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, gap: 8 },
  vipButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  
  paginationContainer: { flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  activeDot: { width: 24, backgroundColor: '#E11D48' },

  masonryContainer: { flexDirection: 'row-reverse', justifyContent: 'space-between' },
  column: { width: '48.5%', gap: 12 },
  bannerCard: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
  gradientOverlay: { ...StyleSheet.absoluteFillObject, top: '40%' },
  fireTag: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FEF08A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  fireText: { fontSize: 11, fontWeight: '900', color: '#92400E' },
  bannerContent: { flex: 1, justifyContent: 'flex-end', padding: 12, alignItems: 'flex-end' },
  storeName: { color: '#D1D5DB', fontSize: 11, fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  bannerTitle: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 20, textAlign: 'right' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#9CA3AF' }
});