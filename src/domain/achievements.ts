import { TRACKING_TESTS } from './exercises';
import { activityStats, dayKey, estimateMinutes, weekDays } from './profile';
import { TARGET_SESSIONS_PER_WEEK } from './selection';
import type { FamilyGoal, PracticeLog, SessionLog, TrackingResult } from './types';

/**
 * Значки достижений, «наш путь» и шкала динамики.
 *
 * Значки отмечают регулярность и заботу, а не результат ребёнка: их нельзя «не заслужить» из-за диагноза.
 * ⚠️ ЧЕРНОВИК: пороги и формулировки стоит согласовать со специалистом (чтобы значки не подталкивали
 * заниматься через боль или усталость).
 */
export type ParentRole = 'mom' | 'dad' | 'other';

export const ROLE_LABELS: Record<ParentRole, string> = { mom: 'Мама', dad: 'Папа', other: 'Близкий взрослый' };

export interface AchievementInput {
  sessions: SessionLog[];
  trackingResults: TrackingResult[];
  goal?: FamilyGoal;
  pastGoals?: FamilyGoal[];
  readArticles?: string[];
  role?: ParentRole;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  /** Что нужно сделать, чтобы получить значок. */
  how: string;
  earned: boolean;
  /** Продвижение к значку, например «7 из 10». */
  progress?: string;
}

const parentTitle = (role?: ParentRole) =>
  role === 'mom' ? 'Супермама' : role === 'dad' ? 'Суперпапа' : 'Надёжный взрослый';

export function achievements(input: AchievementInput, today: Date = new Date()): Achievement[] {
  const { sessions, trackingResults, goal, pastGoals = [], readArticles = [], role } = input;
  const total = sessions.length;
  const stats = activityStats(sessions, today);
  const goals = [...pastGoals, ...(goal ? [goal] : [])];
  const goalReached = goals.some((g) => g.reviews.some((r) => r.rating >= 1));

  // Была ли хоть одна календарная неделя с выполненной целью.
  const weekGoalDone = sessions.some(
    (s) => weekDays(sessions, new Date(s.date)).filter((d) => d.done).length >= TARGET_SESSIONS_PER_WEEK,
  );

  const upTo = (n: number, target: number) => `${Math.min(n, target)} из ${target}`;

  return [
    { id: 'first_step', icon: '🌱', title: 'Первый шаг', how: 'Первое занятие', earned: total >= 1 },
    { id: 'week_goal', icon: '📅', title: 'Неделя по плану', how: `${TARGET_SESSIONS_PER_WEEK} занятия за неделю`, earned: weekGoalDone },
    { id: 'active_child', icon: '🤸', title: 'Подвижный ребёнок', how: '10 занятий', earned: total >= 10, progress: upTo(total, 10) },
    {
      id: 'month_together',
      icon: '🗓️',
      title: 'Месяц вместе',
      how: '4 недели подряд с занятиями',
      earned: stats.weeksInRow >= 4,
      progress: upTo(stats.weeksInRow, 4),
    },
    { id: 'super_parent', icon: '🏅', title: parentTitle(role), how: '20 занятий вместе с ребёнком', earned: total >= 20, progress: upTo(total, 20) },
    {
      id: 'tracker',
      icon: '📈',
      title: 'Следим за динамикой',
      how: '3 результата тестов',
      earned: trackingResults.length >= 3,
      progress: upTo(trackingResults.length, 3),
    },
    { id: 'goal_set', icon: '🎯', title: 'Есть цель', how: 'Выбрать цель', earned: goals.length > 0 },
    { id: 'goal_reached', icon: '🏆', title: 'Цель достигнута', how: 'Оценить цель как «получилось»', earned: goalReached },
    {
      id: 'reader',
      icon: '📖',
      title: 'Любознательный родитель',
      how: '5 прочитанных статей',
      earned: readArticles.length >= 5,
      progress: upTo(readArticles.length, 5),
    },
  ];
}

/** Значки, которые появились после последнего занятия. */
export function newlyEarned(input: AchievementInput, today: Date = new Date()): Achievement[] {
  if (input.sessions.length === 0) return [];
  const before = new Set(
    achievements({ ...input, sessions: input.sessions.slice(0, -1) }, today)
      .filter((a) => a.earned)
      .map((a) => a.id),
  );
  return achievements(input, today).filter((a) => a.earned && !before.has(a.id));
}

// ---------- Наш путь ----------

export interface Journey {
  /** Сколько дней прошло с первого занятия (включая его день). */
  daysOnPath: number;
  /** В скольких разных днях были занятия. */
  activeDays: number;
  sessions: number;
  exercises: number;
  /** Примерное время занятий, минут. */
  minutes: number;
}

/**
 * Итоги пути. Время берётся с секундомера, если тренировка его включала;
 * для старых записей без секундомера — оценка, около трёх минут на упражнение.
 */
export function journey(sessions: SessionLog[], today: Date = new Date(), practices: PracticeLog[] = []): Journey {
  const exercises = sessions.reduce((n, s) => n + s.items.length, 0) + practices.length;
  const seconds =
    sessions.reduce((n, s) => n + (s.durationSec ?? estimateMinutes(s.items.length) * 60), 0) +
    practices.reduce((n, p) => n + (p.durationSec ?? estimateMinutes(1) * 60), 0);
  const dates = [...sessions.map((s) => s.date), ...practices.map((p) => p.date)].sort();
  const first = dates[0] ? new Date(dates[0]) : undefined;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return {
    daysOnPath: first ? Math.round((startOfDay(today) - startOfDay(first)) / (24 * 3600 * 1000)) + 1 : 0,
    activeDays: new Set(dates.map((d) => dayKey(new Date(d)))).size,
    sessions: sessions.length,
    exercises,
    minutes: seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0,
  };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

// ---------- Шкала динамики ----------

export type TrendKind = 'better' | 'stable' | 'worse';

export interface Trend {
  /** От −1 (заметное снижение) до +1 (заметное улучшение). */
  score: number;
  kind: TrendKind;
  /** Сколько тестов сравнили (у которых есть хотя бы два результата). */
  comparedTests: number;
}

/**
 * Динамика по тестам: сравниваем первый и последний результат каждого теста.
 * ⚠️ ЧЕРНОВИК: порог «без изменений» (±10 %) и сама формула — на проверку специалисту.
 */
export function trend(trackingResults: TrackingResult[]): Trend | null {
  const changes: number[] = [];
  for (const t of TRACKING_TESTS) {
    const results = trackingResults.filter((r) => r.testId === t.id);
    if (results.length < 2) continue;
    const first = results[0].value;
    const last = results[results.length - 1].value;
    const relative = (last - first) / Math.max(Math.abs(first), 1);
    changes.push(Math.max(-1, Math.min(1, t.higherIsBetter ? relative : -relative)));
  }
  if (changes.length === 0) return null;
  const score = changes.reduce((a, b) => a + b, 0) / changes.length;
  return { score, kind: score > 0.1 ? 'better' : score < -0.1 ? 'worse' : 'stable', comparedTests: changes.length };
}
