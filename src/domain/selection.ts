import { EXERCISES, TRACKING_TESTS } from './exercises';
import { dayKey } from './profile';
import type {
  ChildProfile,
  Exercise,
  FunctionalAssessment,
  Goal,
  PlannedExercise,
  ProgressMap,
  SessionLog,
  TrackingTest,
  WorkoutPart,
  WorkoutPlan,
} from './types';

/** Сколько занятий в неделю рекомендуем (простое недельное «планирование»). */
export const TARGET_SESSIONS_PER_WEEK = 3;

export const PART_COUNTS: Record<WorkoutPart, number> = { warmup: 1, main: 3, cooldown: 1 };

/** Упражнения, подходящие ребёнку: уровень, возраст, возможности, противопоказания. */
export function eligibleExercises(
  child: Pick<ChildProfile, 'ageYears'>,
  assessment: FunctionalAssessment,
  catalog: Exercise[] = EXERCISES,
): Exercise[] {
  return catalog.filter(
    (e) =>
      e.levels.includes(assessment.level) &&
      child.ageYears >= e.minAge &&
      e.requires.every((c) => assessment.capabilities.includes(c)) &&
      !e.risks.some((r) => assessment.excludedRisks.includes(r)),
  );
}

function lastDoneMap(history: SessionLog[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of history) {
    const t = new Date(s.date).getTime();
    for (const item of s.items) map[item.exerciseId] = Math.max(map[item.exerciseId] ?? 0, t);
  }
  return map;
}

/**
 * Выбор упражнений для части занятия: сначала те, что давно (или никогда) не делали,
 * при этом стараемся покрыть разные цели (сила, равновесие, ...).
 */
function pick(pool: Exercise[], count: number, lastDone: Record<string, number>): Exercise[] {
  const sorted = [...pool].sort(
    (a, b) => (lastDone[a.id] ?? 0) - (lastDone[b.id] ?? 0) || a.id.localeCompare(b.id),
  );
  const chosen: Exercise[] = [];
  const goals = new Set<Goal>();
  // Первый проход — новые цели, второй — добираем оставшиеся.
  for (const e of sorted) {
    if (chosen.length >= count) break;
    if (e.goals.some((g) => !goals.has(g))) {
      chosen.push(e);
      e.goals.forEach((g) => goals.add(g));
    }
  }
  for (const e of sorted) {
    if (chosen.length >= count) break;
    if (!chosen.includes(e)) chosen.push(e);
  }
  return chosen;
}

/** «Сегодня рекомендуется выполнить эту тренировку». */
export function buildTodayWorkout(
  child: Pick<ChildProfile, 'ageYears'> & Partial<Pick<ChildProfile, 'doctorClearanceConfirmed'>>,
  assessment: FunctionalAssessment,
  progress: ProgressMap,
  history: SessionLog[],
  today: Date = new Date(),
  catalog: Exercise[] = EXERCISES,
): WorkoutPlan {
  // Гейт допуска врача действует и в подборе, а не только в UI (`workoutBlock`):
  // без подтверждённого допуска план пустой. Это защита на случай переноса подбора
  // на сервер (Этап 5), где UI-гейта не будет. UI и так показывает экран допуска
  // раньше, поэтому на текущее поведение приложения это не влияет.
  if (assessment.clearanceRequired && !child.doctorClearanceConfirmed) {
    return { date: dayKey(today), items: [] };
  }
  const eligible = eligibleExercises(child, assessment, catalog);
  const lastDone = lastDoneMap(history);
  const items: PlannedExercise[] = [];
  (['warmup', 'main', 'cooldown'] as WorkoutPart[]).forEach((part) => {
    pick(
      eligible.filter((e) => e.part === part),
      PART_COUNTS[part],
      lastDone,
    ).forEach((e) => items.push({ exerciseId: e.id, difficulty: progress[e.id]?.difficulty ?? 1 }));
  });
  return { date: dayKey(today), items };
}

export type DayStatus =
  | { kind: 'done_today' }
  | { kind: 'recommended'; doneThisWeek: number; target: number }
  | { kind: 'rest_suggested'; doneThisWeek: number; target: number };

/** Простая недельная логика: цель — N занятий за последние 7 дней, через день, не чаще одного в день. */
export function dayStatus(history: SessionLog[], today: Date = new Date()): DayStatus {
  // Дни считаем по местному времени устройства: занятие в час ночи — это уже «сегодня».
  const sessionDay = (s: SessionLog) => dayKey(new Date(s.date));
  const todayKey = dayKey(today);
  if (history.some((s) => sessionDay(s) === todayKey)) return { kind: 'done_today' };
  const weekAgo = today.getTime() - 7 * 24 * 3600 * 1000;
  const doneThisWeek = history.filter((s) => new Date(s.date).getTime() > weekAgo).length;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const doneYesterday = history.some((s) => sessionDay(s) === yesterdayKey);
  // Цель недели выполнена или занимались вчера — предлагаем отдых (но занятие всё равно доступно).
  if (doneThisWeek >= TARGET_SESSIONS_PER_WEEK || doneYesterday) {
    return { kind: 'rest_suggested', doneThisWeek, target: TARGET_SESSIONS_PER_WEEK };
  }
  return { kind: 'recommended', doneThisWeek, target: TARGET_SESSIONS_PER_WEEK };
}

/** 1–2 теста динамики, подходящие ребёнку. */
export function trackingTestsFor(assessment: FunctionalAssessment): TrackingTest[] {
  return TRACKING_TESTS.filter(
    (t) => t.levels.includes(assessment.level) && t.requires.every((c) => assessment.capabilities.includes(c)),
  ).slice(0, 2);
}
