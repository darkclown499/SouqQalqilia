import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/hooks/useLanguage';
import { useConversations } from '@/hooks/useChat';
import { useAuth } from '@/template';

/** Receives unreadCount as prop — no hook calls inside */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={badge.wrap}>
      <Text style={badge.text}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 99,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  text: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
});

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { user } = useAuth();
  // Must be at TabLayout level so _globalRefreshUnread is always registered
  // while the tab bar is visible — never inside a child component
  const { unreadCount } = useConversations();

  const tabBarStyle = {
    height: Platform.select({ ios: insets.bottom + 62, android: insets.bottom + 62, default: 70 }),
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
  };

  const postScale = useSharedValue(1);
  const postRotation = useSharedValue(0);
  const postAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: postScale.value }, { rotate: `${postRotation.value}deg` }],
  }));

  const animatePost = () => {
    postScale.value = withSequence(
      withSpring(0.85, { damping: 6, stiffness: 400 }),
      withSpring(1.12, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );
    postRotation.value = withSequence(
      withTiming(45, { duration: 100 }),
      withSpring(0, { damping: 8, stiffness: 200 }),
    );
  };

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
          tabBarButton: (props) => {
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
                    <View
                      style={[styles.postIconInner, { backgroundColor: focused ? colors.accent : colors.primary }]}
                    >
                      <MaterialIcons name="add" size={28} color="#fff" />
                    </View>
                  </Animated.View>
                </View>
                <View
                  style={StyleSheet.absoluteFill}
                  onTouchEnd={() => {
                    animatePost();
                    if (props.onPress) (props.onPress as any)();
                  }}
                />
              </View>
            );
          },
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t.messages,
          tabBarIcon: ({ color, focused }) => (
            <View>
              <MaterialIcons name={focused ? 'chat-bubble' : 'chat-bubble-outline'} size={24} color={color} />
              {user ? <UnreadBadge count={unreadCount} /> : null}
            </View>
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
    flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  postTabBtn: {
    alignItems: 'center', justifyContent: 'center',
    width: 64, height: 64,
  },
  postIconOuter: {
    width: 56, height: 56, borderRadius: 28,
    marginTop: -20,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 10,
  },
  postIconInner: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
});
