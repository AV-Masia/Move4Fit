import type { Difficulty, Fatigue, Feedback, PlannedExercise, ProgressMap, WhatNext } from './types';

/** Сколько «легко» подряд нужно, чтобы усложнить упражнение. */
export const EASY_STREAK_TO_ADVANCE = 2;

const clamp = (d: number): Difficulty => Math.min(3, Math.max(1, d)) as Difficulty;

export interface ProgressionResult {
  progress: ProgressMap;
  /** Показать родителю совет сделать паузу и написать куратору. */
  contactCurator: boolean;
  /** Все упражнения на максимальной сложности и даются легко — пора пройти анкету заново. */
  suggestReassessment: boolean;
}

/**
 * Правила прогрессии (⚠️ черновик, согласовать со специалистом):
 *  • боль → снижаем сложность всех упражнений занятия и советуем связаться с куратором;
 *  • «тяжело» → снижаем сложность на 1;
 *  • «нормально» → оставляем, серия «легко» сбрасывается;
 *  • «легко» N раз подряд → повышаем сложность на 1;
 *  • усталость («устал») или «было много» → тормозим: сложность не повышаем, но серия «легко» сохраняется
 *    и продолжит копиться (повышение — в ближайшем неутомлённом занятии). Боль и «тяжело» действуют всегда.
 *    Это правило ⚠️ ЧЕРНОВИК, согласовать со специалистом;
 *  • отзыв можно уточнить для отдельного упражнения — тогда правило применяется к нему отдельно.
 */
export function applySessionResult(
  progress: ProgressMap,
  items: PlannedExercise[],
  feedback: Feedback,
  pain: boolean,
  /** Отзыв по отдельным упражнениям; для остальных действует общий `feedback`. */
  itemFeedback: Record<string, Feedback> = {},
  /** Усталость и «что дальше» по итогам занятия (⚠️ черновик): при усталости/«было много» сложность не растёт. */
  session?: { fatigue?: Fatigue; whatNext?: WhatNext },
): ProgressionResult {
  const fb = (id: string): Feedback => itemFeedback[id] ?? feedback;
  const brake = session?.fatigue === 'tired' || session?.whatNext === 'tooMuch';
  const next: ProgressMap = { ...progress };
  for (const item of items) {
    const cur = next[item.exerciseId] ?? { difficulty: item.difficulty, easyStreak: 0 };
    if (pain || fb(item.exerciseId) === 'hard') {
      next[item.exerciseId] = { difficulty: clamp(cur.difficulty - 1), easyStreak: 0 };
    } else if (fb(item.exerciseId) === 'ok') {
      next[item.exerciseId] = { difficulty: cur.difficulty, easyStreak: 0 };
    } else {
      const streak = cur.easyStreak + 1;
      next[item.exerciseId] =
        streak >= EASY_STREAK_TO_ADVANCE && cur.difficulty < 3 && !brake
          ? { difficulty: clamp(cur.difficulty + 1), easyStreak: 0 }
          : { difficulty: cur.difficulty, easyStreak: streak };
    }
  }
  const suggestReassessment =
    !pain &&
    items.length > 0 &&
    items.every((i) => fb(i.exerciseId) === 'easy' && (progress[i.exerciseId]?.difficulty ?? 1) === 3);
  return { progress: next, contactCurator: pain, suggestReassessment };
}
