import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import {
  isLocalVideoAvailable,
  loadContent,
  mergedExercises,
  newContentId,
  rememberPicked,
  removeItem,
  saveItem,
  setLocalVideo,
  type LocalVideo,
} from '@/src/admin/content';
import { ADMIN, goBack, useGuardedBack } from '@/src/admin/ui';
import {
  CAPABILITY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  GOAL_LABELS,
  LEVELS,
  PARTS,
  PART_LABELS,
  POSITION_LABELS,
  RISK_LABELS,
  blankExercise,
  validateExercise,
} from '@/src/domain/content';
import { EXERCISES } from '@/src/domain/exercises';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { lockBuiltIn, type Origin, type Review } from '@/src/domain/library';
import { formatAge } from '@/src/domain/profile';
import type { Capability, Difficulty, Exercise, ExerciseRisk, Goal, Position } from '@/src/domain/types';
import { ExerciseVideo } from '@/src/ui/ExerciseVideo';
import { Button, Card, Chip, ChipRow, Field, H2, Notice, P, Screen } from '@/src/ui/kit';

/** Поля формы. Числа хранятся строками, как их вводят; в упражнение превращаются при сохранении. */
interface Form {
  base: Exercise;
  minAge: string;
  equipment: string;
  videoLink: string;
  localVideo?: LocalVideo;
  reviewBy: string;
  variants: Record<Difficulty, { instructions: string; sets: string; reps: string; durationSec: string }>;
}

interface Loaded {
  origin: Origin | 'new';
  /** Встроенная версия, если упражнение из приложения. */
  builtIn?: Exercise;
  review?: Review;
  archived: boolean;
  baseChanged: boolean;
  /** В скольких собранных занятиях используется. */
  usedIn: number;
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n));
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.trim().replace(',', '.')));
const dose = (v: { sets: number; reps?: number; durationSec?: number }) =>
  [`подходов: ${v.sets}`, v.reps ? `повторов: ${v.reps}` : '', v.durationSec ? `${v.durationSec} сек` : ''].filter(Boolean).join(', ');

function toForm(e: Exercise, localVideo: LocalVideo | undefined, review: Review | undefined): Form {
  const variant = (d: Difficulty) => {
    const v = e.variants.find((x) => x.difficulty === d);
    return { instructions: v?.instructions ?? '', sets: str(v?.sets ?? 1), reps: str(v?.reps), durationSec: str(v?.durationSec) };
  };
  return {
    base: e,
    minAge: str(e.minAge),
    equipment: (e.equipment ?? []).join(', '),
    videoLink: e.videoUrl ?? '',
    localVideo,
    reviewBy: review?.by ?? '',
    variants: { 1: variant(1), 2: variant(2), 3: variant(3) },
  };
}

function toExercise(f: Form): Exercise {
  const equipment = f.equipment.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    ...f.base,
    title: f.base.title.trim(),
    description: f.base.description.trim(),
    minAge: num(f.minAge) ?? NaN,
    equipment: equipment.length > 0 ? equipment : undefined,
    videoUrl: f.videoLink.trim() || undefined,
    variants: DIFFICULTIES.map((difficulty) => {
      const v = f.variants[difficulty];
      return { difficulty, instructions: v.instructions.trim(), sets: num(v.sets) ?? NaN, reps: num(v.reps), durationSec: num(v.durationSec) };
    }),
  };
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
/** Содержание упражнения без отметки о проверке — чтобы понять, менялся ли сам текст. */
const contentOf = (f: Form) => JSON.stringify({ ...f, reviewBy: '' });

/** Создание и изменение упражнения. У упражнений из приложения меняются только тексты и видео. */
export default function AdminExerciseEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [meta, setMeta] = useState<Loaded | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [errors, setErrors] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initial = useRef('');

  const dirty = !!form && JSON.stringify(form) !== initial.current;
  useGuardedBack(dirty, ADMIN.exercises);

  useEffect(() => {
    const start = (f: Form, m: Loaded) => {
      initial.current = JSON.stringify(f);
      setForm(f);
      setMeta(m);
      setState('ready');
    };
    loadContent()
      .then((c) => {
        if (!id) {
          start(toForm(blankExercise(newContentId('custom')), undefined, undefined), { origin: 'new', archived: false, baseChanged: false, usedIn: 0 });
          return;
        }
        const found = mergedExercises(c).find((m) => m.item.id === id);
        if (!found) {
          setState('missing');
          return;
        }
        start(toForm(found.item, c.localVideos[id], found.review), {
          origin: found.origin,
          builtIn: EXERCISES.find((e) => e.id === id),
          review: found.review,
          archived: !!found.archived,
          baseChanged: found.baseChanged,
          usedIn: c.workouts.filter((w) => w.items.some((i) => i.exerciseId === id)).length,
        });
      })
      .catch(() => setState('failed'));
  }, [id]);

  if (state === 'missing' || state === 'failed') {
    return (
      <Screen>
        {state === 'missing' ? <P>Такого упражнения нет — возможно, оно удалено.</P> : <Notice>Не удалось прочитать сохранённые упражнения. Попробуйте открыть экран ещё раз.</Notice>}
        <Button title="К списку упражнений" variant="secondary" onPress={() => goBack(ADMIN.exercises)} />
      </Screen>
    );
  }
  if (!form || !meta) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const locked = !!meta.builtIn;
  const setBase = (patch: Partial<Exercise>) => setForm({ ...form, base: { ...form.base, ...patch } });
  const setVariant = (d: Difficulty, patch: Partial<Form['variants'][Difficulty]>) =>
    setForm({ ...form, variants: { ...form.variants, [d]: { ...form.variants[d], ...patch } } });
  const e = form.base;

  const link = form.videoLink.trim();
  const localPlayable = !!form.localVideo && isLocalVideoAvailable(form.localVideo.uri);
  const previewUrl = /^https?:\/\/\S+$/.test(link) ? link : localPlayable ? form.localVideo?.uri : undefined;
  const contentChanged = contentOf(form) !== contentOf(JSON.parse(initial.current) as Form);
  const reviewWillReset = !!meta.review && contentChanged && form.reviewBy.trim() === meta.review.by;

  const pickVideo = async () => {
    try {
      setProblem('');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos' });
      const asset = result.assets?.[0];
      if (!asset) return;
      rememberPicked(asset.uri);
      setForm({ ...form, localVideo: { uri: asset.uri, fileName: asset.fileName ?? 'видео' } });
    } catch {
      setProblem('Не удалось открыть выбор видео. Проверьте, что приложению разрешён доступ к файлам.');
    }
  };

  const persist = async (archived: boolean) => {
    const typed = toExercise(form);
    const exercise = meta.builtIn ? lockBuiltIn(meta.builtIn, typed) : typed;
    const found = validateExercise(exercise);
    setErrors(found);
    if (found.length > 0) return;
    const by = form.reviewBy.trim();
    const review: Review | undefined =
      !by || reviewWillReset ? undefined : meta.review && meta.review.by === by && !contentChanged ? meta.review : { by, at: new Date().toISOString() };
    try {
      setProblem('');
      await saveItem('exercises', { item: exercise, review, archived: archived || undefined, base: meta.builtIn ? JSON.stringify(meta.builtIn) : undefined });
      await setLocalVideo(exercise.id, form.localVideo);
      goBack(ADMIN.exercises);
    } catch {
      setProblem('Не удалось сохранить упражнение на этом устройстве. Попробуйте ещё раз.');
    }
  };

  const remove = async () => {
    try {
      await removeItem('exercises', e.id);
      goBack(ADMIN.exercises);
    } catch {
      setProblem('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
  };

  return (
    <Screen>
      {locked && (
        <Notice>
          Это упражнение из приложения. Здесь меняются название, описание, тексты вариантов и видео. Кому оно подходит,
          риски и дозировку меняет только специалист — от них зависят противопоказания.
        </Notice>
      )}
      {meta.baseChanged && <Notice>Упражнение в приложении изменилось после вашей правки. Сверьте тексты и сохраните ещё раз.</Notice>}
      {meta.archived && <Notice>Упражнение в архиве: в новые занятия оно не предлагается.</Notice>}

      <Card>
        <H2>Название и описание</H2>
        <Field label="Название" value={e.title} onChangeText={(title) => setBase({ title })} />
        <Field
          label="Описание: что делает ребёнок, чем помогает взрослый"
          value={e.description}
          onChangeText={(description) => setBase({ description })}
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />
        <Field label="Что понадобится (через запятую, необязательно)" value={form.equipment} onChangeText={(equipment) => setForm({ ...form, equipment })} />
      </Card>

      <Card>
        <H2>Видео</H2>
        <ExerciseVideo key={previewUrl ?? 'none'} url={previewUrl} />
        <Button title={form.localVideo ? 'Выбрать другое видео' : 'Загрузить видео с устройства'} variant="secondary" onPress={pickVideo} />
        {form.localVideo && (
          <>
            <P muted>
              {localPlayable ? `Выбран файл: ${form.localVideo.fileName}` : `Файл «${form.localVideo.fileName}» больше недоступен — выберите его заново.`}
            </P>
            <Button title="Убрать файл" variant="secondary" onPress={() => setForm({ ...form, localVideo: undefined })} />
          </>
        )}
        <P muted>
          Файл с устройства пока некуда загрузить: сервер не подключён, поэтому видео видно только здесь и может
          пропасть после закрытия страницы. Если ролик уже лежит в интернете, вставьте ссылку — она сохранится.
        </P>
        <Field
          label="Или ссылка на видео (необязательно)"
          value={form.videoLink}
          onChangeText={(videoLink) => setForm({ ...form, videoLink })}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://"
        />
      </Card>

      {locked ? (
        <Card>
          <H2>Кому подходит и риски</H2>
          <P>
            {PART_LABELS[e.part]} · {POSITION_LABELS[e.position].toLowerCase()} · {e.minAge > 0 ? `от ${formatAge(e.minAge)}` : 'любой возраст'}
          </P>
          <P>Цели: {e.goals.map((g) => GOAL_LABELS[g].toLowerCase()).join(', ')}.</P>
          <P>Группы: {e.levels.map((l) => LEVEL_DESCRIPTIONS[l].title).join(', ')}.</P>
          <P>Ребёнок должен уметь: {e.requires.length > 0 ? e.requires.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(', ') : 'особых умений не нужно'}.</P>
          <P>Риски: {e.risks.length > 0 ? e.risks.map((r) => RISK_LABELS[r].toLowerCase()).join(', ') : 'не отмечены'}.</P>
          <P muted>Эти поля здесь не меняются.</P>
        </Card>
      ) : (
        <>
          <Card>
            <H2>Место в занятии</H2>
            <P muted>Часть занятия</P>
            <ChipRow>
              {PARTS.map((part) => (
                <Chip key={part} label={PART_LABELS[part]} selected={e.part === part} onPress={() => setBase({ part })} />
              ))}
            </ChipRow>
            <P muted>Цели (одна или несколько)</P>
            <ChipRow>
              {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                <Chip key={g} label={GOAL_LABELS[g]} selected={e.goals.includes(g)} onPress={() => setBase({ goals: toggle(e.goals, g) })} />
              ))}
            </ChipRow>
            <P muted>Исходное положение</P>
            <ChipRow>
              {(Object.keys(POSITION_LABELS) as Position[]).map((position) => (
                <Chip key={position} label={POSITION_LABELS[position]} selected={e.position === position} onPress={() => setBase({ position })} />
              ))}
            </ChipRow>
          </Card>

          <Card>
            <H2>Кому подходит</H2>
            <P muted>Группы детей (одна или несколько)</P>
            <ChipRow>
              {LEVELS.map((l) => (
                <Chip key={l} label={LEVEL_DESCRIPTIONS[l].title} selected={e.levels.includes(l)} onPress={() => setBase({ levels: toggle(e.levels, l).sort() })} />
              ))}
            </ChipRow>
            <Field label="С какого возраста, лет" value={form.minAge} onChangeText={(minAge) => setForm({ ...form, minAge })} keyboardType="numeric" />
            <P muted>Что ребёнок должен уметь (если ничего не отмечено — подходит всем в группе)</P>
            <ChipRow>
              {(Object.keys(CAPABILITY_LABELS) as Capability[]).map((c) => (
                <Chip key={c} label={CAPABILITY_LABELS[c]} selected={e.requires.includes(c)} onPress={() => setBase({ requires: toggle(e.requires, c) })} />
              ))}
            </ChipRow>
          </Card>

          <Card>
            <H2>Риски</H2>
            <P muted>
              Отметьте всё, что есть в упражнении. По этим отметкам приложение не показывает упражнение детям с
              противопоказаниями — если пропустить риск, ребёнок может получить неподходящее упражнение.
            </P>
            <ChipRow>
              {(Object.keys(RISK_LABELS) as ExerciseRisk[]).map((r) => (
                <Chip key={r} label={RISK_LABELS[r]} selected={e.risks.includes(r)} onPress={() => setBase({ risks: toggle(e.risks, r) })} />
              ))}
            </ChipRow>
          </Card>
        </>
      )}

      {DIFFICULTIES.map((d) => {
        const original = e.variants.find((v) => v.difficulty === d);
        return (
          <Card key={d}>
            <H2>Вариант «{DIFFICULTY_LABELS[d].toLowerCase()}»</H2>
            <Field
              label="Как выполнять"
              value={form.variants[d].instructions}
              onChangeText={(instructions) => setVariant(d, { instructions })}
              multiline
              numberOfLines={3}
              style={{ minHeight: 76, textAlignVertical: 'top' }}
            />
            {locked ? (
              <P muted>Дозировка: {original ? dose(original) : '—'}. Здесь не меняется.</P>
            ) : (
              <>
                <Field label="Подходов" value={form.variants[d].sets} onChangeText={(sets) => setVariant(d, { sets })} keyboardType="number-pad" />
                <Field label="Повторов (необязательно)" value={form.variants[d].reps} onChangeText={(reps) => setVariant(d, { reps })} keyboardType="number-pad" />
                <Field
                  label="Длительность, секунд (необязательно)"
                  value={form.variants[d].durationSec}
                  onChangeText={(durationSec) => setVariant(d, { durationSec })}
                  keyboardType="number-pad"
                />
              </>
            )}
          </Card>
        );
      })}

      <Card>
        <H2>Проверка специалистом</H2>
        <Field
          label="Кто проверил (фамилия и специальность). Пусто — ещё не проверено"
          value={form.reviewBy}
          onChangeText={(reviewBy) => setForm({ ...form, reviewBy })}
        />
        {reviewWillReset && <Notice>Вы изменили упражнение после проверки. При сохранении отметка о проверке будет снята.</Notice>}
        <P muted>Это пометка на вашем устройстве, а не подпись специалиста: подтвердить проверку можно будет только после подключения сервера.</P>
      </Card>

      {errors.length > 0 && <Notice>{`Проверьте заполнение:\n${errors.map((x) => `• ${x}`).join('\n')}`}</Notice>}
      {!!problem && <Notice>{problem}</Notice>}
      <Button title="Сохранить упражнение" onPress={() => persist(meta.archived)} />
      {meta.origin !== 'new' && (
        <Button title={meta.archived ? 'Вернуть из архива' : 'Убрать в архив'} variant="secondary" onPress={() => persist(!meta.archived)} />
      )}
      {meta.origin === 'edited' && <Button title="Сбросить мои правки" variant="secondary" onPress={remove} />}
      {meta.origin === 'custom' &&
        (meta.usedIn > 0 ? (
          <P muted>Упражнение используется в занятиях ({meta.usedIn}), поэтому удалить его нельзя — уберите в архив.</P>
        ) : confirmDelete ? (
          <>
            <Notice>Упражнение будет удалено без возможности вернуть.</Notice>
            <Button title="Удалить упражнение" onPress={remove} />
            <Button title="Отмена" variant="secondary" onPress={() => setConfirmDelete(false)} />
          </>
        ) : (
          <Button title="Удалить" variant="secondary" onPress={() => setConfirmDelete(true)} />
        ))}
    </Screen>
  );
}
