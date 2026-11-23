import type { ParentRole } from './achievements';
import { TRACKING_TESTS } from './exercises';
import type { ChildProfile, FamilyGoal, FunctionalAssessment, SessionLog, TrackingResult } from './types';

/**
 * Кабинет администратора: сколько семей зарегистрировалось, данные по каждой и сигналы
 * «показатели снизились — стоит связаться». Чистая логика, без UI и без сети.
 */

/** Всё, что администратор видит об одной семье. Так запись должна приходить с сервера. */
export interface FamilyRecord {
  id: string;
  parent: { name: string; email: string; role?: ParentRole; consentAt?: string };
  registeredAt: string; // ISO
  child?: ChildProfile;
  assessment?: FunctionalAssessment;
  sessions: SessionLog[];
  trackingResults: TrackingResult[];
  goal?: FamilyGoal;
}

export type SignalKind = 'pain' | 'tests_worse' | 'goal_worse' | 'inactive' | 'fewer_sessions' | 'all_hard' | 'not_started';

export interface Signal {
  kind: SignalKind;
  /**
   * Что именно вызвало сигнал (вид + дата события). По ключу отмечается «сигнал обработан»:
   * после нового события ключ меняется, и сигнал появляется снова.
   */
  key: string;
  /** urgent — связаться в первую очередь; watch — обратить внимание. */
  severity: 'urgent' | 'watch';
  /** Причина словами — показывается администратору. */
  text: string;
}

const DAY = 24 * 3600 * 1000;

/**
 * ⚠️ ЧЕРНОВИК: пороги сигналов должен утвердить специалист.
 */
export const SIGNAL_RULES = {
  /** За сколько дней смотрим отметки о боли и сравниваем число занятий (текущий период с предыдущим). */
  periodDays: 14,
  /** Сколько дней без занятий считаем перерывом, после которого стоит написать семье. */
  inactiveDays: 14,
  /** Результат теста хуже предыдущего больше чем на эту долю — снижение (как порог шкалы динамики). */
  testDrop: 0.1,
  /** Число занятий упало до этой доли от предыдущего периода или ниже — снижение активности. */
  sessionsDrop: 0.5,
  /** Сколько занятий подряд «тяжело» — повод проверить нагрузку. */
  hardInRow: 3,
  /** Сколько дней после регистрации ждём первое занятие. */
  notStartedDays: 7,
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const daysSince = (iso: string, today: Date) => Math.floor((today.getTime() - new Date(iso).getTime()) / DAY);
// С сервера порядок записей не гарантирован — сортируем по дате сами.
const byDate = <T extends { date: string }>(list: T[]) => [...list].sort((a, b) => a.date.localeCompare(b.date));

/** Сигналы по одной семье, сначала срочные. Пустой список — всё в порядке. */
export function signalsFor(f: FamilyRecord, today: Date = new Date()): Signal[] {
  const R = SIGNAL_RULES;
  const signals: Signal[] = [];
  const sessions = byDate(f.sessions);
  const age = (s: SessionLog) => today.getTime() - new Date(s.date).getTime();
  const current = sessions.filter((s) => age(s) <= R.periodDays * DAY);
  const previous = sessions.filter((s) => age(s) > R.periodDays * DAY && age(s) <= 2 * R.periodDays * DAY);
  const last = sessions[sessions.length - 1];

  const painful = current.filter((s) => s.pain);
  if (painful.length > 0) {
    signals.push({
      kind: 'pain',
      key: `pain:${painful[painful.length - 1].date}`,
      severity: 'urgent',
      text: `Отмечали боль или сильный дискомфорт: ${painful.map((s) => fmt(s.date)).join(', ')}`,
    });
  }

  for (const t of TRACKING_TESTS) {
    const results = byDate(f.trackingResults.filter((r) => r.testId === t.id));
    if (results.length < 2) continue;
    const prev = results[results.length - 2];
    const cur = results[results.length - 1];
    const change = ((cur.value - prev.value) / Math.max(Math.abs(prev.value), 1)) * (t.higherIsBetter ? 1 : -1);
    if (change < -R.testDrop) {
      signals.push({
        kind: 'tests_worse',
        key: `tests_worse:${t.id}:${cur.date}`,
        severity: 'urgent',
        text: `Тест «${t.title}» стал хуже: ${prev.value} → ${cur.value} ${t.unit} (${fmt(cur.date)})`,
      });
    }
  }

  const review = f.goal?.reviews[f.goal.reviews.length - 1];
  if (f.goal && review && review.rating === -2) {
    signals.push({
      kind: 'goal_worse',
      key: `goal_worse:${review.date}`,
      severity: 'urgent',
      text: `Цель «${f.goal.text}»: родитель отметил, что стало труднее (${fmt(review.date)})`,
    });
  }

  if (!last) {
    if (daysSince(f.registeredAt, today) >= R.notStartedDays) {
      signals.push({
        kind: 'not_started',
        key: 'not_started',
        severity: 'watch',
        text: `Зарегистрировались ${fmt(f.registeredAt)}, но не провели ни одного занятия`,
      });
    }
  } else if (daysSince(last.date, today) >= R.inactiveDays) {
    signals.push({
      kind: 'inactive',
      key: `inactive:${last.date}`,
      severity: 'watch',
      text: `Нет занятий ${daysSince(last.date, today)} дн. — последнее было ${fmt(last.date)}`,
    });
  } else if (previous.length >= 2 && current.length <= previous.length * R.sessionsDrop) {
    signals.push({
      kind: 'fewer_sessions',
      key: `fewer_sessions:${last.date}`,
      severity: 'watch',
      text: `Занятий стало меньше: ${current.length} за последние ${R.periodDays} дн. против ${previous.length} за предыдущие`,
    });
  }

  const tail = sessions.slice(-R.hardInRow);
  if (tail.length === R.hardInRow && tail.every((s) => s.feedback === 'hard')) {
    signals.push({
      kind: 'all_hard',
      key: `all_hard:${tail[tail.length - 1].date}`,
      severity: 'watch',
      text: `Последние ${R.hardInRow} занятия подряд — «тяжело»`,
    });
  }

  return signals.sort((a, b) => Number(b.severity === 'urgent') - Number(a.severity === 'urgent'));
}

/** Ключ отметки «сигнал обработан» для конкретной семьи. */
export const handledKey = (familyId: string, signal: Signal) => `${familyId}|${signal.key}`;

/** Сигналы семьи, по которым администратор ещё не отметил, что связался. */
export function openSignals(f: FamilyRecord, handled: ReadonlySet<string> = new Set(), today: Date = new Date()): Signal[] {
  return signalsFor(f, today).filter((s) => !handled.has(handledKey(f.id, s)));
}

export interface AdminOverview {
  registered: number;
  /** Зарегистрировались за последние 7 и 30 дней. */
  newThisWeek: number;
  newThisMonth: number;
  /** Семьи хотя бы с одним занятием за последние 7 дней. */
  activeThisWeek: number;
  /** Семьи хотя бы с одним необработанным сигналом. */
  needAttention: number;
}

export function overview(families: FamilyRecord[], today: Date = new Date(), handled: ReadonlySet<string> = new Set()): AdminOverview {
  const within = (iso: string, days: number) => today.getTime() - new Date(iso).getTime() <= days * DAY;
  return {
    registered: families.length,
    newThisWeek: families.filter((f) => within(f.registeredAt, 7)).length,
    newThisMonth: families.filter((f) => within(f.registeredAt, 30)).length,
    activeThisWeek: families.filter((f) => f.sessions.some((s) => within(s.date, 7))).length,
    needAttention: families.filter((f) => openSignals(f, handled, today).length > 0).length,
  };
}

/** Сколько семей зарегистрировалось в каждую из последних календарных недель (с понедельника), от старых к новым. */
export function registrationsByWeek(families: FamilyRecord[], weeks = 6, today: Date = new Date()): { label: string; value: number }[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const result: { label: string; value: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const value = families.filter((f) => {
      const t = new Date(f.registeredAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    }).length;
    result.push({ label: `${from.getDate()}.${from.getMonth() + 1}`, value });
  }
  return result;
}

/** Список для администратора: сначала семьи со срочными сигналами, затем с остальными, затем новые. */
export function sortForAdmin(
  families: FamilyRecord[],
  today: Date = new Date(),
  handled: ReadonlySet<string> = new Set(),
): { family: FamilyRecord; signals: Signal[] }[] {
  const rank = (s: Signal[]) => (s.some((x) => x.severity === 'urgent') ? 0 : s.length > 0 ? 1 : 2);
  return families
    .map((family) => ({ family, signals: openSignals(family, handled, today) }))
    .sort((a, b) => rank(a.signals) - rank(b.signals) || b.family.registeredAt.localeCompare(a.family.registeredAt));
}

/**
 * Черновик письма родителю. Администратор правит его перед отправкой.
 * Имя ребёнка, боль и результаты тестов в письмо не попадают: почта не место для данных о здоровье.
 */
export function contactDraft(f: FamilyRecord, signals: Signal[]): { subject: string; body: string } {
  const kinds = new Set(signals.map((s) => s.kind));
  const reason =
    kinds.size === 1 && kinds.has('not_started')
      ? 'Вы зарегистрировались, но ещё не начали занятия. Если что-то непонятно или нужна помощь с первым занятием — напишите.'
      : [...kinds].every((k) => k === 'inactive' || k === 'fewer_sessions') && kinds.size > 0
        ? 'Заметили, что занятий стало меньше. Всё ли в порядке? Если что-то мешает или упражнения не подходят — расскажите, поможем.'
        : 'Хотим узнать, как проходят занятия и не нужна ли помощь с подбором упражнений.';
  return {
    subject: 'Move4Fit: как проходят занятия?',
    body: `Здравствуйте, ${f.parent.name}!\n\nЭто куратор Move4Fit. ${reason}\n\nМожно ответить на это письмо.`,
  };
}

// ---------- Журнал связи ----------

export type ContactChannel = 'email' | 'phone' | 'messenger';
export type ContactOutcome = 'agreed' | 'all_fine' | 'no_answer' | 'referred';

export const CHANNEL_LABELS: Record<ContactChannel, string> = { email: 'Почта', phone: 'Телефон', messenger: 'Мессенджер' };
export const OUTCOME_LABELS: Record<ContactOutcome, string> = {
  agreed: 'Договорились, что делать дальше',
  all_fine: 'Всё в порядке',
  no_answer: 'Не ответили',
  referred: 'Передали специалисту',
};

/**
 * Запись о связи с семьёй. Свободного текста нет намеренно: в заметках о семье быстро копятся
 * данные о здоровье ребёнка, а хранить их на устройстве администратора нельзя.
 */
export interface ContactEntry {
  id: string;
  familyId: string;
  at: string; // ISO
  channel: ContactChannel;
  outcome: ContactOutcome;
}
