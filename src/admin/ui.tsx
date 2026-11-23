import { router, useNavigation, type Href } from 'expo-router';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { colors, fs, headerTheme } from '@/src/ui/kit';

/** Адреса разделов кабинета — в одном месте. */
export const ADMIN = {
  families: '/admin/families',
  exercises: '/admin/exercises',
  exerciseEdit: '/admin/exercises/edit',
  workouts: '/admin/workouts',
  workoutEdit: '/admin/workouts/edit',
  articles: '/admin/articles',
  articleEdit: '/admin/articles/edit',
  goals: '/admin/goals',
  settings: '/admin/settings',
} as const satisfies Record<string, Href>;

/** Вернуться на предыдущий экран, а если истории нет (страницу открыли по ссылке или обновили) — в раздел. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

function confirmLeave(): Promise<boolean> {
  const message = 'Изменения не сохранены. Выйти без сохранения?';
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Выйти без сохранения?', 'Изменения не сохранены.', [
      { text: 'Остаться', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Выйти', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Назад"
      hitSlop={8}
      onPress={onPress}
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

/** Настройки шапки вложенного экрана: кнопка «Назад» слева вверху, которая работает и без истории. */
export function backHeader(fallback: Href) {
  return { headerBackVisible: false, headerLeft: () => <BackButton onPress={() => goBack(fallback)} /> };
}

/** Общие настройки навигации разделов кабинета. */
export function sectionScreenOptions() {
  return { ...headerTheme(), contentStyle: { backgroundColor: colors.bg } };
}

/**
 * Для экранов-редакторов: «Назад» спрашивает подтверждение, если есть несохранённые изменения.
 * Не ловит кнопку «назад» самого браузера и переход по меню — только кнопку в шапке.
 */
export function useGuardedBack(dirty: boolean, fallback: Href) {
  const navigation = useNavigation();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useLayoutEffect(() => {
    const leave = async () => {
      if (!dirtyRef.current || (await confirmLeave())) goBack(fallback);
    };
    navigation.setOptions({ headerBackVisible: false, headerLeft: () => <BackButton onPress={leave} /> });
  }, [navigation, fallback]);
}

/** Строка списка в кабинете: название, подпись, необязательная пометка и стрелка. */
export function ListRow({
  title,
  subtitle,
  note,
  left,
  dimmed,
  onPress,
}: {
  title: string;
  subtitle?: string;
  /** Пометка, требующая внимания («нужно исправить», «встроенное изменилось»). */
  note?: string;
  left?: ReactNode;
  dimmed?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, note].filter(Boolean).join('. ')}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.card,
        borderRadius: 18,
        padding: 12,
        opacity: dimmed ? 0.6 : 1,
      }}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fs(16), fontWeight: '600', color: colors.text }}>{title}</Text>
        {!!subtitle && <Text style={{ fontSize: fs(13), color: colors.muted, marginTop: 1 }}>{subtitle}</Text>}
        {!!note && <Text style={{ fontSize: fs(13), color: colors.warn, marginTop: 1 }}>{note}</Text>}
      </View>
      <Text style={{ fontSize: fs(20), color: colors.muted }}>›</Text>
    </Pressable>
  );
}

/** Подпись о происхождении и проверке записи: «встроенное», «изменено вами», «проверено: …». */
export function statusText(m: { origin: 'builtin' | 'edited' | 'custom'; archived?: boolean; review?: { by: string } }): string {
  const origin = m.origin === 'builtin' ? 'из приложения' : m.origin === 'edited' ? 'из приложения, изменено вами' : 'создано вами';
  const review = m.review ? `отмечено как проверенное: ${m.review.by}` : m.origin === 'builtin' ? '' : 'ждёт проверки специалистом';
  return [m.archived ? 'в архиве' : '', origin, review].filter(Boolean).join(' · ');
}
