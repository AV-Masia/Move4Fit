import type { Feedback, PracticeLog, SessionLog } from './types';

/**
 * Оценки «легко / нормально / тяжело», которые родитель ставит после каждого упражнения —
 * в занятии и при отдельном выполнении из карточки упражнения.
 */
export interface Rating {
  exerciseId: string;
  date: string; // ISO
  feedback: Feedback;
}

/** Все оценки по порядку времени: из занятий (по каждому упражнению) и из отдельных упражнений. */
export function allRatings(sessions: SessionLog[], practices: PracticeLog[] = []): Rating[] {
  const list: Rating[] = [];
  for (const s of sessions) {
    for (const item of s.items) {
      list.push({ exerciseId: item.exerciseId, date: s.date, feedback: s.itemFeedback?.[item.exerciseId] ?? s.feedback });
    }
  }
  for (const p of practices) {
    if (p.feedback) list.push({ exerciseId: p.exerciseId, date: p.date, feedback: p.feedback });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function exerciseRatings(exerciseId: string, sessions: SessionLog[], practices: PracticeLog[] = []): Rating[] {
  return allRatings(sessions, practices).filter((r) => r.exerciseId === exerciseId);
}

/**
 * Общий отзыв о занятии по оценкам упражнений: чаще всего встречающаяся оценка;
 * при равенстве — «нормально».
 */
export function overallFeedback(itemFeedback: Record<string, Feedback>): Feedback {
  const counts: Record<Feedback, number> = { easy: 0, ok: 0, hard: 0 };
  Object.values(itemFeedback).forEach((f) => counts[f]++);
  if (counts.easy > counts.ok && counts.easy > counts.hard) return 'easy';
  if (counts.hard > counts.ok && counts.hard > counts.easy) return 'hard';
  return 'ok';
}

export interface WeekRatings {
  /** Понедельник недели, например «9.11». */
  label: string;
  easy: number;
  ok: number;
  hard: number;
}

/** Сколько упражнений далось легко, нормально и тяжело в каждую из последних недель (с понедельника). */
export function ratingsByWeek(
  sessions: SessionLog[],
  practices: PracticeLog[] = [],
  weeks = 6,
  today: Date = new Date(),
): WeekRatings[] {
  const ratings = allRatings(sessions, practices);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const result: WeekRatings[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const row: WeekRatings = { label: `${from.getDate()}.${from.getMonth() + 1}`, easy: 0, ok: 0, hard: 0 };
    for (const r of ratings) {
      const t = new Date(r.date).getTime();
      if (t >= from.getTime() && t < to.getTime()) row[r.feedback]++;
    }
    result.push(row);
  }
  return result;
}

export const FEEDBACK_LABELS: Record<Feedback, string> = { easy: 'Легко', ok: 'Нормально', hard: 'Тяжело' };
