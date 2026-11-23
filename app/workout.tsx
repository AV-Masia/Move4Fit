import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';

import { newlyEarned } from '@/src/domain/achievements';
import { EXERCISES } from '@/src/domain/exercises';
import { PAIN_AREAS, PAIN_SIGNS, workoutBlock, type WorkoutBlock } from '@/src/domain/profile';
import type { ProgressionResult } from '@/src/domain/progression';
import { FEEDBACK_LABELS, overallFeedback } from '@/src/domain/ratings';
import { buildTodayWorkout, dayStatus } from '@/src/domain/selection';
import type { Fatigue, Feedback, WhatNext } from '@/src/domain/types';
import { useApp } from '@/src/state/AppState';
import { ExerciseVideo } from '@/src/ui/ExerciseVideo';
import { formatClock, useStopwatch } from '@/src/ui/useStopwatch';
import { Badge, Button, Card, Chip, ChipRow, Choice, DifficultyDots, FaceChoiceRow, H1, H2, Notice, P, RateRow, Screen, Sun, colors, feedbackColor, tints, fs } from '@/src/ui/kit';

const FEEDBACK: Feedback[] = ['easy', 'ok', 'hard'];
const FATIGUE_OPTIONS = [
  { value: 'fresh', icon: '🦸', label: 'Полон сил' },
  { value: 'ok', icon: '🙂', label: 'Нормально' },
  { value: 'tired', icon: '🦥', label: 'Устал' },
] as const satisfies readonly { value: Fatigue; icon: string; label: string }[];
const WHAT_NEXT_OPTIONS = [
  { value: 'more', icon: '🔁', label: 'Хочу ещё' },
  { value: 'done', icon: '👍', label: 'На сегодня хватит' },
  { value: 'tooMuch', icon: '😵', label: 'Было много' },
] as const satisfies readonly { value: WhatNext; icon: string; label: string }[];
const SHORT: Record<Feedback, string> = { easy: 'Легко', ok: 'Норм', hard: 'Тяжело' };

type Readiness = 'ask' | 'tired' | 'unwell' | 'ready';

/**
 * Экран можно открыть напрямую (адрес в браузере, обновление страницы), поэтому сначала ждём загрузки
 * сохранённых данных, а потом повторяем те же проверки, что и главный экран.
 */
export default function Workout() {
  const { ready, child, assessment } = useApp();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!child || !assessment) return <Redirect href="/" />;
  return <WorkoutSession />;
}

function WorkoutSession() {
  const {
    user, child, assessment, progress, sessions, trackingResults, goal, pastGoals, readArticles, completeSession,
    rulesAcceptedAt, painAcknowledgedSessionId, breakHandledSessionId,
  } = useApp();
  // Можно ли начинать — решаем один раз при открытии: после сохранения занятия «сегодня уже занимались» станет правдой.
  const [gate] = useState<WorkoutBlock | 'done_today' | null>(() => {
    if (!child || !assessment) return null;
    // Правила проверяются ниже по текущему состоянию, поэтому здесь считаем их принятыми.
    const block = workoutBlock({ child, assessment, sessions, painAcknowledgedSessionId, breakHandledSessionId, rulesAcceptedAt: 'checked-below' });
    return block ?? (dayStatus(sessions).kind === 'done_today' ? 'done_today' : null);
  });
  // План фиксируем при открытии экрана, чтобы он не поменялся после сохранения.
  const [plan] = useState(() => (child && assessment ? buildTodayWorkout(child, assessment, progress, sessions) : null));
  // Защита от двойного нажатия «Завершить занятие»: иначе в истории появятся два одинаковых занятия.
  const finished = useRef(false);
  const [readiness, setReadiness] = useState<Readiness>('ask');
  const [step, setStep] = useState(0);
  // Оценка каждого сделанного упражнения; упражнения без оценки считаются пропущенными.
  const [ratings, setRatings] = useState<Record<string, Feedback>>({});
  const [pain, setPain] = useState(false);
  const [painSigns, setPainSigns] = useState<string[]>([]);
  const [painArea, setPainArea] = useState<string | null>(null);
  const [result, setResult] = useState<ProgressionResult | null>(null);
  const watch = useStopwatch();
  const [durationSec, setDurationSec] = useState<number | null>(null);
  // Необязательный шаг для ребёнка после «Завершить занятие»: занятие сохраняется только после него.
  const [checkin, setCheckin] = useState(false);
  const [fatigue, setFatigue] = useState<Fatigue | null>(null);
  const [whatNext, setWhatNext] = useState<WhatNext | null>(null);
  const begin = () => {
    watch.start();
    setReadiness('ready');
  };

  if (!plan) return null;

  if (!rulesAcceptedAt) return <Redirect href={{ pathname: '/rules', params: { next: 'workout' } }} />;
  // Разрешение врача, пауза после боли, вопрос о перерыве и «сегодня уже занимались» объясняет главный экран.
  if (gate) return <Redirect href="/(tabs)" />;

  if (plan.items.length === 0) {
    return (
      <Screen>
        <Notice>
          Для ребёнка пока не нашлось подходящих упражнений в каталоге. Напишите куратору — он подберёт занятия вручную.
        </Notice>
        <Button title="Написать куратору" onPress={() => router.replace('/(tabs)/support')} />
        <Button title="На главную" variant="secondary" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }

  if (result) {
    // К этому моменту занятие уже в истории, поэтому видно, какие значки оно принесло.
    const fresh = result.contactCurator ? [] : newlyEarned({ sessions, trackingResults, goal, pastGoals, readArticles, role: user?.role });
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <Sun size={96} />
        </View>
        <H1>Занятие завершено!</H1>
        {durationSec !== null && <P>⏱ Занимались {formatClock(durationSec)}</P>}
        {result.contactCurator ? (
          <Notice>
            Вы отметили боль или дискомфорт. Мы снизили нагрузку и поставили занятия на паузу. Пожалуйста, напишите
            куратору, прежде чем продолжать.
          </Notice>
        ) : (
          <P>Спасибо! Оно появилось в истории и на дорожке недели. Следующее занятие подстроится под ваши оценки.</P>
        )}
        {fresh.length > 0 && (
          <Card>
            <H2>{fresh.length === 1 ? 'Новый значок!' : 'Новые значки!'}</H2>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 6 }}>
              {fresh.map((b) => (
                <Badge key={b.id} icon={b.icon} title={b.title} how={b.how} earned tint={tints.yellow} />
              ))}
            </View>
          </Card>
        )}
        {result.suggestReassessment && (
          <Notice>Похоже, ребёнку уже легко. Пройдите вопросы заново — возможно, пора перейти в следующую группу.</Notice>
        )}
        {result.contactCurator && <Button title="Написать куратору" onPress={() => router.replace('/(tabs)/support')} />}
        <Button title="На главную" variant={result.contactCurator ? 'secondary' : 'primary'} onPress={() => router.replace('/(tabs)')} />
        <Button title="Посмотреть мои успехи" variant="secondary" onPress={() => router.replace('/(tabs)/progress')} />
      </Screen>
    );
  }

  // Перед началом — один вопрос: уставшему или нездоровому ребёнку заниматься не стоит.
  if (readiness === 'ask') {
    return (
      <Screen>
        <H1>Как ребёнок сегодня?</H1>
        <View style={{ gap: 10 }}>
          <Choice label="😊  Бодрый, всё хорошо — начать" selected={false} onPress={begin} />
          <Choice label="😴  Устал или не в настроении" selected={false} onPress={() => setReadiness('tired')} />
          <Choice label="🤒  Что-то болит или нездоровится" selected={false} onPress={() => setReadiness('unwell')} />
        </View>
      </Screen>
    );
  }

  if (readiness === 'tired') {
    return (
      <Screen>
        <H1>Лучше отдохнуть</H1>
        <P>
          Уставшему ребёнку труднее держать равновесие и следить за движениями — занятие не принесёт пользы и может быть
          небезопасным. Попробуйте позже сегодня или завтра: занятие никуда не денется.
        </P>
        <Button title="Вернуться на главную" onPress={() => router.replace('/(tabs)')} />
        <Button title="Всё-таки начать" variant="secondary" onPress={begin} />
      </Screen>
    );
  }

  if (readiness === 'unwell') {
    return (
      <Screen>
        <H1>Сегодня без занятия</H1>
        <P>Когда что-то болит или ребёнок нездоров, заниматься не нужно. Вернитесь, когда ему станет лучше.</P>
        <Notice>Если боль сильная, не проходит или повторяется — обратитесь к врачу. В экстренном случае звоните 103 или 112.</Notice>
        <Button title="Вернуться на главную" onPress={() => router.replace('/(tabs)')} />
        <Button title="Написать куратору" variant="secondary" onPress={() => router.replace('/(tabs)/support')} />
      </Screen>
    );
  }

  if (step < plan.items.length) {
    const item = plan.items[step];
    const ex = EXERCISES.find((e) => e.id === item.exerciseId)!;
    const variant = ex.variants.find((v) => v.difficulty === item.difficulty) ?? ex.variants[0];
    const rate = (f: Feedback) => {
      setRatings((r) => ({ ...r, [item.exerciseId]: f }));
      setStep(step + 1);
    };
    const skip = () => {
      setRatings(({ [item.exerciseId]: _removed, ...rest }) => rest);
      setStep(step + 1);
    };
    return (
      <Screen>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
          <P muted>Упражнение {step + 1} из {plan.items.length}</P>
          <DifficultyDots level={item.difficulty} />
          <P muted>⏱ {formatClock(watch.seconds)}</P>
        </View>
        <H1>{ex.title}</H1>
        <ExerciseVideo url={ex.videoUrl} />
        <Card>
          <P>{ex.description}</P>
          <Text style={{ fontSize: fs(17), fontWeight: '700', color: colors.text }}>{variant.instructions}</Text>
          {ex.equipment && <P muted>Понадобится: {ex.equipment.join(', ')}</P>}
        </Card>
        <H2>Сделали? Как получилось?</H2>
        <RateRow value={ratings[item.exerciseId] ?? null} onRate={rate} />
        <P muted>Нажмите на оценку — упражнение отметится, и откроется следующее.</P>
        <Button title="Пропустить упражнение" variant="secondary" onPress={skip} />
        {step > 0 && <Button title="Назад" variant="secondary" onPress={() => setStep(step - 1)} />}
        <P muted>Если ребёнку больно или он сильно устал — пропустите упражнение.</P>
      </Screen>
    );
  }

  const doneItems = plan.items.filter((i) => ratings[i.exerciseId]);

  if (doneItems.length === 0) {
    return (
      <Screen>
        <H1>Занятие не засчитано</H1>
        <P>Вы пропустили все упражнения — ничего страшного. Вернитесь к занятию, когда ребёнок будет готов.</P>
        <Button title="На главную" onPress={() => router.replace('/(tabs)')} />
        <Button title="Вернуться к упражнениям" variant="secondary" onPress={() => setStep(0)} />
      </Screen>
    );
  }

  const toggleSign = (id: string) => setPainSigns((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = (skipCheckin: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const itemFeedback = Object.fromEntries(doneItems.map((i) => [i.exerciseId, ratings[i.exerciseId]]));
    const seconds = durationSec ?? watch.stop();
    setDurationSec(seconds);
    setResult(
      completeSession({ ...plan, items: doneItems }, overallFeedback(itemFeedback), pain, {
        itemFeedback,
        durationSec: seconds,
        painSigns,
        painArea: painArea ?? undefined,
        fatigue: skipCheckin ? undefined : fatigue ?? undefined,
        whatNext: skipCheckin ? undefined : whatNext ?? undefined,
      }),
    );
  };
  const finish = () => {
    // Если отмечена боль, сохраняем сразу: пауза и совет написать куратору не должны зависеть от дополнительного шага.
    if (pain) return save(true);
    if (durationSec === null) setDurationSec(watch.stop());
    setCheckin(true);
  };

  if (checkin) {
    return (
      <Screen>
        <H1>Как ты себя чувствуешь?</H1>
        <FaceChoiceRow groupLabel="Как ты себя чувствуешь?" options={FATIGUE_OPTIONS} value={fatigue} onChange={setFatigue} />
        <H2>Что дальше?</H2>
        <FaceChoiceRow groupLabel="Что дальше?" options={WHAT_NEXT_OPTIONS} value={whatNext} onChange={setWhatNext} />
        <P muted>Это необязательно. Можно ответить на один вопрос или оба.</P>
        <Button title="Готово" onPress={() => save(false)} />
        <Button title="Пропустить" variant="secondary" onPress={() => save(true)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>Почти готово</H1>
      <P muted>
        Выполнено упражнений: {doneItems.length} из {plan.items.length}
        {doneItems.length < plan.items.length ? ' · пропущенные предложим в следующий раз' : ''}. Проверьте оценки и
        нажмите «Завершить занятие». Идёт время: ⏱ {formatClock(watch.seconds)}
      </P>
      <Card>
        <H2>Ваши оценки</H2>
        {doneItems.map((i) => {
          const ex = EXERCISES.find((e) => e.id === i.exerciseId)!;
          return (
            <View key={i.exerciseId} style={{ gap: 6, paddingTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: feedbackColor(ratings[i.exerciseId]) }} />
                <Text style={{ flex: 1, fontSize: fs(15), fontWeight: '600', color: colors.text }}>{ex.title}</Text>
              </View>
              <ChipRow>
                {FEEDBACK.map((f) => (
                  <Chip
                    key={f}
                    label={SHORT[f]}
                    selected={ratings[i.exerciseId] === f}
                    onPress={() => setRatings((r) => ({ ...r, [i.exerciseId]: f }))}
                  />
                ))}
              </ChipRow>
            </View>
          );
        })}
        <P muted>В целом: {FEEDBACK_LABELS[overallFeedback(Object.fromEntries(doneItems.map((i) => [i.exerciseId, ratings[i.exerciseId]])))].toLowerCase()}.</P>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <P>Была боль или сильный дискомфорт</P>
          </View>
          <Switch
            value={pain}
            onValueChange={setPain}
            accessibilityLabel="Была боль или сильный дискомфорт"
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.card}
            {...({ activeThumbColor: colors.card } as object)}
          />
        </View>
        {pain && (
          <View style={{ gap: 10, paddingTop: 6 }}>
            <P muted>Что вы заметили? Можно выбрать несколько.</P>
            <ChipRow>
              {PAIN_SIGNS.map((s) => (
                <Chip key={s.id} label={s.label} selected={painSigns.includes(s.id)} onPress={() => toggleSign(s.id)} />
              ))}
            </ChipRow>
            <P muted>Где, если удалось понять?</P>
            <ChipRow>
              {PAIN_AREAS.map((a) => (
                <Chip key={a.id} label={a.label} selected={painArea === a.id} onPress={() => setPainArea(painArea === a.id ? null : a.id)} />
              ))}
            </ChipRow>
          </View>
        )}
      </Card>
      {pain && <Notice>Мы снизим нагрузку и приостановим занятия, пока вы не подтвердите, что ребёнку лучше.</Notice>}
      <Button title="Завершить занятие" onPress={finish} />
      <Button title="Назад к упражнениям" variant="secondary" onPress={() => setStep(plan.items.length - 1)} />
    </Screen>
  );
}
