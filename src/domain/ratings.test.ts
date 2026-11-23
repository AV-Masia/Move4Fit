import { describe, expect, it } from 'vitest';

import { weekDays } from './profile';
import { allRatings, exerciseRatings, overallFeedback, ratingsByWeek } from './ratings';
import type { PracticeLog, SessionLog } from './types';

const today = new Date(2026, 10, 14, 12, 0); // суббота
const at = (daysAgo: number, hour = 10) => new Date(2026, 10, 14 - daysAgo, hour, 0).toISOString();
const items = [
  { exerciseId: 'bridge', difficulty: 1 as const },
  { exerciseId: 'heel_raises', difficulty: 1 as const },
];
const session = (id: string, daysAgo: number, extra: Partial<SessionLog> = {}): SessionLog => ({
  id,
  childId: 'c',
  date: at(daysAgo),
  items,
  feedback: 'ok',
  pain: false,
  ...extra,
});
const practice = (id: string, daysAgo: number, feedback?: PracticeLog['feedback']): PracticeLog => ({
  id,
  exerciseId: 'bridge',
  difficulty: 1,
  date: at(daysAgo, 15),
  feedback,
});

describe('оценки упражнений', () => {
  it('собирает оценки из занятий и отдельных упражнений по порядку времени', () => {
    const list = allRatings([session('s1', 3, { itemFeedback: { bridge: 'hard' } })], [practice('p1', 1, 'easy'), practice('p2', 0)]);
    expect(list.map((r) => `${r.exerciseId}:${r.feedback}`)).toEqual(['bridge:hard', 'heel_raises:ok', 'bridge:easy']);
    expect(exerciseRatings('bridge', [session('s1', 3, { itemFeedback: { bridge: 'hard' } })], [practice('p1', 1, 'easy')]).map((r) => r.feedback)).toEqual(['hard', 'easy']);
  });

  it('общий отзыв — самая частая оценка, при равенстве «нормально»', () => {
    expect(overallFeedback({ a: 'easy', b: 'easy', c: 'hard' })).toBe('easy');
    expect(overallFeedback({ a: 'hard', b: 'hard', c: 'ok' })).toBe('hard');
    expect(overallFeedback({ a: 'easy', b: 'hard' })).toBe('ok');
    expect(overallFeedback({})).toBe('ok');
  });

  it('считает оценки по неделям', () => {
    const weeks = ratingsByWeek(
      [session('s1', 9, { feedback: 'hard' }), session('s2', 2, { itemFeedback: { bridge: 'easy' } })],
      [practice('p1', 0, 'easy')],
      2,
      today,
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ easy: 0, ok: 0, hard: 2 }); // прошлая неделя
    expect(weeks[1]).toMatchObject({ easy: 2, ok: 1, hard: 0 }); // эта неделя
  });

  it('день с отдельным упражнением виден на дорожке недели, но не считается занятием', () => {
    const days = weekDays([session('s1', 3)], today, [practice('p1', 1, 'ok'), practice('p2', 3, 'ok')]);
    const by = Object.fromEntries(days.map((d) => [d.label, d]));
    expect(by['Ср']).toMatchObject({ done: true, practiced: false }); // было занятие — галочка
    expect(by['Пт']).toMatchObject({ done: false, practiced: true });
    expect(by['Чт']).toMatchObject({ done: false, practiced: false });
  });
});
