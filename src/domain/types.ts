/**
 * Модель данных Move4Fit.
 *
 * Цепочка алгоритма:
 * возраст → ограничения и противопоказания → функциональные возможности (тест из 5 пунктов, GMFCS) →
 * функциональный уровень → подходящие упражнения → уровень сложности → прогрессия.
 *
 * Диагноз в профиле не хранится: подбор идёт по тому, что ребёнок умеет, и по запретам врача.
 */

// ---------- Ребёнок ----------

export interface ChildProfile {
  id: string;
  name: string;
  ageYears: number;
  /** Когда родитель указал возраст (ISO). От этой даты возраст «растёт» сам, см. currentAgeYears. */
  ageSetAt?: string;
  /** Пол ребёнка — только для обращения. На оформление НЕ влияет: тема по умолчанию
   * нейтральна (см. defaultTheme в kit.tsx; требование «не привязывать цвет к гендеру»). Необязателен. */
  sex?: 'girl' | 'boy';
  /** Родитель подтвердил, что врач разрешил занятия (нужно при «блокирующих» особенностях). */
  doctorClearanceConfirmed: boolean;
  createdAt: string; // ISO
}

// ---------- Функциональный профиль ----------

/**
 * Внутренний уровень, близкий к GMFCS I–V. Родителю этот термин не показывается —
 * он видит описание простыми словами.
 */
export type FunctionalLevel = 1 | 2 | 3 | 4 | 5;

/** Конкретные двигательные возможности ребёнка, которые выясняются вопросами. */
export type Capability =
  | 'head_control' // держит голову
  | 'sit_with_support' // сидит с поддержкой
  | 'sit_independent' // сидит сам, без опоры на руки
  | 'stand_with_support' // стоит у опоры
  | 'stand_independent' // стоит без опоры
  | 'walk_with_device' // ходит с ходунками/тростями
  | 'walk_independent' // ходит сам в помещении
  | 'walk_outdoors' // ходит сам на улице, по неровной поверхности
  | 'stairs_with_rail' // поднимается по лестнице с перилами
  | 'stairs_no_rail' // поднимается по лестнице без перил
  | 'run_jump'; // бегает, прыгает

/** Особенности здоровья, которые меняют набор упражнений или требуют разрешения врача. */
export type SafetyFlag =
  | 'uncontrolled_seizures' // неконтролируемые судороги/эпилепсия
  | 'recent_surgery' // операция за последние 6 месяцев
  | 'recent_botulinum' // ботулинотерапия за последний месяц
  | 'hip_instability' // подвывих/вывих тазобедренного сустава
  | 'shunt' // шунт
  | 'fragile_bones' // хрупкость костей, переломы в анамнезе
  | 'heart_condition' // заболевание сердца
  | 'neck_instability' // врач запрещал кувырки и наклоны вниз головой (нестабильность шеи)
  | 'no_impact' // врач запрещал прыжки и спрыгивания
  | 'other_restriction'; // другие запреты врача, которых нет в списке

/** Ответ на вопрос об ограничении. «Не знаю» есть только у вопросов, где родитель может не знать мнение врача. */
export type SafetyAnswer = 'yes' | 'no' | 'unknown';

/** Ответы анкеты: тест движений (пункт → выбранный вариант) и вопросы об ограничениях. */
export interface AssessmentAnswers {
  motor: Record<string, string>;
  safety: Record<string, SafetyAnswer>;
}

export interface FunctionalAssessment {
  childId: string;
  date: string; // ISO
  answers: AssessmentAnswers;
  capabilities: Capability[];
  /** Уровень по тесту из 5 пунктов. */
  computedLevel: FunctionalLevel;
  /** Уровень GMFCS, который родителю назвал врач. Пусто — не называл или родитель не помнит. */
  gmfcsReported?: FunctionalLevel;
  /** Уровень, по которому подбираются занятия: более осторожный из двух (см. effectiveLevel). */
  level: FunctionalLevel;
  /** Ограничения, на которые родитель ответил «да». */
  safetyFlags: SafetyFlag[];
  /** Ограничения с ответом «не знаю»: упражнения исключаются, пока родитель не уточнит у врача. */
  unsureFlags: SafetyFlag[];
  /** Какие риски упражнений исключены (по ограничениям, включая «не знаю»). */
  excludedRisks: ExerciseRisk[];
  /** Нужно разрешение врача, прежде чем показывать тренировки. */
  clearanceRequired: boolean;
}

// ---------- Упражнения ----------

export type Position = 'lying' | 'sitting' | 'kneeling' | 'standing';
export type Goal = 'strength' | 'balance' | 'flexibility' | 'coordination' | 'endurance';
export type WorkoutPart = 'warmup' | 'main' | 'cooldown';

/** Характеристики упражнения, которые могут быть противопоказаны. */
export type ExerciseRisk =
  | 'impact' // прыжки, удары
  | 'hip_loading' // нагрузка на тазобедренный сустав в крайних положениях
  | 'head_down' // положение вниз головой
  | 'neck_flexion' // сильное сгибание шеи (кувырки)
  | 'breath_holding' // натуживание
  | 'high_intensity'; // высокая интенсивность

export type Difficulty = 1 | 2 | 3;

export interface ExerciseVariant {
  difficulty: Difficulty;
  instructions: string;
  sets: number;
  reps?: number;
  durationSec?: number;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  part: WorkoutPart;
  goals: Goal[];
  position: Position;
  /** Все перечисленные возможности должны быть у ребёнка. */
  requires: Capability[];
  /** Для каких функциональных уровней подходит. */
  levels: FunctionalLevel[];
  minAge: number;
  risks: ExerciseRisk[];
  variants: ExerciseVariant[];
  /** Ссылка на видео (собственная съёмка проекта). */
  videoUrl?: string;
  equipment?: string[];
}

// ---------- Занятия и прогрессия ----------

export type Feedback = 'easy' | 'ok' | 'hard';

export interface PlannedExercise {
  exerciseId: string;
  difficulty: Difficulty;
}

export interface WorkoutPlan {
  date: string; // ISO day
  items: PlannedExercise[];
}

/** Самочувствие ребёнка после занятия: полон сил / нормально / устал. */
export type Fatigue = 'fresh' | 'ok' | 'tired';

/** Что ребёнок хочет дальше: ещё / на сегодня хватит / было слишком много. */
export type WhatNext = 'more' | 'done' | 'tooMuch';

export interface SessionLog {
  id: string;
  childId: string;
  date: string; // ISO
  items: PlannedExercise[];
  /** Общий отзыв о занятии. */
  feedback: Feedback;
  /** Отзыв по отдельным упражнениям, если родитель его уточнил; иначе действует общий. */
  itemFeedback?: Record<string, Feedback>;
  pain: boolean;
  /** Усталость после занятия; у старых занятий не задана. */
  fatigue?: Fatigue;
  /** «Что дальше» по мнению ребёнка; у старых занятий не задано. */
  whatNext?: WhatNext;
  /** Что заметил родитель (id из PAIN_SIGNS) и где, если понятно (id из PAIN_AREAS). */
  painSigns?: string[];
  painArea?: string;
  /** Сколько длилось занятие по секундомеру, секунд. */
  durationSec?: number;
  note?: string;
}

// ---------- Цель семьи ----------

/** Оценка продвижения к цели: от −2 «стало труднее» до +2 «лучше, чем ждали». */
export type GoalRating = -2 | -1 | 0 | 1 | 2;

export interface GoalReview {
  date: string; // ISO
  rating: GoalRating;
}

export interface FamilyGoal {
  id: string;
  text: string;
  /** id готовой цели из списка, если выбрана она, а не написана своя. */
  presetId?: string;
  setAt: string; // ISO
  reviews: GoalReview[];
}

export interface ExerciseProgress {
  difficulty: Difficulty;
  /** Сколько занятий подряд упражнение было «легко». */
  easyStreak: number;
}

export type ProgressMap = Record<string, ExerciseProgress>;

/** Отдельно сделанное упражнение — вне занятия, из карточки упражнения. */
export interface PracticeLog {
  id: string;
  exerciseId: string;
  difficulty: Difficulty;
  date: string; // ISO
  /** Как далось упражнение. */
  feedback?: Feedback;
  /** Сколько длилась тренировка по секундомеру, секунд. */
  durationSec?: number;
}

// ---------- Тесты динамики ----------

export interface TrackingTest {
  id: string;
  title: string;
  instructions: string;
  unit: string;
  levels: FunctionalLevel[];
  requires: Capability[];
  higherIsBetter: boolean;
}

export interface TrackingResult {
  id: string;
  childId: string;
  testId: string;
  date: string;
  value: number;
}
