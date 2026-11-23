import { describe, expect, it } from 'vitest';

import { achievements, formatDuration, journey, newlyEarned, trend } from './achievements';
import type { SessionLog, TrackingResult } from './types';

const day = 24 * 3600 * 1000;
const today = new Date(2026, 10, 14, 12, 0); // суббота
const items = [
  { exerciseId: 'bridge', difficulty: 1 as const },
  { exerciseId: 'heel_raises', difficulty: 1 as const },
];
const sessionsAgo = (...daysAgo: number[]): SessionLog[] =>
  daysAgo.map((d, i) => ({
    id: `s${i}`,
    childId: 'c',
    date: new Date(today.getTime() - d * day).toISOString(),
    items,
    feedback: 'ok',
    pain: false,
  }));
const result = (testId: string, value: number, daysAgo: number): TrackingResult => ({
  id: `${testId}-${daysAgo}`,
  childId: 'c',
  testId,
  value,
  date: new Date(today.getTime() - daysAgo * day).toISOString(),
});
const earned = (list: ReturnType<typeof achievements>) => list.filter((a) => a.earned).map((a) => a.id);

describe('значки', () => {
  it('без занятий значков нет', () => {
    expect(earned(achievements({ sessions: [], trackingResults: [] }, today))).toEqual([]);
  });

  it('первое занятие даёт «Первый шаг» — и только его', () => {
    const input = { sessions: sessionsAgo(0), trackingResults: [] };
    expect(earned(achievements(input, today))).toEqual(['first_step']);
    expect(newlyEarned(input, today).map((a) => a.id)).toEqual(['first_step']);
  });

  it('три занятия за календарную неделю — «Неделя по плану»', () => {
    // Сегодня суббота: 0, 2 и 4 дня назад — суббота, четверг, вторник одной недели.
    expect(earned(achievements({ sessions: sessionsAgo(4, 2, 0), trackingResults: [] }, today))).toContain('week_goal');
    // 8, 2 и 0 дней назад — занятия в разных неделях.
    expect(earned(achievements({ sessions: sessionsAgo(8, 2, 0), trackingResults: [] }, today))).not.toContain('week_goal');
  });

  it('десятое занятие приносит «Подвижного ребёнка», название значка родителя зависит от роли', () => {
    const ten = sessionsAgo(27, 24, 21, 18, 15, 12, 9, 6, 3, 0);
    expect(newlyEarned({ sessions: ten, trackingResults: [] }, today).map((a) => a.id)).toContain('active_child');
    const title = (role?: 'mom' | 'dad' | 'other') =>
      achievements({ sessions: [], trackingResults: [], role }, today).find((a) => a.id === 'super_parent')!.title;
    expect(title('mom')).toBe('Супермама');
    expect(title('dad')).toBe('Суперпапа');
    expect(title()).toBe('Надёжный взрослый');
  });

  it('цель и статьи', () => {
    const goal = { id: 'g', text: 'Стоять у опоры', setAt: today.toISOString(), reviews: [{ date: today.toISOString(), rating: 1 as const }] };
    const list = earned(achievements({ sessions: [], trackingResults: [], goal, readArticles: ['a', 'b', 'c', 'd', 'e'] }, today));
    expect(list).toEqual(expect.arrayContaining(['goal_set', 'goal_reached', 'reader']));
  });
});

describe('наш путь', () => {
  it('считает дни, упражнения и время', () => {
    const j = journey(sessionsAgo(9, 5, 5, 0), today);
    expect(j.daysOnPath).toBe(10);
    expect(j.activeDays).toBe(3);
    expect(j.sessions).toBe(4);
    expect(j.exercises).toBe(8);
    expect(j.minutes).toBe(24);
    expect(journey([], today).daysOnPath).toBe(0);
  });

  it('берёт время с секундомера, а без него — оценку; считает отдельные упражнения', () => {
    const timed = sessionsAgo(2).map((s) => ({ ...s, durationSec: 600 })); // 10 минут по секундомеру
    const old = sessionsAgo(5); // без секундомера: 2 упражнения × 3 минуты
    const practices = [
      { id: 'p1', exerciseId: 'bridge', difficulty: 1 as const, date: new Date(today.getTime() - 7 * day).toISOString(), durationSec: 90 },
      { id: 'p2', exerciseId: 'bridge', difficulty: 1 as const, date: today.toISOString() },
    ];
    const j = journey([...old, ...timed], today, practices);
    expect(j.exercises).toBe(6);
    expect(j.minutes).toBe(Math.round((600 + 360 + 90 + 180) / 60));
    expect(j.daysOnPath).toBe(8); // путь начался с отдельного упражнения 7 дней назад
    expect(j.activeDays).toBe(4);
  });

  it('форматирует время', () => {
    expect(formatDuration(24)).toBe('24 мин');
    expect(formatDuration(120)).toBe('2 ч');
    expect(formatDuration(195)).toBe('3 ч 15 мин');
  });
});

describe('шкала динамики', () => {
  it('нужны хотя бы два результата одного теста', () => {
    expect(trend([result('sit_to_stand_30s', 4, 10)])).toBeNull();
  });

  it('рост результата — улучшение, падение — снижение, малое изменение — стабильно', () => {
    expect(trend([result('sit_to_stand_30s', 4, 30), result('sit_to_stand_30s', 7, 1)])?.kind).toBe('better');
    expect(trend([result('sit_to_stand_30s', 8, 30), result('sit_to_stand_30s', 5, 1)])?.kind).toBe('worse');
    expect(trend([result('sit_to_stand_30s', 20, 30), result('sit_to_stand_30s', 21, 1)])?.kind).toBe('stable');
  });

  it('усредняет по тестам и не выходит за границы шкалы', () => {
    const t = trend([
      result('sit_to_stand_30s', 1, 30),
      result('sit_to_stand_30s', 30, 1),
      result('sitting_hold', 40, 30),
      result('sitting_hold', 40, 1),
    ])!;
    expect(t.comparedTests).toBe(2);
    expect(t.score).toBe(0.5);
  });
});
