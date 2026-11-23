import { determineLevel, excludedRisks, capabilitiesFromAnswers, safetyFlagsFromAnswers, unsureFlagsFromAnswers } from './functionalLevel';
import { CLEARANCE_FLAGS, SAFETY_QUESTIONS, isSafetyAnswer, motorAnswersFromCapabilities } from './questionnaire';
import type { AssessmentAnswers, Capability, FunctionalLevel, SafetyAnswer } from './types';

/**
 * Чтение сохранённого состояния приложения.
 *
 * Сохранённая строка может оказаться испорченной (обрыв записи, ручная правка, старая версия).
 * Раньше в таком случае приложение молча начинало с пустого состояния и тут же записывало его
 * поверх прежних данных — история занятий терялась без следа. Теперь испорченные данные
 * распознаются, а вызывающий код сохраняет их копию, прежде чем что-либо перезаписывать.
 */
export interface RestoredState {
  /** Разобранное состояние; null — сохранения не было или его нельзя прочитать. */
  data: Record<string, unknown> | null;
  /** Строка была, но прочитать её (целиком или частично) не удалось. */
  corrupt: boolean;
}

const ARRAY_KEYS = ['sessions', 'trackingResults', 'pastGoals', 'readArticles', 'practices', 'chat'];
const OBJECT_KEYS = ['user', 'child', 'assessment', 'progress', 'goal'];

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function restoreState(raw: string | null | undefined): RestoredState {
  if (!raw) return { data: null, corrupt: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: null, corrupt: true };
  }
  if (!isPlainObject(parsed)) return { data: null, corrupt: true };

  // Поля неверного вида отбрасываем (вместо них подставятся значения по умолчанию), остальное сохраняем.
  const data: Record<string, unknown> = { ...parsed };
  let corrupt = false;
  for (const key of ARRAY_KEYS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      delete data[key];
      corrupt = true;
    }
  }
  for (const key of OBJECT_KEYS) {
    if (data[key] !== undefined && data[key] !== null && !isPlainObject(data[key])) {
      delete data[key];
      corrupt = true;
    }
    if (data[key] === null) delete data[key];
  }
  // Перевод данных прежних версий. Если он не удался, оценку не оставляем в старом виде: родитель
  // пройдёт вопросы заново, а копию прежних данных вызывающий код отложит (corrupt = true).
  try {
    return { data: migrateState(data), corrupt };
  } catch {
    const { assessment: _dropped, ...rest } = data;
    return { data: stripDiagnosis(rest).data, corrupt: true };
  }
}

// ---------- Перевод данных прежних версий ----------

/** Какое ограничение раньше следовало из диагноза само собой. */
const DIAGNOSIS_CARRY_OVER: Record<string, string> = {
  down_syndrome: 's_neck',
  spina_bifida: 's_impact',
};

/** Убирает диагноз из профиля ребёнка. Возвращает вопрос об ограничении, которое раньше из него следовало. */
function stripDiagnosis(data: Record<string, unknown>): { data: Record<string, unknown>; carryOver?: string; had: boolean } {
  if (!isPlainObject(data.child)) return { data, had: false };
  const { diagnosis, diagnosisNote, ...child } = data.child;
  const had = diagnosis !== undefined || diagnosisNote !== undefined;
  if (!had) return { data, had };
  const carryOver = typeof diagnosis === 'string' ? DIAGNOSIS_CARRY_OVER[diagnosis] : undefined;
  return { data: { ...data, child }, carryOver, had };
}

const isLevel = (x: unknown): x is FunctionalLevel => x === 1 || x === 2 || x === 3 || x === 4 || x === 5;

/**
 * Переводит сохранённые данные в текущий вид. Чистая функция; повторный вызов ничего не меняет.
 *
 * 1. Диагноз и уточнение к нему удаляются из профиля: они больше не хранятся.
 * 2. Ответы прежней анкеты (11 вопросов «да/нет») переводятся в тест из 5 пунктов. Группа занятий
 *    остаётся прежней — её не пересчитываем, чтобы программа не поменялась без участия родителя.
 * 3. Исключения, которые раньше следовали из диагноза, сохраняются как ответ «не знаю» на новый вопрос
 *    о запрете врача: упражнения остаются исключёнными, но родителю не приписывается ответ «да».
 */
export function migrateState(input: Record<string, unknown>): Record<string, unknown> {
  const { data: stripped, carryOver, had } = stripDiagnosis(input);
  const data: Record<string, unknown> = { ...stripped };
  // Родителю один раз объясняем, что изменилось, и просим ответить на новые вопросы.
  if (had) data.profileNotice = 'profile_updated';

  const a = data.assessment;
  if (!isPlainObject(a)) return data;

  const stored = isPlainObject(a.answers) ? a.answers : {};
  const current = isPlainObject(stored.motor) && isPlainObject(stored.safety);
  if (current && !carryOver) return data;

  let answers: AssessmentAnswers;
  if (current) {
    answers = { motor: stored.motor as Record<string, string>, safety: { ...(stored.safety as Record<string, SafetyAnswer>) } };
  } else {
    const caps = (Array.isArray(a.capabilities) ? a.capabilities.filter((c) => typeof c === 'string') : []) as Capability[];
    const flags = Array.isArray(a.safetyFlags) ? a.safetyFlags : [];
    const safety: Record<string, SafetyAnswer> = {};
    for (const q of SAFETY_QUESTIONS) {
      const old = stored[q.id];
      if (old === true || flags.includes(q.flag)) safety[q.id] = 'yes';
      else if (old === false) safety[q.id] = 'no';
    }
    answers = { motor: motorAnswersFromCapabilities(caps), safety };
  }
  if (carryOver && !isSafetyAnswer(answers.safety[carryOver])) answers.safety[carryOver] = 'unknown';

  const capabilities = capabilitiesFromAnswers(answers);
  const safetyFlags = safetyFlagsFromAnswers(answers);
  const unsureFlags = unsureFlagsFromAnswers(answers);
  const age = isPlainObject(data.child) && typeof data.child.ageYears === 'number' ? data.child.ageYears : 0;
  const computedLevel = isLevel(a.computedLevel) ? a.computedLevel : isLevel(a.level) ? a.level : determineLevel(capabilities, age);

  data.assessment = {
    ...a,
    answers,
    capabilities,
    computedLevel,
    level: isLevel(a.level) ? a.level : computedLevel,
    safetyFlags,
    unsureFlags,
    excludedRisks: excludedRisks([...safetyFlags, ...unsureFlags]),
    clearanceRequired:
      typeof a.clearanceRequired === 'boolean' ? a.clearanceRequired : safetyFlags.some((f) => CLEARANCE_FLAGS.includes(f)),
  };
  return data;
}
