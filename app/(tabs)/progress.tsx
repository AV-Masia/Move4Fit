import { router } from 'expo-router';

import { formatDuration, journey, trend } from '@/src/domain/achievements';
import { sessionsByWeek } from '@/src/domain/profile';
import { ratingsByWeek } from '@/src/domain/ratings';
import { TARGET_SESSIONS_PER_WEEK, trackingTestsFor } from '@/src/domain/selection';
import { useApp } from '@/src/state/AppState';
import { View } from 'react-native';

import { BarChart, Button, Card, Col, Columns, StackedBarChart, H1, H2, P, Screen, StatTile, TrendScale, tints } from '@/src/ui/kit';

const short = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

/** Динамика: занятия по неделям, 1–2 простых теста с графиком результатов. */
export default function Progress() {
  const { assessment, trackingResults, sessions, practices } = useApp();
  if (!assessment) return null;
  const tests = trackingTestsFor(assessment);
  const weeks = sessionsByWeek(sessions);
  const rated = ratingsByWeek(sessions, practices ?? []);
  const ratedTotal = rated.reduce((n, w) => n + w.easy + w.ok + w.hard, 0);
  const lastRated = [...rated].reverse().find((w) => w.easy + w.ok + w.hard > 0);
  const path = journey(sessions, new Date(), practices ?? []);
  const dynamics = trend(trackingResults);
  const TREND_TEXT = {
    better: 'Есть улучшение. Так держать!',
    stable: 'Результаты держатся на одном уровне. Это тоже результат: навык закрепляется.',
    worse:
      'Результаты немного снизились. Так бывает после болезни, перерыва или скачка роста. Если снижение держится — покажите сводку куратору или врачу.',
  } as const;

  return (
    <Screen wide>
      <H1>Мои успехи</H1>
      <Columns>
        <Col>

      <Card>
        <H2>Наш путь</H2>
        {path.sessions === 0 ? (
          <P muted>Путь начнётся с первого занятия.</P>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
            <StatTile value={String(path.daysOnPath)} label="дней с первого занятия" tint={tints.pink} />
            <StatTile value={String(path.activeDays)} label="дней с занятиями" tint={tints.teal} />
            <StatTile value={String(path.exercises)} label="упражнений сделано" tint={tints.lilac} />
            <StatTile value={formatDuration(path.minutes)} label="занимались" tint={tints.peach} />
          </View>
        )}
      </Card>

      <Card>
        <H2>Шкала динамики</H2>
        {dynamics ? (
          <>
            <TrendScale score={dynamics.score} label={TREND_TEXT[dynamics.kind]} />
            <P>{TREND_TEXT[dynamics.kind]}</P>
            <P muted>Считается по тестам: сравниваем первый и последний результат.</P>
          </>
        ) : (
          <P muted>Шкала появится, когда один и тот же тест будет пройден хотя бы дважды.</P>
        )}
      </Card>

      <Card>
        <H2>Занятия по неделям</H2>
        {sessions.length === 0 ? (
          <P muted>График появится после первого занятия.</P>
        ) : (
          <>
            <BarChart
              data={weeks.map((w) => ({ label: w.label, value: w.count }))}
              target={TARGET_SESSIONS_PER_WEEK}
              summary={`Занятий по неделям: ${weeks.map((w) => w.count).join(', ')}. Цель — ${TARGET_SESSIONS_PER_WEEK} в неделю.`}
            />
            <P muted>
              Пунктир — цель, {TARGET_SESSIONS_PER_WEEK} занятия в неделю. Всего выполнено: {sessions.length}.
            </P>
          </>
        )}
        <Button title="История занятий" variant="secondary" onPress={() => router.push('/(tabs)/profile')} />
      </Card>

        </Col>
        <Col>
      <Card>
        <H2>Как даются упражнения</H2>
        {ratedTotal === 0 ? (
          <P muted>График появится, когда вы оцените первое упражнение: легко, нормально или тяжело.</P>
        ) : (
          <>
            <StackedBarChart
              data={rated}
              summary={`Оценки упражнений по неделям. ${rated.map((w) => `${w.label}: легко ${w.easy}, нормально ${w.ok}, тяжело ${w.hard}`).join('; ')}`}
            />
            {lastRated && (
              <P muted>
                Последняя неделя с занятиями: легко — {lastRated.easy}, нормально — {lastRated.ok}, тяжело — {lastRated.hard}.
                Когда «легко» становится больше, приложение предлагает вариант сложнее.
              </P>
            )}
          </>
        )}
      </Card>

      <P muted>Повторяйте тесты раз в 2–4 недели в одинаковых условиях.</P>
      {tests.map((t) => {
        const results = trackingResults.filter((r) => r.testId === t.id).slice(-6);
        const first = results[0];
        const last = results[results.length - 1];
        const diff = results.length > 1 ? Math.round((last.value - first.value) * 10) / 10 : 0;
        const better = t.higherIsBetter ? diff > 0 : diff < 0;
        return (
          <Card key={t.id}>
            <H2>{t.title}</H2>
            {results.length === 0 && <P muted>Ещё нет результатов. Пройдите тест, чтобы было с чем сравнивать.</P>}
            {results.length > 0 && (
              <BarChart
                data={results.map((r) => ({ label: short(r.date), value: r.value }))}
                summary={`${t.title}: ${results.map((r) => `${r.value} ${t.unit}`).join(', ')}`}
              />
            )}
            {results.length === 1 && (
              <P muted>
                Первый результат: {last.value} {t.unit}. Повторите через 2–4 недели.
              </P>
            )}
            {results.length > 1 && (
              <P>
                {diff === 0
                  ? `Без изменений: ${last.value} ${t.unit}.`
                  : `${better ? '🌱 ' : ''}${diff > 0 ? '+' : '−'}${Math.abs(diff)} ${t.unit} с первого теста${better ? '' : ' — это бывает, смотрите на общую линию'}.`}
              </P>
            )}
            <Button title="Пройти тест" variant="secondary" onPress={() => router.push({ pathname: '/test/[id]', params: { id: t.id } })} />
          </Card>
        );
      })}
        </Col>
      </Columns>
    </Screen>
  );
}
