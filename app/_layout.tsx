import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { AppStateProvider, useApp } from '@/src/state/AppState';
import { applyTheme, colors, defaultThemeFor, headerTheme, fs, applyFontScale, useLayout } from '@/src/ui/kit';

export { ErrorBoundary } from 'expo-router';

/** На вебе приложение занимает всё окно; ширину содержимого ограничивают сами экраны (см. Screen в kit). */
function WebFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

/**
 * Кнопка «Назад» в левом верхнем углу. Она есть всегда: если экран открыт напрямую (по ссылке или после
 * обновления страницы) и возвращаться некуда, ведёт на главный экран.
 */
function BackButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Назад"
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: 44,
        paddingRight: 12,
        marginLeft: Platform.OS === 'web' ? 12 : 0,
        opacity: pressed ? 0.6 : 1,
      })}>
      <Text style={{ fontSize: fs(26), lineHeight: fs(28), color: colors.primaryInk }}>‹</Text>
      <Text style={{ fontSize: fs(16), fontWeight: '600', color: colors.primaryInk }}>Назад</Text>
    </Pressable>
  );
}

/** Шапка внутренних экранов: своя кнопка «Назад» вместо стандартной стрелки. */
const withBack = { headerBackVisible: false, headerLeft: () => <BackButton /> };

/** Навигация в текущей теме оформления. Тема зависит от пола ребёнка или выбрана в профиле. */
function ThemedApp() {
  const { child, theme } = useApp();
  // Палитру переключаем до отрисовки экранов, чтобы они сразу прочитали новые цвета.
  applyTheme(theme ?? defaultThemeFor(child?.sex));
  // На планшете (между телефоном и компьютером) весь текст на 15 % крупнее.
  const { tablet, desktop } = useLayout();
  // В кабинете администратора текст крупнее на любом экране: там много чтения и правки.
  const inAdmin = useSegments()[0] === 'admin';
  applyFontScale(inAdmin ? 1.25 : tablet && !desktop ? 1.15 : 1);
  return (
    <WebFrame>
      <Stack screenOptions={{ headerBackTitle: 'Назад', ...headerTheme(), contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: 'Регистрация' }} />
        <Stack.Screen name="child/new" options={{ title: 'Профиль ребёнка' }} />
        <Stack.Screen name="child/questionnaire" options={{ title: 'Что умеет ребёнок' }} />
        <Stack.Screen name="child/result" options={{ title: 'Результат', headerBackVisible: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="rules" options={{ title: 'Правила', ...withBack }} />
        <Stack.Screen name="goal" options={{ title: 'Цель', ...withBack }} />
        <Stack.Screen name="chat" options={{ title: 'Чат с куратором', ...withBack }} />
        <Stack.Screen name="article/[id]" options={{ title: 'Статья', ...withBack }} />
        <Stack.Screen name="exercise/[id]" options={{ title: 'Упражнение', ...withBack }} />
        <Stack.Screen name="workout" options={{ title: 'Занятие', ...withBack }} />
        <Stack.Screen name="test/[id]" options={{ title: 'Тест', ...withBack }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    </WebFrame>
  );
}

export default function RootLayout() {
  return (
    <AppStateProvider>
      <StatusBar style="dark" />
      <ThemedApp />
    </AppStateProvider>
  );
}
