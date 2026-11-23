import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useApp } from '@/src/state/AppState';

/** Маршрутизация по состоянию: регистрация → профиль ребёнка → анкета → главная. */
export default function Index() {
  const { ready, user, child, assessment } = useApp();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) return <Redirect href="/welcome" />;
  if (!child) return <Redirect href="/child/new" />;
  if (!assessment) return <Redirect href="/child/questionnaire" />;
  return <Redirect href="/(tabs)" />;
}
