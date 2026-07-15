import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, StyleSheet, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming,
} from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
// ✅ تم إزالة useConversations لأن تبويب الرسائل قد حُذف
import { useAuth, getSupabaseClient } from '@/template';
import { useMemo, useCallback, useEffect, useRef } from 'react';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const { user } = useAuth();

  // ─── TabBar Style ───────────────────────────────────────────────────────────
  const tabBarStyle = useMemo(() => ({
    minHeight: Platform.select({ ios: insets.bottom + 62, android: insets.bottom + 62, default: 70 }),
    paddingTop: 8,
    paddingBottom: Platform.select({ ios: insets.bottom + 8, android: insets.bottom + 8, default: 8 }),
    paddingHorizontal: 4,
    backgroundColor: colors.tabBar,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
    flexDirection: isRTL ? 'row-reverse' : 'row',
  }), [insets, colors, isRTL]);

  // ─── Post Button Animation ──────────────────────────────────────────────────
  const postScale = useSharedValue(1);
  const postRotation = useSharedValue(0);
  const postAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: postScale.value }, { rotate: `${postRotation.value}deg` }],
  }));

  const animatePost = useCallback(() => {
    postScale.value = withSequence(
      withSpring(0.85, { damping: 6, stiffness: 400 }),
      withSpring(1.12, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );
    postRotation.value = withSequence(
      withTiming(45, { duration: 100 }),
      withSpring(0, { damping: 8, stiffness: 200 }),
    );
  }, [postScale, postRotation]);

  const PostButton = useCallback((props: any) => {
    const focused = props.accessibilityState?.selected ?? false;
    return (
      <View style={styles.postTabWrap} pointerEvents="box-none">
        <View style={styles.postTabBtn}>
          <Animated.View
            style={[
              styles.postIconOuter,
              { shadowColor: focused ? colors.accent : colors.primary },
              postAnimStyle,
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.postIconInner,
                {
                  backgroundColor: focused ? colors.accent : colors.primary,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={() => {
                animatePost();
                if (props.onPress) (props.onPress as any)();
              }}
            >
              <MaterialIcons name="add" size={28} color="#fff" />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }, [colors, postAnimStyle, animatePost]);

  // ─── Push Notifications Registration ─────────────────────────────────────
  const registeredRef = useRef(false);

  const registerForPushNotifications = useCallback(async () => {
    if (!user || Platform.OS === 'web') return;
    if (registeredRef.current) return;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('[Push] Permission not granted.');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'c102ae5b-583e-4af3-9643-7f32b9e5f1b1',
      });
      const token = tokenData.data;
      if (!token) {
        console.warn('[Push] No token received.');
        return;
      }

      console.log('[Push] ✅ Expo Push Token:', token);

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('user_profiles')
        .update({ expo_push_token: token })
        .eq('id', user.id);

      if (error) {
        console.error('[Push] ❌ Failed to save token:', error.message);
      } else {
        console.log('[Push] ✅ Token saved to database.');
        registeredRef.current = true;
      }
    } catch (e: any) {
      console.error('[Push] ❌ registerForPushNotifications error:', e?.message ?? e);
    }
  }, [user]);

  useEffect(() => {
    registerForPushNotifications();
  }, [registerForPushNotifications]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: -2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.home,
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name={focused ? 'home' : 'home'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: t.browse,
          tabBarIcon: ({ color }) => <MaterialIcons name="grid-view" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: '',
          tabBarButton: PostButton,
        }}
      />
      {/* ✅ تم حذف تبويب "messages" نهائياً */}
      <Tabs.Screen
        name="stores"
        options={{
          title: isAr ? 'المتاجر' : 'Stores',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name={focused ? 'storefront' : 'storefront'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.profile,
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  postTabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  postTabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
  },
  postIconOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -20,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 10,
  },
  postIconInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});