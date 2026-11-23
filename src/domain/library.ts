import type { Article, ArticleCategory } from '../content/articles';
import { DIFFICULTIES, LEVELS, PARTS, validateExercise, type WorkoutTemplate } from './content';
import type { GoalPreset } from './goals';
import type { Exercise } from './types';

/**
 * Библиотека содержания администратора: встроенное в приложение + правки и свои записи.
 * Чистая логика: слияние по id, ограничения на правку встроенного, проверка статей и целей,
 * выгрузка в файл и загрузка из файла.
 *
 * Родителям правки не показываются: то, что не утвердил специалист, не должно попадать к ребёнку.
 */

// ---------- Записи и слияние ----------

export interface Review {
  /** Кто проверил. Это отметка администратора на его устройстве, а не подпись специалиста. */
  by: string;
  at: string; // ISO
}

export interface Stored<T> {
  item: T;
  updatedAt: string; // ISO
  review?: Review;
  /** Убрано из каталога: в новые занятия не предлагается, но остаётся для истории. */
  archived?: boolean;
  /** Встроенная версия на момент правки (JSON) — чтобы заметить, что встроенное с тех пор изменилось. */
  base?: string;
}

/** builtin — как в приложении; edited — встроенное с правкой администратора; custom — создано администратором. */
export type Origin = 'builtin' | 'edited' | 'custom';

export interface Merged<T> extends Stored<T> {
  origin: Origin;
  /** Встроенная версия изменилась после правки администратора: правку стоит перепроверить. */
  baseChanged: boolean;
}

/** Встроенные записи с наложенными правками (по id), затем свои записи администратора. */
export function mergeById<T extends { id: string }>(builtIn: T[], stored: Stored<T>[]): Merged<T>[] {
  const edits = new Map(stored.map((s) => [s.item.id, s]));
  const builtInIds = new Set(builtIn.map((b) => b.id));
  const fromBuiltIn = builtIn.map((b): Merged<T> => {
    const edit = edits.get(b.id);
    if (!edit) return { item: b, updatedAt: '', origin: 'builtin', baseChanged: false };
    const changed = JSON.stringify(edit.item) !== JSON.stringify(b);
    return { ...edit, origin: changed ? 'edited' : 'builtin', baseChanged: edit.base !== undefined && edit.base !== JSON.stringify(b) };
  });
  const custom = stored.filter((s) => !builtInIds.has(s.item.id)).map((s): Merged<T> => ({ ...s, origin: 'custom', baseChanged: false }));
  return [...fromBuiltIn, ...custom];
}

/** Записи, которые можно ставить в новые занятия и показывать в списках выбора. */
export function activeItems<T>(merged: Merged<T>[]): T[] {
  return merged.filter((m) => !m.archived).map((m) => m.item);
}

/**
 * Правка встроенного упражнения: меняются только тексты, инвентарь и видео.
 * ⚠️ Часть занятия, группы, возраст, умения, риски и дозировка управляют противопоказаниями и подбором —
 * их меняет только специалист через код приложения.
 */
export function lockBuiltIn(builtIn: Exercise, edited: Exercise): Exercise {
  return {
    ...builtIn,
    title: edited.title,
    description: edited.description,
    equipment: edited.equipment,
    videoUrl: edited.videoUrl,
    variants: builtIn.variants.map((v) => ({
      ...v,
      instructions: edited.variants.find((x) => x.difficulty === v.difficulty)?.instructions ?? v.instructions,
    })),
  };
}

// ---------- Статьи ----------

export const ARTICLE_CATEGORIES: ArticleCategory[] = ['support', 'conditions', 'practice', 'people'];

export function blankArticle(id: string): Article {
  return { id, category: 'support', title: '', icon: '📄', minutes: 1, body: [''] };
}

/** Примерное время чтения: около 150 слов в минуту, не меньше минуты. */
export function readingMinutes(body: string[]): number {
  const words = body.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 150));
}

export const isHeading = (block: string) => block.startsWith('## ');

export function validateArticle(a: Article): string[] {
  const errors: string[] = [];
  if (!a.title.trim()) errors.push('Напишите заголовок статьи.');
  if (!a.icon.trim()) errors.push('Выберите значок статьи.');
  const text = a.body.filter((b) => !isHeading(b) && b.trim());
  if (text.length === 0) errors.push('Добавьте хотя бы один абзац текста.');
  if (a.body.some((b) => (isHeading(b) ? !b.slice(3).trim() : !b.trim()))) errors.push('Заполните или удалите пустые абзацы и подзаголовки.');
  return errors;
}

/** Изменился ли текст статьи (то, что читает родитель). После такой правки отметка о проверке снимается. */
export function articleTextChanged(before: Article, after: Article): boolean {
  return before.title !== after.title || JSON.stringify(before.body) !== JSON.stringify(after.body);
}

// ---------- Цели ----------

export function validateGoal(g: GoalPreset): string[] {
  const errors: string[] = [];
  if (!g.title.trim()) errors.push('Напишите цель.');
  if (g.levels.length === 0) errors.push('Отметьте, каким группам детей подходит цель.');
  return errors;
}

// ---------- Документ содержания, выгрузка и загрузка ----------

export interface SupportContacts {
  telegram: string;
  whatsapp: string;
  email: string;
  communityUrl: string;
}

export const EMPTY_SUPPORT: SupportContacts = { telegram: '', whatsapp: '', email: '', communityUrl: '' };

export function validateSupport(s: SupportContacts): string[] {
  const errors: string[] = [];
  if (s.telegram && !/^[A-Za-z0-9_]{3,}$/.test(s.telegram)) errors.push('Telegram: только имя пользователя, без @ и ссылки.');
  if (s.whatsapp && !/^\d{8,15}$/.test(s.whatsapp)) errors.push('WhatsApp: номер в международном формате, только цифры.');
  if (s.email && !/^\S+@\S+\.\S+$/.test(s.email)) errors.push('Почта: проверьте адрес.');
  if (s.communityUrl && !/^https:\/\/\S+$/.test(s.communityUrl)) errors.push('Чат родителей: ссылка должна начинаться с https://.');
  return errors;
}

/** Всё содержание, которое ведёт администратор. Данных о семьях здесь нет и быть не должно. */
export interface ContentDoc {
  exercises: Stored<Exercise>[];
  workouts: WorkoutTemplate[];
  articles: Stored<Article>[];
  goals: Stored<GoalPreset>[];
  support: SupportContacts;
}

export const EMPTY_DOC: ContentDoc = { exercises: [], workouts: [], articles: [], goals: [], support: EMPTY_SUPPORT };

export const BACKUP_FORMAT = 'move4fit-content';
export const SCHEMA_VERSION = 2;

export function buildBackup(doc: ContentDoc, now: Date = new Date()): string {
  return JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), ...doc }, null, 2);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isStrList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr);
const within = <T>(allowed: readonly T[], list: unknown) => Array.isArray(list) && list.every((v) => allowed.includes(v as T));

/** Типам TypeScript в чужом файле верить нельзя — проверяем форму руками. */
function isExercise(x: unknown): x is Exercise {
  if (!isObj(x) || !isStr(x.id) || !x.id || !isStr(x.title) || !isStr(x.description)) return false;
  if (!PARTS.includes(x.part as never) || !['lying', 'sitting', 'kneeling', 'standing'].includes(x.position as string)) return false;
  if (!isStrList(x.goals) || !isStrList(x.requires) || !isStrList(x.risks) || !within(LEVELS, x.levels)) return false;
  if (typeof x.minAge !== 'number' || (x.videoUrl !== undefined && !isStr(x.videoUrl))) return false;
  if (x.equipment !== undefined && !isStrList(x.equipment)) return false;
  if (!Array.isArray(x.variants) || x.variants.length !== DIFFICULTIES.length) return false;
  const variantsOk = x.variants.every(
    (v) => isObj(v) && DIFFICULTIES.includes(v.difficulty as never) && isStr(v.instructions) && typeof v.sets === 'number',
  );
  return variantsOk && new Set(x.variants.map((v) => v.difficulty)).size === DIFFICULTIES.length && validateExercise(x as unknown as Exercise).length === 0;
}

function isArticle(x: unknown): x is Article {
  return (
    isObj(x) && isStr(x.id) && !!x.id && isStr(x.title) && isStr(x.icon) && typeof x.minutes === 'number' && isStrList(x.body) &&
    ARTICLE_CATEGORIES.includes(x.category as ArticleCategory) && validateArticle(x as unknown as Article).length === 0
  );
}

function isGoal(x: unknown): x is GoalPreset {
  return isObj(x) && isStr(x.id) && !!x.id && isStr(x.title) && within(LEVELS, x.levels) && validateGoal(x as unknown as GoalPreset).length === 0;
}

function isWorkout(x: unknown): x is WorkoutTemplate {
  return (
    isObj(x) && isStr(x.id) && !!x.id && isStr(x.title) && LEVELS.includes(x.level as never) && isStr(x.createdAt) && Array.isArray(x.items) &&
    x.items.every((i) => isObj(i) && isStr(i.exerciseId) && DIFFICULTIES.includes(i.difficulty as never))
  );
}

/** Записи из файла: оставляем только известные поля; отметку о проверке из файла не переносим. */
function storedList<T>(list: unknown, isItem: (x: unknown) => x is T, skipped: { n: number }): Stored<T>[] {
  if (!Array.isArray(list)) return [];
  const result: Stored<T>[] = [];
  for (const raw of list) {
    // Поддерживаем и прежний вид записи упражнения: { exercise, updatedAt }.
    const item = isObj(raw) ? (raw.item ?? raw.exercise) : undefined;
    if (!isObj(raw) || !isItem(item)) {
      skipped.n++;
      continue;
    }
    result.push({
      item,
      updatedAt: isStr(raw.updatedAt) ? raw.updatedAt : '',
      archived: raw.archived === true ? true : undefined,
      base: isStr(raw.base) ? raw.base : undefined,
    });
  }
  return result;
}

export type ParsedBackup = { ok: true; doc: ContentDoc; skipped: number } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Это не файл содержания Move4Fit: его не удалось прочитать.' };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: 'Это не файл содержания Move4Fit.' };
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'Файл сделан в более новой версии приложения. Обновите приложение и повторите.' };
  }
  const skipped = { n: 0 };
  const workouts: WorkoutTemplate[] = [];
  for (const w of Array.isArray(raw.workouts) ? raw.workouts : []) {
    if (isWorkout(w)) workouts.push({ id: w.id, title: w.title, level: w.level, note: isStr(w.note) ? w.note : undefined, items: w.items, createdAt: w.createdAt });
    else skipped.n++;
  }
  const s = isObj(raw.support) ? raw.support : {};
  const support: SupportContacts = {
    telegram: isStr(s.telegram) ? s.telegram : '',
    whatsapp: isStr(s.whatsapp) ? s.whatsapp : '',
    email: isStr(s.email) ? s.email : '',
    communityUrl: isStr(s.communityUrl) ? s.communityUrl : '',
  };
  const doc: ContentDoc = {
    exercises: storedList(raw.exercises, isExercise, skipped),
    workouts,
    articles: storedList(raw.articles, isArticle, skipped),
    goals: storedList(raw.goals, isGoal, skipped),
    support: validateSupport(support).length === 0 ? support : EMPTY_SUPPORT,
  };
  return { ok: true, doc, skipped: skipped.n };
}

export interface ImportPlan {
  /** Что получится после загрузки. */
  doc: ContentDoc;
  added: number;
  changed: number;
  same: number;
}

function mergeLists<T>(current: T[], incoming: T[], idOf: (x: T) => string, bodyOf: (x: T) => unknown, plan: ImportPlan): T[] {
  const result = [...current];
  for (const inc of incoming) {
    const i = result.findIndex((x) => idOf(x) === idOf(inc));
    if (i < 0) {
      result.push(inc);
      plan.added++;
    } else if (JSON.stringify(bodyOf(result[i])) === JSON.stringify(bodyOf(inc))) {
      plan.same++;
    } else {
      result[i] = inc;
      plan.changed++;
    }
  }
  return result;
}

/**
 * Что изменит загрузка файла: записи добавляются и заменяются по id, остальное остаётся как было.
 * Отметки «проверено» у изменённых записей снимаются (в файле их нет), у совпадающих — сохраняются.
 */
export function planImport(current: ContentDoc, incoming: ContentDoc): ImportPlan {
  const plan: ImportPlan = { doc: current, added: 0, changed: 0, same: 0 };
  const stored = <T extends { id: string }>(a: Stored<T>[], b: Stored<T>[]) =>
    mergeLists(a, b, (x) => x.item.id, (x) => [x.item, x.archived ?? false], plan);
  const hasContacts = Object.values(incoming.support).some(Boolean);
  plan.doc = {
    exercises: stored(current.exercises, incoming.exercises),
    workouts: mergeLists(current.workouts, incoming.workouts, (x) => x.id, (x) => x, plan),
    articles: stored(current.articles, incoming.articles),
    goals: stored(current.goals, incoming.goals),
    support: hasContacts ? incoming.support : current.support,
  };
  return plan;
}
