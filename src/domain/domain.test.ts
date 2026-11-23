import { describe, expect, it } from 'vitest';

import { assess, determineLevel, effectiveLevel, levelGap } from './functionalLevel';
import { GOAL_REVIEW_DAYS, goalsFor, isGoalReviewDue } from './goals';
import {
  activityStats,
  ageFromParts,
  applyBreak,
  dayKey,
  formatAge,
  isPainHold,
  needsBreakCheck,
  needsNewClearance,
  weekDays,
} from './profile';
import { MOTOR_ITEMS, SAFETY_QUESTIONS, FLAG_EXCLUSIONS, walkMotorItems } from './questionnaire';
import { buildSummary } from './summary';
import { applySessionResult } from './progression';
import { buildTodayWorkout, dayStatus, eligibleExercises, trackingTestsFor } from './selection';
import type { AssessmentAnswers, Exercise, SafetyAnswer, SafetyFlag, SessionLog } from './types';

/** Ответы анкеты: тест движений (пункт → вариант) и вопросы об ограничениях, на которые ответили «да». */
const answers = (motor: Record<string, string> = {}, yes: string[] = [], unknown: string[] = []): AssessmentAnswers => ({
  motor,
  safety: Object.fromEntries([
    ...yes.map((id) => [id, 'yes' as SafetyAnswer]),
    ...unknown.map((id) => [id, 'unknown' as SafetyAnswer]),
  ]),
});
/** Ходит сам на улице, по лестнице без перил, бегает и прыгает. */
const ACTIVE = { m_posture: 'sit_free', m_stand: 'free', m_walk: 'outdoor', m_stairs: 'free', m_run: 'yes' };
/** Сидит сам, стоит у опоры, ходит с ходунками. */
const WALKER = { m_posture: 'sit_free', m_stand: 'support', m_walk: 'device' };

describe('функциональный уровень', () => {
  it('ходит, лестница без перил, бегает → 1', () => {
    const a = assess({ id: 'c', ageYears: 7 }, answers(ACTIVE));
    expect(a.level).toBe(1);
  });

  it('ходит сам, но без бега → 2', () => {
    expect(determineLevel(['head_control', 'sit_independent', 'stand_with_support', 'walk_independent'], 8)).toBe(2);
  });

  it('ходит с ходунками → 3', () => {
    expect(determineLevel(['head_control', 'sit_independent', 'stand_with_support', 'walk_with_device'], 6)).toBe(3);
  });

  it('сидит с поддержкой → 4, не держит голову → 5', () => {
    expect(determineLevel(['head_control', 'sit_with_support'], 5)).toBe(4);
    expect(determineLevel([], 5)).toBe(5);
  });

  it('ответы на пункты, которые не задавались, игнорируются', () => {
    // «ходит сам» отмечено, но ребёнок не стоит у опоры: пункт о ходьбе не задавался.
    const a = assess({ id: 'c', ageYears: 6 }, answers({ m_posture: 'sit_support', m_stand: 'none', m_walk: 'indoor', m_run: 'yes' }));
    expect(a.capabilities).not.toContain('walk_independent');
    expect(a.capabilities).not.toContain('run_jump');
    expect(a.level).toBe(4);
  });
});

describe('тест из 5 пунктов', () => {
  it('пунктов пять; первый вариант каждого ничего не даёт', () => {
    expect(MOTOR_ITEMS).toHaveLength(5);
    MOTOR_ITEMS.forEach((item) => expect(item.options[0].grants).toEqual([]));
  });

  it('вариант даёт и возможности более простых вариантов того же пункта', () => {
    for (const item of MOTOR_ITEMS) {
      for (let i = 2; i < item.options.length; i++) {
        const lower = item.options[i - 1].grants;
        // Исключение — ходьба: «ходит сам» не означает «ходит с ходунками».
        if (item.id === 'm_walk' && i === 2) continue;
        lower.forEach((c) => expect(item.options[i].grants).toContain(c));
      }
    }
  });

  it('следующий пункт задаётся, только если пройдена предыдущая ступень', () => {
    expect(walkMotorItems({}).visible.map((i) => i.id)).toEqual(['m_posture']);
    expect(walkMotorItems({ m_posture: 'head' }).visible.map((i) => i.id)).toEqual(['m_posture']);
    expect(walkMotorItems({ m_posture: 'sit_support', m_stand: 'support' }).visible.map((i) => i.id)).toEqual([
      'm_posture', 'm_stand', 'm_walk', 'm_stairs',
    ]);
    expect(walkMotorItems({ m_posture: 'sit_free', m_stand: 'free', m_walk: 'indoor' }).visible).toHaveLength(5);
  });

  it('бегает и прыгает, но на лестнице держится за перила → группа 2, без прыжков', () => {
    const a = assess({ id: 'c', ageYears: 7 }, answers({ ...ACTIVE, m_stairs: 'rail' }));
    expect(a.capabilities).toContain('run_jump');
    expect(a.capabilities).not.toContain('stairs_no_rail');
    expect(a.level).toBe(2);
    expect(eligibleExercises({ ageYears: 7 }, a).map((e) => e.id)).not.toContain('two_foot_jumps');
  });

  it('«без перил» не засчитывается ребёнку, который не ходит сам', () => {
    const a = assess({ id: 'c', ageYears: 7 }, answers({ ...WALKER, m_stairs: 'free' }));
    expect(a.capabilities).not.toContain('stairs_no_rail');
    expect(a.level).toBe(3);
  });

  it('испорченные ответы не роняют оценку', () => {
    const broken = [undefined, null, [], 'x', { motor: null, safety: 5 }] as unknown as AssessmentAnswers[];
    broken.forEach((b) => {
      const a = assess({ id: 'c', ageYears: 6 }, b);
      expect(a.level).toBe(5);
      expect(a.safetyFlags).toEqual([]);
    });
  });
});

describe('уровень от врача (GMFCS)', () => {
  it('берётся более осторожный из двух; без уровня от врача — по тесту', () => {
    expect(effectiveLevel(2)).toBe(2);
    expect(effectiveLevel(2, 3)).toBe(3);
    expect(effectiveLevel(3, 1)).toBe(3);
    expect(effectiveLevel(2, 2)).toBe(2);
  });

  it('оценка хранит оба уровня и расхождение', () => {
    const a = assess({ id: 'c', ageYears: 7 }, answers(ACTIVE), 3);
    expect(a.computedLevel).toBe(1);
    expect(a.gmfcsReported).toBe(3);
    expect(a.level).toBe(3);
    expect(levelGap(a)).toBe(2);
    expect(levelGap(assess({ id: 'c', ageYears: 7 }, answers(ACTIVE)))).toBe(0);
  });

  it('уровень от врача не открывает упражнения сложнее, чем по тесту', () => {
    const a = assess({ id: 'c', ageYears: 6 }, answers(WALKER), 1);
    expect(a.level).toBe(3);
    expect(eligibleExercises({ ageYears: 6 }, a).map((e) => e.id)).not.toContain('two_foot_jumps');
  });
});

describe('противопоказания', () => {
  it('нестабильность тазобедренного сустава убирает прыжки', () => {
    const a = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE, ['s_hip']));
    expect(eligibleExercises({ ageYears: 8 }, a).map((e) => e.id)).not.toContain('two_foot_jumps');
  });

  it('операция за 6 месяцев требует разрешения врача', () => {
    const a = assess({ id: 'c', ageYears: 8 }, answers({ m_posture: 'head' }, ['s_surgery']));
    expect(a.clearanceRequired).toBe(true);
  });

  it('без ограничений активному ребёнку предлагаются прыжки', () => {
    const a = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE));
    expect(a.excludedRisks).toEqual([]);
    expect(eligibleExercises({ ageYears: 8 }, a).map((e) => e.id)).toContain('two_foot_jumps');
  });

  it('запрет врача на прыжки убирает прыжки — и при «да», и при «не знаю»', () => {
    const yes = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE, ['s_impact']));
    const unsure = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE, [], ['s_impact']));
    expect(yes.safetyFlags).toEqual(['no_impact']);
    expect(unsure.safetyFlags).toEqual([]);
    expect(unsure.unsureFlags).toEqual(['no_impact']);
    for (const a of [yes, unsure]) {
      expect(a.excludedRisks).toContain('impact');
      expect(eligibleExercises({ ageYears: 8 }, a).map((e) => e.id)).not.toContain('two_foot_jumps');
    }
  });

  it('запрет на кувырки убирает упражнения со сгибанием шеи и вниз головой', () => {
    // В встроенном каталоге таких упражнений пока нет — проверяем на своём.
    const somersault: Exercise = {
      id: 'somersault', title: 'Кувырок', description: '', part: 'main', goals: ['coordination'], position: 'kneeling',
      requires: [], levels: [1, 2, 3, 4, 5], minAge: 0, risks: ['neck_flexion'],
      variants: [{ difficulty: 1, instructions: '', sets: 1 }],
    };
    const free = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE));
    const unsure = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE, [], ['s_neck']));
    expect(eligibleExercises({ ageYears: 8 }, free, [somersault])).toHaveLength(1);
    expect(unsure.excludedRisks).toEqual(expect.arrayContaining(['neck_flexion', 'head_down']));
    expect(eligibleExercises({ ageYears: 8 }, unsure, [somersault])).toHaveLength(0);
  });

  it('«не знаю» принимается только там, где такой ответ предусмотрен, и не требует разрешения врача', () => {
    const a = assess({ id: 'c', ageYears: 8 }, answers(ACTIVE, [], ['s_heart', 's_neck']));
    expect(a.unsureFlags).toEqual(['neck_instability']);
    expect(a.clearanceRequired).toBe(false);
  });

  it('другие запреты врача закрывают занятия до его разрешения', () => {
    expect(assess({ id: 'c', ageYears: 8 }, answers(ACTIVE, ['s_other'])).clearanceRequired).toBe(true);
  });

  it('у каждого ограничения есть ровно один вопрос и правило исключений', () => {
    const flags = Object.keys(FLAG_EXCLUSIONS) as SafetyFlag[];
    expect(SAFETY_QUESTIONS.map((q) => q.flag).sort()).toEqual([...flags].sort());
    expect(SAFETY_QUESTIONS).toHaveLength(10);
  });
});

describe('тренировка дня', () => {
  const a = assess({ id: 'c', ageYears: 6 }, answers(WALKER));

  it('разминка + 3 основных + заминка, всё подходит ребёнку', () => {
    const plan = buildTodayWorkout({ ageYears: 6 }, a, {}, [], new Date('2026-11-13T10:00:00Z'));
    expect(plan.items).toHaveLength(5);
    const ok = new Set(eligibleExercises({ ageYears: 6 }, a).map((e) => e.id));
    plan.items.forEach((i) => expect(ok.has(i.exerciseId)).toBe(true));
  });

  it('чередует упражнения между занятиями', () => {
    const p1 = buildTodayWorkout({ ageYears: 6 }, a, {}, []);
    const log: SessionLog = { id: '1', childId: 'c', date: '2026-11-12T10:00:00Z', items: p1.items, feedback: 'ok', pain: false };
    const p2 = buildTodayWorkout({ ageYears: 6 }, a, {}, [log]);
    expect(p2.items.map((i) => i.exerciseId)).not.toEqual(p1.items.map((i) => i.exerciseId));
  });

  it('один раз в день и цель на неделю', () => {
    const today = new Date('2026-11-13T18:00:00Z');
    const log = (d: string): SessionLog => ({ id: d, childId: 'c', date: d, items: [], feedback: 'ok', pain: false });
    expect(dayStatus([log('2026-11-13T09:00:00Z')], today).kind).toBe('done_today');
    expect(dayStatus([log('2026-11-10T09:00:00Z')], today).kind).toBe('recommended');
    expect(dayStatus([log('2026-11-08T09:00:00Z'), log('2026-11-10T09:00:00Z'), log('2026-11-11T09:00:00Z')], today).kind).toBe('rest_suggested');
  });

  it('подбирает 1–2 теста динамики', () => {
    const tests = trackingTestsFor(a);
    expect(tests.length).toBeGreaterThanOrEqual(1);
    expect(tests.length).toBeLessThanOrEqual(2);
  });
});

describe('прогрессия', () => {
  const items = [{ exerciseId: 'bridge', difficulty: 1 as const }];

  it('два раза «легко» → сложнее', () => {
    const r1 = applySessionResult({}, items, 'easy', false);
    expect(r1.progress.bridge.difficulty).toBe(1);
    const r2 = applySessionResult(r1.progress, items, 'easy', false);
    expect(r2.progress.bridge.difficulty).toBe(2);
  });

  it('«тяжело» → проще, боль → куратор', () => {
    const r = applySessionResult({ bridge: { difficulty: 3, easyStreak: 1 } }, items, 'hard', false);
    expect(r.progress.bridge.difficulty).toBe(2);
    expect(applySessionResult({}, items, 'ok', true).contactCurator).toBe(true);
  });
});

describe('прогрессия: усталость и «что дальше»', () => {
  const items = [{ exerciseId: 'bridge', difficulty: 1 as const }];
  const noPain = (p: Parameters<typeof applySessionResult>[0], fb: 'easy' | 'ok' | 'hard', s?: Parameters<typeof applySessionResult>[5]) =>
    applySessionResult(p, items, fb, false, {}, s);

  it('усталость тормозит повышение, серия сохраняется и срабатывает потом', () => {
    const r1 = noPain({}, 'easy');
    const r2 = noPain(r1.progress, 'easy', { fatigue: 'tired' });
    expect(r2.progress.bridge).toEqual({ difficulty: 1, easyStreak: 2 });
    const r3 = noPain(r2.progress, 'easy', { fatigue: 'fresh' });
    expect(r3.progress.bridge).toEqual({ difficulty: 2, easyStreak: 0 });
  });

  it('«было много» действует так же', () => {
    const p = { bridge: { difficulty: 1 as const, easyStreak: 1 } };
    expect(noPain(p, 'easy', { whatNext: 'tooMuch' }).progress.bridge).toEqual({ difficulty: 1, easyStreak: 2 });
    expect(noPain(p, 'easy', { whatNext: 'more' }).progress.bridge.difficulty).toBe(2);
  });

  it('боль и «тяжело» понижают даже при усталости', () => {
    const p = { bridge: { difficulty: 2 as const, easyStreak: 1 } };
    expect(noPain(p, 'hard', { fatigue: 'tired' }).progress.bridge.difficulty).toBe(1);
    expect(applySessionResult(p, items, 'easy', true, {}, { fatigue: 'tired' }).progress.bridge.difficulty).toBe(1);
  });

  it('«нормально» по-прежнему сбрасывает серию', () => {
    const p = { bridge: { difficulty: 1 as const, easyStreak: 1 } };
    expect(noPain(p, 'ok', { fatigue: 'tired' }).progress.bridge.easyStreak).toBe(0);
  });

  it('вызов без нового параметра работает как раньше', () => {
    const r = applySessionResult({ bridge: { difficulty: 1, easyStreak: 1 } }, items, 'easy', false);
    expect(r.progress.bridge.difficulty).toBe(2);
  });
});

describe('профиль и безопасность', () => {
  const log = (id: string, date: string, pain = false): SessionLog => ({ id, childId: 'c', date, items: [], feedback: 'ok', pain });

  it('возраст в годах и месяцах', () => {
    expect(formatAge(ageFromParts(5, 6))).toBe('5 лет 6 месяцев');
    expect(formatAge(ageFromParts(0, 8))).toBe('8 месяцев');
    expect(formatAge(ageFromParts(2, 0))).toBe('2 года');
    expect(formatAge(ageFromParts(1, 1))).toBe('1 год 1 месяц');
  });

  it('день считается по местному времени', () => {
    const lateNight = new Date(2026, 10, 14, 0, 30); // 00:30 местного времени
    expect(dayKey(lateNight)).toBe('2026-11-14');
    expect(dayStatus([log('1', lateNight.toISOString())], new Date(2026, 10, 14, 9, 0)).kind).toBe('done_today');
  });

  it('новая особенность требует нового разрешения врача', () => {
    const child = { id: 'c', ageYears: 8 };
    const surgery = assess(child, answers({ m_posture: 'head' }, ['s_surgery']));
    const both = assess(child, answers({ m_posture: 'head' }, ['s_surgery', 's_heart']));
    const none = assess(child, answers({ m_posture: 'head' }));
    expect(needsNewClearance(undefined, surgery)).toBe(true);
    expect(needsNewClearance(surgery, surgery)).toBe(false);
    expect(needsNewClearance(surgery, both)).toBe(true);
    expect(needsNewClearance(both, none)).toBe(false);
  });

  it('после боли — пауза, пока родитель не подтвердит', () => {
    const sessions = [log('1', '2026-11-10T09:00:00Z'), log('2', '2026-11-12T09:00:00Z', true)];
    expect(isPainHold(sessions)).toBe(true);
    expect(isPainHold(sessions, '2')).toBe(false);
    expect(isPainHold([...sessions, log('3', '2026-11-13T09:00:00Z')], undefined)).toBe(false);
    expect(isPainHold([])).toBe(false);
  });

  it('статистика занятий', () => {
    const today = new Date('2026-11-13T18:00:00Z');
    const s = activityStats([log('1', '2026-11-01T09:00:00Z'), log('2', '2026-11-08T09:00:00Z'), log('3', '2026-11-12T09:00:00Z')], today);
    expect(s.total).toBe(3);
    expect(s.thisWeek).toBe(2);
    expect(s.weeksInRow).toBe(2);
    expect(activityStats([], today).weeksInRow).toBe(0);
  });
});

describe('отзыв по упражнениям, перерыв, цель, сводка', () => {
  const log = (id: string, date: string, extra: Partial<SessionLog> = {}): SessionLog => ({
    id, childId: 'c', date, items: [], feedback: 'ok', pain: false, ...extra,
  });

  it('уточнение по одному упражнению не трогает остальные', () => {
    const items = [
      { exerciseId: 'bridge', difficulty: 2 as const },
      { exerciseId: 'heel_raises', difficulty: 2 as const },
    ];
    const start = { bridge: { difficulty: 2 as const, easyStreak: 0 }, heel_raises: { difficulty: 2 as const, easyStreak: 0 } };
    const r = applySessionResult(start, items, 'ok', false, { bridge: 'hard' });
    expect(r.progress.bridge.difficulty).toBe(1);
    expect(r.progress.heel_raises.difficulty).toBe(2);
  });

  it('после недели перерыва спрашиваем причину; болезнь и пауза смягчают нагрузку', () => {
    const today = new Date('2026-11-20T10:00:00Z');
    const sessions = [log('1', '2026-11-05T10:00:00Z')];
    expect(needsBreakCheck(sessions, undefined, today)).toBe(true);
    expect(needsBreakCheck(sessions, '1', today)).toBe(false);
    expect(needsBreakCheck([log('2', '2026-11-18T10:00:00Z')], undefined, today)).toBe(false);
    expect(needsBreakCheck([], undefined, today)).toBe(false);

    const progress = { bridge: { difficulty: 3 as const, easyStreak: 1 }, heel_raises: { difficulty: 1 as const, easyStreak: 1 } };
    expect(applyBreak(progress, 'illness').bridge).toEqual({ difficulty: 2, easyStreak: 0 });
    expect(applyBreak(progress, 'pause').heel_raises.difficulty).toBe(1);
    expect(applyBreak(progress, 'with_specialist')).toBe(progress);
  });

  it('дорожка недели начинается с понедельника', () => {
    const saturday = new Date(2026, 10, 14, 12, 0);
    const days = weekDays([log('1', new Date(2026, 10, 11, 9, 0).toISOString())], saturday);
    expect(days.map((d) => d.label)).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);
    expect(days.filter((d) => d.done).map((d) => d.label)).toEqual(['Ср']);
    expect(days.find((d) => d.isToday)?.label).toBe('Сб');
    expect(days[6].isFuture).toBe(true);
  });

  it('цели есть для каждой группы; оценка — через 8 недель', () => {
    ([1, 2, 3, 4, 5] as const).forEach((level) => expect(goalsFor(level).length).toBeGreaterThanOrEqual(3));
    const goal = { id: 'g', text: 'Стоять у опоры', setAt: '2026-09-01T10:00:00Z', reviews: [] };
    const day = 24 * 3600 * 1000;
    const setAt = new Date(goal.setAt).getTime();
    expect(isGoalReviewDue(goal, new Date(setAt + (GOAL_REVIEW_DAYS - 1) * day))).toBe(false);
    expect(isGoalReviewDue(goal, new Date(setAt + GOAL_REVIEW_DAYS * day))).toBe(true);
    const reviewed = { ...goal, reviews: [{ date: new Date(setAt + GOAL_REVIEW_DAYS * day).toISOString(), rating: 0 as const }] };
    expect(isGoalReviewDue(reviewed, new Date(setAt + (GOAL_REVIEW_DAYS + 10) * day))).toBe(false);
    expect(isGoalReviewDue(undefined)).toBe(false);
  });

  it('сводка для куратора содержит главное', () => {
    const child = { id: 'c', name: 'Маша', ageYears: 5.5, doctorClearanceConfirmed: false, createdAt: '2026-10-01T10:00:00Z' };
    const a = assess(child, answers(WALKER, ['s_hip'], ['s_neck']), 3);
    const items = [{ exerciseId: 'bridge', difficulty: 1 as const }, { exerciseId: 'heel_raises', difficulty: 1 as const }];
    const sessions = [
      log('1', '2026-11-10T10:00:00Z', { items, itemFeedback: { bridge: 'hard' } }),
      log('2', '2026-11-12T10:00:00Z', { items, pain: true, painSigns: ['cry'], painArea: 'legs' }),
      log('0', '2026-09-01T10:00:00Z', { items, feedback: 'hard', fatigue: 'tired' }),
    ];
    sessions[0].fatigue = 'tired';
    sessions[1].whatNext = 'tooMuch';
    const text = buildSummary(child, a, sessions, [], { id: 'g', text: 'Стоять у опоры', setAt: '2026-10-01T10:00:00Z', reviews: [] }, new Date('2026-11-13T18:00:00Z'));
    expect(text).toContain('Маша, 5 лет 6 месяцев.');
    expect(text).not.toMatch(/ДЦП|диагноз/i);
    expect(text).toContain('Группа занятий: Ходит с опорой');
    expect(text).toContain('Уровень GMFCS со слов родителя: III');
    expect(text).toContain('Ограничения и противопоказания: подвывих или вывих тазобедренного сустава.');
    expect(text).toContain('Родитель не знает, просит уточнить: запрет на кувырки и наклоны вниз головой.');
    expect(text).toContain('Цель: Стоять у опоры');
    expect(text).toContain('Занятий за 30 дней: 2; всего: 3');
    expect(text).toContain('Давалось тяжело: «Мостик» (1)');
    expect(text).toContain('плакал или кричал; где: ноги');
    expect(text).toContain('Ребёнок уставал после занятий: 1 из 2.');
    expect(text).toContain('Говорил, что было слишком много: 1 раз.');
    expect(text).not.toContain('Просил ещё');
  });
});
