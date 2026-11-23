import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { deleteWorkout, loadContent, mergedExercises, newContentId, saveWorkout } from '@/src/admin/content';
import { ADMIN, goBack, useGuardedBack } from '@/src/admin/ui';
import {
  CAPABILITY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  LEVELS,
  PART_LABELS,
  RISK_LABELS,
  WORKOUT_STRUCTURE,
  blankWorkout,
  exercisesForSlot,
  keepSuitable,
  validateWorkout,
  workoutFit,
  type WorkoutTemplate,
} from '@/src/domain/content';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { estimateMinutes, formatAge } from '@/src/domain/profile';
import type { Difficulty, Exercise, FunctionalLevel } from '@/src/domain/types';
import { Button, Card, Chip, ChipRow, Field, H2, Notice, P, Screen, colors, fs } from '@/src/ui/kit';

/** Сборка занятия по шаблону: группа детей → упражнения в каждую часть → сложность каждого. */
export default function AdminWorkoutEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [catalog, setCatalog] = useState<Exercise[] | null>(null);
  const [w, setW] = useState<WorkoutTemplate | null>(null);
  const [missing, setMissing] = useState<'missing' | 'failed' | null>(null);
  // Что нельзя ставить в новые занятия (архив) и чем помечать упражнения в списке выбора.
  const [marks, setMarks] = useState<{ archived: Set<string>; label: Record<string, string> }>({ archived: new Set(), label: {} });
  const initial = useRef('');
  const dirty = !!w && JSON.stringify(w) !== initial.current;
  useGuardedBack(dirty, ADMIN.workouts);
  const [errors, setErrors] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    loadContent()
      .then((c) => {
        const merged = mergedExercises(c);
        setCatalog(merged.map((m) => m.item));
        setMarks({
          archived: new Set(merged.filter((m) => m.archived).map((m) => m.item.id)),
          label: Object.fromEntries(merged.filter((m) => m.origin !== 'builtin').map((m) => [m.item.id, m.origin === 'custom' ? ' (моё)' : ' (изменено)'])),
        });
        const existing = id ? c.workouts.find((x) => x.id === id) : blankWorkout(newContentId('workout'), 1);
        if (existing) {
          initial.current = JSON.stringify(existing);
          setW(existing);
        } else setMissing('missing');
      })
      .catch(() => setMissing('failed'));
  }, [id]);

  if (missing) {
    return (
      <Screen>
        {missing === 'missing' ? <P>Такого занятия нет — возможно, оно удалено.</P> : <Notice>Не удалось прочитать сохранённые занятия. Попробуйте открыть экран ещё раз.</Notice>}
        <Button title="К списку занятий" variant="secondary" onPress={() => goBack(ADMIN.workouts)} />
      </Screen>
    );
  }
  if (!w || !catalog) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const selected = (exerciseId: string) => w.items.find((i) => i.exerciseId === exerciseId);
  const setLevel = (level: FunctionalLevel) => setW({ ...w, level, items: keepSuitable(w.items, level, catalog) });
  const toggle = (exerciseId: string) =>
    setW({
      ...w,
      items: selected(exerciseId) ? w.items.filter((i) => i.exerciseId !== exerciseId) : [...w.items, { exerciseId, difficulty: 1 }],
    });
  const setDifficulty = (exerciseId: string, difficulty: Difficulty) =>
    setW({ ...w, items: w.items.map((i) => (i.exerciseId === exerciseId ? { ...i, difficulty } : i)) });

  const fit = workoutFit(w.items, catalog);
  // Упражнения, которых уже нет в каталоге или которые не подходят группе: в частях занятия они не видны.
  const stray = w.items.filter((i) => !catalog.some((e) => e.id === i.exerciseId && e.levels.includes(w.level)));

  const save = async () => {
    // Порядок упражнений — как в занятии: разминка, основная часть, заминка.
    const ordered = WORKOUT_STRUCTURE.flatMap(({ part }) => w.items.filter((i) => catalog.find((e) => e.id === i.exerciseId)?.part === part));
    const rest = w.items.filter((i) => !ordered.includes(i));
    const workout: WorkoutTemplate = { ...w, title: w.title.trim(), note: w.note?.trim() || undefined, items: [...ordered, ...rest] };
    const found = validateWorkout(workout, catalog);
    setErrors(found);
    if (found.length > 0) return;
    try {
      setProblem('');
      await saveWorkout(workout);
      goBack(ADMIN.workouts);
    } catch {
      setProblem('Не удалось сохранить занятие на этом устройстве. Попробуйте ещё раз.');
    }
  };

  const remove = async () => {
    try {
      await deleteWorkout(w.id);
      goBack(ADMIN.workouts);
    } catch {
      setProblem('Не удалось удалить занятие. Попробуйте ещё раз.');
    }
  };

  return (
    <Screen>
      <Card>
        <H2>1. О занятии</H2>
        <Field label="Название" value={w.title} onChangeText={(title) => setW({ ...w, title })} />
        <P muted>Для какой группы детей</P>
        <ChipRow>
          {LEVELS.map((l) => (
            <Chip key={l} label={LEVEL_DESCRIPTIONS[l].title} selected={w.level === l} onPress={() => setLevel(l)} />
          ))}
        </ChipRow>
        <P muted>При смене группы неподходящие ей упражнения убираются из занятия.</P>
        <Field
          label="Пояснение для родителя (необязательно)"
          value={w.note ?? ''}
          onChangeText={(note) => setW({ ...w, note })}
          multiline
          numberOfLines={3}
          style={{ minHeight: 76, textAlignVertical: 'top' }}
        />
      </Card>

      {WORKOUT_STRUCTURE.map(({ part, count }, index) => {
        const options = exercisesForSlot(part, w.level, catalog).filter((e) => !marks.archived.has(e.id) || selected(e.id));
        const chosen = options.filter((e) => selected(e.id));
        const full = chosen.length >= count;
        return (
          <Card key={part}>
            <H2>
              {index + 2}. {PART_LABELS[part]}
            </H2>
            <P muted>
              Выбрано {chosen.length} из {count}
              {full ? '. Чтобы взять другое упражнение, сначала снимите выбранное.' : ''}
            </P>
            {options.length === 0 && <P muted>Для этой группы таких упражнений нет — создайте их на вкладке «Упражнения».</P>}
            <ChipRow>
              {options.map((e) => (
                <Chip
                  key={e.id}
                  label={`${e.title}${marks.archived.has(e.id) ? ' (в архиве)' : (marks.label[e.id] ?? '')}`}
                  selected={!!selected(e.id)}
                  onPress={() => (selected(e.id) || !full) && toggle(e.id)}
                />
              ))}
            </ChipRow>
            {chosen.map((e) => {
              const difficulty = selected(e.id)?.difficulty ?? 1;
              return (
                <View key={e.id} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: fs(16), fontWeight: '700', color: colors.text }}>{e.title}</Text>
                  <ChipRow>
                    {DIFFICULTIES.map((d) => (
                      <Chip key={d} label={DIFFICULTY_LABELS[d]} selected={difficulty === d} onPress={() => setDifficulty(e.id, d)} />
                    ))}
                  </ChipRow>
                  <P muted>{e.variants.find((v) => v.difficulty === difficulty)?.instructions ?? ''}</P>
                </View>
              );
            })}
          </Card>
        );
      })}

      {stray.length > 0 && (
        <Card>
          <H2>Нужно убрать</H2>
          <P muted>Эти упражнения удалены из каталога или больше не подходят группе.</P>
          {stray.map((i) => (
            <Button
              key={i.exerciseId}
              title={`Убрать: ${catalog.find((e) => e.id === i.exerciseId)?.title ?? 'удалённое упражнение'}`}
              variant="secondary"
              onPress={() => toggle(i.exerciseId)}
            />
          ))}
        </Card>
      )}

      <Card>
        <H2>Кому подходит это занятие</H2>
        {w.items.length === 0 ? (
          <P muted>Появится, когда вы выберете упражнения.</P>
        ) : (
          <>
            <P>
              Группа «{LEVEL_DESCRIPTIONS[w.level].title}» · {fit.minAge > 0 ? `от ${formatAge(fit.minAge)}` : 'любой возраст'} · около{' '}
              {estimateMinutes(w.items.length)} мин
            </P>
            <P>Ребёнок должен уметь: {fit.requires.length > 0 ? fit.requires.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(', ') : 'особых умений не нужно'}.</P>
            <P>В занятии есть: {fit.risks.length > 0 ? fit.risks.map((r) => RISK_LABELS[r].toLowerCase()).join(', ') : 'отмеченных рисков нет'}.</P>
            <P muted>
              Занятие, собранное вручную, не проверяется под конкретного ребёнка. Не давайте его детям, которые не
              умеют перечисленное или у которых есть противопоказания к перечисленным нагрузкам.
            </P>
          </>
        )}
      </Card>

      {errors.length > 0 && <Notice>{`Проверьте заполнение:\n${errors.map((x) => `• ${x}`).join('\n')}`}</Notice>}
      {!!problem && <Notice>{problem}</Notice>}
      <Button title="Сохранить занятие" onPress={save} />
      {!!id &&
        (confirmDelete ? (
          <>
            <Notice>Занятие будет удалено.</Notice>
            <Button title="Удалить занятие" onPress={remove} />
            <Button title="Отмена" variant="secondary" onPress={() => setConfirmDelete(false)} />
          </>
        ) : (
          <Button title="Удалить" variant="secondary" onPress={() => setConfirmDelete(true)} />
        ))}
    </Screen>
  );
}
