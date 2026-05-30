import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import type { Language } from '@/constants/i18n';

// ─── Privacy Policy Content (bilingual) ──────────────────────────────────────

const POLICY_EN = {
  lastUpdated: 'Last updated: May 30, 2026',
  sections: [
    {
      icon: 'info-outline' as const,
      title: '1. Introduction',
      body: 'Welcome to Souq Qalqilya ("we", "our", or "us"). This Privacy Policy explains how we collect, use, and protect your personal information when you use our mobile application. By using the app, you agree to the terms described here.',
    },
    {
      icon: 'person-outline' as const,
      title: '2. Information We Collect',
      body: 'We collect only the information necessary to operate the marketplace:\n\n• Email address (for account creation and login)\n• Display name and phone number (optional, set by you)\n• Ad listings you post (title, description, price, photos, location)\n• Messages exchanged between buyers and sellers\n• Profile avatar photo (if you choose to upload one)\n\nWe do NOT collect: device location, contacts, call history, microphone recordings, or any sensor data.',
    },
    {
      icon: 'settings-outlined' as const,
      title: '3. How We Use Your Information',
      body: 'Your information is used exclusively to:\n\n• Create and manage your account\n• Display your listings to other users\n• Enable in-app messaging between buyers and sellers\n• Send push notifications for new messages\n• Provide customer support via WhatsApp\n\nWe do not sell, rent, or share your personal data with third-party advertisers.',
    },
    {
      icon: 'lock-outline' as const,
      title: '4. Data Security',
      body: 'All data is stored on secure servers provided by Supabase (PostgreSQL). Connections are encrypted using HTTPS/TLS 1.3. We enforce HTTPS-only traffic — no cleartext connections are permitted. Passwords are hashed using bcrypt and are never stored in plain text. Your data is accessible only to you and our administrative team.',
    },
    {
      icon: 'photo-camera' as const,
      title: '5. Photos & Media',
      body: 'The app requests camera and media gallery access only when you choose to upload photos for a listing or profile avatar. Photos are stored in our secure cloud storage (Supabase Storage) and are only accessible via authenticated requests.\n\nWe do not access your camera or photo library in the background.',
    },
    {
      icon: 'notifications-none' as const,
      title: '6. Push Notifications',
      body: 'We request permission to send push notifications to alert you of new messages from buyers or sellers. Notification permission is optional — the app functions without it. You can revoke this permission at any time in your device settings.\n\nWe use Expo Push Notification Service (hosted by Expo) solely to deliver message alerts. No marketing or promotional notifications are sent.',
    },
    {
      icon: 'people-outline' as const,
      title: '7. Third-Party Services',
      body: 'The app uses the following third-party services:\n\n• Supabase — database, authentication, file storage (servers in EU)\n• Expo — mobile runtime and push notifications\n• Google Sign-In — optional OAuth login\n• Twilio — optional SMS OTP delivery\n\nEach of these services has its own Privacy Policy. We do not share identifiable information beyond what is required for these services to function.',
    },
    {
      icon: 'child-care' as const,
      title: "8. Children's Privacy",
      body: 'Souq Qalqilya is not directed to children under the age of 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us immediately and we will delete it.',
    },
    {
      icon: 'delete-forever' as const,
      title: '9. Account Deletion',
      body: 'You can permanently delete your account and all associated data directly from within the app at any time:\n\n1. Open the app and go to the Profile tab\n2. Scroll down to the Settings section\n3. Tap "Delete Account" (shown in red)\n4. Confirm the deletion in the dialog that appears\n\nUpon confirmation, the following data is immediately and permanently deleted from our servers:\n\n• Your user account and authentication credentials\n• All ad listings you have posted (including photos)\n• All messages and conversations\n• Your favorites list\n• Your profile photo and personal information\n\nThis action is irreversible. Once deleted, your data cannot be recovered. If you only want to stop using the app temporarily, you can simply log out instead.',
    },
    {
      icon: 'manage-accounts' as const,
      title: '10. Your Rights',
      body: 'You have the right to:\n\n• Access the personal data we hold about you\n• Correct inaccurate information\n• Delete your account and all associated data (see Section 9)\n• Withdraw consent at any time\n\nTo exercise these rights, contact us via WhatsApp or email at the address below.',
    },
    {
      icon: 'update' as const,
      title: '11. Changes to This Policy',
      body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email. Continued use of the app after changes constitutes acceptance of the updated policy.',
    },
    {
      icon: 'contact-mail' as const,
      title: '12. Contact Us',
      body: 'For privacy-related questions, please contact:\n\nPlankton Team\nQalqilya, Palestine\n\nWhatsApp: +972-59-232-4302\nEmail: support@souqqalqilya.ps',
    },
  ],
};

const POLICY_AR = {
  lastUpdated: 'آخر تحديث: ٣٠ مايو ٢٠٢٦',
  sections: [
    {
      icon: 'info-outline' as const,
      title: '١. المقدمة',
      body: 'أهلاً بك في سوق قلقيلية ("نحن" أو "التطبيق"). توضح سياسة الخصوصية هذه كيفية جمع معلوماتك الشخصية وتوظيفها وحمايتها عند استخدامك لتطبيقنا. باستخدام التطبيق، فإنك توافق على الشروط المذكورة هنا.',
    },
    {
      icon: 'person-outline' as const,
      title: '٢. المعلومات التي نجمعها',
      body: 'نجمع فقط المعلومات اللازمة لتشغيل السوق الإلكتروني:\n\n• البريد الإلكتروني (لإنشاء الحساب وتسجيل الدخول)\n• الاسم المعروض ورقم الهاتف (اختياري، تحدده أنت)\n• الإعلانات التي تنشرها (العنوان والوصف والسعر والصور والموقع)\n• الرسائل المتبادلة بين المشترين والبائعين\n• صورة الملف الشخصي (إن اخترت رفعها)\n\nلا نجمع: الموقع الجغرافي، جهات الاتصال، سجل المكالمات، تسجيلات الميكروفون، أو أي بيانات من المستشعرات.',
    },
    {
      icon: 'settings-outlined' as const,
      title: '٣. كيف نستخدم معلوماتك',
      body: 'تُستخدم معلوماتك حصراً من أجل:\n\n• إنشاء حسابك وإدارته\n• عرض إعلاناتك للمستخدمين الآخرين\n• تمكين المراسلة بين المشترين والبائعين داخل التطبيق\n• إرسال إشعارات للرسائل الجديدة\n• تقديم دعم العملاء عبر واتساب\n\nلا نبيع بياناتك الشخصية ولا نؤجرها ولا نشاركها مع أطراف ثالثة.',
    },
    {
      icon: 'lock-outline' as const,
      title: '٤. أمان البيانات',
      body: 'تُخزَّن جميع البيانات على خوادم آمنة توفرها Supabase (PostgreSQL). الاتصالات مشفرة بـ HTTPS/TLS 1.3. نلتزم بحركة HTTPS فقط دون السماح بأي اتصالات غير مشفرة. تُخزَّن كلمات المرور مشفرة باستخدام bcrypt ولا تُحفظ أبداً كنص صريح. بياناتك متاحة فقط لك وللفريق الإداري.',
    },
    {
      icon: 'photo-camera' as const,
      title: '٥. الصور والوسائط',
      body: 'يطلب التطبيق الوصول إلى الكاميرا ومعرض الصور فقط عند اختيارك رفع صور لإعلان أو لصورة ملفك الشخصي. تُخزَّن الصور في التخزين السحابي الآمن الخاص بنا ولا يُمكن الوصول إليها إلا عبر طلبات مصادق عليها.\n\nلا نصل إلى الكاميرا أو مكتبة الصور في الخلفية.',
    },
    {
      icon: 'notifications-none' as const,
      title: '٦. الإشعارات الفورية',
      body: 'نطلب إذناً لإرسال إشعارات فورية لتنبيهك بالرسائل الجديدة من المشترين أو البائعين. الإذن اختياري — يعمل التطبيق بدونه. يمكنك سحب هذا الإذن في أي وقت من إعدادات جهازك.\n\nنستخدم خدمة Expo للإشعارات فقط لإيصال تنبيهات الرسائل. لا نرسل أي إشعارات تسويقية أو ترويجية.',
    },
    {
      icon: 'people-outline' as const,
      title: '٧. خدمات الأطراف الثالثة',
      body: 'يستخدم التطبيق الخدمات التالية:\n\n• Supabase — قاعدة البيانات والمصادقة وتخزين الملفات (خوادم في الاتحاد الأوروبي)\n• Expo — بيئة تشغيل التطبيق والإشعارات الفورية\n• تسجيل الدخول بـ Google — دخول OAuth اختياري\n• Twilio — توصيل رمز التحقق عبر SMS (اختياري)\n\nلكل من هذه الخدمات سياسة خصوصية خاصة بها. لا نشارك أي معلومات تعريفية تتجاوز ما هو ضروري لعمل هذه الخدمات.',
    },
    {
      icon: 'child-care' as const,
      title: '٨. خصوصية الأطفال',
      body: 'سوق قلقيلية ليس موجهاً للأطفال دون سن الثالثة عشرة. لا نجمع عن قصد أي معلومات شخصية من الأطفال. إذا اعتقدت أن طفلاً قدّم لنا معلومات شخصية، يرجى التواصل معنا فوراً وسنحذفها.',
    },
    {
      icon: 'delete-forever' as const,
      title: '٩. حذف الحساب',
      body: 'يمكنك حذف حسابك وجميع بياناتك نهائياً مباشرةً من داخل التطبيق في أي وقت:\n\n١. افتح التطبيق وانتقل إلى تبويب الملف الشخصي\n٢. انتقل للأسفل إلى قسم الإعدادات\n٣. اضغط على "حذف الحساب" (باللون الأحمر)\n٤. أكّد الحذف في نافذة الحوار التي تظهر\n\nعند التأكيد، يُحذف الآتي فوراً ونهائياً من خوادمنا:\n\n• حسابك وبيانات تسجيل الدخول\n• جميع الإعلانات التي نشرتها (بما فيها الصور)\n• جميع الرسائل والمحادثات\n• قائمة المفضلة\n• صورة الملف الشخصي والمعلومات الشخصية\n\nهذا الإجراء لا رجعة فيه. بعد الحذف، لا يمكن استرجاع بياناتك. إذا أردت التوقف عن استخدام التطبيق مؤقتاً، يمكنك تسجيل الخروج فحسب.',
    },
    {
      icon: 'manage-accounts' as const,
      title: '١٠. حقوقك',
      body: 'يحق لك:\n\n• الاطلاع على البيانات الشخصية التي نحتفظ بها عنك\n• تصحيح المعلومات غير الدقيقة\n• حذف حسابك وجميع البيانات المرتبطة به (انظر القسم ٩)\n• سحب موافقتك في أي وقت\n\nلممارسة هذه الحقوق، تواصل معنا عبر واتساب أو البريد الإلكتروني أدناه.',
    },
    {
      icon: 'update' as const,
      title: '١١. التغييرات على هذه السياسة',
      body: 'قد نُحدّث سياسة الخصوصية هذه من وقت لآخر. سنُعلمك بأي تغييرات جوهرية عبر التطبيق أو بالبريد الإلكتروني. استمرار استخدام التطبيق بعد التغييرات يعني قبولك للسياسة المحدّثة.',
    },
    {
      icon: 'contact-mail' as const,
      title: '١٢. تواصل معنا',
      body: 'لأي استفسارات تتعلق بالخصوصية، يُرجى التواصل:\n\nفريق بلانكتون\nقلقيلية، فلسطين\n\nواتساب: 972-59-232-4302+\nالبريد الإلكتروني: support@souqqalqilya.ps',
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language, setLanguage, isRTL } = useLanguage();

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const isAr = language === 'ar';
  const policy = isAr ? POLICY_AR : POLICY_EN;

  const toggleSection = (i: number) => {
    setExpandedIndex(prev => (prev === i ? null : i));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <View style={[
        styles.header,
        { backgroundColor: colors.primary, paddingTop: insets.top + 12 },
      ]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons
            name={isRTL ? 'arrow-forward' : 'arrow-back'}
            size={22}
            color="#fff"
          />
        </Pressable>

        <View style={styles.headerCenter}>
          <MaterialIcons name="privacy-tip" size={28} color="rgba(255,255,255,0.9)" />
          <Text style={styles.headerTitle}>
            {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
          </Text>
          <Text style={styles.headerSub}>{policy.lastUpdated}</Text>
        </View>

        {/* Language toggle */}
        <View style={[styles.langRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {(['en', 'ar'] as Language[]).map(lang => (
            <Pressable
              key={lang}
              style={[
                styles.langPill,
                {
                  backgroundColor: language === lang
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.15)',
                  borderColor: language === lang
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.3)',
                },
              ]}
              onPress={() => setLanguage(lang)}
              hitSlop={8}
            >
              <Text style={[
                styles.langPillText,
                { color: language === lang ? colors.primary : 'rgba(255,255,255,0.85)' },
              ]}>
                {lang === 'en' ? 'EN' : 'ع'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── INTRO BANNER ─────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.introBanner, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '30' }]}>
          <MaterialIcons name="verified-user" size={32} color={colors.primary} />
          <Text style={[
            styles.introText,
            { color: colors.textSecondary, textAlign: isRTL ? 'right' : 'left' },
          ]}>
            {isAr
              ? 'نحن ملتزمون بحماية خصوصيتك وبياناتك. اقرأ هذه السياسة بعناية لفهم كيفية تعاملنا مع معلوماتك.'
              : 'We are committed to protecting your privacy and data. Read this policy carefully to understand how we handle your information.'}
          </Text>
        </View>

        {/* ── DELETE ACCOUNT HIGHLIGHT CARD ──────────────────────────────────── */}
        <View style={[styles.deleteHighlight, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <View style={styles.deleteHighlightIcon}>
            <MaterialIcons name="delete-forever" size={22} color="#DC2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.deleteHighlightTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr ? 'حذف الحساب متاح داخل التطبيق' : 'Account Deletion Available In-App'}
            </Text>
            <Text style={[styles.deleteHighlightBody, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isAr
                ? 'الملف الشخصي ← الإعدادات ← حذف الحساب'
                : 'Profile Tab → Settings → Delete Account'}
            </Text>
          </View>
        </View>

        {/* ── ACCORDION SECTIONS ─────────────────────────────────────────────── */}
        <View style={styles.sections}>
          {policy.sections.map((section, i) => {
            const isOpen = expandedIndex === i;
            const isDeleteSection = section.icon === 'delete-forever';
            return (
              <View
                key={i}
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: isDeleteSection && isOpen ? '#FEF2F2' : colors.surface,
                    borderColor: isDeleteSection
                      ? (isOpen ? '#F87171' : '#FECACA')
                      : (isOpen ? colors.primary + '50' : colors.border),
                    ...Shadow.xs,
                  },
                ]}
              >
                <Pressable
                  style={[
                    styles.sectionHeader,
                    { flexDirection: isRTL ? 'row-reverse' : 'row' },
                  ]}
                  onPress={() => toggleSection(i)}
                  hitSlop={{ top: 4, bottom: 4 }}
                >
                  <View style={[
                    styles.sectionIconWrap,
                    {
                      backgroundColor: isDeleteSection
                        ? '#FEE2E2'
                        : (isOpen ? colors.primaryGhost : colors.surfaceTint),
                    },
                  ]}>
                    <MaterialIcons
                      name={section.icon}
                      size={18}
                      color={isDeleteSection ? '#DC2626' : (isOpen ? colors.primary : colors.textMuted)}
                    />
                  </View>
                  <Text style={[
                    styles.sectionTitle,
                    {
                      color: isDeleteSection
                        ? '#DC2626'
                        : (isOpen ? colors.primary : colors.textPrimary),
                      flex: 1,
                      textAlign: isRTL ? 'right' : 'left',
                    },
                  ]}>
                    {section.title}
                  </Text>
                  <MaterialIcons
                    name={isOpen ? 'expand-less' : 'expand-more'}
                    size={22}
                    color={isDeleteSection ? '#DC2626' : (isOpen ? colors.primary : colors.textMuted)}
                  />
                </Pressable>

                {isOpen ? (
                  <View style={[styles.sectionBody, { borderTopColor: isDeleteSection ? '#FECACA' : colors.borderLight }]}>
                    <Text style={[
                      styles.sectionBodyText,
                      {
                        color: isDeleteSection ? '#7F1D1D' : colors.textSecondary,
                        textAlign: isRTL ? 'right' : 'left',
                      },
                    ]}>
                      {section.body}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
        <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
          <MaterialIcons name="security" size={20} color={colors.primary} />
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            {isAr
              ? 'سوق قلقيلية — بُني بـ ❤ من فريق بلانكتون'
              : 'Souq Qalqilya — Built with ❤ by Plankton Team'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backBtn: {
    position: 'absolute',
    left: Spacing.lg,
    top: 0,
    marginTop: 16,
    zIndex: 10,
  },
  headerCenter: { alignItems: 'center', gap: 4, marginTop: 4 },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginTop: 6,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
  langRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    minWidth: 44,
    alignItems: 'center',
  },
  langPillText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Scroll
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  // Intro
  introBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: 4,
  },
  introText: {
    flex: 1,
    fontSize: FontSize.sm,
    lineHeight: 22,
    fontWeight: '500',
  },

  // Delete highlight card
  deleteHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    marginBottom: 4,
  },
  deleteHighlightIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteHighlightTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  deleteHighlightBody: {
    fontSize: FontSize.xs,
    color: '#EF4444',
    fontWeight: '500',
  },

  // Sections
  sections: { gap: Spacing.sm },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    minHeight: 58,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionBody: {
    borderTopWidth: 1,
    padding: Spacing.md,
    paddingTop: Spacing.sm + 4,
  },
  sectionBodyText: {
    fontSize: FontSize.sm,
    lineHeight: 24,
    fontWeight: '400',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.xl,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
