import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { GOAL_RATINGS, goalsFor } from '@/src/domain/goals';
import type { GoalRating } from '@/src/domain/types';
import { useApp } from '@/src/state/AppState';
import { Button, Card, Choice, Field, H1, H2, Notice, P, Screen } from '@/src/ui/kit';

/**
 * Цель семьи: выбор (или своя формулировка) и оценка раз в 8 недель.
 * ⚠️ ЧЕРНОВИК: список целей и шкала оценки — на проверку специалисту.
 */
export default function Goal() {
  const { review } = useLocalSearchParams<{ review?: string }>();
  const { child, assessment, goal, setGoal, reviewGoal } = useApp();
  // Пока родитель ничего не выбрал, режим выводится из параметра и наличия цели (цель подгружается не мгновенно).
  const [modeOverride, setMode] = useState<'after_review' | 'choose' | null>(null);
  const mode = modeOverride ?? (review && goal ? 'review' : 'choose');
  const [rating, setRating] = useState<GoalRating | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  if (!child || !assessment) return null;
  const presets = goalsFor(assessment.level);

  if (mode === 'review' && goal) {
    return (
      <Screen>
        <H1>Как продвигается цель?</H1>
        <Card>
          <P muted>Моя цель</P>
          <H2>{goal.text}</H2>
        </Card>
        <View style={{ gap: 10 }}>
          {GOAL_RATINGS.map((r) => (
            <Choice key={r.value} label={r.label} selected={rating === r.value} onPress={() => setRating(r.value)} />
          ))}
        </View>
        <Button
          title="Сохранить"
          disabled={rating === null}
          onPress={() => {
            reviewGoal(rating!);
            setMode('after_review');
          }}
        />
      </Screen>
    );
  }

  if (mode === 'after_review' && goal) {
    const achieved = rating !== null && rating >= 1;
    const worse = rating === -2;
    return (
      <Screen>
        <H1>{achieved ? 'Здорово, получилось!' : 'Спасибо, записали'}</H1>
        {achieved && <P>Самое время выбрать следующую цель. Если ребёнок многому научился — пройдите вопросы заново.</P>}
        {!achieved && !worse && <P>Навыки растут не сразу. Можно оставить цель и продолжить или выбрать другую, попроще.</P>}
        {worse && (
          <Notice>
            Если ребёнок стал делать меньше, чем умел раньше, — покажите его врачу и напишите куратору, прежде чем
            продолжать занятия.
          </Notice>
        )}
        <Button title="Выбрать новую цель" variant={achieved ? 'primary' : 'secondary'} onPress={() => setMode('choose')} />
        <Button title="Оставить эту цель" variant={achieved ? 'secondary' : 'primary'} onPress={() => router.back()} />
        {achieved && (
          <Button title="Пройти вопросы заново" variant="secondary" onPress={() => router.replace('/child/questionnaire')} />
        )}
      </Screen>
    );
  }

  const text = custom.trim() || presets.find((p) => p.id === presetId)?.title || '';

  return (
    <Screen>
      <H1>Чему хотим научиться?</H1>
      <P muted>
        Выберите одну цель для ребёнка на ближайшие 2–3 месяца. Через 8 недель спросим, как идут дела.
      </P>
      <View style={{ gap: 10 }}>
        {presets.map((p) => (
          <Choice
            key={p.id}
            label={p.title}
            selected={presetId === p.id && !custom.trim()}
            onPress={() => {
              setPresetId(p.id);
              setCustom('');
            }}
          />
        ))}
      </View>
      <Field
        label="Или напишите свою цель"
        value={custom}
        onChangeText={setCustom}
        placeholder="Например: сам садится за стол"
        maxLength={80}
      />
      <Button
        title="Сохранить цель"
        disabled={!text}
        onPress={() => {
          setGoal(text, custom.trim() ? undefined : (presetId ?? undefined));
          router.back();
        }}
      />
      {goal && <Button title="Отмена" variant="secondary" onPress={() => router.back()} />}
    </Screen>
  );
}
