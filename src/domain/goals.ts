import type { FamilyGoal, FunctionalLevel, GoalRating } from './types';

/**
 * Цель семьи: чему хотим научиться в ближайшие 2–3 месяца.
 * Лёгкий вариант: цель видна родителю и оценивается раз в 8 недель, но на подбор упражнений пока не влияет.
 *
 * ⚠️ ЧЕРНОВИК: список целей по группам и срок пересмотра должен утвердить специалист.
 */
export interface GoalPreset {
  id: string;
  title: string;
  levels: FunctionalLevel[];
}

export const GOAL_PRESETS: GoalPreset[] = [
  { id: 'jump_two_feet', title: 'Прыгать на двух ногах', levels: [1] },
  { id: 'stairs_no_rail', title: 'Подниматься по лестнице без перил', levels: [1] },
  { id: 'one_leg_longer', title: 'Дольше стоять на одной ноге', levels: [1] },
  { id: 'run_fall_less', title: 'Бегать увереннее и реже падать', levels: [1] },

  { id: 'stairs_less_rail', title: 'Подниматься по лестнице, меньше держась за перила', levels: [2] },
  { id: 'uneven_ground', title: 'Ходить по неровной дорожке', levels: [2] },
  { id: 'walk_fall_less', title: 'Реже падать при ходьбе', levels: [2] },
  { id: 'floor_to_stand', title: 'Вставать с пола без помощи', levels: [2] },

  { id: 'stand_no_support', title: 'Стоять без опоры несколько секунд', levels: [3] },
  { id: 'chair_stand_alone', title: 'Вставать со стула самостоятельно', levels: [3] },
  { id: 'room_less_help', title: 'Пройти по комнате с меньшей помощью', levels: [3] },
  { id: 'walker_longer', title: 'Дольше ходить с ходунками', levels: [3] },

  { id: 'sit_longer', title: 'Дольше сидеть без поддержки', levels: [4] },
  { id: 'lie_to_sit', title: 'Самостоятельно садиться из положения лёжа', levels: [4] },
  { id: 'stand_at_support', title: 'Стоять у опоры', levels: [4] },
  { id: 'reach_sitting', title: 'Тянуться за игрушкой сидя и не падать', levels: [4] },

  { id: 'head_longer', title: 'Дольше держать голову', levels: [5] },
  { id: 'prone_on_arms', title: 'Лежать на животе с опорой на руки', levels: [5] },
  { id: 'sit_supported_watch', title: 'Сидеть с поддержкой и следить за игрушкой', levels: [5] },
  { id: 'calm_position_change', title: 'Спокойнее переносить смену положений', levels: [5] },
];

export function goalsFor(level: FunctionalLevel): GoalPreset[] {
  return GOAL_PRESETS.filter((g) => g.levels.includes(level));
}

/** Через сколько дней предлагаем оценить продвижение к цели. */
export const GOAL_REVIEW_DAYS = 56;

/** Пять ступеней оценки (по мотивам шкалы достижения целей). */
export const GOAL_RATINGS: { value: GoalRating; label: string }[] = [
  { value: 2, label: 'Получилось даже лучше, чем ждали' },
  { value: 1, label: 'Получилось' },
  { value: 0, label: 'Заметно продвинулись' },
  { value: -1, label: 'Пока без изменений' },
  { value: -2, label: 'Стало труднее, чем было' },
];

export function goalRatingLabel(rating: GoalRating): string {
  return GOAL_RATINGS.find((r) => r.value === rating)?.label ?? '';
}

/** Пора ли спросить «Как с целью?»: прошло 8 недель с постановки или с прошлой оценки. */
export function isGoalReviewDue(goal: FamilyGoal | undefined, today: Date = new Date()): boolean {
  if (!goal) return false;
  const last = goal.reviews[goal.reviews.length - 1]?.date ?? goal.setAt;
  return today.getTime() - new Date(last).getTime() >= GOAL_REVIEW_DAYS * 24 * 3600 * 1000;
}
