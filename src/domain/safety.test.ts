import { describe, expect, it } from 'vitest';

import { determineLevel } from './functionalLevel';
import { currentAgeYears, workoutBlock, type WorkoutGateInput } from './profile';
import { motorAnswersFromCapabilities, walkMotorItems } from './questionnaire';
import { migrateState, restoreState } from './storage';
import type { Capability, FunctionalAssessment, SessionLog } from './types';

const session = (id: string, date: string, pain = false): SessionLog => ({
  id,
  childId: 'c',
  date,
  items: [],
  feedback: 'ok',
  pain,
});

describe('возраст на сегодня', () => {
  it('растёт на полные месяцы с даты ввода', () => {
    const child = { ageYears: 3.5, ageSetAt: '2026-01-15T10:00:00' };
    expect(currentAgeYears(child, new Date('2026-01-20T10:00:00'))).toBe(3.5);
    expect(currentAgeYears(child, new Date('2026-07-14T10:00:00'))).toBeCloseTo(3.5 + 5 / 12);
    expect(currentAgeYears(child, new Date('2026-07-15T10:00:00'))).toBeCloseTo(4);
    expect(currentAgeYears(child, new Date('2028-01-15T10:00:00'))).toBeCloseTo(5.5);
  });

  it('без даты ввода, с испорченной датой или датой в будущем возраст не меняется', () => {
    expect(currentAgeYears({ ageYears: 6 }, new Date('2030-01-01T10:00:00'))).toBe(6);
    expect(currentAgeYears({ ageYears: 6, ageSetAt: 'не дата' }, new Date('2030-01-01T10:00:00'))).toBe(6);
    expect(currentAgeYears({ ageYears: 6, ageSetAt: '2031-01-01T10:00:00' }, new Date('2030-01-01T10:00:00'))).toBe(6);
  });
});

describe('проверка перед занятием', () => {
  const today = new Date('2026-11-14T12:00:00');
  const base: WorkoutGateInput = {
    child: { doctorClearanceConfirmed: false },
    assessment: { clearanceRequired: false },
    sessions: [],
    rulesAcceptedAt: '2026-11-01T10:00:00',
  };

  it('всё в порядке → можно заниматься', () => {
    expect(workoutBlock(base, today)).toBeNull();
  });

  it('нужно разрешение врача, а его нет', () => {
    expect(workoutBlock({ ...base, assessment: { clearanceRequired: true } }, today)).toBe('clearance');
    expect(
      workoutBlock({ ...base, assessment: { clearanceRequired: true }, child: { doctorClearanceConfirmed: true } }, today),
    ).toBeNull();
  });

  it('боль на последнем занятии держит паузу, пока её не сняли', () => {
    const sessions = [session('s1', '2026-11-13T10:00:00', true)];
    expect(workoutBlock({ ...base, sessions }, today)).toBe('pain_hold');
    expect(workoutBlock({ ...base, sessions, painAcknowledgedSessionId: 's1' }, today)).toBeNull();
  });

  it('долгий перерыв требует ответа о причине', () => {
    const sessions = [session('s1', '2026-10-01T10:00:00')];
    expect(workoutBlock({ ...base, sessions }, today)).toBe('break_check');
    expect(workoutBlock({ ...base, sessions, breakHandledSessionId: 's1' }, today)).toBeNull();
  });

  it('правила не приняты; разрешение врача важнее правил', () => {
    expect(workoutBlock({ ...base, rulesAcceptedAt: undefined }, today)).toBe('rules');
    expect(workoutBlock({ ...base, rulesAcceptedAt: undefined, assessment: { clearanceRequired: true } }, today)).toBe('clearance');
  });
});

describe('чтение сохранённого состояния', () => {
  it('пусто → нет данных и нет ошибки', () => {
    expect(restoreState(null)).toEqual({ data: null, corrupt: false });
    expect(restoreState('')).toEqual({ data: null, corrupt: false });
  });

  it('нечитаемая строка или не объект → помечается испорченной', () => {
    expect(restoreState('{"sessions": [')).toEqual({ data: null, corrupt: true });
    expect(restoreState('[1,2]')).toEqual({ data: null, corrupt: true });
    expect(restoreState('null')).toEqual({ data: null, corrupt: true });
  });

  it('исправные данные возвращаются как есть', () => {
    const state = { user: { name: 'Аня', email: 'a@b.c' }, progress: {}, sessions: [{ id: 's1' }], trackingResults: [] };
    expect(restoreState(JSON.stringify(state))).toEqual({ data: state, corrupt: false });
  });

  it('поле неверного вида отбрасывается, остальное сохраняется', () => {
    const r = restoreState(JSON.stringify({ user: { name: 'Аня' }, sessions: 'oops', progress: [], child: null }));
    expect(r.corrupt).toBe(true);
    expect(r.data).toEqual({ user: { name: 'Аня' } });
  });
});

describe('перевод данных прежней версии', () => {
  /** Прежняя анкета: 11 вопросов «да/нет», каждый давал одну возможность. */
  const OLD: { id: string; capability: Capability; askIf?: Capability }[] = [
    { id: 'q_head', capability: 'head_control' },
    { id: 'q_sit_support', capability: 'sit_with_support', askIf: 'head_control' },
    { id: 'q_sit_free', capability: 'sit_independent', askIf: 'sit_with_support' },
    { id: 'q_stand_support', capability: 'stand_with_support', askIf: 'sit_with_support' },
    { id: 'q_stand_free', capability: 'stand_independent', askIf: 'stand_with_support' },
    { id: 'q_walk_device', capability: 'walk_with_device', askIf: 'stand_with_support' },
    { id: 'q_walk_free', capability: 'walk_independent', askIf: 'stand_with_support' },
    { id: 'q_walk_outdoors', capability: 'walk_outdoors', askIf: 'walk_independent' },
    { id: 'q_stairs_rail', capability: 'stairs_with_rail', askIf: 'stand_with_support' },
    { id: 'q_stairs_free', capability: 'stairs_no_rail', askIf: 'walk_independent' },
    { id: 'q_run_jump', capability: 'run_jump', askIf: 'walk_independent' },
  ];
  const visible = (q: (typeof OLD)[number], a: Record<string, boolean>): boolean => {
    if (!q.askIf) return true;
    const pre = OLD.find((o) => o.capability === q.askIf)!;
    return a[pre.id] === true && visible(pre, a);
  };
  const oldCaps = (a: Record<string, boolean>) => OLD.filter((q) => visible(q, a) && a[q.id] === true).map((q) => q.capability);

  const oldState = (diagnosis: string, answers: Record<string, boolean>, extra: Record<string, unknown> = {}) => {
    const capabilities = oldCaps(answers);
    return {
      user: { name: 'Аня', email: 'a@b.c' },
      child: { id: 'c', name: 'Маша', ageYears: 7, diagnosis, diagnosisNote: 'спастическая диплегия', doctorClearanceConfirmed: true, createdAt: '2026-10-01T10:00:00Z' },
      assessment: {
        childId: 'c', date: '2026-10-01T10:00:00Z', answers, capabilities,
        level: determineLevel(capabilities, 7), safetyFlags: [], excludedRisks: [], clearanceRequired: false,
        ...extra,
      },
      progress: {}, sessions: [], trackingResults: [],
    };
  };
  const migrated = (state: unknown) => migrateState(state as Record<string, unknown>) as { child: Record<string, unknown>; assessment: FunctionalAssessment; profileNotice?: string };

  it('для любых ответов прежней анкеты группа не меняется, а возможностей не становится больше', () => {
    for (let mask = 0; mask < 1 << OLD.length; mask++) {
      const answers = Object.fromEntries(OLD.map((q, i) => [q.id, (mask & (1 << i)) !== 0]));
      const before = oldCaps(answers);
      const after = walkMotorItems(motorAnswersFromCapabilities(before)).capabilities;
      for (const age of [3, 7]) expect(determineLevel(after, age)).toBe(determineLevel(before, age));
      // Единственное добавление: «без перил» включает «с перилами».
      const added = after.filter((c) => !before.includes(c));
      expect(added.every((c) => c === 'stairs_with_rail' && before.includes('stairs_no_rail'))).toBe(true);
      // Единственная потеря: «ходит с ходунками» у ребёнка, который ходит сам.
      const lost = before.filter((c) => !after.includes(c));
      expect(lost.every((c) => c === 'walk_with_device' && before.includes('walk_independent'))).toBe(true);
    }
  });

  it('диагноз и уточнение удаляются, родителю оставляется пояснение', () => {
    const m = migrated(oldState('cerebral_palsy', { q_head: true }));
    expect(JSON.stringify(m)).not.toMatch(/diagnos|диплегия|cerebral/);
    expect(m.profileNotice).toBe('profile_updated');
    expect(m.child.name).toBe('Маша');
    expect(m.child.doctorClearanceConfirmed).toBe(true);
  });

  it('ответы переводятся в тест из 5 пунктов, группа и ограничения сохраняются', () => {
    const answers = { q_head: true, q_sit_support: true, q_sit_free: true, q_stand_support: true, q_walk_device: true, s_hip: true, s_shunt: false };
    const m = migrated(oldState('cerebral_palsy', answers, { safetyFlags: ['hip_instability'], excludedRisks: ['hip_loading', 'impact'] }));
    expect(m.assessment.answers.motor).toMatchObject({ m_posture: 'sit_free', m_stand: 'support', m_walk: 'device' });
    expect(m.assessment.answers.safety).toMatchObject({ s_hip: 'yes', s_shunt: 'no' });
    expect(m.assessment.level).toBe(3);
    expect(m.assessment.computedLevel).toBe(3);
    expect(m.assessment.safetyFlags).toEqual(['hip_instability']);
    expect(m.assessment.excludedRisks).toEqual(expect.arrayContaining(['hip_loading', 'impact']));
    expect(m.assessment.date).toBe('2026-10-01T10:00:00Z');
  });

  it('исключения, которые следовали из диагноза, остаются — как ответ «не знаю»', () => {
    const down = migrated(oldState('down_syndrome', { q_head: true }, { excludedRisks: ['neck_flexion', 'head_down'] }));
    expect(down.assessment.answers.safety.s_neck).toBe('unknown');
    expect(down.assessment.unsureFlags).toEqual(['neck_instability']);
    expect(down.assessment.safetyFlags).toEqual([]);
    expect(down.assessment.excludedRisks).toEqual(expect.arrayContaining(['neck_flexion', 'head_down']));

    const spina = migrated(oldState('spina_bifida', { q_head: true }, { excludedRisks: ['impact'] }));
    expect(spina.assessment.unsureFlags).toEqual(['no_impact']);
    expect(spina.assessment.excludedRisks).toContain('impact');

    expect(migrated(oldState('cerebral_palsy', { q_head: true })).assessment.excludedRisks).toEqual([]);
  });

  it('подтверждённое разрешение врача не сбрасывается', () => {
    const m = migrated(oldState('other', { q_head: true, s_heart: true }, { safetyFlags: ['heart_condition'], clearanceRequired: true }));
    expect(m.assessment.clearanceRequired).toBe(true);
    expect(m.child.doctorClearanceConfirmed).toBe(true);
  });

  it('повторный перевод ничего не меняет', () => {
    const once = migrateState(oldState('down_syndrome', { q_head: true, q_sit_support: true }) as Record<string, unknown>);
    expect(migrateState(once)).toEqual(once);
  });

  it('диагноз без пройденной анкеты: профиль очищается, оценки нет', () => {
    const { assessment: _a, ...state } = oldState('spina_bifida', {});
    const m = migrateState(state as Record<string, unknown>);
    expect(m.assessment).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/diagnos|spina/);
  });

  it('испорченная оценка не роняет чтение и не оставляет диагноз', () => {
    for (const answers of [null, [], 'x', 5]) {
      const state = oldState('down_syndrome', {}, { answers, capabilities: 'oops', safetyFlags: null, level: 9 });
      const r = restoreState(JSON.stringify(state));
      expect(r.data).not.toBeNull();
      expect(JSON.stringify(r.data)).not.toMatch(/diagnos|down_syndrome/);
      const a = (r.data as { assessment: FunctionalAssessment }).assessment;
      expect(a.level).toBe(5);
      expect(a.unsureFlags).toEqual(['neck_instability']);
    }
  });

  it('данные в текущем виде чтение не меняет', () => {
    const state = migrateState(oldState('cerebral_palsy', { q_head: true }) as Record<string, unknown>);
    expect(restoreState(JSON.stringify(state))).toEqual({ data: JSON.parse(JSON.stringify(state)), corrupt: false });
  });
});
