import { CLEARANCE_FLAGS } from './questionnaire';
import type { Difficulty, FunctionalAssessment, PracticeLog, ProgressMap, SessionLog } from './types';

/** День по местному времени устройства (а не по Гринвичу): «сегодня» родителя, а не сервера. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
};

/** Возраст хранится в годах дробным числом (годы + месяцы / 12). */
export function ageFromParts(years: number, months: number): number {
  return years + months / 12;
}

export function agePartsOf(ageYears: number): { years: number; months: number } {
  const total = Math.round(ageYears * 12);
  return { years: Math.floor(total / 12), months: total % 12 };
}

/**
 * Возраст ребёнка на сегодня: указанный родителем плюс полные месяцы, прошедшие с тех пор.
 * Без этого возраст навсегда оставался бы таким, каким его ввели при регистрации,
 * и упражнения с минимальным возрастом никогда бы не открылись.
 * Если дата ввода неизвестна (старые записи), возраст не меняется.
 */
export function currentAgeYears(child: { ageYears: number; ageSetAt?: string }, today: Date = new Date()): number {
  if (!child.ageSetAt) return child.ageYears;
  const from = new Date(child.ageSetAt);
  if (Number.isNaN(from.getTime())) return child.ageYears;
  const months =
    (today.getFullYear() - from.getFullYear()) * 12 +
    (today.getMonth() - from.getMonth()) -
    (today.getDate() < from.getDate() ? 1 : 0);
  return months > 0 ? child.ageYears + months / 12 : child.ageYears;
}

/** «2 года 3 месяца», «7 лет», «8 месяцев». */
export function formatAge(ageYears: number): string {
  const { years, months } = agePartsOf(ageYears);
  const y = years > 0 ? `${years} ${plural(years, 'год', 'года', 'лет')}` : '';
  const m = months > 0 ? `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}` : '';
  return [y, m].filter(Boolean).join(' ') || 'меньше месяца';
}

/**
 * Нужно ли заново спросить разрешение врача после повторной анкеты.
 * ⚠️ ЧЕРНОВИК: разрешение относится к конкретным особенностям. Если появилась новая особенность,
 * требующая разрешения (или анкета проходится впервые), прежнее подтверждение не действует.
 */
export function needsNewClearance(prev: FunctionalAssessment | undefined, next: FunctionalAssessment): boolean {
  if (!next.clearanceRequired) return false;
  const before = new Set(prev?.safetyFlags.filter((f) => CLEARANCE_FLAGS.includes(f)) ?? []);
  return next.safetyFlags.some((f) => CLEARANCE_FLAGS.includes(f) && !before.has(f));
}

/**
 * Пауза после боли: если на последнем занятии отметили боль или сильный дискомфорт,
 * следующее занятие не предлагается, пока родитель не подтвердит, что с ребёнком всё в порядке.
 * ⚠️ ЧЕРНОВИК: правило возобновления занятий должен утвердить специалист.
 */
export function isPainHold(sessions: SessionLog[], acknowledgedSessionId?: string): boolean {
  const last = sessions[sessions.length - 1];
  return !!last && last.pain && last.id !== acknowledgedSessionId;
}

/** Почему сейчас нельзя начинать занятие или отдельное упражнение. */
export type WorkoutBlock = 'clearance' | 'pain_hold' | 'break_check' | 'rules';

export interface WorkoutGateInput {
  child: { doctorClearanceConfirmed: boolean };
  assessment: { clearanceRequired: boolean };
  sessions: SessionLog[];
  painAcknowledgedSessionId?: string;
  breakHandledSessionId?: string;
  rulesAcceptedAt?: string;
}

/**
 * Единая проверка перед любым занятием: разрешение врача → пауза после боли → вопрос о перерыве → правила.
 * Нужна на самих экранах занятия и упражнения, а не только на главном: их можно открыть напрямую
 * (по адресу в браузере, после обновления страницы), минуя главный экран.
 */
export function workoutBlock(input: WorkoutGateInput, today: Date = new Date()): WorkoutBlock | null {
  if (input.assessment.clearanceRequired && !input.child.doctorClearanceConfirmed) return 'clearance';
  if (isPainHold(input.sessions, input.painAcknowledgedSessionId)) return 'pain_hold';
  if (needsBreakCheck(input.sessions, input.breakHandledSessionId, today)) return 'break_check';
  if (!input.rulesAcceptedAt) return 'rules';
  return null;
}

export const WORKOUT_BLOCK_TEXT: Record<WorkoutBlock, string> = {
  clearance: 'Занятия откроются после того, как вы подтвердите разрешение врача.',
  pain_hold: 'На прошлом занятии вы отметили боль. Занятия на паузе, пока вы не подтвердите на главном экране, что ребёнку лучше.',
  break_check: 'Вы давно не занимались. Сначала ответьте на главном экране, что было причиной перерыва, — от этого зависит нагрузка.',
  rules: 'Перед первым занятием прочитайте и примите правила занятий.',
};

export interface ActivityStats {
  total: number;
  /** Занятий за последние 7 дней. */
  thisWeek: number;
  /** Сколько недель подряд (считая текущую) было хотя бы одно занятие. */
  weeksInRow: number;
  firstDate?: string;
}

/** Простая статистика без баллов и наград. */
export function activityStats(sessions: SessionLog[], today: Date = new Date()): ActivityStats {
  const week = 7 * 24 * 3600 * 1000;
  const now = today.getTime();
  const times = sessions.map((s) => new Date(s.date).getTime());
  const inWindow = (i: number) => times.some((t) => t > now - week * (i + 1) && t <= now - week * i);
  let weeksInRow = 0;
  while (inWindow(weeksInRow)) weeksInRow++;
  return {
    total: sessions.length,
    thisWeek: times.filter((t) => t > now - week).length,
    weeksInRow,
    firstDate: sessions[0]?.date,
  };
}

// ---------- Неделя ----------

export interface WeekDay {
  label: string;
  /** В этот день было занятие целиком. */
  done: boolean;
  /** Занятия не было, но делали отдельные упражнения. */
  practiced: boolean;
  /** Сколько отдельных упражнений сделано в этот день (в том числе в день с занятием). */
  extra: number;
  isToday: boolean;
  isFuture: boolean;
}

const WEEK_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Текущая календарная неделя (с понедельника): в какие дни были занятия. */
export function weekDays(sessions: SessionLog[], today: Date = new Date(), practices: PracticeLog[] = []): WeekDay[] {
  const done = new Set(sessions.map((s) => dayKey(new Date(s.date))));
  const extra = new Map<string, number>();
  for (const p of practices) {
    const k = dayKey(new Date(p.date));
    extra.set(k, (extra.get(k) ?? 0) + 1);
  }
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const todayKey = dayKey(today);
  return WEEK_LABELS.map((label, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = dayKey(d);
    return {
      label,
      done: done.has(key),
      practiced: !done.has(key) && extra.has(key),
      extra: extra.get(key) ?? 0,
      isToday: key === todayKey,
      isFuture: key > todayKey,
    };
  });
}

/** Примерная длительность занятия: около трёх минут на упражнение. */
export function estimateMinutes(exerciseCount: number): number {
  return exerciseCount * 3;
}

// ---------- Перерыв в занятиях ----------

/** После какого перерыва (в днях) спрашиваем о причине, прежде чем продолжать. */
export const BREAK_DAYS = 7;

export type BreakReason = 'illness' | 'pause' | 'with_specialist';

/** ⚠️ ЧЕРНОВИК: формулировки и правило для каждой причины должен утвердить специалист. */
export const BREAK_REASONS: { value: BreakReason; label: string }[] = [
  { value: 'illness', label: 'Ребёнок болел' },
  { value: 'pause', label: 'Просто был перерыв' },
  { value: 'with_specialist', label: 'Занимались со специалистом или в центре' },
];

export function needsBreakCheck(sessions: SessionLog[], handledSessionId?: string, today: Date = new Date()): boolean {
  const last = sessions[sessions.length - 1];
  if (!last || last.id === handledSessionId) return false;
  return today.getTime() - new Date(last.date).getTime() > BREAK_DAYS * 24 * 3600 * 1000;
}

/**
 * Что делаем с нагрузкой после перерыва.
 * ⚠️ ЧЕРНОВИК: болел или просто пауза — все упражнения на шаг проще; занимались со специалистом — без изменений.
 */
export function applyBreak(progress: ProgressMap, reason: BreakReason): ProgressMap {
  if (reason === 'with_specialist') return progress;
  const next: ProgressMap = {};
  for (const [id, p] of Object.entries(progress)) {
    next[id] = { difficulty: Math.max(1, p.difficulty - 1) as Difficulty, easyStreak: 0 };
  }
  return next;
}

// ---------- Признаки боли ----------

/**
 * Родитель неговорящего ребёнка часто не знает, «где болит», но видит признаки.
 * ⚠️ ЧЕРНОВИК: список признаков должен утвердить специалист.
 */
export const PAIN_SIGNS: { id: string; label: string }[] = [
  { id: 'cry', label: 'Плакал или кричал' },
  { id: 'grimace', label: 'Морщился, менялся в лице' },
  { id: 'tense', label: 'Напрягался или выгибался' },
  { id: 'withdraw', label: 'Отдёргивал руку или ногу' },
  { id: 'told', label: 'Сам сказал или показал, что больно' },
];

export const PAIN_AREAS: { id: string; label: string }[] = [
  { id: 'legs', label: 'Ноги' },
  { id: 'back', label: 'Спина' },
  { id: 'arms', label: 'Руки' },
  { id: 'neck', label: 'Шея' },
  { id: 'unknown', label: 'Не удалось понять' },
];

// ---------- Графики ----------

export interface WeekCount {
  /** Понедельник недели, например «9.11». */
  label: string;
  count: number;
}

/** Сколько занятий было в каждую из последних календарных недель (с понедельника), от старых к новым. */
export function sessionsByWeek(sessions: SessionLog[], weeks = 6, today: Date = new Date()): WeekCount[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const result: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const count = sessions.filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= from.getTime() && t < to.getTime();
    }).length;
    result.push({ label: `${from.getDate()}.${from.getMonth() + 1}`, count });
  }
  return result;
}
