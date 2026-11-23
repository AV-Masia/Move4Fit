import { PART_COUNTS } from './selection';
import type {
  Capability,
  Difficulty,
  Exercise,
  ExerciseRisk,
  FunctionalLevel,
  Goal,
  PlannedExercise,
  Position,
  WorkoutPart,
} from './types';

/**
 * Содержание, которое создаёт администратор: новые упражнения и занятия, собранные по шаблону.
 * Чистая логика: пустые шаблоны, проверка заполнения, подсказки о том, кому занятие подходит.
 *
 * ⚠️ ЧЕРНОВИК: всё, что создано здесь, — медицинское содержание. Перед показом родителям каждое
 * упражнение и занятие должен утвердить специалист.
 */

// ---------- Подписи ----------

export const PARTS: WorkoutPart[] = ['warmup', 'main', 'cooldown'];
export const LEVELS: FunctionalLevel[] = [1, 2, 3, 4, 5];
export const DIFFICULTIES: Difficulty[] = [1, 2, 3];

export const PART_LABELS: Record<WorkoutPart, string> = { warmup: 'Разминка', main: 'Основная часть', cooldown: 'Заминка' };

export const GOAL_LABELS: Record<Goal, string> = {
  strength: 'Сила',
  balance: 'Равновесие',
  flexibility: 'Гибкость',
  coordination: 'Координация',
  endurance: 'Выносливость',
};

export const POSITION_LABELS: Record<Position, string> = { lying: 'Лёжа', sitting: 'Сидя', kneeling: 'На коленях', standing: 'Стоя' };

export const CAPABILITY_LABELS: Record<Capability, string> = {
  head_control: 'Держит голову',
  sit_with_support: 'Сидит с поддержкой',
  sit_independent: 'Сидит сам',
  stand_with_support: 'Стоит у опоры',
  stand_independent: 'Стоит без опоры',
  walk_with_device: 'Ходит с ходунками или тростями',
  walk_independent: 'Ходит сам в помещении',
  walk_outdoors: 'Ходит сам на улице',
  stairs_with_rail: 'Лестница с перилами',
  stairs_no_rail: 'Лестница без перил',
  run_jump: 'Бегает и прыгает',
};

export const RISK_LABELS: Record<ExerciseRisk, string> = {
  impact: 'Прыжки и удары',
  hip_loading: 'Нагрузка на тазобедренный сустав',
  head_down: 'Положение вниз головой',
  neck_flexion: 'Сильное сгибание шеи',
  breath_holding: 'Натуживание',
  high_intensity: 'Высокая интенсивность',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { 1: 'Проще', 2: 'Средне', 3: 'Сложнее' };

// ---------- Новое упражнение ----------

/** Пустой шаблон упражнения: три варианта сложности, остальное заполняет администратор. */
export function blankExercise(id: string): Exercise {
  return {
    id,
    title: '',
    description: '',
    part: 'main',
    goals: [],
    position: 'lying',
    requires: [],
    levels: [],
    minAge: 0,
    risks: [],
    variants: DIFFICULTIES.map((difficulty) => ({ difficulty, instructions: '', sets: 1 })),
  };
}

const isCount = (n: number | undefined): n is number => n !== undefined && Number.isInteger(n) && n > 0;

/** Что не заполнено или заполнено неверно. Пустой список — упражнение можно сохранять. */
export function validateExercise(e: Exercise): string[] {
  const errors: string[] = [];
  if (!e.title.trim()) errors.push('Напишите название упражнения.');
  if (!e.description.trim()) errors.push('Напишите описание: что делает ребёнок и чем помогает взрослый.');
  if (e.goals.length === 0) errors.push('Отметьте хотя бы одну цель упражнения.');
  if (e.levels.length === 0) errors.push('Отметьте, каким группам детей подходит упражнение.');
  if (!Number.isFinite(e.minAge) || e.minAge < 0 || e.minAge > 18) errors.push('Минимальный возраст — число от 0 до 18 лет.');
  if (e.videoUrl !== undefined && !/^https?:\/\/\S+$/.test(e.videoUrl)) {
    errors.push('Ссылка на видео должна начинаться с http:// или https://.');
  }
  for (const d of DIFFICULTIES) {
    const v = e.variants.find((x) => x.difficulty === d);
    const name = `Вариант «${DIFFICULTY_LABELS[d].toLowerCase()}»`;
    if (!v || !v.instructions.trim()) {
      errors.push(`${name}: напишите, как выполнять.`);
      continue;
    }
    if (!isCount(v.sets)) errors.push(`${name}: число подходов — целое, от 1.`);
    if (v.reps !== undefined && !isCount(v.reps)) errors.push(`${name}: число повторов — целое, от 1.`);
    if (v.durationSec !== undefined && !isCount(v.durationSec)) errors.push(`${name}: длительность — целое число секунд, от 1.`);
  }
  return errors;
}

// ---------- Шаблон занятия ----------

/**
 * Занятие, собранное администратором по шаблону: разминка, основная часть и заминка
 * (сколько упражнений в каждой части — как в занятии, которое приложение подбирает само).
 */
export interface WorkoutTemplate {
  id: string;
  title: string;
  /** Для какой группы детей составлено. */
  level: FunctionalLevel;
  /** Пояснение для родителя: когда и как выполнять. Необязательно. */
  note?: string;
  items: PlannedExercise[];
  createdAt: string; // ISO
}

/** Сколько упражнений в каждой части занятия. */
export const WORKOUT_STRUCTURE: { part: WorkoutPart; count: number }[] = PARTS.map((part) => ({ part, count: PART_COUNTS[part] }));

export function blankWorkout(id: string, level: FunctionalLevel, now: Date = new Date()): WorkoutTemplate {
  return { id, title: '', level, items: [], createdAt: now.toISOString() };
}

/** Упражнения, которые можно поставить в часть занятия для данной группы. */
export function exercisesForSlot(part: WorkoutPart, level: FunctionalLevel, catalog: Exercise[]): Exercise[] {
  return catalog.filter((e) => e.part === part && e.levels.includes(level));
}

/** После смены группы убирает упражнения, которые ей не подходят. */
export function keepSuitable(items: PlannedExercise[], level: FunctionalLevel, catalog: Exercise[]): PlannedExercise[] {
  return items.filter((i) => catalog.some((e) => e.id === i.exerciseId && e.levels.includes(level)));
}

export function validateWorkout(w: WorkoutTemplate, catalog: Exercise[]): string[] {
  const errors: string[] = [];
  if (!w.title.trim()) errors.push('Напишите название занятия.');
  const found = w.items.map((i) => catalog.find((e) => e.id === i.exerciseId));
  if (found.some((e) => !e)) errors.push('В занятии есть упражнение, которого больше нет в каталоге, — уберите его.');
  if (new Set(w.items.map((i) => i.exerciseId)).size !== w.items.length) errors.push('Одно упражнение добавлено дважды.');
  const exercises = found.filter((e): e is Exercise => !!e);
  const wrongLevel = exercises.filter((e) => !e.levels.includes(w.level));
  if (wrongLevel.length > 0) errors.push(`Не подходят выбранной группе: ${wrongLevel.map((e) => e.title).join(', ')}.`);
  for (const { part, count } of WORKOUT_STRUCTURE) {
    const n = exercises.filter((e) => e.part === part).length;
    if (n > count) errors.push(`${PART_LABELS[part]}: не больше ${count} упр., сейчас ${n}.`);
    if (part === 'main' && n === 0) errors.push('Добавьте хотя бы одно упражнение в основную часть.');
  }
  return errors;
}

export interface WorkoutFit {
  /** С какого возраста подходит занятие целиком. */
  minAge: number;
  /** Что ребёнок должен уметь, чтобы выполнить все упражнения. */
  requires: Capability[];
  /** Риски упражнений: детям с такими противопоказаниями занятие целиком не подходит. */
  risks: ExerciseRisk[];
}

/**
 * Кому подходит занятие целиком. Когда приложение подбирает занятие само, оно проверяет каждое упражнение
 * под конкретного ребёнка; в занятии, собранном вручную, этой проверки нет — поэтому ограничения показываем явно.
 */
export function workoutFit(items: PlannedExercise[], catalog: Exercise[]): WorkoutFit {
  const exercises = items.map((i) => catalog.find((e) => e.id === i.exerciseId)).filter((e): e is Exercise => !!e);
  return {
    minAge: Math.max(0, ...exercises.map((e) => e.minAge)),
    requires: [...new Set(exercises.flatMap((e) => e.requires))],
    risks: [...new Set(exercises.flatMap((e) => e.risks))],
  };
}
