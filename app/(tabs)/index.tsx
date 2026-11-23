import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CATEGORY_TINT, articleOfTheDay } from '@/src/content/articles';
import { formatDuration, journey } from '@/src/domain/achievements';
import { FEEDBACK_LABELS } from '@/src/domain/ratings';
import { formatClock } from '@/src/ui/useStopwatch';

import { EXERCISES } from '@/src/domain/exercises';
import { isGoalReviewDue } from '@/src/domain/goals';
import {
  BREAK_REASONS,
  activityStats,
  dayKey,
  estimateMinutes,
  isPainHold,
  needsBreakCheck,
  weekDays,
} from '@/src/domain/profile';
import { TARGET_SESSIONS_PER_WEEK, buildTodayWorkout, dayStatus } from '@/src/domain/selection';
import { useApp } from '@/src/state/AppState';
import { Button, Card, Choice, ExerciseRow, H1, H2, HeroCard, Notice, P, Col, Columns, Screen, StatTile, WeekPath, colors, partIcon, partTint, tints, fs } from '@/src/ui/kit';

const PART_LABEL = { warmup: 'Разминка', main: 'Основная часть', cooldown: 'Заминка' } as const;

const plural = (n: number, one: string, few: string, many: string) => {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
};

/** «Сегодня рекомендуется выполнить эту тренировку». */
export default function Today() {
  const {
    child,
    assessment,
    progress,
    sessions,
    goal,
    readArticles,
    practices,
    rulesAcceptedAt,
    painAcknowledgedSessionId,
    breakHandledSessionId,
    storageProblem,
    profileNotice,
    dismissProfileNotice,
    acknowledgePain,
    resolveBreak,
  } = useApp();
  const plan = useMemo(
    () => (child && assessment ? buildTodayWorkout(child, assessment, progress, sessions) : null),
    [child, assessment, progress, sessions],
  );
  if (!child || !assessment || !plan) return null;

  if (assessment.clearanceRequired && !child.doctorClearanceConfirmed) {
    return (
      <Screen>
        <Notice>Занятия откроются после того, как вы подтвердите разрешение врача.</Notice>
        <Button title="Открыть профиль" onPress={() => router.push('/child/result')} />
      </Screen>
    );
  }

  // Пауза после боли: занятие не предлагаем, пока родитель не подтвердит, что всё в порядке.
  if (isPainHold(sessions, painAcknowledgedSessionId)) {
    return (
      <Screen>
        <H1>Сделаем паузу</H1>
        <Notice>
          На прошлом занятии вы отметили боль или сильный дискомфорт. Не продолжайте, пока ребёнку не станет лучше. Если
          боль не проходит или повторяется — обратитесь к врачу или напишите куратору.
        </Notice>
        <P muted>Когда вернётесь к занятиям, упражнения будут в более простом варианте.</P>
        <Button title="Написать куратору" onPress={() => router.push('/(tabs)/support')} />
        <Button title="Ребёнку лучше, продолжить занятия" variant="secondary" onPress={acknowledgePain} />
      </Screen>
    );
  }

  // Долгий перерыв: сначала спрашиваем о причине — от неё зависит нагрузка.
  if (needsBreakCheck(sessions, breakHandledSessionId)) {
    return (
      <Screen>
        <HeroCard title={`С возвращением, ${child.name}!`} />
        <H2>Вы давно не занимались. Что было причиной?</H2>
        <P muted>От ответа зависит, с какой нагрузки начнём.</P>
        <View style={{ gap: 10 }}>
          {BREAK_REASONS.map((r) => (
            <Choice key={r.value} label={r.label} selected={false} onPress={() => resolveBreak(r.value)} />
          ))}
        </View>
        <Notice>Если ребёнок болел тяжело или лежал в больнице — сначала спросите врача, можно ли возобновить занятия.</Notice>
      </Screen>
    );
  }

  const status = dayStatus(sessions);
  const stats = activityStats(sessions);
  const days = weekDays(sessions, new Date(), practices ?? []);
  const doneThisWeek = days.filter((d) => d.done).length;
  const count = plan.items.length;
  const minutes = estimateMinutes(count);
  const article = articleOfTheDay(readArticles);
  // Что уже сделано сегодня: занятие целиком и отдельные упражнения.
  const todayKey = dayKey(new Date());
  const sessionsToday = sessions.filter((s) => dayKey(new Date(s.date)) === todayKey);
  const practicesToday = (practices ?? []).filter((p) => dayKey(new Date(p.date)) === todayKey);
  const path = journey(sessions, new Date(), practices ?? []);
  const start = () =>
    rulesAcceptedAt ? router.push('/workout') : router.push({ pathname: '/rules', params: { next: 'workout' } });

  return (
    <Screen wide>
      {storageProblem === 'corrupt' && (
        <Notice>
          Не удалось прочитать часть сохранённых данных на этом устройстве. Их копия отложена и не удалена — напишите
          куратору, чтобы помочь её восстановить.
        </Notice>
      )}
      {storageProblem === 'unavailable' && (
        <Notice>
          Данные сейчас не сохраняются на этом устройстве (хранилище недоступно или переполнено). Отметки о занятиях
          могут пропасть после закрытия приложения.
        </Notice>
      )}
      {profileNotice === 'profile_updated' && (
        <Card>
          <H2>Мы обновили профиль</H2>
          <P>
            Диагноз больше не нужен, и мы его не храним: занятия подбираются по тому, что ребёнок умеет, и по запретам
            врача. Ваша группа занятий не изменилась. Появились новые вопросы о запретах врача — ответьте на них, когда
            будет удобно.
          </P>
          <Button title="Ответить на вопросы" onPress={() => router.push('/child/questionnaire')} />
          <Button title="Понятно" variant="secondary" onPress={dismissProfileNotice} />
        </Card>
      )}
      <Columns>
        <Col>
      <HeroCard
        title={`Привет, ${child.name}!`}
        chip={
          status.kind === 'done_today'
            ? 'Сегодня уже занимались'
            : count > 0
              ? `${count} ${plural(count, 'упражнение', 'упражнения', 'упражнений')} · ${minutes} минут`
              : undefined
        }
      />

      {path.exercises > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <StatTile
            value={String(path.exercises)}
            label={`${plural(path.exercises, 'упражнение', 'упражнения', 'упражнений')} пройдено`}
            tint={tints.lilac}
          />
          <StatTile value={formatDuration(path.minutes)} label="занимались всего" tint={tints.peach} />
        </View>
      )}

      <WeekPath
        days={days}
        summary={`${doneThisWeek} из ${TARGET_SESSIONS_PER_WEEK} за неделю`}
        streak={stats.weeksInRow >= 2 ? `🔥 ${stats.weeksInRow} ${plural(stats.weeksInRow, 'неделя', 'недели', 'недель')} подряд` : undefined}
      />

      {days.some((d) => d.extra > 0) && (
        <P muted>Галочка — занятие целиком. Жёлтая точка и «+1» — отдельные упражнения в этот день.</P>
      )}

      {(sessionsToday.length > 0 || practicesToday.length > 0) && (
        <Card>
          <H2>Сегодня сделано</H2>
          {sessionsToday.map((s) => (
            <P key={s.id}>
              ✓ Занятие: {s.items.length} {plural(s.items.length, 'упражнение', 'упражнения', 'упражнений')}
              {s.durationSec ? ` · ${formatClock(s.durationSec)}` : ''}
            </P>
          ))}
          {practicesToday.map((p) => (
            <P key={p.id}>
              • {EXERCISES.find((e) => e.id === p.exerciseId)?.title ?? p.exerciseId}
              {p.feedback ? ` · ${FEEDBACK_LABELS[p.feedback].toLowerCase()}` : ''}
              {p.durationSec ? ` · ${formatClock(p.durationSec)}` : ''}
            </P>
          ))}
        </Card>
      )}

      {goal ? (
        isGoalReviewDue(goal) ? (
          <Card>
            <H2>Как продвигается цель?</H2>
            <P>{goal.text}</P>
            <Button title="Оценить" variant="secondary" onPress={() => router.push({ pathname: '/goal', params: { review: '1' } })} />
          </Card>
        ) : (
          <ExerciseRow icon="🎯" tint="#FFF3C9" title={goal.text} subtitle="Наша цель" />
        )
      ) : (
        <Card>
          <H2>Чему хотите научиться?</H2>
          <P muted>Выберите цель на ближайшие 2–3 месяца — так легче замечать успехи.</P>
          <Button title="Выбрать цель" variant="secondary" onPress={() => router.push('/goal')} />
        </Card>
      )}

      {status.kind === 'done_today' && (
        <Notice>
          Сегодня занятие уже отмечено — отличная работа! Заниматься чаще раза в день не нужно, поэтому кнопка «Начать
          занятие» появится завтра. Ниже — следующее занятие: нажмите на упражнение, чтобы посмотреть его.
        </Notice>
      )}
      {status.kind === 'rest_suggested' && (
        <Notice>Сегодня можно отдохнуть — или сделать занятие, если ребёнок в настроении.</Notice>
      )}

        </Col>
        <Col>
      {count === 0 ? (
        <Notice>
          Для ребёнка пока не нашлось подходящих упражнений в каталоге. Напишите куратору — он подберёт занятия вручную.
        </Notice>
      ) : (
        <View style={{ gap: 8 }}>
          {status.kind !== 'done_today' && <P muted>Нажмите на упражнение, чтобы посмотреть его заранее.</P>}
          {plan.items.map((item) => {
            const ex = EXERCISES.find((e) => e.id === item.exerciseId)!;
            return (
              <Pressable
                key={item.exerciseId}
                accessibilityRole="link"
                accessibilityLabel={`${ex.title}, ${PART_LABEL[ex.part]}. Открыть упражнение`}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}>
                <ExerciseRow
                  icon={partIcon[ex.part]}
                  tint={partTint[ex.part]}
                  title={ex.title}
                  subtitle={PART_LABEL[ex.part]}
                  right={<Text style={{ fontSize: fs(22), color: colors.muted }}>›</Text>}
                />
              </Pressable>
            );
          })}
        </View>
      )}
      {count > 0 && count < 3 && (
        <P muted>Занятие получилось коротким: в каталоге пока мало упражнений для этого возраста. Куратор подскажет, чем его дополнить.</P>
      )}
      {status.kind !== 'done_today' && count > 0 && <Button title="Начать занятие" onPress={start} />}
      {count === 0 && <Button title="Написать куратору" onPress={() => router.push('/(tabs)/support')} />}

      <H2>Почитать сегодня</H2>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${article.title}, ${article.minutes} мин`}
        onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.id } })}>
        <ExerciseRow icon={article.icon} tint={CATEGORY_TINT[article.category]} title={article.title} subtitle={`${article.minutes} мин чтения`} />
      </Pressable>
        </Col>
      </Columns>
    </Screen>
  );
}
