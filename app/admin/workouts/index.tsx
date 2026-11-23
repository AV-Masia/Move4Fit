import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { fullCatalog, loadContent, type AdminContent } from '@/src/admin/content';
import { ADMIN, ListRow } from '@/src/admin/ui';
import { PART_LABELS, WORKOUT_STRUCTURE, validateWorkout } from '@/src/domain/content';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { Button, Card, H2, Notice, P, Screen } from '@/src/ui/kit';

/** Раздел «Занятия»: занятия, собранные администратором по шаблону. */
export default function AdminWorkouts() {
  const [content, setContent] = useState<AdminContent | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    loadContent()
      .then(setContent)
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(load);

  const catalog = content ? fullCatalog(content) : [];

  return (
    <Screen>
      <Card>
        <H2>Шаблон занятия</H2>
        <P muted>
          {WORKOUT_STRUCTURE.map(({ part, count }) => `${PART_LABELS[part].toLowerCase()} — ${count} упр.`).join(', ')}. Вы
          выбираете группу детей, упражнения для каждой части и их сложность.
        </P>
        <Button title="Создать занятие по шаблону" onPress={() => router.push(ADMIN.workoutEdit)} />
      </Card>
      <Notice>
        Собранные занятия хранятся только на этом устройстве. Родители по-прежнему получают занятие, которое приложение
        подбирает само: чтобы показывать им ваши занятия, нужен сервер.
      </Notice>
      {failed && (
        <>
          <Notice>Не удалось прочитать сохранённые занятия.</Notice>
          <Button title="Повторить" variant="secondary" onPress={load} />
        </>
      )}
      {!content && !failed && <ActivityIndicator />}
      {content?.workouts.length === 0 && <P muted>Вы пока не создали ни одного занятия.</P>}
      {content?.workouts.map((w) => (
        <ListRow
          key={w.id}
          title={w.title}
          subtitle={`${LEVEL_DESCRIPTIONS[w.level].title} · упражнений: ${w.items.length}`}
          note={validateWorkout(w, catalog).length > 0 ? 'Нужно исправить: откройте занятие' : undefined}
          onPress={() => router.push({ pathname: ADMIN.workoutEdit, params: { id: w.id } })}
        />
      ))}
    </Screen>
  );
}
