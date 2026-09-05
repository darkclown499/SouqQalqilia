import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useCallback } from 'react';

const ICONS: Record<string, (focused: boolean) => keyof typeof MaterialIcons.glyphMap> = {
  index: (focused) => (focused ? 'home-filled' : 'home'),
  categories: () => 'grid-view',
  stores: (focused) => (focused ? 'storefront' : 'store'),
  profile: (focused) => (focused ? 'person' : 'person-outline'),
};

// ── شريط تبويب مخصص بالكامل — نتحكم بالتمركز يدوياً بدل الاعتماد على تخطيط
// react-navigation الداخلي (اللي كان يزيح الأيقونات لفوق ولا يتمركز صح) ─────────
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const postScale = useSharedValue(1);
  const postRotation = useSharedValue(0);
  const postAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: postScale.value }, { rotate: `${postRotation.value}deg` }],
  }));

  const animatePost = useCallback(() => {
    postScale.value = withSequence(
      withSpring(0.85, { damping: 6, stiffness: 400 }),
      withSpring(1.12, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
    postRotation.value = withSequence(
      withTiming(45, { duration: 100 }),
      withSpring(0, { damping: 8, stiffness: 200 })
    );
  }, [postScale, postRotation]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.tabBarOuter,
        {
          marginBottom: insets.bottom + 10,
          borderColor: colors.tabBarBorder,
        },
      ]}
    >
      <View style={styles.tabBarBlur}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 80 : 60}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? 'rgba(26,29,39,0.82)' : 'rgba(255,255,255,0.82)' },
          ]}
        />
      </View>

      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;

          if (route.name === 'post') {
            return (
              <View key={route.key} style={styles.postSlot} pointerEvents="box-none">
                <Animated.View
                  style={[
                    styles.postIconOuter,
                    { shadowColor: '#000' },
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
                      navigation.navigate(route.name);
                    }}
                  >
                    <MaterialIcons name="add" size={28} color="#fff" />
                  </Pressable>
                </Animated.View>
              </View>
            );
          }

          const iconGetter = ICONS[route.name];
          if (!iconGetter) return null;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.itemSlot}
              android_ripple={{ color: 'transparent' }}
            >
              <View style={[styles.iconPill, focused && { backgroundColor: colors.successLight }]}>
                <MaterialIcons
                  name={iconGetter(focused)}
                  size={24}
                  color={focused ? colors.tabBarActive : colors.tabBarInactive}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { t, isRTL } = useLanguage();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'shift' }}
    >
      <Tabs.Screen name="index" options={{ title: t.home }} />
      <Tabs.Screen name="categories" options={{ title: t.browse }} />
      <Tabs.Screen name="post" options={{ title: '' }} />
      <Tabs.Screen name="stores" options={{ title: isRTL ? 'المتاجر' : 'Stores' }} />
      <Tabs.Screen name="profile" options={{ title: t.profile }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    height: 68,
    borderRadius: 30,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  tabBarBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  itemSlot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPill: {
    width: 48,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postSlot: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postIconOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -34,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  postIconInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
