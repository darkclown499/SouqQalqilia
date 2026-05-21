import { AuthRouter } from '@/template';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_SEEN_KEY } from './onboarding';
import { BETA_SEEN_KEY } from './beta-warning';

export default function RootScreen() {
  const [route, setRoute] = useState<{ showOnboarding: boolean; showBeta: boolean } | null>(null);

  useEffect(() => {
    // Always read fresh from AsyncStorage — module-level cache caused stale
    // redirects back to /onboarding after the user completed the flow.
    AsyncStorage.multiGet([ONBOARDING_SEEN_KEY, BETA_SEEN_KEY]).then((pairs) => {
      const onboarding = pairs[0][1];
      const beta = pairs[1][1];
      setRoute({
        showOnboarding: !onboarding,
        showBeta: !!onboarding && !beta,
      });
    });
  }, []);

  if (!route) return null;

  if (route.showOnboarding) return <Redirect href="/onboarding" />;
  if (route.showBeta) return <Redirect href="/beta-warning" />;

  // Skip auth wall — allow guest access directly to home
  return <Redirect href="/(tabs)" />;
}
