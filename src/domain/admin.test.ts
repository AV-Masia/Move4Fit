import { describe, expect, it } from 'vitest';

import { contactDraft, handledKey, openSignals, overview, registrationsByWeek, signalsFor, sortForAdmin, type FamilyRecord } from './admin';
import type { Feedback, SessionLog, TrackingResult } from './types';

const day = 24 * 3600 * 1000;
const today = new Date(2026, 10, 14, 12, 0); // суббота
const ago = (d: number) => new Date(today.getTime() - d * day).toISOString();

const session = (daysAgo: number, extra: Partial<SessionLog> = {}): SessionLog => ({
  id: `s${daysAgo}`,
  childId: 'c',
  date: ago(daysAgo),
  items: [{ exerciseId: 'bridge', difficulty: 1 }],
  feedback: 'ok',
  pain: false,
  ...extra,
});
const result = (value: number, daysAgo: number, testId = 'sit_to_stand_30s'): TrackingResult => ({
  id: `${testId}-${daysAgo}`,
  childId: 'c',
  testId,
  value,
  date: ago(daysAgo),
});
const family = (extra: Partial<FamilyRecord> = {}): FamilyRecord => ({
  id: 'f',
  parent: { name: 'Анна', email: 'anna@example.com' },
  registeredAt: ago(60),
  sessions: [],
  trackingResults: [],
  ...extra,
});
const kinds = (f: FamilyRecord) => signalsFor(f, today).map((s) => s.kind);

describe('сигналы администратору', () => {
  it('регулярные занятия без жалоб — сигналов нет', () => {
    expect(kinds(family({ sessions: [session(20), session(16), session(9), session(5), session(1)] }))).toEqual([]);
  });

  it('недавняя боль — срочный сигнал; давняя — нет', () => {
    const recent = signalsFor(family({ sessions: [session(3, { pain: true }), session(1)] }), today);
    expect(recent.map((s) => [s.kind, s.severity])).toEqual([['pain', 'urgent']]);
    expect(kinds(family({ sessions: [session(20, { pain: true }), session(1)] }))).toEqual([]);
  });

  it('последний результат теста хуже предыдущего больше чем на 10 % — снижение', () => {
    const sessions = [session(1)];
    expect(kinds(family({ sessions, trackingResults: [result(10, 40), result(8, 2)] }))).toEqual(['tests_worse']);
    // В пределах порога и улучшение — не сигнал.
    expect(kinds(family({ sessions, trackingResults: [result(10, 40), result(9, 2)] }))).toEqual([]);
    expect(kinds(family({ sessions, trackingResults: [result(8, 40), result(10, 2)] }))).toEqual([]);
    // Сравниваем с предыдущим результатом, а не с первым: после спада был рост.
    expect(kinds(family({ sessions, trackingResults: [result(10, 60), result(6, 40), result(8, 2)] }))).toEqual([]);
  });

  it('оценка цели «стало труднее» — сигнал, «без изменений» — нет', () => {
    const goal = (rating: -2 | -1) => ({ id: 'g', text: 'Сидеть за столом', setAt: ago(60), reviews: [{ date: ago(2), rating }] });
    expect(kinds(family({ sessions: [session(1)], goal: goal(-2) }))).toEqual(['goal_worse']);
    expect(kinds(family({ sessions: [session(1)], goal: goal(-1) }))).toEqual([]);
  });

  it('две недели без занятий — «нет занятий», а не «стало меньше»', () => {
    expect(kinds(family({ sessions: [session(25), session(22), session(18)] }))).toEqual(['inactive']);
  });

  it('занятий вдвое меньше, чем в предыдущие две недели, — снижение активности', () => {
    expect(kinds(family({ sessions: [session(27), session(24), session(20), session(16), session(3)] }))).toEqual(['fewer_sessions']);
    // 2 против 3 — обычные колебания.
    expect(kinds(family({ sessions: [session(27), session(24), session(20), session(8), session(3)] }))).toEqual([]);
  });

  it('три занятия подряд «тяжело»', () => {
    const hard = (d: number, feedback: Feedback = 'hard') => session(d, { feedback });
    expect(kinds(family({ sessions: [hard(6), hard(4), hard(1)] }))).toEqual(['all_hard']);
    expect(kinds(family({ sessions: [hard(6), hard(4, 'ok'), hard(1)] }))).toEqual([]);
  });

  it('неделя после регистрации без занятий — «не начали»; только что зарегистрировались — нет', () => {
    expect(kinds(family({ registeredAt: ago(8) }))).toEqual(['not_started']);
    expect(kinds(family({ registeredAt: ago(2) }))).toEqual([]);
  });

  it('срочные сигналы идут первыми', () => {
    const f = family({ sessions: [session(40), session(30, { pain: false })], trackingResults: [result(10, 50), result(5, 30)] });
    expect(kinds(f)).toEqual(['tests_worse', 'inactive']);
  });
});

describe('сводка и список', () => {
  const families = [
    family({ id: 'ok', registeredAt: ago(40), sessions: [session(9), session(5), session(1)] }),
    family({ id: 'new', registeredAt: ago(3) }),
    family({ id: 'quiet', registeredAt: ago(20) }),
    family({ id: 'pain', registeredAt: ago(50), sessions: [session(2, { pain: true })] }),
  ];

  it('считает зарегистрированных, новых, активных и требующих внимания', () => {
    expect(overview(families, today)).toEqual({ registered: 4, newThisWeek: 1, newThisMonth: 2, activeThisWeek: 2, needAttention: 2 });
  });

  it('список: срочные, затем остальные сигналы, затем по дате регистрации', () => {
    expect(sortForAdmin(families, today).map((x) => x.family.id)).toEqual(['pain', 'quiet', 'new', 'ok']);
  });

  it('регистрации по неделям', () => {
    const weeks = registrationsByWeek(families, 3, today);
    // Сегодня суббота 14.11: текущая неделя с 9.11, в неё попала регистрация 3 дня назад.
    expect(weeks.map((w) => w.label)).toEqual(['26.10', '2.11', '9.11']);
    expect(weeks.map((w) => w.value)).toEqual([0, 0, 1]);
  });

  it('черновик письма обращается по имени и не упоминает ребёнка и данные о здоровье', () => {
    const child = { id: 'c', name: 'Соня', ageYears: 5, doctorClearanceConfirmed: false, createdAt: ago(50) };
    const f = { ...families[3], child };
    const draft = contactDraft(f, signalsFor(f, today));
    expect(draft.body).toContain('Здравствуйте, Анна!');
    expect(draft.body).not.toMatch(/бол|Соня|чувству/i);
  });

  it('обработанный сигнал скрывается, но после нового события появляется снова', () => {
    const f = families[3];
    const handled = new Set(signalsFor(f, today).map((s) => handledKey(f.id, s)));
    expect(openSignals(f, handled, today)).toEqual([]);
    expect(overview(families, today, handled).needAttention).toBe(1);
    expect(sortForAdmin(families, today, handled).map((x) => x.family.id)).toEqual(['quiet', 'new', 'ok', 'pain']);
    const again = { ...f, sessions: [...f.sessions, session(0, { pain: true })] };
    expect(openSignals(again, handled, today).map((s) => s.kind)).toEqual(['pain']);
  });

  it('порядок записей с сервера не важен', () => {
    const f = family({ sessions: [session(1), session(40), session(30)], trackingResults: [result(5, 2), result(10, 50)] });
    expect(signalsFor(f, today).map((s) => s.kind)).toEqual(['tests_worse']);
  });
});
