import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ContactEntry } from '@/src/domain/admin';

/**
 * Журнал связи с семьями и отметки «сигнал обработан».
 *
 * Хранится отдельно от содержания и в выгрузку не попадает: это сведения о семьях.
 * Свободного текста нет намеренно (см. ContactEntry). С появлением сервера — заменить функции этого файла.
 */
export interface FamilyLog {
  contacts: ContactEntry[];
  /** Ключи обработанных сигналов, см. `handledKey`. */
  handled: string[];
}

const KEY = 'move4fit/admin-family-log/v1';

export async function loadFamilyLog(): Promise<FamilyLog> {
  const raw = await AsyncStorage.getItem(KEY);
  return { contacts: [], handled: [], ...(raw ? JSON.parse(raw) : {}) };
}

let queue: Promise<unknown> = Promise.resolve();

/** Записать, что связались с семьёй; при необходимости отметить текущие сигналы обработанными. */
export function addContact(entry: Omit<ContactEntry, 'id'>, handledKeys: string[]): Promise<void> {
  const run = queue.then(async () => {
    const log = await loadFamilyLog();
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const next: FamilyLog = {
      contacts: [...log.contacts, { ...entry, id }],
      handled: [...new Set([...log.handled, ...handledKeys])],
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  });
  queue = run.catch(() => {});
  return run;
}
