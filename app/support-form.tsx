import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAlert } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

const SUPPORT_EMAIL = 'support@plankton.fit';
const MAX_DESCRIPTION = 500;

export default function SupportFormScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const isRTL = language === 'ar';

  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<{ uri: string; base64: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const handlePickScreenshot = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert(
        isRTL ? 'الإذن مطلوب' : 'Permission Required',
        isRTL ? 'يرجى السماح بالوصول للصور' : 'Please allow access to your photo library'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setScreenshot({ uri: result.assets[0].uri, base64: result.assets[0].base64 ?? null });
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      showAlert(
        isRTL ? 'وصف مطلوب' : 'Description Required',
        isRTL ? 'يرجى وصف المشكلة قبل الإرسال' : 'Please describe your issue before submitting'
      );
      return;
    }
    if (description.trim().length < 10) {
      showAlert(
        isRTL ? 'وصف قصير جداً' : 'Too Short',
        isRTL ? 'يرجى وصف المشكلة بتفاصيل أكثر' : 'Please describe the issue in more detail'
      );
      return;
    }

    setLoading(true);
    try {
      // Build email content
      const subject = isRTL ? 'بلاغ خطأ - سوق قلقيلية' : 'Bug Report - Souq Qalqilya';
      const body = encodeURIComponent(
        `${isRTL ? 'وصف المشكلة' : 'Issue Description'}:\n${description.trim()}\n\n`
        + (screenshot ? (isRTL ? '(تم إرفاق لقطة الشاشة)' : '(Screenshot attached)') : (isRTL ? '(لا توجد لقطة شاشة)' : '(No screenshot)'))
        + `\n\n---\nSouq Qalqilya App v1.0.5\n${Platform.OS} ${Platform.Version}`
      );
      const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${body}`;

      const { Linking } = require('react-native');
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        setSuccessVisible(true);
        setDescription('');
        setScreenshot(null);
      } else {
        showAlert(
          isRTL ? 'تعذّر فتح التطبيق' : 'Cannot Open Mail',
          isRTL
            ? `يرجى إرسال البلاغ يدوياً إلى:\n${SUPPORT_EMAIL}`
            : `Please send your report manually to:\n${SUPPORT_EMAIL}`
        );
      }
    } catch (e: any) {
      showAlert(isRTL ? 'خطأ' : 'Error', e?.message ?? 'Failed to send report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable
            style={styles.backBtn}
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
            <Text style={[styles.headerTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isRTL ? 'الإبلاغ عن مشكلة' : 'Report a Problem'}
            </Text>
            <Text style={[styles.headerSub, { textAlign: isRTL ? 'right' : 'left' }]}>
              {isRTL ? 'ساعدنا في تحسين التطبيق' : 'Help us improve the app'}
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info banner */}
          <View style={[styles.infoBanner, { backgroundColor: colors.primaryGhost, borderColor: colors.primary + '30' }]}>
            <MaterialIcons name="info-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary, textAlign: isRTL ? 'right' : 'left', flex: 1 }]}>
              {isRTL
                ? `سيتم إرسال بلاغك إلى: ${SUPPORT_EMAIL}`
                : `Your report will be sent to: ${SUPPORT_EMAIL}`}
            </Text>
          </View>

          {/* Description */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: colors.borderLight }]}>
              <View style={[styles.cardIconWrap, { backgroundColor: colors.primaryGhost }]}>
                <MaterialIcons name="description" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {isRTL ? 'وصف المشكلة' : 'Issue Description'} <Text style={{ color: colors.error }}>*</Text>
              </Text>
            </View>

            <View style={{ padding: Spacing.md }}>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    borderColor: description.length > 0 ? colors.primary : colors.border,
                    backgroundColor: colors.background,
                    color: colors.textPrimary,
                    textAlign: isRTL ? 'right' : 'left',
                  },
                ]}
                placeholder={isRTL
                  ? 'صف المشكلة التي واجهتها بتفاصيل... ماذا كنت تفعل؟ ما الذي حدث؟ ما الذي توقعت أن يحدث؟'
                  : 'Describe the issue in detail... What were you doing? What happened? What did you expect?'}
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={t => { if (t.length <= MAX_DESCRIPTION) setDescription(t); }}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              <Text style={[styles.charCount, {
                color: description.length > MAX_DESCRIPTION * 0.9 ? colors.error : colors.textMuted,
                textAlign: isRTL ? 'left' : 'right',
              }]}>
                {description.length}/{MAX_DESCRIPTION}
              </Text>
            </View>
          </View>

          {/* Screenshot */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: colors.borderLight }]}>
              <View style={[styles.cardIconWrap, { backgroundColor: colors.accentGhost }]}>
                <MaterialIcons name="screenshot-monitor" size={18} color={colors.accentDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {isRTL ? 'لقطة الشاشة' : 'Screenshot'}
                </Text>
                <Text style={[styles.cardSubTitle, { color: colors.textMuted }]}>
                  {isRTL ? 'اختياري — تساعدنا في فهم المشكلة بسرعة' : 'Optional — helps us understand your issue faster'}
                </Text>
              </View>
            </View>

            <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
              {screenshot ? (
                <View style={styles.screenshotPreview}>
                  <Image
                    source={{ uri: screenshot.uri }}
                    style={styles.screenshotImg}
                    contentFit="cover"
                    transition={200}
                  />
                  <Pressable
                    style={[styles.removeScreenshot, { backgroundColor: colors.error }]}
                    onPress={() => setScreenshot(null)}
                  >
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.uploadZone, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={handlePickScreenshot}
                >
                  <View style={[styles.uploadIconCircle, { backgroundColor: colors.primaryGhost }]}>
                    <MaterialIcons name="add-photo-alternate" size={28} color={colors.primary} />
                  </View>
                  <Text style={[styles.uploadLabel, { color: colors.textPrimary }]}>
                    {isRTL ? 'إضافة لقطة شاشة' : 'Add Screenshot'}
                  </Text>
                  <Text style={[styles.uploadSub, { color: colors.textMuted }]}>
                    {isRTL ? 'اضغط لاختيار صورة من معرض الصور' : 'Tap to choose from your photo library'}
                  </Text>
                </Pressable>
              )}

              {screenshot ? (
                <Pressable
                  style={[styles.changePhotoBtn, { borderColor: colors.border }]}
                  onPress={handlePickScreenshot}
                >
                  <MaterialIcons name="swap-horiz" size={16} color={colors.textSecondary} />
                  <Text style={[styles.changePhotoText, { color: colors.textSecondary }]}>
                    {isRTL ? 'تغيير الصورة' : 'Change Photo'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Submit button */}
          <Pressable
            style={[
              styles.submitBtn,
              {
                backgroundColor: description.trim().length >= 10 ? colors.primary : colors.border,
                opacity: loading ? 0.75 : 1,
              },
            ]}
            onPress={handleSubmit}
            disabled={loading || description.trim().length < 10}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitText}>
                  {isRTL ? 'إرسال البلاغ' : 'Send Report'}
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            {isRTL
              ? 'بإرسال هذا البلاغ، أنت توافق على مشاركة وصف المشكلة مع فريق الدعم.'
              : 'By submitting this report, you agree to share the issue description with our support team.'}
          </Text>
        </ScrollView>

        {/* Success Modal */}
        <Modal visible={successVisible} transparent animationType="fade">
          <View style={styles.successOverlay}>
            <View style={[styles.successBox, { backgroundColor: colors.surface, ...Shadow.lg }]}>
              <View style={[styles.successIcon, { backgroundColor: colors.successLight }]}>
                <MaterialIcons name="check-circle" size={40} color={colors.success} />
              </View>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>
                {isRTL ? 'تم إرسال البلاغ!' : 'Report Sent!'}
              </Text>
              <Text style={[styles.successSub, { color: colors.textMuted }]}>
                {isRTL
                  ? 'شكراً لمساعدتنا في تحسين التطبيق. سيتواصل معك فريق الدعم قريباً.'
                  : 'Thank you for helping us improve the app. Our support team will get back to you soon.'}
              </Text>
              <Pressable
                style={[styles.successBtn, { backgroundColor: colors.primary }]}
                onPress={() => { setSuccessVisible(false); router.back(); }}
              >
                <Text style={styles.successBtnText}>{isRTL ? 'حسناً' : 'Got it'}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  content: { padding: Spacing.lg, gap: Spacing.md },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
  },
  infoText: { fontSize: FontSize.xs, lineHeight: 18, fontWeight: '500' },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadow.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  cardIconWrap: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700' },
  cardSubTitle: { fontSize: FontSize.xs, marginTop: 1 },
  textArea: {
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    lineHeight: 22,
    minHeight: 140,
  },
  charCount: { fontSize: FontSize.xs, marginTop: 6 },
  uploadZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 10,
  },
  uploadIconCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadLabel: { fontSize: FontSize.md, fontWeight: '700' },
  uploadSub: { fontSize: FontSize.xs, textAlign: 'center' },
  screenshotPreview: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  screenshotImg: { width: '100%', height: 200, borderRadius: Radius.xl },
  removeScreenshot: {
    position: 'absolute',
    top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  changePhotoText: { fontSize: FontSize.sm, fontWeight: '600' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: Radius.xl,
    ...Shadow.colored,
  },
  submitText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  disclaimer: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.sm,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  successBox: {
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
    maxWidth: 340,
  },
  successIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: FontSize.xl, fontWeight: '800' },
  successSub: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 22 },
  successBtn: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: 14,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  successBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
