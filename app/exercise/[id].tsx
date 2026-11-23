import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EXERCISES } from '@/src/domain/exercises';
import { WORKOUT_BLOCK_TEXT, dayKey, workoutBlock } from '@/src/domain/profile';
import { eligibleExercises } from '@/src/domain/selection';
import { FEEDBACK_LABELS, exerciseRatings } from '@/src/domain/ratings';
import type { Difficulty, Feedback } from '@/src/domain/types';
import { useApp } from '@/src/state/AppState';
import { ExerciseVideo } from '@/src/ui/ExerciseVideo';
import { Button, Card, DifficultyDots, H1, H2, Notice, P, RateRow, Screen, colors, feedbackColor, fs } from '@/src/ui/kit';
import { formatClock, useStopwatch } from '@/src/ui/useStopwatch';

const PART_LABEL = { warmup: 'Разминка', main: 'Основная часть', cooldown: 'Заминка' } as const;
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

/** Этапы тренировки одного упражнения: не начата → идёт → ждём оценку → сохранена. */
type Phase = 'idle' | 'running' | 'rate' | 'saved';

/**
 * Карточка упражнения: посмотреть, выбрать вариант сложности, сделать упражнение отдельно от занятия
 * (с секундомером) и оценить его.
 * ⚠️ ЧЕРНОВИК: можно ли родителю самому повышать сложность — на проверку специалисту.
 */
export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    ready, child, assessment, progress, practices, sessions, rulesAcceptedAt, painAcknowledgedSessionId, breakHandledSessionId,
    setExerciseDifficulty, addPractice, ratePractice,
  } = useApp();
  // Сложность, с которой родитель открыл карточку: по ней понятно, повысил ли он её сейчас.
  const [opened] = useState<Record<string, Difficulty>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  // Тренировка сохраняется сразу при завершении; оценка добавляется к ней следующим нажатием.
  const [finished, setFinished] = useState<{ id: string; difficulty: Difficulty; seconds: number } | null>(null);
  const [lastRating, setLastRating] = useState<Feedback | null>(null);
  const watch = useStopwatch();
  const ex = EXERCISES.find((e) => e.id === id);

  if (!ready) return null;

  if (!ex) {
    return (
      <Screen>
        <P>Упражнение не найдено.</P>
        <Button title="На главную" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  const current = progress[ex.id]?.difficulty ?? 1;
  if (opened[ex.id] === undefined) opened[ex.id] = current;
  const raised = phase === 'idle' && current > opened[ex.id];
  const today = dayKey(new Date());
  const doneToday = (practices ?? []).filter((p) => p.exerciseId === ex.id && dayKey(new Date(p.date)) === today).length;
  const history = exerciseRatings(ex.id, sessions, practices ?? []).slice(-8);
  const locked = phase === 'running' || phase === 'rate';
  // Карточку можно открыть напрямую, поэтому перед тренировкой повторяем проверки главного экрана
  // и убеждаемся, что упражнение подходит ребёнку по анкете (уровень, возраст, противопоказания).
  const suitable = !!child && !!assessment && eligibleExercises(child, assessment).some((e) => e.id === ex.id);
  const block =
    child && assessment
      ? workoutBlock({ child, assessment, sessions, painAcknowledgedSessionId, breakHandledSessionId, rulesAcceptedAt })
      : null;
  const canTrain = suitable && !block;

  return (
    <Screen>
      <P muted>{PART_LABEL[ex.part]}</P>
      <H1>{ex.title}</H1>
      <ExerciseVideo url={ex.videoUrl} />
      <Card>
        <P>{ex.description}</P>
        {ex.equipment && <P muted>Понадобится: {ex.equipment.join(', ')}</P>}
      </Card>
      <Card>
        <H2>Выберите сложность</H2>
        <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
          {ex.variants.map((v) => {
            const active = v.difficulty === current;
            return (
              <Pressable
                key={v.difficulty}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: locked }}
                accessibilityLabel={`Сложность ${v.difficulty} из 3. ${v.instructions}`}
                disabled={locked}
                onPress={() => {
                  setPhase('idle');
                  setExerciseDifficulty(ex.id, v.difficulty);
                }}
                style={{
                  borderRadius: 14,
                  padding: 12,
                  gap: 2,
                  opacity: locked && !active ? 0.5 : 1,
                  backgroundColor: active ? colors.primarySoft : colors.card,
                  borderWidth: 2,
                  borderColor: active ? colors.primary : colors.border,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <DifficultyDots level={v.difficulty} decorative />
                  {active && <Text style={{ fontSize: fs(13), fontWeight: '700', color: colors.primaryInk }}>Выбрано</Text>}
                </View>
                <Text style={{ fontSize: fs(16), lineHeight: fs(23), color: colors.text }}>{v.instructions}</Text>
              </Pressable>
            );
          })}
        </View>
        <P muted>
          {locked
            ? 'Сложность можно поменять после завершения тренировки.'
            : 'Выбранный вариант будет и в следующих занятиях. Дальше сложность подстраивается по вашим оценкам.'}
        </P>
      </Card>
      {raised && (
        <Notice>
          Вы выбрали вариант сложнее. Переходите к нему, только если предыдущий получается уверенно и без боли.
        </Notice>
      )}

      {phase === 'idle' && !suitable && (
        <Notice>
          По результатам анкеты это упражнение сейчас не подходит ребёнку, поэтому тренировка недоступна. Если считаете,
          что это ошибка, — пройдите вопросы заново в профиле или напишите куратору.
        </Notice>
      )}
      {phase === 'idle' && suitable && block && (
        <>
          <Notice>{WORKOUT_BLOCK_TEXT[block]}</Notice>
          {block === 'rules' ? (
            <Button title="Открыть правила" onPress={() => router.push('/rules')} />
          ) : (
            <Button title="На главную" onPress={() => router.replace('/(tabs)')} />
          )}
        </>
      )}

      {phase === 'idle' && canTrain && (
        <>
          <Button
            title="Начать тренировку"
            onPress={() => {
              watch.start();
              setPhase('running');
            }}
          />
          {doneToday > 0 && <P muted>Сегодня это упражнение уже сделано: {doneToday}.</P>}
        </>
      )}

      {phase === 'running' && (
        <Card>
          <H2>Идёт тренировка</H2>
          <Text accessibilityLabel={`Прошло ${formatClock(watch.seconds)}`} style={{ fontSize: fs(44), fontWeight: '800', color: colors.text, textAlign: 'center' }}>
            {formatClock(watch.seconds)}
          </Text>
          <P muted>Если ребёнку больно или он устал — остановитесь.</P>
          <Button
            title="Завершить тренировку"
            onPress={() => {
              const seconds = watch.stop();
              setFinished({ id: addPractice(ex.id, current, seconds), difficulty: current, seconds });
              setPhase('rate');
            }}
          />
        </Card>
      )}

      {phase === 'rate' && finished && (
        <Card>
          <H2>Тренировка сохранена ✓</H2>
          <P>Длилась {formatClock(finished.seconds)}. Как получилось?</P>
          <RateRow
            value={null}
            onRate={(f) => {
              ratePractice(finished.id, f);
              setLastRating(f);
              setPhase('saved');
            }}
          />
        </Card>
      )}

      {phase === 'saved' && finished && lastRating && (
        <>
          <Card>
            <H2>Оценка сохранена ✓</H2>
            <P>
              {FEEDBACK_LABELS[lastRating]} · {formatClock(finished.seconds)}. Тренировка видна на главном экране в блоке
              «Сегодня сделано», в истории и в графиках «Динамики».
            </P>
            {current < finished.difficulty && <P muted>Раз было тяжело, вариант стал на шаг проще.</P>}
            {current > finished.difficulty && <P muted>Получается легко — вариант стал на шаг сложнее.</P>}
          </Card>
          <Button title="На главную" onPress={() => router.replace('/(tabs)')} />
          <Button
            title="Начать ещё раз"
            variant="secondary"
            onPress={() => {
              watch.start();
              setPhase('running');
            }}
          />
        </>
      )}

      {history.length > 0 && (
        <Card>
          <H2>Как давалось раньше</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {history.map((r, i) => (
              <View key={`${r.date}-${i}`} accessible accessibilityLabel={`${shortDate(r.date)}: ${FEEDBACK_LABELS[r.feedback]}`} style={{ alignItems: 'center', gap: 3 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: feedbackColor(r.feedback) }} />
                <Text style={{ fontSize: fs(11), color: colors.muted }}>{shortDate(r.date)}</Text>
              </View>
            ))}
          </View>
          <P muted>Бирюзовый — легко, жёлтый — нормально, цвет темы — тяжело.</P>
        </Card>
      )}

      <P muted>Занятие целиком запускается кнопкой «Начать занятие» на главном экране.</P>
    </Screen>
  );
}
