import { describe, expect, it } from 'vitest';

import { ARTICLES } from '../content/articles';
import { EXERCISES } from './exercises';
import { GOAL_PRESETS } from './goals';
import {
  EMPTY_DOC,
  activeItems,
  articleTextChanged,
  blankArticle,
  buildBackup,
  lockBuiltIn,
  mergeById,
  parseBackup,
  planImport,
  readingMinutes,
  validateArticle,
  validateGoal,
  validateSupport,
  type ContentDoc,
  type Stored,
} from './library';
import type { Exercise } from './types';

const at = '2026-11-14T08:00:00.000Z';
const base = EXERCISES[0];
const custom: Exercise = { ...base, id: 'custom_1', title: 'Своё упражнение' };

describe('слияние встроенного с правками', () => {
  it('без правок — всё встроенное', () => {
    const merged = mergeById(EXERCISES, []);
    expect(merged).toHaveLength(EXERCISES.length);
    expect(merged.every((m) => m.origin === 'builtin' && !m.baseChanged)).toBe(true);
  });

  it('правка заменяет встроенное по id и не даёт дублей; своё добавляется в конец', () => {
    const edit: Stored<Exercise> = { item: { ...base, title: 'Новое название' }, updatedAt: at, base: JSON.stringify(base) };
    const merged = mergeById(EXERCISES, [edit, { item: custom, updatedAt: at }]);
    expect(merged).toHaveLength(EXERCISES.length + 1);
    expect(merged[0]).toMatchObject({ origin: 'edited', baseChanged: false });
    expect(merged[0].item.title).toBe('Новое название');
    expect(merged[merged.length - 1]).toMatchObject({ origin: 'custom' });
  });

  it('замечает, что встроенное изменилось после правки', () => {
    const edit: Stored<Exercise> = { item: { ...base, title: 'Правка' }, updatedAt: at, base: JSON.stringify({ ...base, description: 'старое' }) };
    expect(mergeById(EXERCISES, [edit])[0].baseChanged).toBe(true);
  });

  it('архивные записи не предлагаются для новых занятий', () => {
    const merged = mergeById(EXERCISES, [{ item: base, updatedAt: at, archived: true }]);
    expect(merged[0]).toMatchObject({ origin: 'builtin', archived: true });
    expect(activeItems(merged).map((e) => e.id)).not.toContain(base.id);
    expect(activeItems(merged)).toHaveLength(EXERCISES.length - 1);
  });

  it('у встроенного упражнения меняются только тексты и видео', () => {
    const attempt: Exercise = {
      ...base,
      title: 'Иначе',
      description: 'Новое описание',
      videoUrl: 'https://example.com/v.mp4',
      risks: ['impact'],
      levels: [1],
      minAge: 10,
      requires: ['run_jump'],
      variants: base.variants.map((v) => ({ ...v, instructions: `${v.instructions}!`, sets: 9, reps: 99 })),
    };
    const locked = lockBuiltIn(base, attempt);
    expect(locked).toMatchObject({ title: 'Иначе', description: 'Новое описание', videoUrl: 'https://example.com/v.mp4' });
    expect(locked.risks).toEqual(base.risks);
    expect(locked.levels).toEqual(base.levels);
    expect(locked.minAge).toBe(base.minAge);
    expect(locked.requires).toEqual(base.requires);
    expect(locked.variants.map((v) => [v.sets, v.reps])).toEqual(base.variants.map((v) => [v.sets, v.reps]));
    expect(locked.variants[0].instructions).toBe(`${base.variants[0].instructions}!`);
  });
});

describe('статьи и цели', () => {
  it('встроенные статьи и цели проходят проверку', () => {
    for (const a of ARTICLES) expect(validateArticle(a), a.id).toEqual([]);
    for (const g of GOAL_PRESETS) expect(validateGoal(g), g.id).toEqual([]);
  });

  it('пустая статья не проходит, пустые блоки называются', () => {
    expect(validateArticle(blankArticle('a'))).toContain('Напишите заголовок статьи.');
    const a = { ...blankArticle('a'), title: 'Заголовок', body: ['Текст', '## ', ''] };
    expect(validateArticle(a)).toEqual(['Заполните или удалите пустые абзацы и подзаголовки.']);
    expect(validateArticle({ ...a, body: ['## Только подзаголовок'] })).toEqual(['Добавьте хотя бы один абзац текста.']);
  });

  it('время чтения считается по словам', () => {
    expect(readingMinutes(['пара слов'])).toBe(1);
    expect(readingMinutes([Array(450).fill('слово').join(' ')])).toBe(3);
  });

  it('правка текста статьи — повод снять отметку о проверке, смена значка — нет', () => {
    const a = ARTICLES[0];
    expect(articleTextChanged(a, { ...a, icon: '⭐' })).toBe(false);
    expect(articleTextChanged(a, { ...a, body: [...a.body, 'Ещё абзац'] })).toBe(true);
  });

  it('контакты куратора', () => {
    expect(validateSupport({ telegram: 'move4fit_support', whatsapp: '79001234567', email: 'a@b.ru', communityUrl: 'https://t.me/x' })).toEqual([]);
    expect(validateSupport({ telegram: '@name', whatsapp: '+7 900', email: 'нет', communityUrl: 'http://x' })).toHaveLength(4);
  });
});

describe('выгрузка и загрузка', () => {
  const doc: ContentDoc = {
    ...EMPTY_DOC,
    exercises: [{ item: custom, updatedAt: at, review: { by: 'Врач', at } }],
    articles: [{ item: { ...ARTICLES[0], id: 'custom_a' }, updatedAt: at }],
    goals: [{ item: { id: 'custom_g', title: 'Цель', levels: [1] }, updatedAt: at, archived: true }],
    workouts: [{ id: 'workout_1', title: 'Занятие', level: 1, items: [{ exerciseId: 'custom_1', difficulty: 2 }], createdAt: at }],
    support: { ...EMPTY_DOC.support, email: 'help@example.com' },
  };

  it('выгруженный файл читается обратно; отметка о проверке из файла не переносится', () => {
    const parsed = parseBackup(buildBackup(doc));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.doc.exercises[0].item).toEqual(custom);
    expect(parsed.doc.exercises[0].review).toBeUndefined();
    expect(parsed.doc.goals[0].archived).toBe(true);
    expect(parsed.doc.workouts).toEqual(doc.workouts);
    expect(parsed.doc.support.email).toBe('help@example.com');
  });

  it('чужие и испорченные файлы отклоняются с объяснением', () => {
    expect(parseBackup('не json')).toMatchObject({ ok: false });
    expect(parseBackup('{"format":"другое"}')).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ format: 'move4fit-content', schemaVersion: 99 }))).toMatchObject({ ok: false });
  });

  it('неверные записи пропускаются и считаются', () => {
    const text = JSON.stringify({
      format: 'move4fit-content',
      schemaVersion: 2,
      exercises: [{ item: { ...custom, risks: 'impact' }, updatedAt: at }, { item: { ...custom, levels: [9] } }, { exercise: custom, updatedAt: at }],
      articles: [{ item: { id: 'x' } }],
      workouts: [{ id: 'w', title: 'Без упражнений' }],
    });
    const parsed = parseBackup(text);
    expect(parsed).toMatchObject({ ok: true, skipped: 4 });
    if (parsed.ok) expect(parsed.doc.exercises.map((e) => e.item.id)).toEqual(['custom_1']);
  });

  it('загрузка добавляет новое, заменяет изменённое и не трогает остальное', () => {
    const incoming: ContentDoc = {
      ...EMPTY_DOC,
      exercises: [
        { item: { ...custom, title: 'Переименовано' }, updatedAt: at },
        { item: { ...custom, id: 'custom_2' }, updatedAt: at },
      ],
      workouts: doc.workouts,
    };
    const plan = planImport(doc, incoming);
    expect([plan.added, plan.changed, plan.same]).toEqual([1, 1, 1]);
    expect(plan.doc.exercises.map((e) => e.item.title)).toEqual(['Переименовано', 'Своё упражнение']);
    expect(plan.doc.exercises[0].review).toBeUndefined();
    expect(plan.doc.articles).toEqual(doc.articles);
    expect(plan.doc.support.email).toBe('help@example.com');
    // Совпадающая запись сохраняет отметку о проверке.
    expect(planImport(doc, { ...EMPTY_DOC, exercises: [{ item: custom, updatedAt: '' }] }).doc.exercises[0].review).toEqual({ by: 'Врач', at });
  });
});
