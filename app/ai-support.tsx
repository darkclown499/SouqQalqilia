import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/template';
import { Spacing, FontSize, Radius, Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';

// ── Config ────────────────────────────────────────────────────────────────────
const SUPPORT_WHATSAPP = '972559886886';
const SUPPORT_EMAIL = 'support@plankton.fit';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'handoff';
  content: string;
  timestamp: Date;
}

// Quick-start prompts
const QUICK_PROMPTS_AR = [
  { icon: 'add-circle-outline' as const,  text: 'كيف أنشر إعلاناً؟' },
  { icon: 'edit' as const,                text: 'كيف أعدّل إعلاني؟' },
  { icon: 'chat-bubble-outline' as const, text: 'كيف أتواصل مع البائع؟' },
  { icon: 'delete-outline' as const,      text: 'كيف أحذف إعلاني؟' },
  { icon: 'bolt' as const,                text: 'كيف أعزّز إعلاني؟' },
  { icon: 'location-on' as const,         text: 'ما المناطق المتاحة؟' },
];

const QUICK_PROMPTS_EN = [
  { icon: 'add-circle-outline' as const,  text: 'How do I post an ad?' },
  { icon: 'edit' as const,                text: 'How do I edit my listing?' },
  { icon: 'chat-bubble-outline' as const, text: 'How do I contact a seller?' },
  { icon: 'delete-outline' as const,      text: 'How do I delete my ad?' },
  { icon: 'bolt' as const,                text: 'How do I boost my listing?' },
  { icon: 'location-on' as const,         text: 'What areas are available?' },
];

// ── Animated typing dots ──────────────────────────────────────────────────────
function TypingIndicator({ color }: { color: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const dots = [dot1, dot2, dot3];
  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 180),
        Animated.timing(dot, { toValue: -5, duration: 260, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.delay(420),
      ]))
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', padding: 6 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            { width: 8, height: 8, borderRadius: 4, backgroundColor: color },
            { transform: [{ translateY: dot }] },
          ]}
        />
      ))}
    </View>
  );
}

// ── Human Support Card ────────────────────────────────────────────────────────
const HumanSupportCard = React.memo(function HumanSupportCard({ isAr, colors }: { isAr: boolean; colors: any }) {
  const openWhatsApp = () => {
    const msg = encodeURIComponent(
      isAr ? 'مرحباً، أحتاج للمساعدة في سوق قلقيلية' : 'Hello, I need help with Souq Qalqilya'
    );
    Linking.openURL(`whatsapp://send?phone=${SUPPORT_WHATSAPP}&text=${msg}`)
      .catch(() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${msg}`).catch(() => {}));
  };
  const openEmail = () => {
    const subject = encodeURIComponent(
      isAr ? 'طلب دعم — سوق قلقيلية' : 'Support Request — Souq Qalqilya'
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  };

  return (
    <View style={[hsStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[hsStyles.header, { backgroundColor: colors.primaryGhost }]}>
        <View style={[hsStyles.iconWrap, { backgroundColor: colors.primary }]}>
          <MaterialIcons name="support-agent" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[hsStyles.title, { color: colors.textPrimary }]}>
            {isAr ? 'تواصل مع فريق الدعم' : 'Contact Support Team'}
          </Text>
          <Text style={[hsStyles.sub, { color: colors.textMuted }]}>
            {isAr ? 'نرد خلال ساعات العمل' : 'We reply during working hours'}
          </Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [hsStyles.btn, { backgroundColor: pressed ? '#20BA58' : '#25D366' }]}
        onPress={openWhatsApp}
      >
        <View style={hsStyles.btnIcon}>
          <MaterialIcons name="chat" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={hsStyles.btnTitle}>{isAr ? 'واتساب' : 'WhatsApp'}</Text>
          <Text style={hsStyles.btnSub}>+{SUPPORT_WHATSAPP}</Text>
        </View>
        <MaterialIcons name={isAr ? 'chevron-left' : 'chevron-right'} size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>

      <Pressable
        style={({ pressed }) => [hsStyles.btn, { backgroundColor: pressed ? '#3b71ca' : '#4285F4' }]}
        onPress={openEmail}
      >
        <View style={hsStyles.btnIcon}>
          <MaterialIcons name="email" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={hsStyles.btnTitle}>{isAr ? 'بريد إلكتروني' : 'Email'}</Text>
          <Text style={hsStyles.btnSub}>{SUPPORT_EMAIL}</Text>
        </View>
        <MaterialIcons name={isAr ? 'chevron-left' : 'chevron-right'} size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </View>
  );
});

const hsStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 2,
    ...Shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FontSize.md, fontWeight: '700' },
  sub: { fontSize: FontSize.xs, marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    margin: Spacing.sm,
    borderRadius: Radius.lg,
  },
  btnIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnTitle: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  btnSub: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.xs, marginTop: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AiSupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const turnCountRef = useRef(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep messagesRef in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const quickPrompts = isAr ? QUICK_PROMPTS_AR : QUICK_PROMPTS_EN;

  // ── Scroll to bottom ──────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    // استخدام requestAnimationFrame بدلاً من timeout لتجنب التصادم
    scrollTimeoutRef.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
      scrollTimeoutRef.current = null;
    }, 80);
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [messages.length, scrollToBottom]);

  // ── Reset chat ──
  const resetChat = useCallback(() => {
    setMessages([]);
    turnCountRef.current = 0;
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || loading) return;

    const uid = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const userMsg: ChatMessage = {
      id: uid,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    turnCountRef.current += 1;

    const currentMessages = messagesRef.current;
    const history = [...currentMessages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('ai-support', {
        body: { messages: history, turnCount: turnCountRef.current },
      });

      if (error) {
        let errMsg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { errMsg = await error.context?.text() || errMsg; } catch {}
        }
        throw new Error(errMsg);
      }

      const { reply, shouldHandoff } = data as { reply: string; shouldHandoff: boolean };

      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (shouldHandoff) {
        setMessages(prev => [...prev, {
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: 'handoff',
          content: '',
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      console.error('AI Support error:', err);
      setMessages(prev => [...prev, {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        content: isAr
          ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى أو التواصل مع الدعم البشري.'
          : 'Sorry, an error occurred. Please try again or contact human support.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, isAr]);

  const handleSend = useCallback(() => sendMessage(input), [sendMessage, input]);
  const handleQuickPrompt = useCallback((p: string) => sendMessage(p), [sendMessage]);
  const handleRequestHuman = useCallback(() => {
    sendMessage(isAr ? 'أريد التواصل مع دعم بشري' : 'I want to speak with human support');
  }, [sendMessage, isAr]);

  // ── Memoized footer ──────────────────────────────────────────────────────────
  const footerComponent = useMemo(() => {
    if (!loading) return null;
    return (
      <View style={[
        styles.msgRow,
        isAr ? styles.msgRowUser : styles.msgRowOther,
        { flexDirection: isAr ? 'row-reverse' : 'row' },
      ]}>
        {!isAr ? (
          <View style={[styles.botAvatar, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="robot" size={16} color="#fff" />
          </View>
        ) : null}
        <View style={[styles.bubble, { backgroundColor: colors.surface, ...Shadow.xs }]}>
          <TypingIndicator color={colors.primary} />
        </View>
        {isAr ? (
          <View style={[styles.botAvatar, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="robot" size={16} color="#fff" />
          </View>
        ) : null}
      </View>
    );
  }, [loading, isAr, colors]);

  // ── Render message ──────────────────────────────────────────────────────────
  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    if (item.role === 'handoff') {
      return (
        <View style={styles.handoffCard}>
          <HumanSupportCard isAr={isAr} colors={colors} />
        </View>
      );
    }

    const isUser = item.role === 'user';
    const isUserAlignedRight = isAr ? !isUser : isUser;

    return (
      <View style={[
        styles.msgRow,
        {
          flexDirection: isAr ? 'row-reverse' : 'row',
          justifyContent: isUserAlignedRight ? 'flex-end' : 'flex-start',
        },
      ]}>
        {!isUser ? (
          <View style={[styles.botAvatar, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="smart-toy" size={16} color="#fff" />
          </View>
        ) : null}
        <View style={[
          styles.bubble,
          isUser
            ? {
                backgroundColor: colors.primary,
                borderBottomRightRadius: isAr ? Radius.lg : 4,
                borderBottomLeftRadius: isAr ? 4 : Radius.lg,
              }
            : {
                backgroundColor: colors.surface,
                borderBottomLeftRadius: isAr ? Radius.lg : 4,
                borderBottomRightRadius: isAr ? 4 : Radius.lg,
                ...Shadow.xs,
              },
        ]}>
          <Text style={[
            styles.bubbleText,
            {
              color: isUser ? '#fff' : colors.textPrimary,
              textAlign: isAr ? 'right' : 'left',
            },
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.timeText,
            {
              color: isUser ? 'rgba(255,255,255,0.65)' : colors.textMuted,
              textAlign: isAr ? 'left' : 'right',
            },
          ]}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isUser ? (
          <View style={[styles.botAvatar, { backgroundColor: colors.primaryGhost }]}>
            <MaterialIcons name="person" size={16} color={colors.primary} />
          </View>
        ) : null}
      </View>
    );
  }, [isAr, colors]);

  const canSend = input.trim().length > 0 && !loading;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

        {/* ── HEADER ── */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <Pressable style={styles.headerIconBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name={isAr ? 'arrow-forward' : 'arrow-back'} size={22} color="#fff" />
          </Pressable>

          <View style={[styles.headerAvatarWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <MaterialIcons name="robot" size={22} color="#fff" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { textAlign: isAr ? 'right' : 'left' }]}>
              {isAr ? 'سوق قلقيلية للدعم الفني' : 'Souq Qalqilya Support'}
            </Text>
            <View style={[styles.onlineRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineTxt}>{isAr ? 'متاح الآن' : 'Available now'}</Text>
            </View>
          </View>

          <Pressable style={styles.headerIconBtn} onPress={handleRequestHuman} hitSlop={8}>
            <MaterialIcons name="support-agent" size={22} color="#fff" />
          </Pressable>

          {/* ✅ زر مسح المحادثة */}
          {messages.length > 0 && (
            <Pressable style={styles.headerIconBtn} onPress={resetChat} hitSlop={8}>
              <MaterialIcons name="delete-outline" size={22} color="#fff" />
            </Pressable>
          )}
        </View>

        {/* ── MESSAGES / EMPTY STATE ── */}
        {messages.length === 0 ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.emptyScroll, { paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Welcome card */}
            <View style={[
              styles.welcomeCard,
              { backgroundColor: isDark ? colors.surface : colors.surfaceTint, borderColor: colors.border },
            ]}>
              <View style={[styles.welcomeIconWrap, { backgroundColor: colors.primary }]}>
                <MaterialIcons name="robot" size={40} color="#fff" />
              </View>
              <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>
                {isAr ? 'أهلاً بك في مساعد سوق قلقيلية' : 'Welcome to Souq Qalqilya Assistant'}
              </Text>
              <Text style={[styles.welcomeSub, { color: colors.textSecondary }]}>
                {isAr
                  ? 'اسألني أي شيء عن التطبيق — نشر إعلانات، التواصل مع البائعين، التعديل، والمزيد.'
                  : 'Ask me anything about the app — posting ads, contacting sellers, editing listings, and more.'}
              </Text>
            </View>

            {/* Quick prompts */}
            <View style={styles.quickSection}>
              <View style={[styles.quickLabelRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <MaterialIcons name="auto-awesome" size={15} color={colors.primary} />
                <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>
                  {isAr ? 'أسئلة شائعة' : 'Common questions'}
                </Text>
              </View>

              {quickPrompts.map((p, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    styles.quickRow,
                    {
                      backgroundColor: pressed
                        ? colors.primaryGhost
                        : (isDark ? colors.surface : colors.cardSurface ?? colors.surface),
                      borderColor: pressed ? colors.primary : colors.border,
                      flexDirection: isAr ? 'row-reverse' : 'row',
                    },
                  ]}
                  onPress={() => handleQuickPrompt(p.text)}
                >
                  <View style={[styles.quickRowIcon, { backgroundColor: colors.primaryGhost }]}>
                    <MaterialIcons name={p.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.quickRowText, { color: colors.textPrimary, textAlign: isAr ? 'right' : 'left' }]}>
                    {p.text}
                  </Text>
                  <MaterialIcons
                    name={isAr ? 'chevron-left' : 'chevron-right'}
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMessage}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={footerComponent}
          />
        )}

        {/* ── INPUT BAR ── */}
        <View style={[
          styles.inputBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.sm,
            flexDirection: isAr ? 'row-reverse' : 'row',
          },
        ]}>
          <TextInput
            style={[styles.textInput, {
              borderColor: colors.border,
              backgroundColor: colors.background,
              color: colors.textPrimary,
              textAlign: isAr ? 'right' : 'left',
            }]}
            placeholder={isAr ? 'اكتب سؤالك هنا...' : 'Type your question here...'}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={400}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: canSend
                  ? (pressed ? colors.primaryDark : colors.primary)
                  : colors.border,
              },
            ]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityLabel={isAr ? 'إرسال' : 'Send'}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <MaterialIcons
                  name="send"
                  size={20}
                  color={canSend ? '#fff' : colors.textMuted}
                  style={isAr ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              )
            }
          </Pressable>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  onlineRow: { alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  onlineTxt: { color: 'rgba(255,255,255,0.75)', fontSize: FontSize.xs },

  // ── Empty / Welcome ──────────────────────────────────────────────────────
  emptyScroll: {
    padding: Spacing.md,
    gap: Spacing.lg,
    flexGrow: 1,
  },
  welcomeCard: {
    borderRadius: Radius.xxl,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadow.sm,
  },
  welcomeIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
    ...Shadow.colored,
  },
  welcomeTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  welcomeSub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Quick prompts (list style) ───────────────────────────────────────────
  quickSection: { gap: Spacing.sm },
  quickLabelRow: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  quickLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  quickRow: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    ...Shadow.xs,
  },
  quickRowIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  quickRowText: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '600',
    lineHeight: 22,
    maxWidth: '80%',
    flexWrap: 'wrap',
  },

  // ── Messages ─────────────────────────────────────────────────────────────
  msgList: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.md, flexGrow: 1 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  bubbleText: { fontSize: FontSize.md, lineHeight: 22 },
  timeText: { fontSize: 10, fontWeight: '500' },
  handoffCard: { marginVertical: Spacing.sm, paddingHorizontal: 2 },

  // ── Input bar ─────────────────────────────────────────────────────────────
  inputBar: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderWidth: 1.5,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    fontSize: FontSize.md,
    lineHeight: 20,
    backgroundColor: 'transparent',
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
});