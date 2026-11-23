import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useApp } from '@/src/state/AppState';
import { colors, headerTheme, useLayout, fs } from '@/src/ui/kit';

const icon = (emoji: string) => () => <Text style={{ fontSize: fs(18), lineHeight: fs(22) }}>{emoji}</Text>;

export default function TabsLayout() {
  // Подписка на состояние: при смене темы оформления панель вкладок перерисовывается.
  useApp();
  const { desktop } = useLayout();
  return (
    <Tabs
      screenOptions={{
        ...headerTheme(),
        // На компьютере заголовок экрана уже есть в содержимом, а меню стоит слева.
        headerShown: !desktop,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarPosition: desktop ? 'left' : 'bottom',
        tabBarActiveTintColor: colors.primaryInk,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: desktop ? colors.primarySoft : undefined,
        ...(desktop
          ? {
              tabBarLabelStyle: { fontSize: fs(16), fontWeight: '600' as const },
              tabBarStyle: { backgroundColor: colors.card, borderRightColor: colors.border, minWidth: 230, paddingTop: 24 },
            }
          : {
              // Высота нижней панели фиксирована библиотекой (49), поэтому иконка и подпись подобраны так, чтобы поместиться.
              tabBarIconStyle: { height: 22, marginTop: 3 },
              tabBarLabelStyle: { fontSize: fs(11), lineHeight: fs(14), fontWeight: '600' as const },
              tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
            }),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Сегодня', tabBarIcon: icon('☀️') }} />
      <Tabs.Screen name="progress" options={{ title: 'Динамика', tabBarIcon: icon('🌱') }} />
      <Tabs.Screen name="read" options={{ title: 'Читать', tabBarIcon: icon('📖') }} />
      <Tabs.Screen name="support" options={{ title: 'Куратор', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: icon('🧡') }} />
    </Tabs>
  );
}
