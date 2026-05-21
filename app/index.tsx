import { AuthRouter } from '@/template';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_SEEN_KEY } from './onboarding';

export default function RootScreen() {
  const [route, setRoute] = useState<{ showOnboarding: boolean; showBeta: boolean } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((val) => {
      setRoute({ showOnboarding: !val, showBeta: false });
    });
  }, []);

  if (!route) return null;

  if (route.showOnboarding) return <Redirect href="/onboarding" />;

  // Skip auth wall — allow guest access directly to home
  return <Redirect href="/(tabs)" />;
}
