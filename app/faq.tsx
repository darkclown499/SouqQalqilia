import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from 'react-native-reanimated';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { APP_VERSION } from '@/constants/config';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

interface FaqItem {
  q: string;
  qAr: string;
  a: string;
  aAr: string;
  icon: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    icon: 'add-circle-outline',
    q: 'How do I publish an ad?',
    qAr: 'كيف أنشر إعلاناً؟',
    a: 'Tap the "+" button in the bottom navigation bar. Fill in the title, description, price, location, and category. Add up to 3 photos of your item. Review the details and tap "Publish Listing" to go live instantly.',
    aAr: 'اضغط على زر "+" في شريط التنقل السفلي. أدخل العنوان والوصف والسعر والموقع والتصنيف. أضف ما يصل إلى 3 صور للمنتج. راجع التفاصيل واضغط "نشر الإعلان" لينشر فوراً.',
  },
  {
    icon: 'edit',
    q: 'How do I edit my ad price or details?',
    qAr: 'كيف أعدّل سعر منتجي أو تفاصيل الإعلان؟',
    a: 'Go to your Profile tab → My Listings. Find the ad you want to edit, then tap it to open the ad detail page. Tap the edit icon at the top. Update the price, title, description, or any other field, then tap Save.',
    aAr: 'اذهب إلى تبويب ملفي ← إعلاناتي. ابحث عن الإعلان الذي تريد تعديله، ثم اضغط عليه لفتح صفحة التفاصيل. اضغط على أيقونة التعديل في الأعلى. حدّث السعر أو العنوان أو الوصف أو أي حقل آخر، ثم اضغط حفظ.',
  },
  {
    icon: 'check-circle-outline',
    q: 'How do I mark an item as sold?',
    qAr: 'كيف أضع علامة "مباع" على منتج؟',
    a: 'In your Profile → My Listings, scroll to the active ad and tap the "Mark as Sold" button below it. The ad status will change to Sold and it will no longer appear in the public feed.',
    aAr: 'في ملفك الشخصي ← إعلاناتي، مرّر إلى الإعلان النشط واضغط على زر "وضع علامة مباع" أسفله. سيتغير حالة الإعلان إلى مباع ولن يظهر في القائمة العامة.',
  },
  {
    icon: 'chat-bubble-outline',
    q: 'How do I chat with a buyer or seller?',
    qAr: 'كيف أتحدث مع مشترٍ أو بائع؟',
    a: 'Open any listing and tap the "In-App Chat" button on the product detail page. A conversation thread will open. You can also view all your conversations from the Messages tab.',
    aAr: 'افتح أي إعلان واضغط على زر "دردشة التطبيق" في صفحة التفاصيل. ستُفتح خيط المحادثة. يمكنك أيضاً مشاهدة جميع محادثاتك من تبويب الرسائل.',
  },
  {
    icon: 'photo-camera',
    q: 'How many photos can I add to an ad?',
    qAr: 'كم صورة يمكنني إضافتها للإعلان؟',
    a: 'You can add up to 3 photos per listing. Use clear, well-lit photos to attract more buyers. You can pick images from your gallery or take a new photo directly with your camera.',
    aAr: 'يمكنك إضافة ما يصل إلى 3 صور لكل إعلان. استخدم صوراً واضحة ومضيئة لجذب المزيد من المشترين. يمكنك اختيار الصور من معرض الصور أو التقاط صورة جديدة مباشرة بالكاميرا.',
  },
  {
    icon: 'flag',
    q: 'How do I report an inappropriate listing?',
    qAr: 'كيف أُبلّغ عن إعلان غير لائق؟',
    a: 'Open the listing detail page and tap the flag/report icon in the top-right corner. Choose a reason (Fraud, Inappropriate Content, Duplicate, Abusive User, or Other) and submit. Our team reviews reports within 24 hours.',
    aAr: 'افتح صفحة تفاصيل الإعلان واضغط على أيقونة الإبلاغ في الزاوية العلوية اليمنى. اختر سبباً (احتيال، محتوى غير لائق، إعلان مكرر، مستخدم مسيء، أو أخرى) وأرسله. يراجع فريقنا البلاغات خلال 24 ساعة.',
  },
  {
    icon: 'block',
    q: 'How do I block a user?',
    qAr: 'كيف أحظر مستخدماً؟',
    a: 'On any listing or in a chat, tap the seller/buyer name to open their profile, then tap "Block User." You can also block from the ad detail page. Blocked users content is hidden from your feed immediately. You can unblock from Settings → Your Profile → Blocked Users.',
    aAr: 'في أي إعلان أو في محادثة، اضغط على اسم البائع/المشتري لفتح ملفه الشخصي، ثم اضغط "حظر المستخدم". يمكنك أيضاً الحظر من صفحة تفاصيل الإعلان. يُخفى محتوى المستخدمين المحظورين من موجزك فوراً. يمكنك رفع الحظر من الإعدادات ← ملفك الشخصي ← المستخدمون المحظورون.',
  },
  {
    icon: 'notifications-none',
    q: 'Why am I not receiving notifications?',
    qAr: 'لماذا لا أتلقى إشعارات؟',
    a: 'Make sure notifications are enabled in your device Settings → Souq Qalqilya → Notifications. Also ensure you are signed in, as notifications require an active account. If the problem persists, try logging out and back in.',
    aAr: 'تأكد من تفعيل الإشعارات في إعدادات جهازك ← سوق قلقيلية ← الإشعارات. تأكد أيضاً من تسجيل الدخول، لأن الإشعارات تتطلب حساباً نشطاً. إذا استمرت المشكلة، جرّب تسجيل الخروج ثم الدخول مجدداً.',
  },
  {
    icon: 'delete-outline',
    q: 'How do I delete my account?',
    qAr: 'كيف أحذف حسابي؟',
    a: 'Go to Profile → Settings → scroll to "Delete Account." Tap it, read the confirmation, then confirm. This permanently deletes all your listings, messages, and personal data. This action cannot be undone.',
    aAr: 'اذهب إلى ملفي ← الإعدادات ← مرّر إلى "حذف الحساب". اضغط عليه، اقرأ التأكيد، ثم أكّد. هذا يحذف جميع إعلاناتك ورسائلك وبياناتك الشخصية نهائياً. لا يمكن التراجع عن هذا الإجراء.',
  },
  {
    icon: 'lock-outline',
    q: 'How do I change my password?',
    qAr: 'كيف أغيّر كلمة المرور؟',
    a: 'Go to Profile → Settings → Security & Privacy → Change Password. Enter your current email and we will send you a password reset link. Alternatively, use the "Forgot Password?" option on the login screen.',
    aAr: 'اذهب إلى ملفي ← الإعدادات ← الأمان والخصوصية ← تغيير كلمة المرور. أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور. بدلاً من ذلك، استخدم خيار "نسيت كلمة المرور؟" في شاشة تسجيل الدخول.',
  },
];

function FaqAccordion({ item, isRTL, colors }: { item: FaqItem; isRTL: boolean; colors: any }) {
  const [open, setOpen] = useState(false);
  const rotation = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    maxHeight: withTiming(open ? 600 : 0, { duration: 280 }),
    opacity: withTiming(open ? 1 : 0, { duration: 220 }),
    overflow: 'hidden',
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    rotation.value = withSpring(next ? 180 : 0, { damping: 14, stiffness: 120 });
  };

  return (
    <View style={[faqStyles.item, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        style={[faqStyles.question, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        onPress={toggle}
      >
        <View style={[faqStyles.qIconWrap, { backgroundColor: colors.primaryGhost }]}>
          <MaterialIcons name={item.icon as any} size={18} color={colors.primary} />
        </View>
        <Text
          style={[faqStyles.qText, { color: colors.textPrimary, flex: 1, textAlign: isRTL ? 'right' : 'left' }]}
          numberOfLines={2}
        >
          {isRTL ? item.qAr : item.q}
        </Text>
        <Animated.View style={arrowStyle}>
          <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.primary} />
        </Animated.View>
      </Pressable>

      <Animated.View style={animStyle}>
        <View style={[faqStyles.answer, { borderTopColor: colors.borderLight }]}>
          <Text style={[faqStyles.aText, { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? item.aAr : item.a}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default function FaqScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  return (
    <View style={[faqStyles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[faqStyles.header, { backgroundColor: colors.primary }]}>
        <Pressable
          style={faqStyles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <MaterialIcons
            name={isRTL ? 'arrow-forward' : 'arrow-back'}
            size={22}
            color="#fff"
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[faqStyles.headerTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? 'الأسئلة الشائعة' : 'FAQ'}
          </Text>
          <Text style={[faqStyles.headerSub, { textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? 'إجابات على أكثر الأسئلة شيوعاً' : 'Answers to common questions'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={faqStyles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner */}
        <View style={[faqStyles.banner, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '30' }]}>
          <View style={[faqStyles.bannerIcon, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="help-outline" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[faqStyles.bannerTitle, { color: colors.primary, textAlign: isRTL ? 'right' : 'left' }]}>
              {isRTL ? 'هل لديك سؤال؟' : 'Have a question?'}
            </Text>
            <Text style={[faqStyles.bannerSub, { color: colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
              {isRTL ? 'اضغط على أي سؤال لرؤية الإجابة' : 'Tap any question to reveal the answer'}
            </Text>
          </View>
        </View>

        {FAQ_ITEMS.map((item, i) => (
          <FaqAccordion key={i} item={item} isRTL={isRTL} colors={colors} />
        ))}

        {/* ── VERSION FOOTER ── */}
        <View style={faqStyles.versionFooter}>
          <View style={[faqStyles.versionDot, { backgroundColor: colors.border }]} />
          <View style={faqStyles.versionRow}>
            <MaterialIcons name="info-outline" size={12} color={colors.textMuted} />
            <Text style={[faqStyles.versionText, { color: colors.textMuted }]}>
              {isRTL ? `سوق قلقيلية · الإصدار ${APP_VERSION}` : `Souq Qalqilya · v${APP_VERSION}`}
            </Text>
          </View>
        </View>

        <View style={[faqStyles.footer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="support-agent" size={24} color={colors.primary} />
          <Text style={[faqStyles.footerText, { color: colors.textPrimary }]}>
            {isRTL ? 'لم تجد إجابتك؟' : "Didn't find your answer?"}
          </Text>
          <Text style={[faqStyles.footerSub, { color: colors.textMuted }]}>
            {isRTL ? 'تواصل مع فريق الدعم عبر مركز المساعدة في الإعدادات' : 'Contact our support team via Help Center in Settings'}
          </Text>
        </View>

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const faqStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  bannerIcon: {
    width: 48, height: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 2 },
  bannerSub: { fontSize: FontSize.xs, lineHeight: 16 },
  item: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadow.xs,
  },
  question: {
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  qIconWrap: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  qText: { fontSize: FontSize.sm, fontWeight: '600', lineHeight: 20 },
  answer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
  },
  aText: { fontSize: FontSize.sm, lineHeight: 22 },
  footer: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
  },
  footerText: { fontSize: FontSize.md, fontWeight: '700' },
  footerSub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  versionFooter: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 7 },
  versionDot: { width: 36, height: 1.5, borderRadius: 99 },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  versionText: { fontSize: FontSize.xs, fontWeight: '500' },
});
