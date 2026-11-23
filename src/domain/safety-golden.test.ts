/**
 * GOLDEN-ТЕСТЫ БЕЗОПАСНОСТИ — снимок текущего поведения (baseline) перед переработкой подбора (Этап 4).
 *
 * Эти тесты НЕ утверждают, что правила медицински верны (они помечены ⚠️ ЧЕРНОВИК в коде).
 * Они фиксируют, что есть сейчас, чтобы переработка опросника/подбора не ослабила безопасность молча.
 * Если тест падает после изменений — это осознанное решение методиста, а не «обновить снимок».
 * Любая новая модель подбора (дерево доски) должна проходить их без правок.
 *
 * Где живёт логика: assess()/effectiveLevel()/levelGap() — functionalLevel.ts; CLEARANCE_FLAGS,
 * FLAG_EXCLUSIONS, SAFETY_QUESTIONS — questionnaire.ts; workoutBlock()/needsNewClearance() — profile.ts;
 * eligibleExercises()/buildTodayWorkout() — selection.ts.
 */
import { describe, expect, it } from 'vitest';

import { assess, effectiveLevel, LEVEL_GAP_WARNING, levelGap } from './functionalLevel';
import { needsNewClearance, workoutBlock, type WorkoutGateInput } from './profile';
import { CLEARANCE_FLAGS, FLAG_EXCLUSIONS, SAFETY_QUESTIONS } from './questionnaire';
import { buildTodayWorkout, eligibleExercises } from './selection';
import type { AssessmentAnswers, Exercise, ExerciseRisk, SafetyAnswer, SafetyFlag } from './types';

const answers = (motor: Record<string, string> = {}, yes: string[] = [], unknown: string[] = []): AssessmentAnswers => ({
  motor,
  safety: Object.fromEntries([
    ...yes.map((id) => [id, 'yes' as SafetyAnswer]),
    ...unknown.map((id) => [id, 'unknown' as SafetyAnswer]),
  ]),
});
/** Ходит сам на улице, по лестнице без перил, бегает и прыгает → уровень 1. */
const ACTIVE = { m_posture: 'sit_free', m_stand: 'free', m_walk: 'outdoor', m_stairs: 'free', m_run: 'yes' };
/** Сидит сам, стоит у опоры, ходит с ходунками → уровень 3. */
const WALKER = { m_posture: 'sit_free', m_stand: 'support', m_walk: 'device' };

const child = { id: 'c', ageYears: 8 };
const questionId = (flag: SafetyFlag) => SAFETY_QUESTIONS.find((q) => q.flag === flag)!.id;
const sorted = <T>(xs: T[]) => [...xs].sort();

/** Упражнение-«пробник» с одним риском: проверяет исключение по риску независимо от встроенного каталога. */
const probe = (risk: ExerciseRisk): Exercise => ({
  id: `probe_${risk}`, title: risk, description: '', part: 'main', goals: ['strength'], position: 'standing',
  requires: [], levels: [1, 2, 3, 4, 5], minAge: 0, risks: [risk],
  variants: [{ difficulty: 1, instructions: '', sets: 1 }],
});
const ALL_RISKS: ExerciseRisk[] = ['impact', 'hip_loading', 'head_down', 'neck_flexion', 'breath_holding', 'high_intensity'];
const PROBES = ALL_RISKS.map(probe);

describe('golden: таблицы правил безопасности (дословный снимок)', () => {
  it('флаги, требующие разрешения врача', () => {
    expect(sorted(CLEARANCE_FLAGS)).toEqual(sorted(['uncontrolled_seizures', 'recent_surgery', 'heart_condition', 'other_restriction']));
  });

  it('какие риски исключает каждый флаг', () => {
    expect(FLAG_EXCLUSIONS).toEqual({
      uncontrolled_seizures: ['high_intensity', 'breath_holding', 'head_down'],
      recent_surgery: ['impact', 'hip_loading', 'high_intensity'],
      recent_botulinum: ['high_intensity'],
      hip_instability: ['hip_loading', 'impact'],
      shunt: ['head_down', 'impact', 'neck_flexion'],
      fragile_bones: ['impact', 'hip_loading'],
      heart_condition: ['high_intensity', 'breath_holding'],
      neck_instability: ['neck_flexion', 'head_down'],
      no_impact: ['impact'],
      other_restriction: [],
    });
  });

  it('«не знаю» разрешено только у двух вопросов', () => {
    expect(SAFETY_QUESTIONS.filter((q) => q.allowUnknown).map((q) => q.flag)).toEqual(['neck_instability', 'no_impact']);
  });
});

describe('golden: допуск врача (clearanceRequired) и блокировка занятий', () => {
  it.each(CLEARANCE_FLAGS)('«да» по %s → clearanceRequired', (flag) => {
    const a = assess(child, answers(ACTIVE, [questionId(flag)]));
    expect(a.safetyFlags).toEqual([flag]);
    expect(a.clearanceRequired).toBe(true);
  });

  it('судороги не под контролем (uncontrolled_seizures) → допуск обязателен', () => {
    expect(assess(child, answers(ACTIVE, ['s_seizures'])).clearanceRequired).toBe(true);
  });

  it.each((Object.keys(FLAG_EXCLUSIONS) as SafetyFlag[]).filter((f) => !CLEARANCE_FLAGS.includes(f)))(
    '«да» по %s допуска НЕ требует (только исключает риски)',
    (flag) => {
      const a = assess(child, answers(ACTIVE, [questionId(flag)]));
      expect(a.safetyFlags).toEqual([flag]);
      expect(a.clearanceRequired).toBe(false);
    },
  );

  it('без ограничений допуск не нужен', () => {
    expect(assess(child, answers(ACTIVE)).clearanceRequired).toBe(false);
  });

  const gate = (clearanceRequired: boolean, confirmed: boolean): WorkoutGateInput => ({
    child: { doctorClearanceConfirmed: confirmed },
    assessment: { clearanceRequired },
    sessions: [],
    rulesAcceptedAt: '2026-11-01T10:00:00',
  });
  const today = new Date('2026-11-14T12:00:00');

  it('допуск нужен и не подтверждён → занятия заблокированы (clearance); подтверждён → открыты', () => {
    expect(workoutBlock(gate(true, false), today)).toBe('clearance');
    expect(workoutBlock(gate(true, true), today)).toBeNull();
    expect(workoutBlock(gate(false, false), today)).toBeNull();
  });

  it('разрешение врача важнее остальных блокировок (даже непринятых правил)', () => {
    expect(workoutBlock({ ...gate(true, false), rulesAcceptedAt: undefined }, today)).toBe('clearance');
  });

  it('подбор уважает гейт допуска: без подтверждения план пустой, с подтверждением — непустой', () => {
    // Усилено осознанно: гейт `clearanceRequired` продублирован в `buildTodayWorkout`
    // (защита на случай переноса подбора на сервер). Ослаблять обратно нельзя.
    const a = assess(child, answers(ACTIVE, ['s_seizures']));
    expect(a.clearanceRequired).toBe(true);
    expect(buildTodayWorkout(child, a, {}, []).items).toHaveLength(0);
    expect(buildTodayWorkout({ ...child, doctorClearanceConfirmed: true }, a, {}, []).items.length).toBeGreaterThan(0);
  });

  it('новая особенность, требующая допуска, сбрасывает прежнее подтверждение', () => {
    const none = assess(child, answers(ACTIVE));
    const surgery = assess(child, answers(ACTIVE, ['s_surgery']));
    const both = assess(child, answers(ACTIVE, ['s_surgery', 's_heart']));
    expect(needsNewClearance(undefined, surgery)).toBe(true);
    expect(needsNewClearance(surgery, surgery)).toBe(false);
    expect(needsNewClearance(surgery, both)).toBe(true);
    expect(needsNewClearance(both, none)).toBe(false);
  });
});

describe('golden: «не знаю»', () => {
  it('где разрешено: попадает в unsureFlags, не в safetyFlags, риски исключаются как при «да»', () => {
    for (const flag of ['neck_instability', 'no_impact'] as const) {
      const yes = assess(child, answers(ACTIVE, [questionId(flag)]));
      const unsure = assess(child, answers(ACTIVE, [], [questionId(flag)]));
      expect(unsure.safetyFlags).toEqual([]);
      expect(unsure.unsureFlags).toEqual([flag]);
      expect(sorted(unsure.excludedRisks)).toEqual(sorted(yes.excludedRisks));
      expect(sorted(unsure.excludedRisks)).toEqual(sorted(FLAG_EXCLUSIONS[flag]));
    }
  });

  it('где не разрешено (судороги, сердце, шунт и др.): «не знаю» игнорируется — ни флага, ни исключений, ни допуска', () => {
    const notAllowed = SAFETY_QUESTIONS.filter((q) => !q.allowUnknown);
    expect(notAllowed).toHaveLength(8);
    for (const q of notAllowed) {
      const a = assess(child, answers(ACTIVE, [], [q.id]));
      expect(a.safetyFlags).toEqual([]);
      expect(a.unsureFlags).toEqual([]);
      expect(a.excludedRisks).toEqual([]);
      expect(a.clearanceRequired).toBe(false);
    }
  });

  it('«не знаю» допуска врача не требует', () => {
    expect(assess(child, answers(ACTIVE, [], ['s_neck', 's_impact'])).clearanceRequired).toBe(false);
  });

  it('«не знаю» не снимает исключение, которое дал бы ответ «да» по другому флагу', () => {
    const a = assess(child, answers(ACTIVE, ['s_hip'], ['s_neck']));
    expect(sorted(a.excludedRisks)).toEqual(sorted(['hip_loading', 'impact', 'neck_flexion', 'head_down']));
  });

  it('значения вне yes/no/unknown считаются отсутствием ответа', () => {
    const bad = { motor: ACTIVE, safety: { s_seizures: 'maybe', s_hip: true } } as unknown as AssessmentAnswers;
    const a = assess(child, bad);
    expect(a.safetyFlags).toEqual([]);
    expect(a.unsureFlags).toEqual([]);
    expect(a.clearanceRequired).toBe(false);
  });
});

describe('golden: флаги-противопоказания исключают упражнения', () => {
  it.each(Object.keys(FLAG_EXCLUSIONS) as SafetyFlag[])('%s: excludedRisks и подбор исключают ровно заявленные риски', (flag) => {
    const a = assess(child, answers(ACTIVE, [questionId(flag)]));
    expect(sorted(a.excludedRisks)).toEqual(sorted(FLAG_EXCLUSIONS[flag]));
    const left = eligibleExercises(child, a, PROBES).map((e) => e.id);
    const expected = ALL_RISKS.filter((r) => !FLAG_EXCLUSIONS[flag].includes(r)).map((r) => `probe_${r}`);
    expect(sorted(left)).toEqual(sorted(expected));
  });

  it('несколько флагов: риски объединяются без дублей', () => {
    const a = assess(child, answers(ACTIVE, ['s_hip', 's_shunt']));
    expect(sorted(a.excludedRisks)).toEqual(sorted(['hip_loading', 'impact', 'head_down', 'neck_flexion']));
  });

  it('встроенный каталог: прыжки (impact, high_intensity) исключаются при операции, бедре, хрупких костях, шунте, сердце, судорогах', () => {
    for (const q of ['s_surgery', 's_hip', 's_bones', 's_shunt', 's_impact', 's_heart', 's_seizures']) {
      const a = assess(child, answers(ACTIVE, [q]));
      expect(eligibleExercises(child, a).map((e) => e.id)).not.toContain('two_foot_jumps');
    }
  });

  it('встроенный каталог: «мост» (breath_holding) исключается при судорогах и сердце, но не при бедре', () => {
    const base = eligibleExercises(child, assess(child, answers(ACTIVE))).map((e) => e.id);
    expect(base).toContain('bridge');
    for (const q of ['s_seizures', 's_heart']) {
      expect(eligibleExercises(child, assess(child, answers(ACTIVE, [q]))).map((e) => e.id)).not.toContain('bridge');
    }
    expect(eligibleExercises(child, assess(child, answers(ACTIVE, ['s_hip']))).map((e) => e.id)).toContain('bridge');
  });

  it('ботулинотерапия исключает высокоинтенсивную нагрузку (⚠️ ЧЕРНОВИК); «другие запреты» рисков не исключают (только допуск врача)', () => {
    expect(assess(child, answers(ACTIVE, ['s_botox'])).excludedRisks).toEqual(['high_intensity']);
    expect(assess(child, answers(ACTIVE, ['s_other'])).excludedRisks).toEqual([]);
  });

  it('исключение действует и на тренировку дня: в плане нет упражнений с исключённым риском', () => {
    const a = assess(child, answers(ACTIVE, ['s_seizures', 's_hip']));
    // Допуск подтверждён — иначе план пустой из-за гейта clearanceRequired (см. тест выше).
    const plan = buildTodayWorkout({ ...child, doctorClearanceConfirmed: true }, a, {}, []);
    const byId = new Map(eligibleExercises(child, a).map((e) => [e.id, e]));
    expect(plan.items.length).toBeGreaterThan(0);
    for (const item of plan.items) {
      const ex = byId.get(item.exerciseId)!;
      expect(ex).toBeDefined();
      expect(ex.risks.some((r) => a.excludedRisks.includes(r))).toBe(false);
    }
  });
});

describe('golden: GMFCS со слов родителя → осторожный уровень', () => {
  it('итоговый уровень = более осторожный (больший номер) из теста и GMFCS', () => {
    expect(effectiveLevel(2)).toBe(2);
    expect(effectiveLevel(2, 3)).toBe(3);
    expect(effectiveLevel(3, 1)).toBe(3);
    expect(effectiveLevel(2, 2)).toBe(2);
    expect(effectiveLevel(1, 5)).toBe(5);
  });

  it('GMFCS тяжелее теста → level понижается, computedLevel и gmfcsReported сохраняются', () => {
    const a = assess(child, answers(ACTIVE), 3);
    expect(a.computedLevel).toBe(1);
    expect(a.gmfcsReported).toBe(3);
    expect(a.level).toBe(3);
  });

  it('GMFCS легче теста → уровень не повышается', () => {
    const a = assess(child, answers(WALKER), 1);
    expect(a.computedLevel).toBe(3);
    expect(a.level).toBe(3);
  });

  it('уровень от врача не открывает упражнения сложнее, чем по тесту', () => {
    const a = assess(child, answers(WALKER), 1);
    expect(eligibleExercises(child, a).map((e) => e.id)).not.toContain('two_foot_jumps');
  });

  it('осторожный уровень сужает подбор: «сложные» упражнения уровня 1 пропадают', () => {
    const plain = eligibleExercises(child, assess(child, answers(ACTIVE))).map((e) => e.id);
    const cautious = eligibleExercises(child, assess(child, answers(ACTIVE), 3)).map((e) => e.id);
    expect(plain).toContain('two_foot_jumps');
    expect(cautious).not.toContain('two_foot_jumps');
  });

  it('уровень проверяется по полю level; capabilities от GMFCS не зависят', () => {
    const without = assess(child, answers(ACTIVE));
    const withG = assess(child, answers(ACTIVE), 4);
    expect(withG.capabilities).toEqual(without.capabilities);
    expect(withG.level).toBe(4);
  });
});

describe('golden: расхождение теста и GMFCS', () => {
  it('порог предупреждения — 2 ступени', () => {
    expect(LEVEL_GAP_WARNING).toBe(2);
  });

  it('levelGap: 0 без GMFCS; иначе модуль разницы (в обе стороны)', () => {
    expect(levelGap(assess(child, answers(ACTIVE)))).toBe(0);
    expect(levelGap(assess(child, answers(ACTIVE), 3))).toBe(2);
    expect(levelGap(assess(child, answers(WALKER), 1))).toBe(2);
    expect(levelGap(assess(child, answers(ACTIVE), 2))).toBe(1);
    expect(levelGap(assess(child, answers(ACTIVE), 1))).toBe(0);
  });

  it('предупреждение (gap >= порога) срабатывает при 2+ ступенях и не срабатывает при 1', () => {
    const warn = (g: 1 | 2 | 3 | 4 | 5) => levelGap(assess(child, answers(ACTIVE), g)) >= LEVEL_GAP_WARNING;
    expect([1, 2, 3, 4, 5].map((g) => warn(g as 1 | 2 | 3 | 4 | 5))).toEqual([false, false, true, true, true]);
  });
});
