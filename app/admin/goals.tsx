import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { loadContent, mergedGoals, newContentId, removeItem, saveItem } from '@/src/admin/content';
import { ListRow } from '@/src/admin/ui';
import { LEVELS } from '@/src/domain/content';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { GOAL_PRESETS, type GoalPreset } from '@/src/domain/goals';
import { validateGoal, type Merged } from '@/src/domain/library';
import { Button, Card, Chip, ChipRow, Field, H2, Notice, P, Screen } from '@/src/ui/kit';

interface Editing {
  goal: GoalPreset;
  /** Запись, которую правим; пусто — новая цель. */
  source?: Merged<GoalPreset>;
}

/** Раздел «Цели»: готовые цели семьи по группам детей. Правка — прямо в списке. */
export default function AdminGoals() {
  const [goals, setGoals] = useState<Merged<GoalPreset>[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [showArchive, setShowArchive] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    loadContent()
      .then((c) => setGoals(mergedGoals(c)))
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(load);

  const close = () => {
    setEditing(null);
    setErrors([]);
    setProblem('');
  };

  const run = async (action: () => Promise<void>) => {
    try {
      setProblem('');
      await action();
      close();
      load();
    } catch {
      setProblem('Не удалось сохранить на этом устройстве. Попробуйте ещё раз.');
    }
  };

  const save = (archived: boolean) => {
    if (!editing) return;
    const goal = { ...editing.goal, title: editing.goal.title.trim() };
    const found = validateGoal(goal);
    setErrors(found);
    if (found.length > 0) return;
    const builtIn = GOAL_PRESETS.find((g) => g.id === goal.id);
    void run(() => saveItem('goals', { item: goal, archived: archived || undefined, base: builtIn ? JSON.stringify(builtIn) : undefined }));
  };

  const editor = editing && (
    <Card>
      <H2>{editing.source ? 'Изменить цель' : 'Новая цель'}</H2>
      <Field label="Цель — как её увидит родитель" value={editing.goal.title} onChangeText={(title) => setEditing({ ...editing, goal: { ...editing.goal, title } })} />
      <P muted>Каким группам детей подходит</P>
      <ChipRow>
        {LEVELS.map((l) => {
          const on = editing.goal.levels.includes(l);
          const levels = on ? editing.goal.levels.filter((x) => x !== l) : [...editing.goal.levels, l].sort();
          return <Chip key={l} label={LEVEL_DESCRIPTIONS[l].title} selected={on} onPress={() => setEditing({ ...editing, goal: { ...editing.goal, levels } })} />;
        })}
      </ChipRow>
      {errors.length > 0 && <Notice>{errors.join(' ')}</Notice>}
      {!!problem && <Notice>{problem}</Notice>}
      <Button title="Сохранить" onPress={() => save(!!editing.source?.archived)} />
      {editing.source && (
        <Button title={editing.source.archived ? 'Вернуть из архива' : 'Убрать в архив'} variant="secondary" onPress={() => save(!editing.source?.archived)} />
      )}
      {editing.source?.origin === 'edited' && (
        <Button title="Сбросить мои правки" variant="secondary" onPress={() => run(() => removeItem('goals', editing.goal.id))} />
      )}
      {editing.source?.origin === 'custom' && (
        <Button title="Удалить" variant="secondary" onPress={() => run(() => removeItem('goals', editing.goal.id))} />
      )}
      <Button title="Отмена" variant="secondary" onPress={close} />
    </Card>
  );

  const archived = (goals ?? []).filter((g) => g.archived);

  return (
    <Screen>
      <Notice>
        Цели хранятся только на этом устройстве. Родители выбирают из целей приложения: чтобы показать им ваши
        изменения, нужен сервер и проверка специалистом.
      </Notice>
      {failed && (
        <>
          <Notice>Не удалось прочитать сохранённые цели.</Notice>
          <Button title="Повторить" variant="secondary" onPress={load} />
        </>
      )}
      {!goals && !failed && <ActivityIndicator />}
      {goals && (
        <>
          {editing && !editing.source ? (
            editor
          ) : (
            <Button title="Добавить цель" onPress={() => setEditing({ goal: { id: newContentId('custom'), title: '', levels: [] } })} />
          )}
          {LEVELS.map((level) => {
            const inLevel = goals.filter((g) => !g.archived && g.item.levels.includes(level));
            return (
              <View key={level} style={{ gap: 8 }}>
                <H2>{LEVEL_DESCRIPTIONS[level].title}</H2>
                {inLevel.length === 0 && <P muted>Для этой группы целей нет.</P>}
                {inLevel.map((g) =>
                  editing?.source?.item.id === g.item.id ? (
                    <View key={g.item.id}>{editor}</View>
                  ) : (
                    <ListRow
                      key={g.item.id}
                      title={g.item.title}
                      subtitle={g.origin === 'builtin' ? undefined : g.origin === 'edited' ? 'изменено вами' : 'добавлено вами'}
                      note={g.baseChanged ? 'Цель в приложении изменилась после вашей правки — проверьте' : undefined}
                      onPress={() => {
                        setErrors([]);
                        setEditing({ goal: g.item, source: g });
                      }}
                    />
                  ),
                )}
              </View>
            );
          })}
          {archived.length > 0 && (
            <View style={{ gap: 8 }}>
              <Button title={showArchive ? 'Скрыть архив' : `Показать архив (${archived.length})`} variant="secondary" onPress={() => setShowArchive(!showArchive)} />
              {showArchive &&
                archived.map((g) =>
                  editing?.source?.item.id === g.item.id ? (
                    <View key={g.item.id}>{editor}</View>
                  ) : (
                    <ListRow key={g.item.id} title={g.item.title} subtitle="в архиве" dimmed onPress={() => setEditing({ goal: g.item, source: g })} />
                  ),
                )}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
