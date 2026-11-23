import type { FamilyRecord } from '@/src/domain/admin';
import type { Feedback, SessionLog, TrackingResult } from '@/src/domain/types';

/**
 * Откуда кабинет администратора берёт данные о семьях.
 *
 * Сейчас сервера нет: приложение хранит данные только на устройстве родителя, поэтому здесь —
 * выдуманные семьи для показа экранов. Когда появится сервер, заменить нужно только `loadFamilies`
 * (и добавить вход администратора): экраны и правила сигналов работают с `FamilyRecord` и не изменятся.
 */
export interface FamiliesResult {
  families: FamilyRecord[];
  /** true — данные выдуманные, сервер не подключён. */
  demo: boolean;
}

export async function loadFamilies(): Promise<FamiliesResult> {
  return { families: demoFamilies(new Date()), demo: true };
}

export async function loadFamily(id: string): Promise<{ family?: FamilyRecord; demo: boolean }> {
  const { families, demo } = await loadFamilies();
  return { family: families.find((f) => f.id === id), demo };
}

// ---------- Выдуманные семьи ----------

const DAY = 24 * 3600 * 1000;

function demoFamilies(today: Date): FamilyRecord[] {
  const ago = (d: number) => new Date(today.getTime() - d * DAY).toISOString();
  const sessions = (childId: string, days: number[], feedback: Feedback = 'ok', painDay?: number): SessionLog[] =>
    days.map((d) => ({
      id: `${childId}-s${d}`,
      childId,
      date: ago(d),
      items: [
        { exerciseId: 'bridge', difficulty: 1 },
        { exerciseId: 'heel_raises', difficulty: 1 },
      ],
      feedback,
      pain: d === painDay,
      painSigns: d === painDay ? ['grimace', 'withdraw'] : undefined,
      painArea: d === painDay ? 'legs' : undefined,
    }));
  const tests = (childId: string, testId: string, values: [number, number][]): TrackingResult[] =>
    values.map(([value, d]) => ({ id: `${childId}-${testId}-${d}`, childId, testId, value, date: ago(d) }));
  const child = (id: string, name: string, ageYears: number, sex: 'girl' | 'boy', registeredDaysAgo: number) => ({
    id,
    name,
    ageYears,
    sex,
    doctorClearanceConfirmed: false,
    createdAt: ago(registeredDaysAgo),
  });
  const assessment = (childId: string, level: 1 | 2 | 3 | 4 | 5, d: number) => ({
    childId,
    date: ago(d),
    answers: { motor: {}, safety: {} },
    capabilities: [],
    computedLevel: level,
    level,
    safetyFlags: [],
    unsureFlags: [],
    excludedRisks: [],
    clearanceRequired: false,
  });
  const parent = (name: string, email: string, role: 'mom' | 'dad', d: number) => ({ name, email, role, consentAt: ago(d) });

  return [
    {
      id: 'demo-1',
      parent: parent('Мария (пример)', 'maria@example.com', 'mom', 70),
      registeredAt: ago(70),
      child: child('c1', 'Соня', 5.5, 'girl', 70),
      assessment: assessment('c1', 2, 70),
      sessions: sessions('c1', [66, 62, 59, 55, 51, 47, 44, 40, 36, 33, 29, 25, 22, 18, 14, 11, 7, 4, 1]),
      trackingResults: tests('c1', 'sit_to_stand_30s', [[6, 65], [8, 35], [9, 5]]),
      goal: { id: 'g1', text: 'Подниматься по лестнице с перилами', setAt: ago(64), reviews: [{ date: ago(8), rating: 1 }] },
    },
    {
      id: 'demo-2',
      parent: parent('Олег (пример)', 'oleg@example.com', 'dad', 55),
      registeredAt: ago(55),
      child: child('c2', 'Тимур', 7, 'boy', 55),
      assessment: assessment('c2', 3, 55),
      sessions: sessions('c2', [50, 46, 43, 39, 36, 32, 28, 25, 21, 18, 12, 6, 3], 'ok', 3),
      trackingResults: tests('c2', 'sitting_hold', [[60, 50], [75, 24], [55, 4]]),
    },
    {
      id: 'demo-3',
      parent: parent('Елена (пример)', 'elena@example.com', 'mom', 45),
      registeredAt: ago(45),
      child: child('c3', 'Миша', 4, 'boy', 45),
      assessment: assessment('c3', 4, 45),
      sessions: sessions('c3', [42, 39, 35, 32, 28, 25, 21]),
      trackingResults: [],
    },
    {
      id: 'demo-4',
      parent: parent('Ирина (пример)', 'irina@example.com', 'mom', 30),
      registeredAt: ago(30),
      child: child('c4', 'Аня', 6, 'girl', 30),
      assessment: assessment('c4', 1, 30),
      sessions: sessions('c4', [27, 25, 22, 20, 17, 15, 9]),
      trackingResults: tests('c4', 'single_leg_balance', [[4, 26], [5, 10]]),
    },
    {
      id: 'demo-5',
      parent: parent('Павел (пример)', 'pavel@example.com', 'dad', 12),
      registeredAt: ago(12),
      child: child('c5', 'Лев', 3, 'boy', 12),
      assessment: assessment('c5', 5, 12),
      sessions: [],
      trackingResults: [],
    },
    {
      id: 'demo-6',
      parent: parent('Наталья (пример)', 'natalia@example.com', 'mom', 2),
      registeredAt: ago(2),
      sessions: [],
      trackingResults: [],
    },
  ];
}
