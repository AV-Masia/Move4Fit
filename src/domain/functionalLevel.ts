import { CLEARANCE_FLAGS, FLAG_EXCLUSIONS, SAFETY_QUESTIONS, isSafetyAnswer, walkMotorItems } from './questionnaire';
import type {
  AssessmentAnswers,
  Capability,
  ChildProfile,
  ExerciseRisk,
  FunctionalAssessment,
  FunctionalLevel,
  SafetyFlag,
} from './types';

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Возможности по тесту из 5 пунктов. Ответы неверного вида считаются пустыми. */
export function capabilitiesFromAnswers(answers: AssessmentAnswers | undefined): Capability[] {
  const motor = isRecord(answers) && isRecord(answers.motor) ? (answers.motor as Record<string, string>) : {};
  return walkMotorItems(motor).capabilities;
}

/**
 * Определение внутреннего функционального уровня (по мотивам GMFCS).
 *
 * ⚠️ ЧЕРНОВИК — упрощённые правила, требуют проверки реабилитологом.
 * GMFCS описывает уровни по возрастным группам (<2, 2–4, 4–6, 6–12, 12–18 лет);
 * здесь используется упрощение, а для детей младше 4 лет снижаются требования к уровню 1.
 */
export function determineLevel(caps: Capability[], ageYears: number): FunctionalLevel {
  const has = (c: Capability) => caps.includes(c);

  if (has('walk_independent')) {
    const level1 =
      ageYears < 4
        ? true // в раннем возрасте самостоятельная ходьба уже соответствует уровню I
        : has('walk_outdoors') && has('stairs_no_rail') && has('run_jump');
    return level1 ? 1 : 2;
  }
  if (has('walk_with_device')) return 3;
  if (has('sit_independent') || (has('head_control') && has('sit_with_support'))) return 4;
  return 5;
}

/**
 * Уровень, по которому подбираются занятия.
 * ⚠️ ЧЕРНОВИК: если врач называл уровень GMFCS, берётся более осторожный из двух — тот, где
 * возможностей меньше (большее число). Уровень от врача не может сделать занятия сложнее, чем по тесту.
 */
export function effectiveLevel(computed: FunctionalLevel, reported?: FunctionalLevel): FunctionalLevel {
  return reported && reported > computed ? reported : computed;
}

/** При таком расхождении уровня от врача и теста просим родителя перепроверить ответы. */
export const LEVEL_GAP_WARNING = 2;

/** На сколько ступеней расходятся уровень от врача и уровень по тесту; 0 — врач уровень не называл. */
export function levelGap(a: Pick<FunctionalAssessment, 'computedLevel' | 'gmfcsReported'>): number {
  return a.gmfcsReported ? Math.abs(a.gmfcsReported - a.computedLevel) : 0;
}

const flagsWithAnswer = (answers: AssessmentAnswers | undefined, wanted: 'yes' | 'unknown'): SafetyFlag[] => {
  const safety = isRecord(answers) && isRecord(answers.safety) ? answers.safety : {};
  return SAFETY_QUESTIONS.filter((q) => {
    const value = safety[q.id];
    if (!isSafetyAnswer(value)) return false;
    // «Не знаю» принимается только там, где такой ответ предусмотрен.
    return wanted === 'unknown' ? value === 'unknown' && !!q.allowUnknown : value === 'yes';
  }).map((q) => q.flag);
};

/** Ограничения, на которые родитель ответил «да». */
export function safetyFlagsFromAnswers(answers: AssessmentAnswers | undefined): SafetyFlag[] {
  return flagsWithAnswer(answers, 'yes');
}

/** Ограничения с ответом «не знаю»: упражнения исключаются, пока родитель не уточнит у врача. */
export function unsureFlagsFromAnswers(answers: AssessmentAnswers | undefined): SafetyFlag[] {
  return flagsWithAnswer(answers, 'unknown');
}

export function excludedRisks(flags: SafetyFlag[]): ExerciseRisk[] {
  const set = new Set<ExerciseRisk>();
  for (const f of flags) FLAG_EXCLUSIONS[f]?.forEach((r) => set.add(r));
  return [...set];
}

export function assess(
  child: Pick<ChildProfile, 'id' | 'ageYears'>,
  answers: AssessmentAnswers,
  gmfcsReported?: FunctionalLevel,
  now: Date = new Date(),
): FunctionalAssessment {
  const capabilities = capabilitiesFromAnswers(answers);
  const safetyFlags = safetyFlagsFromAnswers(answers);
  const unsureFlags = unsureFlagsFromAnswers(answers);
  const computedLevel = determineLevel(capabilities, child.ageYears);
  return {
    childId: child.id,
    date: now.toISOString(),
    answers,
    capabilities,
    computedLevel,
    gmfcsReported,
    level: effectiveLevel(computedLevel, gmfcsReported),
    safetyFlags,
    unsureFlags,
    excludedRisks: excludedRisks([...safetyFlags, ...unsureFlags]),
    // Разрешение врача нужно только при ответе «да»: «не знаю» у блокирующих вопросов не бывает.
    clearanceRequired: safetyFlags.some((f) => CLEARANCE_FLAGS.includes(f)),
  };
}

/** Описание уровня для родителя — без медицинских терминов. */
export const LEVEL_DESCRIPTIONS: Record<FunctionalLevel, { title: string; text: string }> = {
  1: {
    title: 'Активный',
    text: 'Ребёнок уверенно ходит, поднимается по лестнице и пробует бегать. Будем развивать равновесие, скорость и координацию.',
  },
  2: {
    title: 'Ходит самостоятельно',
    text: 'Ребёнок ходит сам, но на лестнице и неровной поверхности ему нужна опора. Будем укреплять ноги и тренировать равновесие.',
  },
  3: {
    title: 'Ходит с опорой',
    text: 'Ребёнок ходит с ходунками или за руку. Будем укреплять корпус и ноги и учиться стоять увереннее.',
  },
  4: {
    title: 'Сидит',
    text: 'Ребёнок сидит сам или с небольшой поддержкой. Будем тренировать удержание корпуса, руки и переходы между положениями.',
  },
  5: {
    title: 'Нужна поддержка',
    text: 'Ребёнку нужна поддержка головы и корпуса. Будем мягко работать над контролем головы, дыханием и подвижностью суставов вместе со взрослым.',
  },
};
