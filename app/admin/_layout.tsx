import { Tabs, router } from 'expo-router';
import { Text } from 'react-native';

import { AdminGate } from '@/src/admin/gate';
import { ADMIN_ACCESS } from '@/src/config';
import { Button, H1, P, Screen, colors, fs, headerTheme, useLayout } from '@/src/ui/kit';

const icon = (emoji: string) => () => <Text style={{ fontSize: fs(18), lineHeight: fs(22) }}>{emoji}</Text>;

/**
 * Кабинет администратора: разделы в меню (на компьютере — слева, на телефоне — внизу).
 * У разделов со списком и редактором своя шапка с кнопкой «Назад» (см. _layout в папке раздела).
 * Вход защищён мягким паролем (см. AdminGate / ADMIN_ACCESS).
 *
 * На публичной веб-сборке кабинет выключен (ADMIN_ACCESS.enabled): разделы не монтируются,
 * данные семей не загружаются — посетитель сайта видит только заглушку.
 */
export default function AdminLayout() {
  const { desktop } = useLayout();
  const single = { headerShown: true };

  if (!ADMIN_ACCESS.enabled) {
    return (
      <Screen>
        <H1>Раздел недоступен</H1>
        <P muted>
          Кабинет куратора не входит в эту версию приложения. Он доступен в рабочей сборке — обратитесь к команде
          Move4Fit.
        </P>
        <Button title="На главную" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  return (
    <AdminGate>
    <Tabs
      screenOptions={{
        ...headerTheme(),
        headerShown: false,
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
              tabBarIconStyle: { height: 22, marginTop: 3 },
              tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const },
              tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
            }),
      }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="families" options={{ title: 'Семьи', tabBarIcon: icon('👪') }} />
      <Tabs.Screen name="chat" options={{ title: 'Чат', tabBarIcon: icon('💬'), ...single }} />
      <Tabs.Screen name="exercises" options={{ title: 'Упражнения', tabBarIcon: icon('💪') }} />
      <Tabs.Screen name="workouts" options={{ title: 'Занятия', tabBarIcon: icon('🗓️') }} />
      <Tabs.Screen name="articles" options={{ title: 'Статьи', tabBarIcon: icon('📖') }} />
      <Tabs.Screen name="goals" options={{ title: 'Цели', tabBarIcon: icon('🎯'), ...single }} />
      <Tabs.Screen name="settings" options={{ title: 'Настройки', tabBarIcon: icon('⚙️'), ...single }} />
    </Tabs>
    </AdminGate>
  );
}
