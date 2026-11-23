import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { ARTICLES, type Article } from '@/src/content/articles';
import type { WorkoutTemplate } from '@/src/domain/content';
import { EXERCISES } from '@/src/domain/exercises';
import { GOAL_PRESETS, type GoalPreset } from '@/src/domain/goals';
import {
  EMPTY_DOC,
  EMPTY_SUPPORT,
  activeItems,
  buildBackup,
  mergeById,
  type ContentDoc,
  type Merged,
  type Stored,
  type SupportContacts,
} from '@/src/domain/library';
import type { Exercise } from '@/src/domain/types';

/**
 * Содержание администратора: правки встроенных упражнений, статей и целей, свои записи, занятия, контакты.
 *
 * Сейчас сервера нет, поэтому всё хранится на устройстве администратора и родителям не показывается.
 * Когда появится сервер, заменить нужно функции этого файла: экраны работают только через них.
 */

/** Видеофайл, выбранный на устройстве. Загружать его пока некуда; в выгрузку он не попадает. */
export interface LocalVideo {
  uri: string;
  fileName: string;
}

interface Saved extends ContentDoc {
  localVideos: Record<string, LocalVideo>;
}

export interface AdminContent extends ContentDoc {
  localVideos: Record<string, LocalVideo>;
}

const KEY = 'move4fit/admin-content/v1';
const BACKUP_KEY = 'move4fit/admin-content/before-import';
const EXPORTED_AT_KEY = 'move4fit/admin-content/exported-at';

export const newContentId = (prefix: 'custom' | 'workout') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Читает сохранённое. Если запись испорчена — ошибка: молча начинать с пустого значило бы стереть работу. */
export async function loadContent(): Promise<AdminContent> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return { ...EMPTY_DOC, localVideos: {} };
  const saved = JSON.parse(raw) as Partial<Saved> & { exercises?: unknown[] };
  const localVideos: Record<string, LocalVideo> = { ...(saved.localVideos ?? {}) };
  // Прежний вид записи упражнения: { exercise, localVideo, updatedAt }.
  const exercises = (saved.exercises ?? []).map((x) => {
    const old = x as { exercise?: Exercise; localVideo?: LocalVideo; updatedAt?: string };
    if (!old.exercise) return x as Stored<Exercise>;
    if (old.localVideo) localVideos[old.exercise.id] = old.localVideo;
    return { item: old.exercise, updatedAt: old.updatedAt ?? '' };
  });
  return {
    exercises,
    workouts: saved.workouts ?? [],
    articles: saved.articles ?? [],
    goals: saved.goals ?? [],
    support: { ...EMPTY_SUPPORT, ...(saved.support ?? {}) },
    localVideos,
  };
}

// Записи идут строго по очереди: два быстрых сохранения не должны затирать друг друга.
let queue: Promise<unknown> = Promise.resolve();

function update(change: (c: AdminContent) => AdminContent): Promise<void> {
  const run = queue.then(async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(change(await loadContent())));
  });
  queue = run.catch(() => {});
  return run;
}

type Kind = 'exercises' | 'articles' | 'goals';
type ItemOf<K extends Kind> = ContentDoc[K][number]['item'];

function put<K extends Kind>(kind: K, entry: Stored<ItemOf<K>>) {
  return update((c) => {
    const list = c[kind] as Stored<ItemOf<K>>[];
    const exists = list.some((x) => x.item.id === entry.item.id);
    const next = exists ? list.map((x) => (x.item.id === entry.item.id ? entry : x)) : [...list, entry];
    return { ...c, [kind]: next };
  });
}

/** Сохранить запись. `updatedAt` ставится здесь. */
export function saveItem<K extends Kind>(kind: K, entry: Omit<Stored<ItemOf<K>>, 'updatedAt'>) {
  return put(kind, { ...entry, updatedAt: new Date().toISOString() });
}

/** Удалить запись совсем. Только для своих записей; встроенное убирается в архив через `saveItem`. */
export function removeItem(kind: Kind, id: string) {
  return update((c) => {
    const localVideos = { ...c.localVideos };
    if (kind === 'exercises') delete localVideos[id];
    return { ...c, [kind]: c[kind].filter((x) => x.item.id !== id), localVideos };
  });
}

export function setLocalVideo(exerciseId: string, video: LocalVideo | undefined) {
  return update((c) => {
    const localVideos = { ...c.localVideos };
    if (video) localVideos[exerciseId] = video;
    else delete localVideos[exerciseId];
    return { ...c, localVideos };
  });
}

export const saveWorkout = (item: WorkoutTemplate) =>
  update((c) => ({ ...c, workouts: c.workouts.some((x) => x.id === item.id) ? c.workouts.map((x) => (x.id === item.id ? item : x)) : [...c.workouts, item] }));

export const deleteWorkout = (id: string) => update((c) => ({ ...c, workouts: c.workouts.filter((x) => x.id !== id) }));

export const saveSupport = (support: SupportContacts) => update((c) => ({ ...c, support }));

// ---------- Встроенное + правки ----------

export const mergedExercises = (c: ContentDoc): Merged<Exercise>[] => mergeById(EXERCISES, c.exercises);
export const mergedArticles = (c: ContentDoc): Merged<Article>[] => mergeById(ARTICLES, c.articles);
export const mergedGoals = (c: ContentDoc): Merged<GoalPreset>[] => mergeById(GOAL_PRESETS, c.goals);

/** Упражнения, из которых можно собирать новые занятия (без архивных). */
export const activeCatalog = (c: ContentDoc): Exercise[] => activeItems(mergedExercises(c));

/** Все упражнения, включая архивные, — чтобы показать название в уже собранном занятии. */
export const fullCatalog = (c: ContentDoc): Exercise[] => mergedExercises(c).map((m) => m.item);

// ---------- Выгрузка и загрузка ----------

/** Текст файла для выгрузки. Локальные видео в него не входят. */
export async function exportText(): Promise<string> {
  const { localVideos: _skip, ...doc } = await loadContent();
  await AsyncStorage.setItem(EXPORTED_AT_KEY, new Date().toISOString());
  return buildBackup(doc);
}

export const lastExportedAt = () => AsyncStorage.getItem(EXPORTED_AT_KEY);

/** Заменяет содержание результатом загрузки; прежнее состояние сохраняется на случай отмены. */
export function applyImport(doc: ContentDoc) {
  const run = queue.then(async () => {
    const before = await AsyncStorage.getItem(KEY);
    if (before) await AsyncStorage.setItem(BACKUP_KEY, before);
    const current = await loadContent();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...doc, localVideos: current.localVideos }));
  });
  queue = run.catch(() => {});
  return run;
}

export const hasImportBackup = async () => !!(await AsyncStorage.getItem(BACKUP_KEY));

/** Вернуть содержание, каким оно было до последней загрузки файла. */
export function undoImport() {
  const run = queue.then(async () => {
    const before = await AsyncStorage.getItem(BACKUP_KEY);
    if (!before) return;
    await AsyncStorage.setItem(KEY, before);
    await AsyncStorage.removeItem(BACKUP_KEY);
  });
  queue = run.catch(() => {});
  return run;
}

// ---------- Локальные видео ----------

// Адреса файлов, выбранных в браузере, живут только до перезагрузки страницы.
const pickedThisSession = new Set<string>();

export function rememberPicked(uri: string) {
  pickedThisSession.add(uri);
}

/** Можно ли сейчас показать выбранный на устройстве файл. */
export function isLocalVideoAvailable(uri: string): boolean {
  return Platform.OS !== 'web' || pickedThisSession.has(uri);
}
