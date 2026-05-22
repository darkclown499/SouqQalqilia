import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Linking, ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

const WHATSAPP_NUMBER = '972592324302';
const SUPPORT_EMAIL = 'eyadfadezh499@gmail.com';

interface PromotionOption {
  id: string;
  icon: 'bolt' | 'campaign';
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  packages: {
    labelEn: string;
    labelAr: string;
    price: string;
    popular?: boolean;
  }[];
  gradient: string[];
  accentColor: string;
}

const OPTIONS: PromotionOption[] = [
  {
    id: 'boost',
    icon: 'bolt',
    titleEn: 'Boost Product',
    titleAr: 'تعزيز المنتج',
    descEn: 'Push your listing to the top of search results and home feed.',
    descAr: 'اجعل إعلانك في أعلى نتائج البحث والصفحة الرئيسية.',
    packages: [
      { labelEn: '7 Days Boost', labelAr: 'تعزيز 7 أيام', price: '30 ₪' },
    ],
    gradient: ['#0A6E5C', '#0D9176'],
    accentColor: '#0A6E5C',
  },
  {
    id: 'banner',
    icon: 'campaign',
    titleEn: 'Banner Ad',
    titleAr: 'إعلان بانر',
    descEn: 'Display your banner prominently on the home screen carousel.',
    descAr: 'اعرض بانرك بشكل بارز في شريط الصفحة الرئيسية.',
    packages: [
      { labelEn: '7 Days Banner', labelAr: 'بانر 7 أيام', price: '300 ₪' },
      { labelEn: '14 Days Banner', labelAr: 'بانر 14 يوم', price: '500 ₪', popular: true },
    ],
    gradient: ['#D97706', '#F59E0B'],
    accentColor: '#D97706',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PromotionModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);

  const selectedOption = OPTIONS.find(o => o.id === selected);

  const buildWhatsAppMessage = () => {
    if (!selectedOption) {
      return isAr
        ? 'مرحباً، أريد الاستفسار عن خيارات الترويج في سوق قلقيلية.'
        : 'Hello, I want to inquire about promotion options in Souq Qalqilya.';
    }
    const pkg = selectedOption.packages.find(p => p.price === selectedPkg) ?? selectedOption.packages[0];
    const title = isAr ? selectedOption.titleAr : selectedOption.titleEn;
    const pkgLabel = isAr ? pkg.labelAr : pkg.labelEn;
    return isAr
      ? `مرحباً، أريد الاشتراك في خدمة "${title}" - ${pkgLabel} بسعر ${pkg.price} في سوق قلقيلية.`
      : `Hello, I want to subscribe to "${title}" - ${pkgLabel} at ${pkg.price} in Souq Qalqilya.`;
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(buildWhatsAppMessage());
    Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`).catch(() => {});
  };

  const handleEmail = () => {
    const pkg = selectedOption?.packages.find(p => p.price === selectedPkg) ?? selectedOption?.packages[0];
    const subject = isAr ? 'استفسار عن الترويج - سوق قلقيلية' : 'Promotion Inquiry - Souq Qalqilya';
    const body = buildWhatsAppMessage();
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`).catch(() => {});
  };

  const resetAndClose = () => {
    setSelected(null);
    setSelectedPkg(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <Pressable style={styles.overlay} onPress={resetAndClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={e => e.stopPropagation()}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: '#FFF7ED' }]}>
              <MaterialIcons name="workspace-premium" size={24} color="#D97706" />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                {isAr ? 'خيارات الترويج' : 'Promote Your Listing'}
              </Text>
              <Text style={[styles.headerSub, { color: colors.textMuted }]}>
                {isAr ? 'اختر خطة الترويج المناسبة' : 'Choose the right plan for more visibility'}
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={resetAndClose} hitSlop={10}>
              <MaterialIcons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>

            {/* Promotion Options */}
            {OPTIONS.map(option => {
              const isSelected = selected === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[
                    styles.optionCard,
                    {
                      backgroundColor: isSelected ? option.accentColor + '12' : colors.background,
                      borderColor: isSelected ? option.accentColor : colors.border,
                      ...Shadow.xs,
                    },
                  ]}
                  onPress={() => {
                    setSelected(isSelected ? null : option.id);
                    setSelectedPkg(null);
                  }}
                >
                  {/* Option header row */}
                  <View style={styles.optionHeader}>
                    <View style={[styles.optionIconWrap, { backgroundColor: option.accentColor + '18' }]}>
                      <MaterialIcons name={option.icon} size={22} color={option.accentColor} />
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                        {isAr ? option.titleAr : option.titleEn}
                      </Text>
                      <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                        {isAr ? option.descAr : option.descEn}
                      </Text>
                    </View>
                    <View style={[
                      styles.selectCircle,
                      {
                        backgroundColor: isSelected ? option.accentColor : 'transparent',
                        borderColor: isSelected ? option.accentColor : colors.border,
                      },
                    ]}>
                      {isSelected ? <MaterialIcons name="check" size={14} color="#fff" /> : null}
                    </View>
                  </View>

                  {/* Package pills */}
                  <View style={styles.packages}>
                    {option.packages.map(pkg => {
                      const isPkgSelected = selectedPkg === pkg.price && isSelected;
                      return (
                        <Pressable
                          key={pkg.price}
                          style={[
                            styles.pkgPill,
                            {
                              backgroundColor: isPkgSelected ? option.accentColor : colors.surface,
                              borderColor: isPkgSelected ? option.accentColor : colors.border,
                              ...Shadow.xs,
                            },
                          ]}
                          onPress={() => {
                            setSelected(option.id);
                            setSelectedPkg(pkg.price);
                          }}
                        >
                          {pkg.popular ? (
                            <View style={[styles.popularBadge, { backgroundColor: option.accentColor }]}>
                              <Text style={styles.popularBadgeText}>
                                {isAr ? 'الأشهر' : 'Popular'}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={[styles.pkgLabel, { color: isPkgSelected ? '#fff' : colors.textSecondary }]}>
                            {isAr ? pkg.labelAr : pkg.labelEn}
                          </Text>
                          <Text style={[styles.pkgPrice, { color: isPkgSelected ? '#fff' : option.accentColor }]}>
                            {pkg.price}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Pressable>
              );
            })}

            {/* Benefits strip */}
            <View style={[styles.benefitsRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {[
                { icon: 'trending-up', textEn: 'More views', textAr: 'مشاهدات أكثر' },
                { icon: 'speed', textEn: 'Sell faster', textAr: 'بيع أسرع' },
                { icon: 'shield', textEn: 'Safe & secure', textAr: 'آمن وموثوق' },
              ].map((b, i) => (
                <View key={i} style={styles.benefit}>
                  <MaterialIcons name={b.icon as any} size={18} color={colors.primary} />
                  <Text style={[styles.benefitText, { color: colors.textSecondary }]}>
                    {isAr ? b.textAr : b.textEn}
                  </Text>
                </View>
              ))}
            </View>

            {/* CTA Buttons */}
            <View style={styles.ctaSection}>
              <Text style={[styles.ctaLabel, { color: colors.textMuted }]}>
                {isAr ? 'تواصل معنا لإتمام الاشتراك' : 'Contact us to complete your subscription'}
              </Text>

              <Pressable
                style={[styles.ctaWhatsApp, Shadow.colored]}
                onPress={handleWhatsApp}
              >
                <MaterialIcons name="whatsapp" size={20} color="#fff" />
                <Text style={styles.ctaWhatsAppText}>
                  {isAr ? 'تواصل عبر واتساب' : 'Contact via WhatsApp'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.ctaEmail, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={handleEmail}
              >
                <MaterialIcons name="email" size={20} color={colors.primary} />
                <Text style={[styles.ctaEmailText, { color: colors.primary }]}>
                  {isAr ? 'تواصل عبر البريد الإلكتروني' : 'Contact via Email'}
                </Text>
              </Pressable>

              <Text style={[styles.contactHint, { color: colors.textMuted }]}>
                {SUPPORT_EMAIL}
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerIcon: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', letterSpacing: -0.3 },
  headerSub: { fontSize: FontSize.xs, marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },

  optionCard: {
    borderRadius: Radius.xl, borderWidth: 1.5,
    padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.md,
  },
  optionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  optionIconWrap: {
    width: 46, height: 46, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionInfo: { flex: 1 },
  optionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 3 },
  optionDesc: { fontSize: FontSize.sm, lineHeight: 20 },
  selectCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 2,
  },

  packages: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  pkgPill: {
    flex: 1, minWidth: 120,
    borderRadius: Radius.lg, borderWidth: 1.5,
    paddingVertical: 12, paddingHorizontal: Spacing.md,
    alignItems: 'center', gap: 4, position: 'relative',
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute', top: 0, right: 0,
    paddingHorizontal: 8, paddingVertical: 3,
    borderBottomLeftRadius: Radius.md,
  },
  popularBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  pkgLabel: { fontSize: FontSize.sm, fontWeight: '600' },
  pkgPrice: { fontSize: FontSize.xl, fontWeight: '800', letterSpacing: -0.5 },

  benefitsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderRadius: Radius.lg, borderWidth: 1,
    paddingVertical: Spacing.md, marginBottom: Spacing.lg,
  },
  benefit: { alignItems: 'center', gap: 5 },
  benefitText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  ctaSection: { gap: Spacing.sm, paddingBottom: 32 },
  ctaLabel: { fontSize: FontSize.xs, textAlign: 'center', fontWeight: '600' },
  ctaWhatsApp: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: '#25D366',
    borderRadius: Radius.xl, paddingVertical: 16,
    shadowColor: '#25D366', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  ctaWhatsAppText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  ctaEmail: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1.5, paddingVertical: 15,
  },
  ctaEmailText: { fontSize: FontSize.md, fontWeight: '700' },
  contactHint: { fontSize: FontSize.xs, textAlign: 'center' },
});
