import { describe, expect, it } from 'vitest';

import { blankExercise, blankWorkout, exercisesForSlot, keepSuitable, validateExercise, validateWorkout, workoutFit, WORKOUT_STRUCTURE } from './content';
import { EXERCISES } from './exercises';
import type { Exercise } from './types';

const filled = (extra: Partial<Exercise> = {}): Exercise => ({
  ...blankExercise('custom_1'),
  title: 'Мостик с мячом',
  description: 'Лёжа на спине, поднимаем таз, мяч зажат между коленями.',
  goals: ['strength'],
  levels: [2, 3],
  variants: [
    { difficulty: 1, instructions: 'Поднять таз 5 раз.', sets: 1, reps: 5 },
    { difficulty: 2, instructions: 'Поднять таз 8 раз.', sets: 2, reps: 8 },
    { difficulty: 3, instructions: 'Удерживать таз.', sets: 2, durationSec: 10 },
  ],
  ...extra,
});

describe('новое упражнение', () => {
  it('пустой шаблон содержит три варианта сложности и не проходит проверку', () => {
    const blank = blankExercise('x');
    expect(blank.variants.map((v) => v.difficulty)).toEqual([1, 2, 3]);
    expect(validateExercise(blank).length).toBeGreaterThan(0);
  });

  it('заполненное упражнение проходит проверку, как и все упражнения каталога', () => {
    expect(validateExercise(filled())).toEqual([]);
    for (const e of EXERCISES) expect(validateExercise(e), e.id).toEqual([]);
  });

  it('называет, чего не хватает', () => {
    expect(validateExercise(filled({ title: '  ' }))).toEqual(['Напишите название упражнения.']);
    expect(validateExercise(filled({ levels: [] }))).toEqual(['Отметьте, каким группам детей подходит упражнение.']);
    expect(validateExercise(filled({ minAge: NaN }))).toEqual(['Минимальный возраст — число от 0 до 18 лет.']);
    expect(validateExercise(filled({ videoUrl: 'blob:abc' }))).toEqual(['Ссылка на видео должна начинаться с http:// или https://.']);
  });

  it('у каждого варианта должны быть описание и верное число подходов', () => {
    const badSets = filled();
    badSets.variants[0] = { difficulty: 1, instructions: 'Поднять таз.', sets: 0, reps: 5 };
    expect(validateExercise(badSets)).toEqual(['Вариант «проще»: число подходов — целое, от 1.']);
    const noText = filled();
    noText.variants[2] = { difficulty: 3, instructions: '', sets: 1, reps: 5 };
    expect(validateExercise(noText)).toEqual(['Вариант «сложнее»: напишите, как выполнять.']);
  });
});

describe('шаблон занятия', () => {
  const level = 2;
  const pickFor = (part: 'warmup' | 'main' | 'cooldown', n: number) =>
    exercisesForSlot(part, level, EXERCISES)
      .slice(0, n)
      .map((e) => ({ exerciseId: e.id, difficulty: 1 as const }));
  const full = () => ({
    ...blankWorkout('w1', level),
    title: 'Утреннее занятие',
    items: [...pickFor('warmup', 1), ...pickFor('main', 3), ...pickFor('cooldown', 1)],
  });

  it('структура: разминка, три основных, заминка', () => {
    expect(WORKOUT_STRUCTURE).toEqual([
      { part: 'warmup', count: 1 },
      { part: 'main', count: 3 },
      { part: 'cooldown', count: 1 },
    ]);
  });

  it('в часть занятия предлагаются только упражнения этой части и этой группы', () => {
    const options = exercisesForSlot('main', level, EXERCISES);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((e) => e.part === 'main' && e.levels.includes(level))).toBe(true);
  });

  it('полное занятие проходит проверку', () => {
    expect(full().items).toHaveLength(5);
    expect(validateWorkout(full(), EXERCISES)).toEqual([]);
  });

  it('нужны название и основная часть', () => {
    expect(validateWorkout(blankWorkout('w', level), EXERCISES)).toEqual([
      'Напишите название занятия.',
      'Добавьте хотя бы одно упражнение в основную часть.',
    ]);
  });

  it('ловит лишние, повторные, неподходящие и удалённые упражнения', () => {
    const tooMany = { ...full(), items: [...pickFor('warmup', 2), ...pickFor('main', 1)] };
    expect(validateWorkout(tooMany, EXERCISES)).toEqual(['Разминка: не больше 1 упр., сейчас 2.']);

    const twice = { ...full(), items: [...pickFor('main', 1), ...pickFor('main', 1)] };
    expect(validateWorkout(twice, EXERCISES)).toContain('Одно упражнение добавлено дважды.');

    const other = EXERCISES.find((e) => e.part === 'main' && !e.levels.includes(level))!;
    const wrong = { ...full(), items: [...pickFor('main', 1), { exerciseId: other.id, difficulty: 1 as const }] };
    expect(validateWorkout(wrong, EXERCISES)).toEqual([`Не подходят выбранной группе: ${other.title}.`]);
    expect(keepSuitable(wrong.items, level, EXERCISES)).toEqual(pickFor('main', 1));

    const gone = { ...full(), items: [...pickFor('main', 1), { exerciseId: 'нет_такого', difficulty: 1 as const }] };
    expect(validateWorkout(gone, EXERCISES)).toEqual(['В занятии есть упражнение, которого больше нет в каталоге, — уберите его.']);
  });

  it('показывает, кому занятие подходит целиком', () => {
    const catalog: Exercise[] = [
      filled({ id: 'a', minAge: 3, requires: ['sit_independent'], risks: ['impact'] }),
      filled({ id: 'b', minAge: 5, requires: ['sit_independent', 'stand_with_support'], risks: [] }),
    ];
    const items = [
      { exerciseId: 'a', difficulty: 1 as const },
      { exerciseId: 'b', difficulty: 2 as const },
    ];
    expect(workoutFit(items, catalog)).toEqual({ minAge: 5, requires: ['sit_independent', 'stand_with_support'], risks: ['impact'] });
    expect(workoutFit([], catalog)).toEqual({ minAge: 0, requires: [], risks: [] });
  });
});
